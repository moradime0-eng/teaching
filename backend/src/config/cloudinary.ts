import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { getCurrentTenantId } from '../utils/tenantContext';

// ✅ اعتبارسنجی متغیرهای محیطی هنگام شروع برنامه
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  const msg =
    '⚠️ متغیرهای Cloudinary تنظیم نشده‌اند (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET). آپلود فایل کار نخواهد کرد.';
  if (process.env.NODE_ENV === 'production') {
    throw new Error(msg);
  } else {
    console.warn(msg);
  }
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
});

/**
 * Get tenant-specific folder path
 * Structure: iranian-udemy/tenants/{tenantId}/{folder}
 */
export const getTenantFolder = (folder: string, tenantId?: string): string => {
  const currentTenantId = tenantId || getCurrentTenantId();
  if (currentTenantId) {
    return `iranian-udemy/tenants/${currentTenantId}/${folder}`;
  }
  // Fallback for global uploads (e.g., platform assets)
  return `iranian-udemy/global/${folder}`;
};

export const uploadToCloudinary = async (
  filePath: string,
  folder: string,
  resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto',
  tenantId?: string,
): Promise<{ url: string; publicId: string }> => {
  const tenantFolder = getTenantFolder(folder, tenantId);
  // Use chunk_size for large video uploads to improve reliability and speed
  const isLargeFile = resourceType === 'video' || resourceType === 'raw';
  const result = await cloudinary.uploader.upload(filePath, {
    folder: tenantFolder,
    resource_type: resourceType,
    ...(isLargeFile && {
      chunk_size: 20 * 1024 * 1024, // 20MB chunks for large files
      timeout: 600000, // 10 minutes timeout for large uploads
    }),
  });
  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
};

/**
 * Stream a local file to Cloudinary using fs.createReadStream.
 * Uses much less memory than upload() for large files because it streams
 * chunks to Cloudinary instead of loading the entire file into memory.
 */
export const uploadStreamToCloudinary = (
  filePath: string,
  folder: string,
  resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto',
  tenantId?: string,
): Promise<{ url: string; publicId: string }> => {
  return new Promise((resolve, reject) => {
    const tenantFolder = getTenantFolder(folder, tenantId);
    const isLargeFile = resourceType === 'video' || resourceType === 'raw';
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: tenantFolder,
        resource_type: resourceType,
        ...(isLargeFile && {
          chunk_size: 20 * 1024 * 1024,
          timeout: 600000,
        }),
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error('Cloudinary upload returned no result'));
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      },
    );
    const fileStream = fs.createReadStream(filePath);
    fileStream.on('error', (err) => {
      uploadStream.destroy();
      reject(err);
    });
    fileStream.pipe(uploadStream);
  });
};

export const deleteFromCloudinary = async (
  publicId: string,
  resourceType: 'image' | 'video' | 'raw' = 'image',
): Promise<void> => {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};

/**
 * Upload with explicit tenant context (for jobs/background tasks)
 */
export const uploadToCloudinaryWithTenant = async (
  filePath: string,
  folder: string,
  tenantId: string,
  resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto',
): Promise<{ url: string; publicId: string }> => {
  return uploadToCloudinary(filePath, folder, resourceType, tenantId);
};

/**
 * Generate signed upload parameters for client-side (direct) upload to Cloudinary.
 * The frontend uses these params to upload directly without going through the backend.
 *
 * @param folder - Target folder (e.g., 'lecture-videos', 'thumbnails')
 * @param resourceType - 'image', 'video', or 'raw'
 * @param tenantId - Tenant ID for folder scoping
 * @param expiresInSeconds - How long the signature is valid (default: 10 minutes)
 * @returns Signed params including timestamp, signature, api_key, folder, etc.
 */
export const generateUploadSignature = (
  folder: string,
  resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto',
  tenantId?: string,
  expiresInSeconds: number = 600,
): {
  timestamp: number;
  signature: string;
  api_key: string;
  cloud_name: string;
  folder: string;
  resource_type: string;
  expiration: number;
} => {
  const tenantFolder = getTenantFolder(folder, tenantId);
  const timestamp = Math.round(Date.now() / 1000) + expiresInSeconds;

  const params: Record<string, any> = {
    folder: tenantFolder,
    resource_type: resourceType,
    timestamp,
  };

  const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET!);

  return {
    timestamp,
    signature,
    api_key: process.env.CLOUDINARY_API_KEY!,
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    folder: tenantFolder,
    resource_type: resourceType,
    expiration: timestamp,
  };
};

/**
 * Generate a Cloudinary signed URL for accessing authenticated resources.
 * Used for serving paid course videos with time-limited access.
 *
 * @param publicId - The Cloudinary public_id of the resource
 * @param resourceType - 'image', 'video', or 'raw'
 * @param expiresInSeconds - How long the URL is valid (default: 4 hours)
 * @returns Signed URL string
 */
export const generateSignedUrl = (
  publicId: string,
  resourceType: 'video' | 'raw' | 'image' = 'video',
  expiresInSeconds: number = 14400, // 4 hours
): string => {
  const timestamp = Math.round(Date.now() / 1000) + expiresInSeconds;

  const url = cloudinary.url(publicId, {
    resource_type: resourceType,
    type: 'authenticated',
    sign_url: true,
    secure: true,
    expires_at: timestamp,
  });

  return url;
};

export default cloudinary;
