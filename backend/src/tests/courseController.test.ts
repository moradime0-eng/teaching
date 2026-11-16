/// <reference types="jest" />
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Course from '../models/Course';
import Category from '../models/Category'; // فقط برای ثبت schema (populate در کنترلرها)
import Section from '../models/Section';
import Lecture from '../models/Lecture';
import * as authMocked from '../middlewares/auth';
import { generateUniqueSlug } from '../utils/slugGenerator';
import { LectureType } from '../enums/LectureType';
import courseRoutes from '../routes/courseRoutes';
import { errorHandler } from '../middlewares/errorHandler';

/**
 * حداقل طول `description` در مدل Course برابر ۱۰۰ کاراکتر است؛
 * بنابراین تمام فیکسچرهای دوره باید از این رشته استفاده کنند.
 */
const VALID_DESCRIPTION =
  'This is a comprehensive test course description that is intentionally long enough to satisfy the platform minimum length validation rules.';

// Mock middleware
// ⚠️ شناسه‌ها باید ثابت باشند: کنترلرها مالکیت (`req.user._id` در برابر `course.instructor`)
// را بررسی می‌کنند و ساخت ObjectId جدید برای هر درخواست → همیشه 403 می‌داد.
jest.mock('../middlewares/auth', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mongoose = require('mongoose');
  const mockInstructorId = new mongoose.Types.ObjectId();
  const mockTenantId = new mongoose.Types.ObjectId();
  return {
    authenticate: (req: any, res: any, next: any) => {
      req.user = { _id: mockInstructorId, role: 'instructor' };
      req.tenantId = mockTenantId;
      next();
    },
    optionalAuth: (req: any, res: any, next: any) => next(),
    MOCK_INSTRUCTOR_ID: mockInstructorId,
    MOCK_TENANT_ID: mockTenantId,
  };
});

jest.mock('../middlewares/authorize', () => ({
  instructorOnly: (req: any, res: any, next: any) => next(),
  adminOnly: (req: any, res: any, next: any) => next(),
}));

jest.mock('../middlewares/validate', () => ({
  validate: (validators: any[]) => (req: any, res: any, next: any) => next(),
}));

jest.mock('../middlewares/upload', () => {
  // ⚠️ شبیه‌سازی محدودیت ۲ مگابایتی multer:
  // بدون مصرفِ بدنه، درخواست‌های بزرگ با ECONNRESET قطع می‌شدند.
  const MAX_FILE_SIZE = 2 * 1024 * 1024;
  const fakeUploadSingle = (_field: string) => (req: any, res: any, next: any) => {
    const contentLength = Number(req.headers['content-length'] || 0);
    if (contentLength > MAX_FILE_SIZE) {
      req.resume();
      req.on('end', () => {
        const err: any = new Error('File too large');
        err.statusCode = 400;
        err.code = 'LIMIT_FILE_SIZE';
        next(err);
      });
      return;
    }
    next();
  };
  return {
    uploadImage: { single: fakeUploadSingle },
    uploadVideo: { single: fakeUploadSingle },
  };
});

jest.mock('../utils/ApiError', () => ({
  ApiError: class ApiError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
    static badRequest(message: string) {
      return new ApiError(400, message);
    }
    static unauthorized(message = 'Unauthorized') {
      return new ApiError(401, message);
    }
    static forbidden(message = 'Forbidden') {
      return new ApiError(403, message);
    }
    static notFound(message = 'Not Found') {
      return new ApiError(404, message);
    }
    static conflict(message: string) {
      return new ApiError(409, message);
    }
  },
}));

jest.mock('../utils/ApiResponse', () => ({
  ApiResponse: {
    success: (res: any, data: any, message?: string) =>
      res.status(200).json({ success: true, data, message }),
    created: (res: any, data: any, message?: string) =>
      res.status(201).json({ success: true, data, message }),
    paginated: (res: any, data: any, page: number, limit: number, total: number) =>
      res.status(200).json({
        success: true,
        data,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      }),
  },
}));

jest.mock('../middlewares/asyncHandler', () => ({
  asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next),
}));

// ⚠️ slugGenerator دیگر mock نمی‌شود — خودِ تست‌های generateUniqueSlug رفتار واقعی
// (شامل شماره‌گذاری test-course-1) را آزمایش می‌کنند.

jest.mock('../utils/paginationHelper', () => ({
  getPaginationOptions: (req: any) => ({
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 10,
    skip: (parseInt(req.query.page) - 1) * (parseInt(req.query.limit) || 10),
    sort: req.query.sort || '-createdAt',
  }),
}));

describe('Course Controller', () => {
  let app: express.Express;
  let mongoServer: MongoMemoryServer;
  let instructorId: mongoose.Types.ObjectId;
  let tenantId: mongoose.Types.ObjectId;
  let categoryId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // همان شناسه‌هایی که middleware شبیه‌سازی‌شده‌ی authenticate روی req.user می‌گذارد
    instructorId = (authMocked as any).MOCK_INSTRUCTOR_ID;
    tenantId = (authMocked as any).MOCK_TENANT_ID;

    // ساخت دسته‌بندی واقعی — هم schema مدل Category ثبت می‌شود (populate در کنترلرها)
    // و هم تست‌ها با یک ObjectId معتبر کار می‌کنند.
    const category = await Category.create({
      name: 'Test Category',
      slug: 'test-category',
      tenant: tenantId,
    });
    categoryId = category._id as mongoose.Types.ObjectId;

    app = express();
    app.use(express.json());
    app.use('/api/v1/courses', courseRoutes);
    // middleware مدیریت خطا — پاسخ‌های خطا باید `{success:false, ...}` باشند
    app.use(errorHandler);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Course.deleteMany({});
  });

  describe('POST /api/v1/courses', () => {
    it('should create a course with valid data', async () => {
      const courseData = {
        title: 'Test Course Title',
        description: VALID_DESCRIPTION,
        shortDescription: 'Short description',
        category: categoryId.toString(),
        price: 100000,
        level: 'beginner',
      };

      const response = await request(app).post('/api/v1/courses').send(courseData).expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(courseData.title);
      expect(response.body.data.instructor.toString()).toBe(instructorId.toString());
      // ⚠️ چندمستأجری در حال حاضر غیرفعال است ([MULTI-TENANT-DISABLED]) و tenant ثبت نمی‌شود
      if (response.body.data.tenant) {
        expect(response.body.data.tenant.toString()).toBe(tenantId.toString());
      }
      expect(response.body.data.status).toBe('draft');
      expect(response.body.data.slug).toBeDefined();
    });

    it('should return 400 for title less than 10 characters', async () => {
      const courseData = {
        title: 'Short',
        description: VALID_DESCRIPTION,
        shortDescription: 'Short description',
        category: categoryId.toString(),
        price: 100000,
      };

      const response = await request(app).post('/api/v1/courses').send(courseData).expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for missing category', async () => {
      const courseData = {
        title: 'Test Course Title',
        description: VALID_DESCRIPTION,
        shortDescription: 'Short description',
        price: 100000,
      };

      const response = await request(app).post('/api/v1/courses').send(courseData).expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for missing title', async () => {
      const courseData = {
        description: VALID_DESCRIPTION,
        shortDescription: 'Short description',
        category: categoryId.toString(),
        price: 100000,
      };

      const response = await request(app).post('/api/v1/courses').send(courseData).expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for description less than 100 characters', async () => {
      const courseData = {
        title: 'Test Course Title',
        description: 'Short',
        shortDescription: 'Short description',
        category: categoryId.toString(),
        price: 100000,
      };

      const response = await request(app).post('/api/v1/courses').send(courseData).expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for shortDescription more than 300 characters', async () => {
      const courseData = {
        title: 'Test Course Title',
        description: VALID_DESCRIPTION,
        shortDescription: 'a'.repeat(301),
        category: categoryId.toString(),
        price: 100000,
      };

      const response = await request(app).post('/api/v1/courses').send(courseData).expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/courses/:id/thumbnail', () => {
    let courseId: string;

    beforeEach(async () => {
      const course = await Course.create({
        title: 'Test Course',
        slug: 'test-course',
        description: VALID_DESCRIPTION,
        shortDescription: 'Short desc',
        category: categoryId,
        instructor: instructorId,
        tenant: tenantId,
        price: 100000,
        status: 'draft',
      });
      courseId = (course._id as mongoose.Types.ObjectId).toString();
    });

    it('should return 400 when no file uploaded', async () => {
      const response = await request(app).post(`/api/v1/courses/${courseId}/thumbnail`).expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for non-image file', async () => {
      const response = await request(app)
        .post(`/api/v1/courses/${courseId}/thumbnail`)
        .attach('thumbnail', Buffer.from('fake pdf content'), 'test.pdf')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for image larger than 2MB', async () => {
      const largeBuffer = Buffer.alloc(3 * 1024 * 1024); // 3MB
      const response = await request(app)
        .post(`/api/v1/courses/${courseId}/thumbnail`)
        .attach('thumbnail', largeBuffer, 'large.jpg')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('generateUniqueSlug', () => {
    it('should generate slug from title', async () => {
      const slug = await generateUniqueSlug('Test Course Title', Course);
      expect(slug).toBe('test-course-title');
    });

    it('should append number for duplicate slug', async () => {
      await Course.create({
        title: 'Test Course',
        slug: 'test-course',
        description: VALID_DESCRIPTION,
        shortDescription: 'Short desc',
        category: categoryId,
        instructor: instructorId,
        tenant: tenantId,
        price: 100000,
        status: 'draft',
      });

      const slug = await generateUniqueSlug('Test Course', Course);
      expect(slug).toBe('test-course-1');
    });

    it('should exclude current course when updating', async () => {
      const course = await Course.create({
        title: 'Test Course',
        slug: 'test-course',
        description: VALID_DESCRIPTION,
        shortDescription: 'Short desc',
        category: categoryId,
        instructor: instructorId,
        tenant: tenantId,
        price: 100000,
        status: 'draft',
      });

      const slug = await generateUniqueSlug(
        'Test Course',
        Course,
        (course._id as mongoose.Types.ObjectId).toString(),
      );
      expect(slug).toBe('test-course');
    });
  });

  describe('PUT /api/v1/courses/:id', () => {
    let courseId: string;

    beforeEach(async () => {
      const course = await Course.create({
        title: 'Original Course',
        slug: 'original-course',
        description: VALID_DESCRIPTION,
        shortDescription: 'Short desc',
        category: categoryId,
        instructor: instructorId,
        tenant: tenantId,
        price: 100000,
        status: 'draft',
      });
      courseId = (course._id as mongoose.Types.ObjectId).toString();
    });

    it('should update course title and regenerate slug', async () => {
      const response = await request(app)
        .put(`/api/v1/courses/${courseId}`)
        .send({ title: 'Updated Course Title' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Updated Course Title');
      expect(response.body.data.slug).toBe('updated-course-title');
    });

    it('should return 404 for non-existent course', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .put(`/api/v1/courses/${fakeId}`)
        .send({ title: 'Updated Title' })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should return 403 when user is not owner', async () => {
      const otherInstructorId = new mongoose.Types.ObjectId();
      const course = await Course.create({
        title: 'Other Course',
        slug: 'other-course',
        description: VALID_DESCRIPTION,
        shortDescription: 'Short desc',
        category: categoryId,
        instructor: otherInstructorId,
        tenant: tenantId,
        price: 100000,
        status: 'draft',
      });

      const response = await request(app)
        .put(`/api/v1/courses/${course._id}`)
        .send({ title: 'Hacked Title' })
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/courses/:id/submit', () => {
    let courseId: string;

    beforeEach(async () => {
      const course = await Course.create({
        title: 'Course to Submit',
        slug: 'course-to-submit',
        description: VALID_DESCRIPTION,
        shortDescription: 'Short desc',
        category: categoryId,
        instructor: instructorId,
        tenant: tenantId,
        price: 100000,
        status: 'draft',
      });
      courseId = (course._id as mongoose.Types.ObjectId).toString();

      // ✅ فصل/درس حالا مدل‌های جدا هستند (Section/Lecture) و دیگر داخل Course ذخیره نمی‌شوند
      const section = await Section.create({
        course: course._id,
        title: 'Section 1',
        description: 'Section description',
        order: 0,
        tenant: tenantId,
      });

      await Lecture.create({
        section: section._id,
        course: course._id,
        title: 'Lecture 1',
        type: LectureType.VIDEO,
        duration: 30,
        order: 0,
        isFreePreview: false,
        tenant: tenantId,
      });
    });

    it('should submit course for review', async () => {
      const response = await request(app).post(`/api/v1/courses/${courseId}/submit`).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('pending');
    });

    it('should return 400 for course with no sections', async () => {
      const course = await Course.create({
        title: 'Empty Course',
        slug: 'empty-course',
        description: VALID_DESCRIPTION,
        shortDescription: 'Short desc',
        category: categoryId,
        instructor: instructorId,
        tenant: tenantId,
        price: 100000,
        status: 'draft',
        sections: [],
      });

      const response = await request(app).post(`/api/v1/courses/${course._id}/submit`).expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});
