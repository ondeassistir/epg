// scripts/upload.js
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');

// Configuração do R2 usando variáveis de ambiente
const s3 = new S3Client({
  endpoint: process.env.R2_ENDPOINT,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_KEY
  }
});

const LOCAL_FILE = 'public/guide.xml.gz';
const REMOTE_FILE = 'guide.xml.gz';
const BUCKET = process.env.R2_BUCKET;

async function uploadToR2() {
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

module.exports = uploadToR2;
