import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';

// Configuração do R2 usando variáveis de ambiente
const s3 = new S3Client({
  endpoint: process.env.R2_ENDPOINT,           // ex: https://<accountid>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,  // do Cloudflare R2
    secretAccessKey: process.env.R2_SECRET_KEY, // do Cloudflare R2
  },
  region: 'auto',
});

// Função exportada
export async function uploadToR2(localFilePath, remoteFileName) {
  console.log("📤 Iniciando upload para R2...");

  if (!fs.existsSync(localFilePath)) {
    console.error(`❌ Arquivo não encontrado: ${localFilePath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(localFilePath);

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: remoteFileName,
      Body: fileContent,
      ContentType: "application/gzip",
    })
  );

  console.log(`✅ Upload concluído! Arquivo disponível em: ${remoteFileName}`);
}
