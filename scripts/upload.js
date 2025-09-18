import fs from 'fs';
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const r2Client = new S3Client({
  endpoint: process.env.R2_ENDPOINT,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

export default async function upload(localFilePath, bucketPath) {
  const fileStream = fs.createReadStream(localFilePath);

  const params = {
    Bucket: process.env.R2_BUCKET,
    Key: bucketPath,
    Body: fileStream,
    ContentType: "application/gzip",
    ACL: "private",
  };

  await r2Client.send(new PutObjectCommand(params));

  const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: bucketPath });
  const url = await getSignedUrl(r2Client, command, { expiresIn: 86400 });

  console.log(`✅ Uploaded ${bucketPath} to R2. Presigned URL generated.`);
  return url;
}
