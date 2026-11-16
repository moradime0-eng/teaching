import { Injectable, signal } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { ApiService } from './api.service';
import { Review, CreateReviewRequest } from '../models/review.model';
import { ApiResponse, PaginatedResponse } from '../models/api-response.model';

@Injectable({ providedIn: 'root' })
export class ReviewService {
  constructor(private api: ApiService) {}

  /**
   * دریافت نظرات یک دوره با pagination
   */
  getCourseReviews(
    courseId: string,
    page: number = 1,
    limit: number = 10,
  ): Observable<PaginatedResponse<Review>> {
    return this.api.getPaginated<Review>(`/reviews/course/${courseId}`, { page, limit }).pipe(
      catchError((error) => {
        console.error('Error fetching course reviews:', error);
        return throwError(() => new Error('خطا در دریافت نظرات'));
      }),
    );
  }

  /**
   * ثبت نظر جدید برای یک دوره (با استفاده از slug)
   */
  createReviewBySlug(
    slug: string,
    data: {
      rating: number;
      title?: string;
      comment: string;
    },
  ): Observable<ApiResponse<Review>> {
    return this.api.post<Review>(`/reviews/course/${slug}`, data).pipe(
      catchError((error) => {
        console.error('Error creating review:', error);
        return throwError(() => new Error(error?.error?.message || 'خطا در ثبت نظر'));
      }),
    );
  }

  /**
   * ثبت نظر جدید برای یک دوره (با استفاده از courseId)
   */
  createReview(data: CreateReviewRequest): Observable<ApiResponse<Review>> {
    return this.api.post<Review>('/reviews', data).pipe(
      catchError((error) => {
        console.error('Error creating review:', error);
        return throwError(() => new Error(error?.error?.message || 'خطا در ثبت نظر'));
      }),
    );
  }

  /**
   * ویرایش نظر
   */
  updateReview(
    id: string,
    data: { rating?: number; title?: string; comment?: string },
  ): Observable<ApiResponse<Review>> {
    return this.api.put<Review>(`/reviews/${id}`, data).pipe(
      catchError((error) => {
        console.error('Error updating review:', error);
        return throwError(() => new Error(error?.error?.message || 'خطا در ویرایش نظر'));
      }),
    );
  }

  /**
   * حذف نظر
   */
  deleteReview(id: string): Observable<ApiResponse<null>> {
    return this.api.delete<null>(`/reviews/${id}`).pipe(
      catchError((error) => {
        console.error('Error deleting review:', error);
        return throwError(() => new Error(error?.error?.message || 'خطا در حذف نظر'));
      }),
    );
  }

  /**
   * دریافت نظرات برتر (برای صفحه لندینگ)
   */
  getTopReviews(limit: number = 6): Observable<ApiResponse<Review[]>> {
    return this.api.get<Review[]>('/reviews/top', { limit }).pipe(
      catchError((error) => {
        console.error('Error fetching top reviews:', error);
        return throwError(() => new Error('خطا در دریافت نظرات برتر'));
      }),
    );
  }

  /**
   * لایک/دیس‌لایک نظر
   */
  likeReview(
    id: string,
    type: 'like' | 'dislike',
  ): Observable<ApiResponse<{ helpfulCount: number; helpful: number; notHelpful: number }>> {
    return this.api
      .post<{
        helpfulCount: number;
        helpful: number;
        notHelpful: number;
      }>(`/reviews/${id}/like`, { type })
      .pipe(
        catchError((error) => {
          console.error('Error liking review:', error);
          return throwError(() => new Error('خطا در ثبت واکنش'));
        }),
      );
  }
}
