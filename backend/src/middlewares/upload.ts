import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ApiError } from '../utils/ApiError';
import fs from 'fs';
import { v2 as cloudinary } from 'cloudinary';

// ========== Cloudinary Upload Helpers ==========

/**
 * Upload a file buffer directly to Cloudinary (for small files: images, documents)
 */
export const uploadBufferToCloudinary = (
  buffer: Buffer,
  folder: string,
  resourceType: 'image' | 'video' | 'raw' = 'image',
  filename?: string,
): Promise<{ url: string; publicId: string }> => {
  return new Promise((resolve, reject) => {
    const publicId = filename || uuidv4();
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: resourceType,
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
    stream.end(buffer);
  });
};

/**
 * Extract Cloudinary public_id from a Cloudinary URL
 */
export const extractPublicId = (cloudinaryUrl: string): string | null => {
  // پشتیبانی از URL با و بدون version number
  const match = cloudinaryUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
  return match ? match[1] : null;
};

/**
 * Delete a file from Cloudinary by URL or public ID
 */
export const deleteFromCloudinaryByUrl = async (
  fileUrl: string,
  resourceType: 'image' | 'video' | 'raw' = 'image',
): Promise<void> => {
  if (!fileUrl) return;
  // Only delete Cloudinary files
  if (!fileUrl.includes('cloudinary.com')) return;

  const publicId = extractPublicId(fileUrl);
  if (publicId) {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (err) {
      console.warn('Failed to delete old Cloudinary file:', err);
    }
  }
};

// =====================================================================
// ✅ ARCHITECTURE UPDATE — Video uploads now use S3 Presigned URLs
// =====================================================================
//
// Video and resource uploads have been migrated to direct S3 upload:
//   - Browser → S3 (via presigned URL, bypassing Node.js)
//   - Backend only generates signed URLs and confirms completion
//   - See: uploadController.ts, storageService.ts
//
// Image uploads (thumbnail, avatar) remain on Cloudinary via memoryStorage.
//
// =====================================================================

void path; // keep the import for image/document filters
void fs;  // keep the import for legacy compatibility

// Memory storage for small files (images, documents) — streamed directly to Cloudinary
const memoryStorage = multer.memoryStorage();

// ---------- Disk storage engines REMOVED (see comment block above) ----------
// (The previous `lectureVideoDiskStorage` engine is intentionally gone; the
//  three disk-based middleware exports below have been replaced with stubs
//  that short-circuit to HTTP 503 until the upload pipeline is rebuilt.)

const imageFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'فقط فایل‌های تصویری مجاز هستند (JPEG, PNG, GIF, WebP)'));
  }
};

const videoFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = /mp4|webm|mov/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype.startsWith('video/');

  // 🔒 هم پسوند و هم mimetype باید مجاز باشند (قبلاً || بود — دور زدن فیلتر ممکن بود)
  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'فرمت ویدیو باید MP4 یا WebM باشد. فرمت WMV پشتیبانی نمی‌شود'));
  }
};

const documentFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = /pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

  if (extname) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'نوع فایل مجاز نیست'));
  }
};

const lectureVideoFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedTypes = /mp4|webm|mov/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype.startsWith('video/');

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'فرمت ویدیو باید MP4 یا WebM باشد. فرمت WMV پشتیبانی نمی‌شود'));
  }
};

const lectureResourceFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedTypes = /pdf|zip|doc|docx|xlsx|ppt|pptx|rar|txt|mp3|wav|ogg|m4a|aac|flac/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

  if (extname) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'فقط فایل\u200cهای PDF, ZIP, DOC, DOCX, XLSX, PPT, PPTX, RAR, TXT و فایل‌های صوتی (MP3, WAV, OGG, M4A, AAC, FLAC) مجاز هستند'));
  }
};

const audioFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedTypes = /mp3|wav|ogg|m4a|aac|flac/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype.startsWith('audio/');

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'فرمت فایل صوتی باید MP3, WAV, OGG, M4A, AAC یا FLAC باشد'));
  }
};

const anyFileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Allowlist: فقط فرمت‌های مجاز قبول می‌شوند (امن‌تر از denylist)
  const allowedTypes =
    /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt|mp4|webm|mov|mp3|wav|ogg|m4a|aac|flac/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

  if (extname) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'آپلود این نوع فایل مجاز نیست'));
  }
};

const maxSize = parseInt(process.env.MAX_FILE_SIZE || '104857600', 10); // 100MB

// 📸 Memory storage → streams directly to Cloudinary
export const uploadAvatar = multer({
  storage: memoryStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for avatars
});

export const uploadImage = multer({
  storage: memoryStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for images
});

// 🎬 Large videos → NOW USE S3 PRESIGNED URLS (see uploadController.ts)
// Video uploads no longer go through Node.js. Use POST /api/v1/upload/presigned-url
// or POST /api/v1/upload/multipart/init instead.
export const uploadVideo = ((_req: any, res: any, _next: any) => {
  return res.status(400).json({
    success: false,
    message:
      'آپلود ویدیو از این مسیر حذف شده است. ' +
      'از API جدید آپلود S3 استفاده کنید: POST /api/v1/upload/presigned-url',
  });
}) as unknown as multer.Multer;

// 📄 Documents → memory storage → streams to Cloudinary
export const uploadDocument = multer({
  storage: memoryStorage,
  fileFilter: documentFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

export const uploadAny = multer({
  storage: memoryStorage,
  fileFilter: anyFileFilter,
  limits: { fileSize: maxSize },
});

// � Audio uploads → memory storage → streams to Cloudinary
export const uploadAudio = multer({
  storage: memoryStorage,
  fileFilter: audioFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB for audio files
});

// �🎬 Lecture videos → NOW USE S3 PRESIGNED URLS (see uploadController.ts)
export const lectureVideoUpload = ((_req: any, res: any, _next: any) => {
  return res.status(400).json({
    success: false,
    message:
      'آپلود ویدیو از این مسیر حذف شده است. ' +
      'از API جدید آپلود S3 استفاده کنید: POST /api/v1/upload/multipart/init',
  });
}) as unknown as multer.Multer;

// 📄 Lecture resources → NOW USE S3 PRESIGNED URLS (see uploadController.ts)
export const lectureResourceUpload = ((_req: any, res: any, _next: any) => {
  return res.status(400).json({
    success: false,
    message:
      'آپلود فایل پیوست از این مسیر حذف شده است. ' +
      'از API جدید آپلود S3 استفاده کنید: POST /api/v1/upload/presigned-url',
  });
}) as unknown as multer.Multer;

export const generateFileName = (originalName: string): string => {
  const ext = path.extname(originalName);
  return `${uuidv4()}${ext}`;
};
