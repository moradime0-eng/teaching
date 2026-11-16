import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config();

const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'https://s3.ir-thr-at1.arvanstorage.ir',
  region: process.env.S3_REGION || 'ir-thr-at1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
  },
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
});

async function enableCors() {
  const bucketName = process.env.S3_BUCKET || 'iranian-udemy-videos';

  console.log(`⏳ در حال تنظیم قوانین CORS برای باکت: ${bucketName}...`);

  const corsCommand = new PutBucketCorsCommand({
    Bucket: bucketName,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
          AllowedOrigins: [
            'http://localhost:4200',
            'http://localhost:5000',
            'http://localhost:3000',
            'https://homayoon.academy',
            'https://www.homayoon.academy',
          ],
          ExposeHeaders: ['ETag', 'Content-Range', 'Accept-Ranges', 'Content-Length'],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  });

  try {
    await s3Client.send(corsCommand);
    console.log('✅ قوانین CORS با موفقیت روی باکت ابرآروان تنظیم شد!');
    process.exit(0);
  } catch (error) {
    console.error('❌ خطا در تنظیم CORS:', error);
    process.exit(1);
  }
}

enableCors();