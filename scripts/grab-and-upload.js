import fs from "fs";
import path from "path";
import zlib from "zlib";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";

// --- VARIÁVEIS ---
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// endpoint privado do R2
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

async function uploadAndPresign() {
  try {
    console.log("🗜 Compressing guiadetv...");
    const inputFile = path.resolve("guiadetv.xml");
    const outputFile = path.resolve("guide-guiadetv.xml.gz");

    // gzip
    const fileContents = fs.readFileSync(inputFile, "utf-8");
    const gzipped = zlib.gzipSync(fileContents);
    fs.writeFileSync(outputFile, gzipped);

    console.log("📤 Uploading guiadetv to R2...");
    const objectKey = "guide-guiadetv.xml.gz";

    // upload
    await s3Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: objectKey,
        Body: gzipped,
        ContentType: "application/gzip",
      })
    );

    console.log(`✅ Upload concluído: ${objectKey}`);

    // gerar signed URL (96h = 4 dias)
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

    console.log("🔗 Signed URL gerada (válida até):", expiresAt);

    // salvar no Supabase
    const { error } = await supabase.from("epg_sources").insert([
      {
        source_name: "guiadetv",
        signed_url: signedUrl,
        expires_at: expiresAt,
      },
    ]);

    if (error) {
      console.error("❌ Erro ao salvar no Supabase:", error.message);
    } else {
      console.log("✅ Signed URL salva no Supabase.");
    }
  } catch (err) {
    console.error("❌ Erro geral:", err);
  }
}

uploadAndPresign();
