// frontend/src/app/services/learning-path.service.ts

import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from '../core/services/api.service';
import { Observable, tap } from 'rxjs';

// ────────────────────────────────────────
// اینترفیس‌ها
// ────────────────────────────────────────

export interface ICourseRef {
  _id: string;
  title: string;
  slug: string;
  thumbnail?: string;
  coverImage?: string;
  price?: number;
  discountPrice?: number;
  isFree?: boolean;
  averageRating?: number;
  rating?: number;
  totalStudents?: number;
  totalDuration?: number;
  totalLectures?: number;
  lectures?: number;
  lessonsCount?: number;
  hue?: number;
  icon?: string;
  level?: string;
  instructor?: {
    fullName: string;
    avatar: string;
  };
  category?: {
    name: string;
    slug: string;
  };
}

export interface ICourseNode {
  _id?: string;
  id?: string;
  course: ICourseRef | string;
  order: number;
  isRequired: boolean;
  prerequisites: string[];
  estimatedDuration: number;
  customTitle?: string;
  customDescription?: string;
}

export interface IStage {
  _id?: string;
  title: string;
  description?: string;
  icon: string;
  color: string;
  order: number;
  courses: ICourseNode[];
  milestone?: {
    title: string;
    description: string;
    badge?: string;
  };
}

export interface ILearningPath {
  _id?: string;
  title: string;
  slug?: string;
  subtitle?: string;
  description: string;
  shortDescription: string;
  coverImage?: string;
  thumbnail?: string;
  icon: string;
  stages: IStage[];
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'mixed';
  category?: any;
  tags: string[];
  targetAudience: string[];
  learningOutcomes: string[];
  estimatedTotalDuration: number;
  totalCourses: number;
  status: 'draft' | 'published' | 'archived';
  publishedAt?: Date;
  enrolledStudents: number;
  completionRate: number;
  averageRating: number;
  totalRatings: number;
  hasCertificate: boolean;
  certificateTitle?: string;
  isFeatured: boolean;
  displayOrder: number;
  createdBy?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ILearningPathEnrollment {
  _id: string;
  user: string;
  learningPath: ILearningPath;
  progress: number;
  completedCourses: Array<{
    course: string;
    completedAt: Date;
    grade?: number;
  }>;
  currentStageIndex: number;
  currentCourse?: any;
  status: 'active' | 'completed' | 'paused' | 'abandoned';
  enrolledAt: Date;
  completedAt?: Date;
  lastAccessedAt: Date;
  totalTimeSpent: number;
  certificateIssued: boolean;
  /** ✅ FIX #1: شناسه گواهینامه صادرشده برای این مسیر */
  certificate?: string;
}

export interface IPaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** ✅ BUG #2: پارامترهای فیلتر کاتالوگ — همه سمت سرور اعمال می‌شوند */
export interface LearningPathQuery {
  page?: number;
  limit?: number;
  search?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced' | 'mixed';
  hasCertificate?: boolean;
  category?: string;
  isFeatured?: boolean;
  sort?: string;
}

// ────────────────────────────────────────
// سرویس
// ────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class LearningPathService {
  private api = inject(ApiService);
  private readonly base = '/learning-paths';

  readonly paths = signal<ILearningPath[]>([]);
  readonly currentPath = signal<ILearningPath | null>(null);
  readonly availableCourses = signal<ICourseRef[]>([]);
  readonly myEnrollments = signal<ILearningPathEnrollment[]>([]);
  readonly loading = signal(false);
  readonly pagination = signal<IPaginationMeta | null>(null);


  getAll(params?: LearningPathQuery): Observable<any> {
    this.loading.set(true);
    const query: Record<string, unknown> = { ...(params || {}) };

    // تبدیل boolean → string برای query string
    if (typeof query['hasCertificate'] === 'boolean') {
      query['hasCertificate'] = query['hasCertificate'] ? 'true' : undefined;
    }
    if (typeof query['isFeatured'] === 'boolean') {
      query['isFeatured'] = query['isFeatured'] ? 'true' : undefined;
    }
    // حذف کلیدهای خالی تا URL تمیز بماند
    Object.keys(query).forEach((k) => {
      const v = query[k];
      if (v === undefined || v === null || v === '') delete query[k];
    });

    return this.api.get(this.base, query).pipe(
      tap({
        next: (res: any) => {
          this.paths.set(res.data || []);
          this.pagination.set(res.pagination || null);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      }),
    );
  }

  /** آمار کلی کاتالوگ (بدون فیلتر) برای هیرو پیج */
  getPublicStats(): Observable<any> {
    return this.api.get(`${this.base}/stats/overview`);
  }

  getBySlug(slug: string): Observable<any> {
    this.loading.set(true);
    return this.api.get(`${this.base}/${slug}`).pipe(
      tap({
        next: (res: any) => {
          this.currentPath.set(res.data);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      }),
    );
  }

  /** Get learning path by ID for admin (includes draft/archived) */
  getByIdAdmin(id: string): Observable<any> {
    return this.api.get(`${this.base}/admin/${id}`).pipe(
      tap((res: any) => this.currentPath.set(res.data)),
    );
  }

  getAllAdmin(params?: any): Observable<any> {
    return this.api.get(`${this.base}/admin/all`, params).pipe(
      tap((res: any) => {
        this.paths.set(res.data || []);
        this.pagination.set(res.pagination || null);
      }),
    );
  }

  create(data: Partial<ILearningPath>): Observable<any> {
    return this.api.post(this.base, data).pipe(
      tap((res: any) => this.currentPath.set(res.data)),
    );
  }

  update(id: string, data: Partial<ILearningPath>): Observable<any> {
    return this.api.put(`${this.base}/${id}`, data).pipe(
      tap((res: any) => this.currentPath.set(res.data)),
    );
  }

  delete(id: string): Observable<any> {
    return this.api.delete(`${this.base}/${id}`);
  }

  publish(id: string): Observable<any> {
    return this.api.patch(`${this.base}/${id}/publish`, {}).pipe(
      tap((res: any) => this.currentPath.set(res.data)),
    );
  }

  archive(id: string): Observable<any> {
    return this.api.patch(`${this.base}/${id}/archive`, {}).pipe(
      tap((res: any) => this.currentPath.set(res.data)),
    );
  }

  duplicate(id: string): Observable<any> {
    return this.api.post(`${this.base}/${id}/duplicate`, {});
  }

  // ✅ FIX #28: preview updates currentPath (consistent with others)
  preview(id: string): Observable<any> {
    return this.api.get(`${this.base}/${id}/preview`).pipe(
      tap((res: any) => this.currentPath.set(res.data)),
    );
  }

  addStage(pathId: string, stage: Partial<IStage>): Observable<any> {
    return this.api.post(`${this.base}/${pathId}/stages`, stage).pipe(
      tap((res: any) => this.currentPath.set(res.data)),
    );
  }

  updateStage(pathId: string, stageId: string, data: Partial<IStage>): Observable<any> {
    return this.api.put(`${this.base}/${pathId}/stages/${stageId}`, data).pipe(
      tap((res: any) => this.currentPath.set(res.data)),
    );
  }

  removeStage(pathId: string, stageId: string): Observable<any> {
    return this.api.delete(`${this.base}/${pathId}/stages/${stageId}`).pipe(
      tap((res: any) => this.currentPath.set(res.data)),
    );
  }

  reorderStages(pathId: string, stageIds: string[]): Observable<any> {
    return this.api.patch(`${this.base}/${pathId}/stages/reorder`, { stageIds }).pipe(
      tap((res: any) => this.currentPath.set(res.data)),
    );
  }

  addCourseToStage(pathId: string, stageId: string, data: any): Observable<any> {
    return this.api.post(`${this.base}/${pathId}/stages/${stageId}/courses`, data).pipe(
      tap((res: any) => this.currentPath.set(res.data)),
    );
  }

  removeCourseFromStage(pathId: string, stageId: string, courseNodeId: string): Observable<any> {
    return this.api
      .delete(`${this.base}/${pathId}/stages/${stageId}/courses/${courseNodeId}`)
      .pipe(tap((res: any) => this.currentPath.set(res.data)));
  }

  reorderCoursesInStage(
    pathId: string,
    stageId: string,
    courseNodeIds: string[],
  ): Observable<any> {
    return this.api
      .patch(`${this.base}/${pathId}/stages/${stageId}/courses/reorder`, { courseNodeIds })
      .pipe(tap((res: any) => this.currentPath.set(res.data)));
  }

  getAvailableCourses(params?: any): Observable<any> {
    return this.api.get(`${this.base}/available-courses`, params).pipe(
      tap((res: any) => this.availableCourses.set(res.data || [])),
    );
  }

  enroll(pathId: string): Observable<any> {
    return this.api.post(`${this.base}/${pathId}/enroll`, {});
  }

  getMyPaths(): Observable<any> {
    return this.api.get(`${this.base}/my`).pipe(
      tap((res: any) => this.myEnrollments.set(res.data || [])),
    );
  }

  getProgress(pathId: string): Observable<any> {
    return this.api.get(`${this.base}/${pathId}/progress`);
  }

  updateProgress(pathId: string, courseId: string): Observable<any> {
    return this.api.patch(`${this.base}/${pathId}/progress`, { courseId });
  }

  getStats(pathId: string): Observable<any> {
    return this.api.get(`${this.base}/${pathId}/stats`);
  }

  resetCurrentPath(): void {
    this.currentPath.set(null);
  }

  uploadCover(pathId: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('cover', file);
    return this.api.upload(`${this.base}/${pathId}/cover`, formData);
  }

  uploadCoverTemp(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('cover', file);
    return this.api.upload(`${this.base}/upload-cover-temp`, formData);
  }

  searchForAssignment(query: string): Observable<any> {
    return this.api.get(`${this.base}/search-for-assignment`, { q: query });
  }

  getDetailsForAssignment(pathId: string): Observable<any> {
    return this.api.get(`${this.base}/${pathId}/details-for-assignment`);
  }

  quickCreatePath(data: any): Observable<any> {
    return this.api.post(`${this.base}/quick-create`, data);
  }

  getLearningPathsWithCourse(courseId: string): Observable<any> {
    return this.api.get(`${this.base}/with-course/${courseId}`);
  }
}