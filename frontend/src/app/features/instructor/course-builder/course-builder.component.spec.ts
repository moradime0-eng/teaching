import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule, Validators, FormBuilder, FormGroup, FormArray } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpEventType } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CourseBuilderComponent } from './course-builder.component';
import { CourseService } from '../../../core/services/course.service';
import { ApiService } from '../../../core/services/api.service';
import { VideoUploadService } from '../../../core/services/video-upload.service';
import { TenantService } from '../../../core/services/tenant.service';
import { AuthService } from '../../../core/services/auth.service';
import { SectionService } from '../../../core/services/section.service';
import { LectureService } from '../../../core/services/lecture.service';
import { LearningPathService } from '../../../services/learning-path.service';
import { ActivatedRoute } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';

describe('CourseBuilderComponent', () => {
  let component: CourseBuilderComponent;
  let fixture: ComponentFixture<CourseBuilderComponent>;
  let mockCourseService: jasmine.SpyObj<CourseService>;
  let mockApiService: jasmine.SpyObj<ApiService>;
  let mockVideoUploadService: jasmine.SpyObj<VideoUploadService>;
  let mockTenantService: jasmine.SpyObj<TenantService>;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockSectionService: jasmine.SpyObj<SectionService>;
  let mockLectureService: jasmine.SpyObj<LectureService>;
  let mockLpService: jasmine.SpyObj<LearningPathService>;
  let mockActivatedRoute: any;
  let fb: FormBuilder;

  // Helper to access private members without TS errors
  const asAny = (obj: any) => obj as any;

  beforeEach(async () => {
    mockCourseService = jasmine.createSpyObj('CourseService', [
      'getCategories',
      'getSubcategories',
      'getParentCategories',
      'categories',
      'uploadThumbnail',
      'uploadPromoVideo',
    ]);
    // categories یک signal است؛ برای اینکه .categories() قابل فراخوانی باشد
    // باید خروجی callable برگرداند.
    (mockCourseService as any).categories = jasmine.createSpy('categories').and.returnValue([]);
    mockCourseService.getParentCategories.and.returnValue(
      of({ success: true, message: 'OK', data: [] } as any),
    );
    mockApiService = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'patch', 'delete']);
    // ⚠️ FIX: spy بدون returnValue مقدار undefined برمی‌گرداند و
    // هر فراخوانی .subscribe() روی آن خطای
    // «Cannot read properties of undefined (reading 'subscribe')» می‌داد.
    const emptyOk = of({ success: true, message: 'OK', data: [] } as any);
    mockApiService.get.and.returnValue(emptyOk);
    mockApiService.post.and.returnValue(emptyOk);
    mockApiService.put.and.returnValue(emptyOk);
    mockApiService.patch.and.returnValue(emptyOk);
    mockApiService.delete.and.returnValue(emptyOk);
    // ⚠️ FIX: کامپوننت، VideoUploadService و TenantService را inject می‌کند.
    // بدون mock این‌ها، inject آن‌ها به HttpClient می‌رسد که provider ندارد
    // و خطای NG0201 (51 تست fail) می‌داد.
    mockVideoUploadService = jasmine.createSpyObj('VideoUploadService', [
      'uploadVideo',
      'getPlaybackUrl',
      'refreshPlaybackUrl',
      'cancelUpload',
    ]);
    mockTenantService = jasmine.createSpyObj('TenantService', [
      'getTenantId',
      'getCurrentTenantRole',
      'canAccessTenant',
    ]);
    mockVideoUploadService.getPlaybackUrl.and.returnValue(of({ url: '' } as any));
    mockVideoUploadService.refreshPlaybackUrl.and.returnValue(of({ url: '' } as any));
    mockVideoUploadService.uploadVideo.and.returnValue(
      Promise.resolve({ url: '', key: '', duration: 0 }),
    );
    mockTenantService.getTenantId.and.returnValue(null as any);
    mockTenantService.getCurrentTenantRole.and.returnValue(null as any);
    mockTenantService.canAccessTenant.and.returnValue(true);

    // ⚠️ FIX: این سرویس‌ها هم inject می‌شوند و به HttpClient می‌رسند
    // نکته: در AuthService، `currentUser` یک signal است نه متد،
    // پس باید به‌صورت spy تعریف شود تا .and روی آن کار کند.
    mockAuthService = jasmine.createSpyObj('AuthService', ['isAdmin', 'currentUser']);
    mockAuthService.isAdmin.and.returnValue(false);
    mockAuthService.currentUser.and.returnValue(null as any);

    mockSectionService = jasmine.createSpyObj('SectionService', [
      'getSections',
      'createSection',
      'updateSection',
      'deleteSection',
    ]);
    mockSectionService.getSections.and.returnValue(of({ success: true, data: [] } as any));

    mockLectureService = jasmine.createSpyObj('LectureService', [
      'getLectures',
      'createLecture',
      'updateLecture',
      'deleteLecture',
    ]);
    mockLectureService.getLectures.and.returnValue(of({ success: true, data: [] } as any));

    mockLpService = jasmine.createSpyObj('LearningPathService', [
      'searchForAssignment',
      'getDetailsForAssignment',
      'addCourseToStage',
      'quickCreatePath',
      'getLearningPathsWithCourse',
    ]);
    mockLpService.searchForAssignment.and.returnValue(of({ success: true, data: [] } as any));
    mockLpService.getDetailsForAssignment.and.returnValue(of({ success: true, data: {} } as any));
    mockLpService.addCourseToStage.and.returnValue(of({ success: true, data: {} } as any));
    mockLpService.quickCreatePath.and.returnValue(of({ success: true, data: {} } as any));
    mockLpService.getLearningPathsWithCourse.and.returnValue(
      of({ success: true, data: [] } as any),
    );

    mockActivatedRoute = {
      snapshot: {
        paramMap: {
          get: jasmine.createSpy('get').and.returnValue(null),
        },
      },
    };

    mockCourseService.getCategories.and.returnValue(
      of({ success: true, message: 'OK', data: [] as any }),
    );
    mockCourseService.getSubcategories.and.returnValue(
      of({ success: true, message: 'OK', data: [] as any }),
    );

    // Return a LectureUploadEvent-compatible object with `type` property.
    // Using HttpEventType.Response so consumers treating it like a final response work.
    mockCourseService.uploadThumbnail.and.returnValue(
      of({
        type: HttpEventType.Response,
        success: true,
        message: 'OK',
        data: { thumbnail: '/uploads/test.jpg' },
      } as any),
    );
    mockCourseService.uploadPromoVideo.and.returnValue(
      of({
        type: HttpEventType.Response,
        success: true,
        message: 'OK',
        data: { promoVideo: '/uploads/test.mp4' },
      } as any),
    );

    await TestBed.configureTestingModule({
      imports: [
        CourseBuilderComponent,
        ReactiveFormsModule,
        NoopAnimationsModule,
        MatIconModule,
        MatProgressSpinnerModule,
        // ⚠️ FIX: قالب کامپوننت از routerLink استفاده می‌کند و RouterLink
        // به نمونه‌ی واقعی Router نیاز دارد (subscribeToNavigationEventsIfNecessary).
        // spy کافی نبود و ۴۳ تست با «reading 'subscribe'» می‌افتادند.
        RouterTestingModule,
      ],
      providers: [
        { provide: CourseService, useValue: mockCourseService },
        { provide: ApiService, useValue: mockApiService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: VideoUploadService, useValue: mockVideoUploadService },
        { provide: TenantService, useValue: mockTenantService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: SectionService, useValue: mockSectionService },
        { provide: LectureService, useValue: mockLectureService },
        { provide: LearningPathService, useValue: mockLpService },
        // ⚠️ FIX: Router را mock نکنیم؛ RouterTestingModule یک نمونه‌ی واقعی
        // فراهم می‌کند که routerLink به درستی کار کند.
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CourseBuilderComponent);
    component = fixture.componentInstance;
    fb = new FormBuilder();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('generateSlug', () => {
    it('should generate slug from Persian title', () => {
      const title = 'آموزش انگولار پیشرفته';
      const slug = asAny(component).generateSlug(title);
      expect(slug).toBe('آموزش-انگولار-پیشرفته');
    });

    it('should generate slug from English title', () => {
      const title = 'Advanced Angular Course';
      const slug = asAny(component).generateSlug(title);
      expect(slug).toBe('advanced-angular-course');
    });

    it('should handle mixed Persian and English', () => {
      const title = 'آموزش Angular 17';
      const slug = asAny(component).generateSlug(title);
      expect(slug).toBe('آموزش-angular-17');
    });

    it('should remove special characters', () => {
      const title = 'Test @#$% Course!';
      const slug = asAny(component).generateSlug(title);
      expect(slug).toBe('test-course');
    });

    it('should limit slug to 60 characters', () => {
      const title = 'a'.repeat(100);
      const slug = asAny(component).generateSlug(title);
      expect(slug.length).toBeLessThanOrEqual(60);
    });
  });

  describe('addTag', () => {
    beforeEach(() => {
      asAny(component).initForms();
    });

    it('should add a new tag', () => {
      component.tagInput.set('angular');
      component.addTag();
      expect(component.tags.length).toBe(1);
      expect(component.tags.at(0).value).toBe('angular');
    });

    it('should not add duplicate tag', () => {
      component.tagInput.set('angular');
      component.addTag();
      component.tagInput.set('angular');
      component.addTag();
      expect(component.tags.length).toBe(1);
    });

    it('should not add tag when max limit reached', () => {
      for (let i = 0; i < 10; i++) {
        component.tagInput.set(`tag${i}`);
        component.addTag();
      }
      component.tagInput.set('tag11');
      component.addTag();
      expect(component.tags.length).toBe(10);
    });

    it('should clear input after adding tag', () => {
      component.tagInput.set('angular');
      component.addTag();
      expect(component.tagInput()).toBe('');
    });

    it('should trim whitespace', () => {
      component.tagInput.set('  angular  ');
      component.addTag();
      expect(component.tags.at(0).value).toBe('angular');
    });
  });

  describe('removeTag', () => {
    beforeEach(() => {
      asAny(component).initForms();
      component.tags.push(fb.control('angular'));
      component.tags.push(fb.control('react'));
    });

    it('should remove tag at index', () => {
      component.removeTag(0);
      expect(component.tags.length).toBe(1);
      expect(component.tags.at(0).value).toBe('react');
    });
  });

  describe('onTagKeydown', () => {
    beforeEach(() => {
      asAny(component).initForms();
    });

    it('should add tag on Enter key', () => {
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      component.tagInput.set('angular');
      component.onTagKeydown(event);
      expect(component.tags.length).toBe(1);
    });

    it('should add tag on comma key', () => {
      const event = new KeyboardEvent('keydown', { key: ',' });
      component.tagInput.set('angular');
      component.onTagKeydown(event);
      expect(component.tags.length).toBe(1);
    });

    it('should prevent default on Enter', () => {
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      spyOn(event, 'preventDefault');
      component.tagInput.set('angular');
      component.onTagKeydown(event);
      expect(event.preventDefault).toHaveBeenCalled();
    });
  });

  describe('addSection', () => {
    beforeEach(() => {
      asAny(component).initForms();
    });

    it('should add a new section with empty lectures', () => {
      component.addSection();
      expect(component.sections.length).toBe(1);
      expect(component.sections.at(0).get('title')).toBeDefined();
      expect(component.sections.at(0).get('lectures')).toBeDefined();
    });

    it('should auto-expand new section', () => {
      component.addSection();
      expect(component.isSectionCollapsed(0)).toBeFalse();
    });
  });

  describe('duplicateSection', () => {
    beforeEach(() => {
      asAny(component).initForms();
      component.sections.push(
        fb.group({
          title: ['Section 1', Validators.required],
          description: ['Description 1'],
          lectures: fb.array([
            fb.group({
              title: ['Lecture 1', Validators.required],
              type: ['video'],
              duration: [30],
              isFreePreview: [false],
              content: ['Content 1'],
            }),
          ]),
        }),
      );
    });

    it('should duplicate section with all lectures', () => {
      component.duplicateSection(0);
      expect(component.sections.length).toBe(2);
      expect(component.sections.at(1).get('title')?.value).toBe('Section 1 (کپی)');
      expect(component.sections.at(1).get('description')?.value).toBe('Description 1');
      const lectures = component.sections.at(1).get('lectures') as FormArray;
      expect(lectures.length).toBe(1);
      expect(lectures.at(0).get('title')?.value).toBe('Lecture 1');
      expect(lectures.at(0).get('type')?.value).toBe('video');
      expect(lectures.at(0).get('duration')?.value).toBe(30);
    });
  });

  describe('moveSectionUp', () => {
    beforeEach(() => {
      asAny(component).initForms();
      component.sections.push(
        fb.group({ title: ['Section 1'], description: '', lectures: fb.array([]) }),
      );
      component.sections.push(
        fb.group({ title: ['Section 2'], description: '', lectures: fb.array([]) }),
      );
      component.sections.push(
        fb.group({ title: ['Section 3'], description: '', lectures: fb.array([]) }),
      );
    });

    it('should move section up', () => {
      component.moveSectionUp(1);
      expect(component.sections.at(0).get('title')?.value).toBe('Section 2');
      expect(component.sections.at(1).get('title')?.value).toBe('Section 1');
    });

    it('should not move first section up', () => {
      component.moveSectionUp(0);
      expect(component.sections.at(0).get('title')?.value).toBe('Section 1');
    });
  });

  describe('moveSectionDown', () => {
    beforeEach(() => {
      asAny(component).initForms();
      component.sections.push(
        fb.group({ title: ['Section 1'], description: '', lectures: fb.array([]) }),
      );
      component.sections.push(
        fb.group({ title: ['Section 2'], description: '', lectures: fb.array([]) }),
      );
      component.sections.push(
        fb.group({ title: ['Section 3'], description: '', lectures: fb.array([]) }),
      );
    });

    it('should move section down', () => {
      component.moveSectionDown(1);
      expect(component.sections.at(1).get('title')?.value).toBe('Section 3');
      expect(component.sections.at(2).get('title')?.value).toBe('Section 2');
    });

    it('should not move last section down', () => {
      component.moveSectionDown(2);
      expect(component.sections.at(2).get('title')?.value).toBe('Section 3');
    });
  });

  describe('moveLectureUp', () => {
    beforeEach(() => {
      asAny(component).initForms();
      component.sections.push(
        fb.group({
          title: ['Section 1'],
          description: '',
          lectures: fb.array([
            fb.group({
              title: ['Lecture 1'],
              type: 'video',
              duration: 10,
              isFreePreview: false,
              content: '',
            }),
            fb.group({
              title: ['Lecture 2'],
              type: 'video',
              duration: 20,
              isFreePreview: false,
              content: '',
            }),
            fb.group({
              title: ['Lecture 3'],
              type: 'video',
              duration: 30,
              isFreePreview: false,
              content: '',
            }),
          ]),
        }),
      );
    });

    it('should move lecture up', () => {
      component.moveLectureUp(0, 1);
      const lectures = component.getLectures(0);
      expect(lectures.at(0).get('title')?.value).toBe('Lecture 2');
      expect(lectures.at(1).get('title')?.value).toBe('Lecture 1');
    });

    it('should not move first lecture up', () => {
      component.moveLectureUp(0, 0);
      const lectures = component.getLectures(0);
      expect(lectures.at(0).get('title')?.value).toBe('Lecture 1');
    });
  });

  describe('moveLectureDown', () => {
    beforeEach(() => {
      asAny(component).initForms();
      component.sections.push(
        fb.group({
          title: ['Section 1'],
          description: '',
          lectures: fb.array([
            fb.group({
              title: ['Lecture 1'],
              type: 'video',
              duration: 10,
              isFreePreview: false,
              content: '',
            }),
            fb.group({
              title: ['Lecture 2'],
              type: 'video',
              duration: 20,
              isFreePreview: false,
              content: '',
            }),
            fb.group({
              title: ['Lecture 3'],
              type: 'video',
              duration: 30,
              isFreePreview: false,
              content: '',
            }),
          ]),
        }),
      );
    });

    it('should move lecture down', () => {
      component.moveLectureDown(0, 1);
      const lectures = component.getLectures(0);
      expect(lectures.at(1).get('title')?.value).toBe('Lecture 3');
      expect(lectures.at(2).get('title')?.value).toBe('Lecture 2');
    });

    it('should not move last lecture down', () => {
      component.moveLectureDown(0, 2);
      const lectures = component.getLectures(0);
      expect(lectures.at(2).get('title')?.value).toBe('Lecture 3');
    });
  });

  describe('formatDuration', () => {
    it('should return ۰ ثانیه for 0 seconds', () => {
      expect(component.formatDuration(0)).toBe('۰ ثانیه');
    });

    it('should return seconds for less than 60', () => {
      // ⚠️ ورودی بر حسب ثانیه است (واحد صحیح)
      expect(component.formatDuration(30)).toBe('۳۰ ثانیه');
      expect(component.formatDuration(45)).toBe('۴۵ ثانیه');
    });

    it('should return minutes for 60+', () => {
      expect(component.formatDuration(65)).toBe('۱ دقیقه و ۵ ثانیه');
      expect(component.formatDuration(120)).toBe('۲ دقیقه');
      expect(component.formatDuration(135)).toBe('۲ دقیقه و ۱۵ ثانیه');
    });

    it('should return hours only when there are no minutes/seconds left', () => {
      expect(component.formatDuration(3600)).toBe('۱ ساعت');
      expect(component.formatDuration(7200)).toBe('۲ ساعت');
    });

    it('should not treat minutes as hours (regression test)', () => {
      // یک ویدیوی ۳۰ ثانیه‌ای نباید «۱ ساعت» نمایش داده شود
      expect(component.formatDuration(30)).not.toContain('ساعت');
      // یک دوره‌ی ۱۰ ساعته (۳۶۰۰۰ ثانیه) نباید «۶۰۰ ساعت» شود
      expect(component.formatDuration(36000)).toBe('۱۰ ساعت');
    });
  });

  describe('getDiscountPercent', () => {
    beforeEach(() => {
      asAny(component).initForms();
    });

    it('should return 0 for no price', () => {
      component.pricingForm.patchValue({ price: 0, discountPrice: 0 });
      expect(component.getDiscountPercent()).toBe(0);
    });

    it('should return 0 for no discount', () => {
      component.pricingForm.patchValue({ price: 100000, discountPrice: 0 });
      expect(component.getDiscountPercent()).toBe(0);
    });

    it('should return 0 when discount >= price', () => {
      component.pricingForm.patchValue({ price: 100000, discountPrice: 100000 });
      expect(component.getDiscountPercent()).toBe(0);
      component.pricingForm.patchValue({ price: 100000, discountPrice: 150000 });
      expect(component.getDiscountPercent()).toBe(0);
    });

    it('should calculate correct percentage', () => {
      component.pricingForm.patchValue({ price: 100000, discountPrice: 80000 });
      expect(component.getDiscountPercent()).toBe(20);
      component.pricingForm.patchValue({ price: 200000, discountPrice: 150000 });
      expect(component.getDiscountPercent()).toBe(25);
    });
  });

  describe('overallProgress', () => {
    beforeEach(() => {
      asAny(component).initForms();
    });

    it('should calculate weighted progress', () => {
      component.basicForm.patchValue({
        title: 'Test Course Title',
        description: 'Test description that is long enough to be valid',
        category: 'cat1',
        shortDescription: 'Short desc',
      });
      component.thumbnailPreview.set('test.jpg');
      component.sections.push(
        fb.group({
          title: ['Section 1'],
          description: '',
          lectures: fb.array([
            fb.group({
              title: ['Lecture 1'],
              type: 'video',
              duration: 10,
              isFreePreview: false,
              content: '',
            }),
            fb.group({
              title: ['Lecture 2'],
              type: 'video',
              duration: 20,
              isFreePreview: false,
              content: '',
            }),
            fb.group({
              title: ['Lecture 3'],
              type: 'video',
              duration: 30,
              isFreePreview: false,
              content: '',
            }),
          ]),
        }),
      );
      component.pricingForm.patchValue({ price: 100000, isFree: false });

      fixture.detectChanges();
      expect(component.overallProgress()).toBeGreaterThanOrEqual(70);
    });
  });

  describe('totalLectures', () => {
    beforeEach(() => {
      asAny(component).initForms();
    });

    it('should return 0 for no sections', () => {
      expect(component.totalLectures()).toBe(0);
    });

    it('should count lectures across all sections', () => {
      component.sections.push(
        fb.group({
          title: ['Section 1'],
          description: '',
          lectures: fb.array([
            fb.group({
              title: ['Lecture 1'],
              type: 'video',
              duration: 10,
              isFreePreview: false,
              content: '',
            }),
            fb.group({
              title: ['Lecture 2'],
              type: 'video',
              duration: 20,
              isFreePreview: false,
              content: '',
            }),
          ]),
        }),
      );
      component.sections.push(
        fb.group({
          title: ['Section 2'],
          description: '',
          lectures: fb.array([
            fb.group({
              title: ['Lecture 3'],
              type: 'video',
              duration: 30,
              isFreePreview: false,
              content: '',
            }),
          ]),
        }),
      );
      expect(component.totalLectures()).toBe(3);
    });
  });

  describe('totalDuration', () => {
    beforeEach(() => {
      asAny(component).initForms();
    });

    it('should return 0 for no sections', () => {
      expect(component.totalDuration()).toBe(0);
    });

    it('should sum duration across all lectures', () => {
      component.sections.push(
        fb.group({
          title: ['Section 1'],
          description: '',
          lectures: fb.array([
            fb.group({
              title: ['Lecture 1'],
              type: 'video',
              duration: 10,
              isFreePreview: false,
              content: '',
            }),
            fb.group({
              title: ['Lecture 2'],
              type: 'video',
              duration: 20,
              isFreePreview: false,
              content: '',
            }),
          ]),
        }),
      );
      component.sections.push(
        fb.group({
          title: ['Section 2'],
          description: '',
          lectures: fb.array([
            fb.group({
              title: ['Lecture 3'],
              type: 'video',
              duration: 30,
              isFreePreview: false,
              content: '',
            }),
          ]),
        }),
      );
      expect(component.totalDuration()).toBe(60);
    });
  });

  describe('goToStep', () => {
    beforeEach(() => {
      asAny(component).initForms();
    });

    it('should not allow going to next step if basic form invalid', () => {
      component.currentStep.set(1);
      component.goToStep(2);
      expect(component.currentStep()).toBe(1);
    });

    it('should not allow going to curriculum step if no sections', () => {
      component.basicForm.patchValue({
        title: 'Test Course Title',
        description: 'Test description that is long enough to be valid',
        category: 'cat1',
        shortDescription: 'Short desc',
      });
      // قدم ۳ = قیمت‌گذاری، قدم ۴ = سرفصل‌ها (curriculum)
      // بررسی وجود sections در قدم ۴ انجام می‌شود
      component.currentStep.set(3);
      component.goToStep(4);
      expect(component.currentStep()).toBe(3);
    });

    it('should allow going back to previous step', () => {
      component.currentStep.set(3);
      component.goToStep(1);
      expect(component.currentStep()).toBe(1);
    });
  });
});