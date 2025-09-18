// scripts/upload.js
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';

// Configuração do R2 usando variáveis de ambiente
const s3 = new S3Client({
  endpoint: process.env.R2_ENDPOINT,           // ex: https://<accountid>.r2.cloudflarestorage.com
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID, // do Cloudflare R2
    secretAccessKey: process.env.R2_SECRET_KEY
  }
});

const LOCAL_FILE = 'public/guide.xml.gz'; // arquivo local gerado
const REMOTE_FILE = 'guide.xml.gz';       // nome final no bucket
const BUCKET = process.env.R2_BUCKET;     // bucket R2 já criado

export default async function upload() {
  console.log('📤 Iniciando upload para R2...');

  if (!fs.existsSync(LOCAL_FILE)) {
    console.error(`❌ Arquivo não encontrado: ${LOCAL_FILE}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(LOCAL_FILE);

  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: REMOTE_FILE,
      Body: fileContent,
      ContentType: 'application/xml'
    }));

    console.log(`✅ Upload concluído! Arquivo disponível em: ${REMOTE_FILE}`);
  } catch (err) {
    console.error('❌ Erro no upload:', err);
    process.exit(1);
  }
}
