import fs from "fs";
import path from "path";
import zlib from "zlib";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";

// --- VARIABLES ---
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// R2 endpoint
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const s3Client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function grabGuide(site) {
  console.log(`📡 Running grab for ${site}...`);
  try {
    execSync(`npm run grab -- --site=${site} --output=guide-${site}.xml`, {
      stdio: "inherit",
    });
    console.log(`✅ Grab completed for ${site}`);
    return `guide-${site}.xml`;
  } catch (error) {
    console.error(`❌ Grab failed for ${site}:`, error.message);
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
  const sites = ["guiadetv", "mi"];

  for (const site of sites) {
    try {
      console.log(`\n📡 Processing ${site}...`);
      
      // Run grab
      const outputFile = await grabGuide(site);
      
      // Upload and generate signed URL
      await uploadAndPresign(site, outputFile);
      
      console.log(`✅ Completed: ${site}\n`);
    } catch (error) {
      console.error(`⚠️ Skipping ${site}: ${error.message}`);
      continue; // Continue with next site
    }
  }
  
  console.log("🎉 All done!");
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});