import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CourseService } from './course.service';
import { environment } from '../../../environments/environment.development';
import { Category } from '../models/category.model';
import {
  Course,
  CreateCourseRequest,
  UpdateCourseRequest,
  CourseLevel,
  CourseStatus,
} from '../models/course.model';
import { User, UserRole } from '../models/user.model';

describe('CourseService', () => {
  let service: CourseService;
  let httpMock: HttpTestingController;
  const apiUrl = environment.apiUrl;

  // ==========================================
  // Helper: Mock User
  // ==========================================
  const mockUser: User = {
    _id: 'instructor1',
    mobile: '09121234567',
    fullName: 'Test Instructor',
    email: 'instructor@test.com',
    role: UserRole.INSTRUCTOR,
    isEmailVerified: true,
    isPhoneVerified: false,
    isActive: true,
    isBanned: false,
    wallet: { balance: 0, totalDeposited: 0, totalWithdrawn: 0 },
    preferredLanguage: 'fa',
    timezone: 'Asia/Tehran',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // ==========================================
  // Helper: Mock Category
  // ==========================================
  const createMockCategory = (overrides: Partial<Category> = {}): Category => ({
    _id: '1',
    name: 'Programming',
    slug: 'programming',
    order: 1,
    isActive: true,
    totalCourses: 10,
    level: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  // ==========================================
  // Helper: Mock Course
  // ==========================================
  const createMockCourse = (overrides: Partial<Course> = {}): Course => ({
    _id: '1',
    id: '1',
    rating: 4.5,
    title: 'Test Course',
    slug: 'test-course',
    description: 'Test description',
    shortDescription: 'Short desc',
    thumbnail: 'thumb.jpg',
    instructor: mockUser,
    category: createMockCategory(),
    level: CourseLevel.BEGINNER,
    language: 'fa',
    price: 100000,
    isFree: false,
    status: CourseStatus.PUBLISHED,
    requirements: [],
    // ⚠️ FIX: این فیلد در مدل Course اجباری است ولی در mock وجود نداشت
    // و باعث خطای TS2322 (عدم تطابق نوع) می‌شد.
    requirementCourses: [],
    learningOutcomes: [],
    targetAudience: [],
    tags: [],
    totalDuration: 60,
    totalLectures: 10,
    totalSections: 2,
    totalStudents: 100,
    totalReviews: 10,
    averageRating: 4.5,
    ratingDistribution: { five: 5, four: 3, three: 2, two: 0, one: 0 },
    totalRevenue: 10000000,
    hasCertificate: true,
    hasLifetimeAccess: true,
    hasSupport: false,
    installmentEnabled: false,
    installmentCount: 3,
    isFeatured: false,
    isBestseller: false,
    isRecentlyPublished: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [CourseService],
    });
    service = TestBed.inject(CourseService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getCategories', () => {
    it('should send GET request to /categories', () => {
      const mockCategories: Category[] = [
        createMockCategory({ _id: '1', name: 'Programming', slug: 'programming', order: 1 }),
        createMockCategory({
          _id: '2',
          name: 'Design',
          slug: 'design',
          order: 2,
          totalCourses: 5,
        }),
      ];

      service.getCategories().subscribe((res) => {
        expect(res.success).toBeTrue();
        expect(res.data).toEqual(mockCategories);
      });

      const req = httpMock.expectOne(`${apiUrl}/categories`);
      expect(req.request.method).toBe('GET');
      req.flush({ success: true, data: mockCategories });
    });
  });

  describe('getSubcategories', () => {
    it('should send GET request with parentId query param', () => {
      const mockSubcategories: Category[] = [
        createMockCategory({
          _id: '3',
          name: 'Frontend',
          slug: 'frontend',
          parent: '1',
          order: 1,
          totalCourses: 5,
          level: 1,
        }),
        createMockCategory({
          _id: '4',
          name: 'Backend',
          slug: 'backend',
          parent: '1',
          order: 2,
          totalCourses: 5,
          level: 1,
        }),
      ];

      service.getSubcategories('1').subscribe((res) => {
        expect(res.success).toBeTrue();
        expect(res.data).toEqual(mockSubcategories);
      });

      const req = httpMock.expectOne(`${apiUrl}/categories?parentId=1`);
      expect(req.request.method).toBe('GET');
      req.flush({ success: true, data: mockSubcategories });
    });
  });

  describe('getCategoryTree', () => {
    it('should send GET request to /categories/tree', () => {
      const mockTree: Category[] = [
        createMockCategory({
          _id: '1',
          name: 'Programming',
          slug: 'programming',
          children: [
            createMockCategory({
              _id: '3',
              name: 'Frontend',
              slug: 'frontend',
              parent: '1',
              order: 1,
              totalCourses: 5,
              level: 1,
            }),
          ],
        }),
      ];

      service.getCategoryTree().subscribe((res) => {
        expect(res.success).toBeTrue();
        expect(res.data).toEqual(mockTree);
      });

      const req = httpMock.expectOne(`${apiUrl}/categories/tree`);
      expect(req.request.method).toBe('GET');
      req.flush({ success: true, data: mockTree });
    });

    it('should deduplicate concurrent category tree requests (shareReplay)', () => {
      const mockTree: Category[] = [createMockCategory({ _id: '1', name: 'Programming' })];
      let firstRes: any = null;
      let secondRes: any = null;

      service.getCategoryTree().subscribe((res) => (firstRes = res));
      service.getCategoryTree().subscribe((res) => (secondRes = res));

      // فقط یک درخواست HTTP باید ارسال شود
      const requests = httpMock.match(`${apiUrl}/categories/tree`);
      expect(requests.length).toBe(1);
      requests[0].flush({ success: true, data: mockTree });

      expect(firstRes.success).toBeTrue();
      expect(secondRes.success).toBeTrue();
      expect(firstRes.data).toEqual(mockTree);
      expect(secondRes.data).toEqual(mockTree);
    });
  });

  describe('getParentCategories', () => {
    it('should deduplicate concurrent parent category requests (shareReplay)', () => {
      const mockCats: Category[] = [createMockCategory({ _id: '1', name: 'Programming' })];

      service.getParentCategories().subscribe();
      service.getParentCategories().subscribe();

      const requests = httpMock.match(`${apiUrl}/categories?level=0`);
      expect(requests.length).toBe(1);
      requests[0].flush({ success: true, data: mockCats });
    });
  });

  describe('getCourseById', () => {
    it('should send GET request to /courses/:id', () => {
      const mockCourse = createMockCourse();

      service.getCourseById('1').subscribe((res) => {
        expect(res.success).toBeTrue();
        expect(res.data).toEqual(mockCourse);
      });

      const req = httpMock.expectOne(`${apiUrl}/courses/1`);
      expect(req.request.method).toBe('GET');
      req.flush({ success: true, data: mockCourse });
    });
  });

  describe('createCourse', () => {
    it('should send POST request to /courses with course data', () => {
      const createData: CreateCourseRequest = {
        title: 'New Course',
        description: 'Course description',
        shortDescription: 'Short desc',
        category: 'cat1',
        price: 100000,
      };

      const mockResponse = createMockCourse({
        title: 'New Course',
        slug: 'new-course',
        thumbnail: 'default.jpg',
        level: CourseLevel.ALL_LEVELS,
        status: CourseStatus.DRAFT,
        totalDuration: 0,
        totalLectures: 0,
        totalSections: 0,
        totalStudents: 0,
        totalReviews: 0,
        averageRating: 0,
        rating: 0,
        ratingDistribution: { five: 0, four: 0, three: 0, two: 0, one: 0 },
        totalRevenue: 0,
      });

      service.createCourse(createData).subscribe((res) => {
        expect(res.success).toBeTrue();
        expect(res.data).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(`${apiUrl}/courses`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(createData);
      req.flush({ success: true, data: mockResponse });
    });
  });

  describe('updateCourse', () => {
    it('should send PUT request to /courses/:id with update data', () => {
      const updateData: UpdateCourseRequest = {
        title: 'Updated Course',
        price: 150000,
      };

      const mockResponse = createMockCourse({
        title: 'Updated Course',
        slug: 'updated-course',
        price: 150000,
        level: CourseLevel.ALL_LEVELS,
        status: CourseStatus.DRAFT,
        totalDuration: 0,
        totalLectures: 0,
        totalSections: 0,
        totalStudents: 0,
        totalReviews: 0,
        averageRating: 0,
        rating: 0,
        ratingDistribution: { five: 0, four: 0, three: 0, two: 0, one: 0 },
        totalRevenue: 0,
      });

      service.updateCourse('1', updateData).subscribe((res) => {
        expect(res.success).toBeTrue();
        expect(res.data).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(`${apiUrl}/courses/1`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(updateData);
      req.flush({ success: true, data: mockResponse });
    });
  });

  describe('submitForReview', () => {
    it('should send POST request to /courses/:id/submit', () => {
      const mockResponse = createMockCourse({
        level: CourseLevel.ALL_LEVELS,
        status: CourseStatus.PENDING,
        totalDuration: 0,
        totalLectures: 0,
        totalSections: 0,
        totalStudents: 0,
        totalReviews: 0,
        averageRating: 0,
        rating: 0,
        ratingDistribution: { five: 0, four: 0, three: 0, two: 0, one: 0 },
        totalRevenue: 0,
      });

      service.submitForReview('1').subscribe((res) => {
        expect(res.success).toBeTrue();
        expect(res.data?.status).toBe(CourseStatus.PENDING);
      });

      const req = httpMock.expectOne(`${apiUrl}/courses/1/submit`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ success: true, data: mockResponse });
    });
  });

  describe('uploadThumbnail', () => {
    it('should send POST request with FormData containing thumbnail', () => {
      const mockFile = new File(['test'], 'thumbnail.jpg', { type: 'image/jpeg' });
      const mockResponse = { thumbnail: '/uploads/thumbnails/thumbnail.jpg' };

      // ⚠️ FIX: سرویس Observable<LectureUploadEvent> برمی‌گرداند (فقط فیلد type)،
      // نه پاسخ API با success/data. تست باید به رویداد 'success' گوش دهد.
      service.uploadThumbnail('1', mockFile).subscribe((res) => {
        expect(res.type).toBe('success');
      });

      const req = httpMock.expectOne(`${apiUrl}/courses/1/thumbnail`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body instanceof FormData).toBeTrue();
      expect((req.request.body as FormData).get('thumbnail')).toBe(mockFile);
      req.flush({ success: true, data: mockResponse });
    });
  });

  describe('uploadPromoVideo', () => {
    it('should send POST request with FormData containing promoVideo', () => {
      const mockFile = new File(['test'], 'promo.mp4', { type: 'video/mp4' });
      const mockResponse = { promoVideo: '/uploads/videos/promo.mp4' };

      // ⚠️ FIX: نوع بازگشتی LectureUploadEvent است، نه ApiResponse
      service.uploadPromoVideo('1', mockFile).subscribe((res) => {
        expect(res.type).toBe('success');
      });

      const req = httpMock.expectOne(`${apiUrl}/courses/1/promo-video`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body instanceof FormData).toBeTrue();
      expect((req.request.body as FormData).get('promoVideo')).toBe(mockFile);
      req.flush({ success: true, data: mockResponse });
    });
  });
});