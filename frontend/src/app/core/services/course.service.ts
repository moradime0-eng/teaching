import { Injectable, signal } from '@angular/core';
import { Observable, tap, catchError, throwError, shareReplay } from 'rxjs';
import { HttpClient, HttpEvent, HttpEventType, HttpRequest } from '@angular/common/http';
import { ApiService } from './api.service';
import { Course, CourseFilter, CreateCourseRequest, UpdateCourseRequest } from '../models/course.model';
import { Category } from '../models/category.model';
import { ApiResponse, PaginatedResponse } from '../models/api-response.model';
import { environment } from '../../../environments/environment.development';

export interface LectureUploadEvent {
  type: 'progress' | 'success' | 'error';
  progress?: number;
  url?: string;
  error?: any;
}

@Injectable({ providedIn: 'root' })
export class CourseService {
  categories = signal<Category[]>([]);
  featuredCourses = signal<Course[]>([]);
  private baseUrl = environment.apiUrl;

  /** حلقه‌ی کش برای جلوگیری از درخواست تکراری درخت دسته‌بندی‌ها */
  private categoryTree$: Observable<ApiResponse<Category[]>> | null = null;
  /** حلقه‌ی کش برای جلوگیری از درخواست تکراری دسته‌بندی‌های اصلی (parents) */
  private parentCategories$: Observable<ApiResponse<Category[]>> | null = null;

  constructor(private api: ApiService, private http: HttpClient) {}

  invalidateCategoryCache(): void {
    this.categoryTree$ = null;
    this.parentCategories$ = null;
  }

  /** Get root/parent categories only (level 0) */
  getParentCategories(): Observable<ApiResponse<Category[]>> {
    // درخواست تکراری نزن — نتیجه‌ی در حال اجرا/کش‌شده را به اشتراک بگذار
    if (!this.parentCategories$) {
      this.parentCategories$ = this.api.get<Category[]>('/categories?level=0').pipe(
        tap((res) => {
          if (res.success && res.data) this.categories.set(res.data);
        }),
        catchError((error) => {
          console.error('Error fetching parent categories:', error);
          // در صورت خطا کش را پاک کن تا تلاش بعدی مجدداً درخواست بزند
          this.parentCategories$ = null;
          return throwError(() => new Error('دسته‌بندی‌های اصلی بارگذاری نشدند'));
        }),
        shareReplay(1),
      );
    }
    return this.parentCategories$;
  }

  getCategories(): Observable<ApiResponse<Category[]>> {
    return this.api.get<Category[]>('/categories').pipe(
      tap((res) => {
        if (res.success && res.data) this.categories.set(res.data);
      }),
      catchError((error) => {
        console.error('Error fetching categories:', error);
        return throwError(() => new Error('دسته‌بندی‌ها بارگذاری نشدند'));
      })
    );
  }

  getSubcategories(parentId: string): Observable<ApiResponse<Category[]>> {
    return this.api.get<Category[]>(`/categories?parentId=${parentId}`).pipe(
      catchError((error) => {
        console.error('Error fetching subcategories:', error);
        return throwError(() => new Error('زیردسته‌بندی‌ها بارگذاری نشدند'));
      })
    );
  }

  getCategoryTree(): Observable<ApiResponse<Category[]>> {
    // درخواست تکراری نزن — نتیجه‌ی در حال اجرا/کش‌شده را به اشتراک بگذار
    if (!this.categoryTree$) {
      this.categoryTree$ = this.api.get<Category[]>('/categories/tree').pipe(
        tap((res) => {
          // فقط ریشه‌های درخت را نگه می‌داریم (زیردسته‌ها در children هستند)
          if (res.success && res.data) this.categories.set(res.data);
        }),
        catchError((error) => {
          console.error('Error fetching category tree:', error);
          // در صورت خطا کش را پاک کن تا تلاش بعدی مجدداً درخواست بزند
          this.categoryTree$ = null;
          return throwError(() => new Error('ساختار درختی دسته‌بندی‌ها بارگذاری نشد'));
        }),
        shareReplay(1),
      );
    }
    return this.categoryTree$;
  }

  getCourses(filters?: CourseFilter): Observable<PaginatedResponse<Course>> {
    // نگاشت نام فیلترهای رابط کاربری به پارامترهای API بک‌اند
    const params: Record<string, any> = { ...(filters as Record<string, any>) };
    if (params['minPrice'] !== undefined && params['minPrice'] !== '') {
      params['price_min'] = params['minPrice'];
    }
    if (params['maxPrice'] !== undefined && params['maxPrice'] !== '') {
      params['price_max'] = params['maxPrice'];
    }
    if (params['search']) {
      params['q'] = params['search'];
    }
    delete params['minPrice'];
    delete params['maxPrice'];
    delete params['search'];

    // حذف مقادیر خالی تا پارامتر بی‌دلیل ارسال نشود
    Object.keys(params).forEach((key) => {
      if (params[key] === '') delete params[key];
    });

    return this.api.getPaginated<Course>('/search/courses', params).pipe(
      catchError((error) => {
        console.error('Error fetching courses:', error);
        return throwError(() => new Error('دوره‌ها بارگذاری نشدند'));
      })
    );
  }

  getCourseBySlug(slug: string): Observable<ApiResponse<Course>> {
    return this.api.get<Course>(`/courses/${slug}`).pipe(
      catchError((error) => {
        console.error('Error fetching course by slug:', error);
        return throwError(() => new Error('دوره یافت نشد'));
      })
    );
  }

  getFeaturedCourses(): Observable<PaginatedResponse<Course>> {
    return this.api.getPaginated<Course>('/search/courses', { limit: 4, sort: 'popular' }).pipe(
      tap((res) => {
        if (res.success && res.data) this.featuredCourses.set(res.data);
      }),
      catchError((error) => {
        console.error('Error fetching featured courses:', error);
        return throwError(() => new Error('دوره‌های ویژه بارگذاری نشدند'));
      })
    );
  }

  getCourseById(id: string): Observable<ApiResponse<Course>> {
    return this.api.get<Course>(`/courses/${id}`).pipe(
      catchError((error) => {
        console.error('Error fetching course by ID:', error);
        return throwError(() => new Error('دوره یافت نشد'));
      })
    );
  }

  createCourse(data: CreateCourseRequest): Observable<ApiResponse<Course>> {
    return this.api.post<Course>('/courses', data).pipe(
      catchError((error) => {
        console.error('Error creating course:', error);
        return throwError(() => new Error(error?.error?.message || 'خطا در ایجاد دوره'));
      })
    );
  }

  updateCourse(id: string, data: UpdateCourseRequest): Observable<ApiResponse<Course>> {
    return this.api.put<Course>(`/courses/${id}`, data).pipe(
      catchError((error) => {
        console.error('Error updating course:', error);
        return throwError(() => new Error(error?.error?.message || 'خطا در بروزرسانی دوره'));
      })
    );
  }

  submitForReview(id: string): Observable<ApiResponse<Course>> {
    return this.api.post<Course>(`/courses/${id}/submit`, {}).pipe(
      catchError((error) => {
        console.error('Error submitting course for review:', error);
        return throwError(() => new Error(error?.error?.message || 'خطا در ارسال برای بازبینی'));
      })
    );
  }

  /**
   * آپلود تصویر کاور (thumbnail) دوره با نمایش پیشرفت
   */
  uploadThumbnail(courseId: string, file: File): Observable<LectureUploadEvent> {
    const formData = new FormData();
    formData.append('thumbnail', file);

    return new Observable<LectureUploadEvent>((observer) => {
      const req = new HttpRequest(
        'POST',
        `${this.baseUrl}/courses/${courseId}/thumbnail`,
        formData,
        { reportProgress: true, timeout: 600000 }, // 10 minutes timeout
      );

      const sub = this.http.request(req).subscribe({
        next: (event: HttpEvent<any>) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            const progress = Math.round((event.loaded / event.total) * 100);
            observer.next({ type: 'progress', progress });
          } else if (event.type === HttpEventType.Response) {
            const body: any = event.body;
            const url = body?.data?.thumbnail || body?.data?.thumbnailUrl || body?.data?.url || '';
            observer.next({ type: 'success', url });
            observer.complete();
          }
        },
        error: (err) => {
          observer.next({ type: 'error', error: err });
          observer.error(err);
        },
      });

      return () => sub.unsubscribe();
    });
  }

  /**
   * آپلود ویدیو معرفی (promo video) دوره با نمایش پیشرفت
   */
  uploadPromoVideo(courseId: string, file: File): Observable<LectureUploadEvent> {
    const formData = new FormData();
    formData.append('promoVideo', file);

    return new Observable<LectureUploadEvent>((observer) => {
      const req = new HttpRequest(
        'POST',
        `${this.baseUrl}/courses/${courseId}/promo-video`,
        formData,
        { reportProgress: true, timeout: 600000 }, // 10 minutes timeout
      );

      const sub = this.http.request(req).subscribe({
        next: (event: HttpEvent<any>) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            const progress = Math.round((event.loaded / event.total) * 100);
            observer.next({ type: 'progress', progress });
          } else if (event.type === HttpEventType.Response) {
            const body: any = event.body;
            const url = body?.data?.promoVideoUrl || body?.data?.promoVideo || body?.data?.url || '';
            observer.next({ type: 'success', url });
            observer.complete();
          }
        },
        error: (err) => {
          observer.next({ type: 'error', error: err });
          observer.error(err);
        },
      });

      return () => sub.unsubscribe();
    });
  }

  /**
   * آپلود ویدیوی یک درس (Lecture) با نمایش زنده درصد پیشرفت
   */
  uploadLectureVideo(courseId: string, file: File): Observable<LectureUploadEvent> {
    const formData = new FormData();
    formData.append('video', file);

    return new Observable<LectureUploadEvent>((observer) => {
      const req = new HttpRequest(
        'POST',
        `${this.baseUrl}/courses/${courseId}/lecture-video`,
        formData,
        { reportProgress: true, timeout: 600000 } // 10 minutes timeout
      );

      const sub = this.http.request(req).subscribe({
        next: (event: HttpEvent<any>) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            const progress = Math.round((event.loaded / event.total) * 100);
            observer.next({ type: 'progress', progress });
          } else if (event.type === HttpEventType.Response) {
            const body: any = event.body;
            const url = body?.data?.videoUrl || body?.data?.url || '';
            observer.next({ type: 'success', url });
            observer.complete();
          }
        },
        error: (err) => {
          observer.next({ type: 'error', error: err });
          observer.error(err);
        },
      });

      return () => sub.unsubscribe();
    });
  }

  /**
   * آپلود فایل ضمیمه (PDF, ZIP, ...) برای یک درس با نمایش پیشرفت
   */
  uploadLectureResource(courseId: string, file: File): Observable<LectureUploadEvent> {
    const formData = new FormData();
    formData.append('file', file);

    return new Observable<LectureUploadEvent>((observer) => {
      const req = new HttpRequest(
        'POST',
        `${this.baseUrl}/courses/${courseId}/lecture-resource`,
        formData,
        { reportProgress: true, timeout: 600000 } // 10 minutes timeout
      );

      const sub = this.http.request(req).subscribe({
        next: (event: HttpEvent<any>) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            const progress = Math.round((event.loaded / event.total) * 100);
            observer.next({ type: 'progress', progress });
          } else if (event.type === HttpEventType.Response) {
            const body: any = event.body;
            const url = body?.data?.fileUrl || body?.data?.url || '';
            observer.next({ type: 'success', url });
            observer.complete();
          }
        },
        error: (err) => {
          observer.next({ type: 'error', error: err });
          observer.error(err);
        },
      });

      return () => sub.unsubscribe();
    });
  }

  /** بررسی وضعیت ثبت‌نام کاربر در دوره */
  checkEnrollment(courseId: string): Observable<ApiResponse<{ enrolled: boolean }>> {
    return this.api.get<{ enrolled: boolean }>(`/enrollments/check/${courseId}`).pipe(
      catchError((error) => {
        console.error('Error checking enrollment:', error);
        return throwError(() => new Error('خطا در بررسی وضعیت ثبت‌نام'));
      })
    );
  }

  /** ثبت‌نام در دوره رایگان */
  enrollInFreeCourse(courseId: string): Observable<ApiResponse<any>> {
    return this.api.post<any>(`/enrollments/free`, { courseId }).pipe(
      catchError((error) => {
        console.error('Error enrolling in free course:', error);
        return throwError(() => new Error('خطا در ثبت‌نام در دوره رایگان'));
      })
    );
  }

  getRelatedCourses(courseId: string): Observable<ApiResponse<Course[]>> {
    return this.api.get<Course[]>(`/courses/related/${courseId}`).pipe(
      catchError((error) => {
        console.error('Error fetching related courses:', error);
        return throwError(() => new Error('خطا در دریافت دوره‌های مرتبط'));
      })
    );
  }
}