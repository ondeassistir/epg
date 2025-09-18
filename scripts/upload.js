// scripts/upload.js
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';

const s3 = new S3Client({
  endpoint: process.env.R2_ENDPOINT,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_KEY
  }
});

const BUCKET = process.env.R2_BUCKET;

export default async function upload(localFile) {
  const REMOTE_FILE = localFile.split('/').pop(); // pega o nome do arquivo

  console.log(`📤 Iniciando upload para R2: ${REMOTE_FILE}`);

  if (!fs.existsSync(localFile)) {
    console.error(`❌ Arquivo não encontrado: ${localFile}`);
    return;
  }

  const fileContent = fs.readFileSync(localFile);

  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: REMOTE_FILE,
      Body: fileContent,
      ContentType: 'application/xml'
    }));

    console.log(`✅ Upload concluído: ${REMOTE_FILE}`);
  } catch (err) {
    console.error('❌ Erro no upload:', err);
  }
}
