import fs from "fs";
import path from "path";
import zlib from "zlib";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";

// --- VARIABLES ---
// Both naming schemes work: R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY /
// R2_BUCKET_NAME / R2_ACCOUNT_ID, or the R2_ACCESS_KEY / R2_SECRET_KEY /
// R2_BUCKET / R2_ENDPOINT names this job's deployments are configured with.
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// R2 endpoint
const R2_ENDPOINT =
  process.env.R2_ENDPOINT || (R2_ACCOUNT_ID && `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);

const missing = Object.entries({
  "R2_ACCESS_KEY_ID (or R2_ACCESS_KEY)": R2_ACCESS_KEY_ID,
  "R2_SECRET_ACCESS_KEY (or R2_SECRET_KEY)": R2_SECRET_ACCESS_KEY,
  "R2_BUCKET_NAME (or R2_BUCKET)": R2_BUCKET_NAME,
  "R2_ENDPOINT (or R2_ACCOUNT_ID)": R2_ENDPOINT,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
})
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length) {
  console.error(`❌ Missing settings: ${missing.join(", ")}`);
  process.exit(1);
}

const s3Client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Each guide keeps its short name for the output file, the R2 key and
// epg_sources.source_name; dir is its folder under sites/, which is what the
// grab command reads the *.channels.xml files from.
const SITES = [
  // guiadetv.com was redesigned (its pages no longer have the .row and h3 markup
  // the parser reads), so every channel returns 0 programs; upstream iptv-org
  // has the same parser. Re-enable this line once
  // sites/guiadetv.com/guiadetv.com.config.js parses the new pages.
  // { name: "guiadetv", dir: "guiadetv.com" },
  { name: "mi", dir: "mi.tv" },
];

async function grabGuide({ name, dir }) {
  console.log(`📡 Running grab for ${name} (sites/${dir})...`);
  try {
    execSync(`npm run grab -- --site=${dir} --output=guide-${name}.xml`, {
      stdio: "inherit",
      // mi.tv's 1,361 channels outgrow Node's default ~500 MB heap while the
      // guide is assembled. GRAB_HEAP_MB overrides the 1,536 MB used here.
      env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${process.env.GRAB_HEAP_MB || 1536}` },
    });
    console.log(`✅ Grab completed for ${name}`);
    return `guide-${name}.xml`;
  } catch (error) {
    console.error(`❌ Grab failed for ${name}:`, error.message);
    throw error;
  }
}

async function uploadAndPresign(site, inputFilePath) {
  try {
    console.log(`🗜 Compressing ${site}...`);
    
    // Check if input file exists
    if (!fs.existsSync(inputFilePath)) {
      throw new Error(`Input file not found: ${inputFilePath}`);
    }

    const outputFile = path.resolve(`guide-${site}.xml.gz`);

    // Read and compress
    const fileContents = fs.readFileSync(inputFilePath, "utf-8");
    const gzipped = zlib.gzipSync(fileContents);
    fs.writeFileSync(outputFile, gzipped);

    console.log(`📤 Uploading ${site} to R2...`);
    const objectKey = `guide-${site}.xml.gz`;

    // Upload with proper content type and encoding
    await s3Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: objectKey,
        Body: gzipped,
        ContentType: "application/gzip",
        ContentEncoding: "gzip",
      })
    );

    console.log(`✅ Upload completed: ${objectKey}`);

    // Generate signed URL (96h = 4 days)
    const expiresIn = 96 * 3600;
    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: objectKey,
      }),
      { expiresIn }
    );

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    console.log("🔗 Signed URL generated (valid until):", expiresAt);

    // Save to Supabase
    const { error } = await supabase.from("epg_sources").insert([
      {
        source_name: site,
        signed_url: signedUrl,
        expires_at: expiresAt,
      },
    ]);

    if (error) {
      console.error("❌ Error saving to Supabase:", error.message);
      throw error;
    }

    console.log("✅ Signed URL saved to Supabase.");

    // Cleanup: remove uncompressed file
    if (fs.existsSync(inputFilePath)) {
      fs.unlinkSync(inputFilePath);
      console.log(`🧹 Cleaned up: ${inputFilePath}`);
    }
  } catch (err) {
    console.error(`❌ Error processing ${site}:`, err.message);
    throw err;
  }
}

async function main() {
  const failed = [];

  for (const site of SITES) {
    try {
      console.log(`\n📡 Processing ${site.name}...`);

      // Run grab
      const outputFile = await grabGuide(site);

      // Upload and generate signed URL
      await uploadAndPresign(site.name, outputFile);

      console.log(`✅ Completed: ${site.name}\n`);
    } catch (error) {
      console.error(`⚠️ Skipping ${site.name}: ${error.message}`);
      failed.push(site.name);
    }
  }

  if (failed.length) {
    // Non-zero exit so the scheduler reports the run as failed.
    console.error(`❌ Failed: ${failed.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("🎉 All done!");
  }
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});