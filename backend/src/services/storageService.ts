/**
 * 📦 Storage Service — S3-Compatible Object Storage (ArvanCloud)
 * ✅ مجهز به متدهای تولید لینک دانلود امن با نام اصلی فایل به همراه استخراج هوشمند کلید
 */

import {
  S3Client,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Agent as HttpsAgent } from 'https';
import { Agent as HttpAgent } from 'http';
import crypto from 'crypto';
import { Readable } from 'stream';

const S3_ENDPOINT = process.env.S3_ENDPOINT || 'https://s3.ir-thr-at1.arvanstorage.ir';
const S3_REGION = process.env.S3_REGION || 'ir-thr-at1';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || '';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || '';
const S3_BUCKET = process.env.S3_BUCKET || 'iranian-udemy-videos';
const S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === 'true';

const DEFAULT_PART_SIZE = parseInt(process.env.MULTIPART_PART_SIZE || '10485760', 10);
const MAX_VIDEO_SIZE = parseInt(process.env.MAX_VIDEO_SIZE || '5368709120', 10);
const PRESIGNED_UPLOAD_EXPIRES = 3600;
const PRESIGNED_PLAYBACK_EXPIRES = 7200;

class StorageService {
  private static instance: StorageService;
  public s3Client: S3Client;
  public bucket: string;

  private constructor() {
    this.bucket = S3_BUCKET;

    const httpsAgent = new HttpsAgent({ maxSockets: 50, keepAlive: true });
    const httpAgent = new HttpAgent({ maxSockets: 50, keepAlive: true });

    this.s3Client = new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION,
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
      forcePathStyle: S3_FORCE_PATH_STYLE,
      requestHandler: new NodeHttpHandler({
        requestTimeout: 600_000,
        connectionTimeout: 10_000,
        httpsAgent,
        httpAgent,
      }),
    });
  }

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  // ─── استخراج کلید فایل از آدرس خام ───
  public extractKey(raw: string): string {
    if (!raw) return '';
    let key = raw.trim();
    if (key.includes('?')) {
      key = key.split('?')[0];
    }
    if (key.startsWith('http://') || key.startsWith('https://')) {
      try {
        const urlObj = new URL(key);
        const parts = urlObj.pathname.split('/').filter(Boolean);
        if (parts[0] === this.bucket) {
          parts.shift();
        }
        key = parts.join('/');
      } catch {
        // اگر آدرس استاندارد نبود، نام فایل را به عنوان کلید برگردان
        const lastSlash = key.lastIndexOf('/');
        if (lastSlash !== -1) key = key.substring(lastSlash + 1);
      }
    }
    return key;
  }

  validateContentType(contentType: string, type: 'video' | 'resource' | 'audio'): boolean {
    if (type === 'video') {
      return ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'].includes(contentType);
    }
    if (type === 'audio') {
      return ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/flac', 'audio/x-m4a'].includes(contentType);
    }
    return true;
  }

  validateFileSize(size: number, type: 'video' | 'resource' | 'audio'): boolean {
    if (type === 'video') return size > 0 && size <= MAX_VIDEO_SIZE;
    if (type === 'audio') return size > 0 && size <= 104857600; // 100MB for audio
    return size > 0 && size <= 104857600;
  }

  async getPresignedUploadUrl(fileName: string, contentType: string, folder: string) {
    const timestamp = Date.now();
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${folder}/${timestamp}_${uniqueId}_${sanitizedFileName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: PRESIGNED_UPLOAD_EXPIRES });
    return { uploadUrl, key };
  }

  async uploadBuffer(folder: string, fileName: string, contentType: string, buffer: Buffer) {
    const timestamp = Date.now();
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${folder}/${timestamp}_${uniqueId}_${sanitizedFileName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await this.s3Client.send(command);
    return { url: `${S3_ENDPOINT}/${this.bucket}/${key}`, key };
  }

  async getFileInfo(key: string): Promise<{ size: number; contentType: string } | null> {
    try {
      const cleanKey = this.extractKey(key);
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      });
      const response = await this.s3Client.send(command);
      return {
        size: response.ContentLength || 0,
        contentType: response.ContentType || 'video/mp4',
      };
    } catch {
      return null;
    }
  }

  // ─── دریافت مستقیم Stream جهت پخش هوشمند ───
  async getVideoStream(key: string, range?: string): Promise<{ stream: Readable; contentLength: number; contentRange?: string; totalSize: number }> {
    const cleanKey = this.extractKey(key);
    const fileInfo = await this.getFileInfo(cleanKey);
    const totalSize = fileInfo?.size || 0;

    let start = 0;
    let end = totalSize > 0 ? totalSize - 1 : 0;
    let isRange = false;

    if (range && totalSize > 0) {
      const parts = range.replace(/bytes=/, '').split('-');
      start = parseInt(parts[0], 10);
      const requestedEnd = parts[1] ? parseInt(parts[1], 10) : NaN;
      end = !isNaN(requestedEnd) ? requestedEnd : Math.min(start + 10 * 1024 * 1024 - 1, totalSize - 1);
      isRange = true;
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
      ...(isRange ? { Range: `bytes=${start}-${end}` } : {}),
    });

    const response = await this.s3Client.send(command);
    const contentLength = end - start + 1;

    return {
      stream: response.Body as Readable,
      contentLength: contentLength > 0 ? contentLength : (response.ContentLength || totalSize),
      contentRange: isRange ? `bytes ${start}-${end}/${totalSize}` : undefined,
      totalSize,
    };
  }

  // ─── تولید Signed URL سنتی برای مشاهده آنلاین ───
  async getSignedPlaybackUrl(key: string, expiresInSeconds: number = PRESIGNED_PLAYBACK_EXPIRES): Promise<string> {
    const cleanKey = this.extractKey(key);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }

  // ─── ✅ متد جدید: تولید لینک دانلود اختصاصی با نام اصلی فایل ───
  async getSignedDownloadUrl(key: string, originalName: string, expiresInSeconds: number = 600): Promise<string> {
    const cleanKey = this.extractKey(key);
    const sanitizedName = originalName.replace(/[/\\?%*:|"<>\s]/g, '_');
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(sanitizedName)}"`,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }

  async initiateMultipartUpload(fileName: string, contentType: string, folder: string, totalSize: number, partSize: number = DEFAULT_PART_SIZE) {
    const timestamp = Date.now();
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${folder}/${timestamp}_${uniqueId}_${sanitizedFileName}`;

    const createCommand = new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType });
    const createResponse = await this.s3Client.send(createCommand);
    const uploadId = createResponse.UploadId!;

    const totalParts = Math.ceil(totalSize / partSize);
    const partUrls: { partNumber: number; url: string }[] = [];

    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const uploadPartCommand = new UploadPartCommand({ Bucket: this.bucket, Key: key, PartNumber: partNumber, UploadId: uploadId });
      const partUrl = await getSignedUrl(this.s3Client, uploadPartCommand, { expiresIn: PRESIGNED_UPLOAD_EXPIRES });
      partUrls.push({ partNumber, url: partUrl });
    }
    return { uploadId, key, partUrls, totalParts };
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: { ETag: string; PartNumber: number }[]) {
    const sortedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);
    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: sortedParts },
    });
    await this.s3Client.send(command);
    return { url: `${S3_ENDPOINT}/${this.bucket}/${key}`, key };
  }

  async abortMultipartUpload(key: string, uploadId: string) {
    const command = new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId });
    await this.s3Client.send(command);
  }

  // ─── حذف فایل از S3 ───
  async deleteFile(key: string): Promise<boolean> {
    try {
      const cleanKey = this.extractKey(key);
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      });
      await this.s3Client.send(command);
      return true;
    } catch {
      return false;
    }
  }
}

export default StorageService.getInstance();