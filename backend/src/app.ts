/// <reference path="./types/express.d.ts" />
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import fs from 'fs';

import routes from './routes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import {
  generalLimiter,
  authLimiter,
  registerLimiter,
  uploadLimiter,
} from './middlewares/rateLimiter';
import { swaggerSpec } from './config/swagger';
import passport from './config/passport';
import { resolveTenant } from './middlewares/tenant';

const app: Application = express();

// ==================== 1. ENSURE DIRECTORIES EXIST ====================
// ایجاد امن پوشه‌های uploads و scratch در شروع برنامه (بدون توقف برنامه در صورت بروز خطا)
try {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const subDirs = ['avatars', 'courses', 'lectures', 'resources', 'thumbnails'];

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  subDirs.forEach((sub) => {
    const dir = path.join(uploadsDir, sub);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
} catch (err) {
  console.warn('⚠️ [App] Could not create uploads directories (fallback to volume):', err);
}

try {
  const scratchDir = process.env.TEMP_DIR || '/home/app/scratch';
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }
} catch (err) {
  console.warn('⚠️ [App] Could not create scratch directory:', err);
}

// ==================== 2. HEALTH CHECK (برای Docker) ====================
// ✅ این مسیر قبل از تمام میدلورها و ریت‌لیمیترهاست تا وضعیت سلامت سرور همیشه سریع پاسخ داده شود
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ==================== 3. SECURITY & CORS ====================
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // مجوز پخش و استریم ویدیو/تصویر در مرورگر
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
        connectSrc: [
          "'self'",
          process.env.FRONTEND_URL || 'http://localhost:4200',
          'ws:',
          'wss:',
        ],
        mediaSrc: ["'self'", 'https:', 'blob:'],
        frameSrc: ["'self'", 'https://www.youtube.com', 'https://player.vimeo.com', 'https://www.aparat.com'],
      },
    },
  }),
);

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:4200', // در production حتماً CLIENT_URL=https://homayoon.academy تنظیم شود
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Tenant-ID'],
  }),
);

app.use(mongoSanitize());
app.use(hpp());

// ==================== 4. PARSERS & COMPRESSION ====================
// تشخیص درخواست‌های آپلود مالتی‌پارت جهت عدم اشغال حافظه توسط express.json
const isMultipartOrUpload = (req: Request): boolean => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) return true;

  const url = req.url;
  return (
    url.includes('/upload/proxy') ||
    url.includes('/thumbnail') ||
    url.includes('/promo-video') ||
    url.includes('/lecture-video') ||
    url.includes('/lecture-resource') ||
    url.includes('/avatar')
  );
};

app.use((req, res, next) => {
  if (isMultipartOrUpload(req)) {
    return next(); // رد کردن body parser برای آپلودهای استریم
  }
  express.json({ limit: '10mb' })(req, res, (err) => {
    if (err) return next(err);
    express.urlencoded({ extended: true, limit: '10mb' })(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  });
});

app.use(cookieParser());

// فعال‌سازی فشرده‌سازی پاسخ‌ها (به جز فایل‌های سنگین/ویدیو)
app.use((req, res, next) => {
  if (isMultipartOrUpload(req)) {
    return next();
  }
  compression()(req, res, next);
});

// ==================== 5. LOGGING ====================
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ==================== 6. STATIC FILES ====================
// سرو فایل‌های استاتیک محلی با پشتیبانی از Range Request
app.use(
  '/uploads',
  express.static(path.join(process.cwd(), 'uploads'), {
    maxAge: '1d',
    etag: true,
    acceptRanges: true,
    setHeaders: (res) => {
      res.setHeader(
        'Access-Control-Allow-Origin',
        process.env.CLIENT_URL || 'http://localhost:4200',
      );
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  }),
);

// ==================== 7. RATE LIMITING ====================
app.use('/api/', generalLimiter);
app.use('/api/v1/courses/*/thumbnail', uploadLimiter);
app.use('/api/v1/courses/*/promo-video', uploadLimiter);
app.use('/api/v1/courses/*/lecture-video', uploadLimiter);
app.use('/api/v1/courses/*/lecture-resource', uploadLimiter);
app.use('/api/v1/upload/proxy', uploadLimiter);
app.use('/api/v1/upload/presigned-url', uploadLimiter);
app.use('/api/v1/upload/multipart/*', uploadLimiter);
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', registerLimiter);
app.use('/api/v1/auth/forgot-password', authLimiter);

// ==================== 8. PASSPORT & MULTI-TENANCY ====================
app.use(passport.initialize());

// اعمال Tenant فقط در صورت فعال بودن سیستم چند مستأجری
if (process.env.MULTI_TENANT_ENABLED === 'true') {
  app.use(resolveTenant);
}

// ==================== 9. SWAGGER DOCS ====================
if (process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true') {
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Iranian Udemy API Docs',
    }),
  );
}

// ==================== 10. ROUTES ====================
app.use(routes);

// ==================== 11. ERROR HANDLING ====================
app.use(notFoundHandler);
app.use(errorHandler);

// ==================== 12. INLINE WORKER (CONDITIONAL) ====================
// ✅ اگر سرویس جداگانه Worker در داکر ران باشد، Worker درون API لود نمی‌شود تا رم کانتینر پر نشود
if (process.env.DISABLE_INLINE_WORKER !== 'true') {
  import('./workers/videoProcessor.worker')
    .then(() => {
      console.log('✅ [Worker] Inline Video processor worker آماده به کار شد');
    })
    .catch((err) => {
      console.warn(
        '⚠️ [Worker] Inline Video processor worker شروع نشد (Redis در دسترس نیست یا سرویس Worker مستقل است):',
        err?.message || err,
      );
    });
} else {
  console.log('ℹ️ [Worker] Inline worker غیرفعال است (سرویس اختصاصی Worker پردازش را انجام می‌دهد)');
}

export default app;