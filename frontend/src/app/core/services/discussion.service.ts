import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ApiResponse, PaginatedResponse } from '../models/api-response.model';
import {
  Discussion,
  InstructorQuestion,
  InstructorQuestionCourse,
  InstructorQuestionStats,
} from '../models/discussion.model';

/**
 * 💬 سرویس پرسش و پاسخ دوره‌ها
 * بک‌اند: /api/v1/discussions
 */
@Injectable({ providedIn: 'root' })
export class DiscussionService {
  constructor(private api: ApiService) {}

  /**
   * دریافت پرسش‌های یک دوره
   * @param courseId شناسه دوره
   * @param lectureId درس مشخص یا 'all' برای همه درس‌ها
   * @param courseWide اگر true باشد فقط پرسش‌های عمومی دوره برگردانده می‌شود
   */
  getCourseDiscussions(
    courseId: string,
    lectureId?: string | null,
    courseWide = false,
    page = 1,
    limit = 20,
  ): Observable<PaginatedResponse<Discussion>> {
    return this.api.getPaginated<Discussion>(`/discussions/course/${courseId}`, {
      lectureId: lectureId || undefined,
      courseWide: courseWide ? 'true' : undefined,
      page,
      limit,
    });
  }

  /** ثبت پرسش جدید */
  createDiscussion(data: {
    courseId: string;
    lectureId?: string | null;
    title?: string;
    content: string;
  }): Observable<ApiResponse<Discussion>> {
    return this.api.post<Discussion>('/discussions', data);
  }

  /** پاسخ به یک پرسش */
  addReply(discussionId: string, content: string): Observable<ApiResponse<Discussion>> {
    return this.api.post<Discussion>(`/discussions/${discussionId}/replies`, { content });
  }

  /**
   * رأی مثبت/منفی به پرسش یا پاسخ
   * @param value ۱ برای رأی مثبت، -۱ برای رأی منفی (کلیک مجدد = لغو)
   * @param replyId در صورت رأی به پاسخ
   */
  voteDiscussion(
    discussionId: string,
    value: 1 | -1,
    replyId?: string | null,
  ): Observable<ApiResponse<Discussion>> {
    return this.api.post<Discussion>(`/discussions/${discussionId}/vote`, {
      value,
      replyId: replyId || undefined,
    });
  }

  /** حذف پرسش */
  deleteDiscussion(discussionId: string): Observable<ApiResponse<{ _id: string }>> {
    return this.api.delete<{ _id: string }>(`/discussions/${discussionId}`);
  }

  /** اشتراک‌گذاری پرسش با کاربران مشخص */
  shareDiscussion(
    discussionId: string,
    userIds: string[],
  ): Observable<ApiResponse<{ shared: number }>> {
    return this.api.post<{ shared: number }>(`/discussions/${discussionId}/share`, { userIds });
  }

  // ═══════════════════════════════════════════
  //  پنل پرسش و پاسخ مدرس
  // ═══════════════════════════════════════════

  /** صندوق پرسش‌های مدرس (فیلتر: دوره، وضعیت پاسخ، جستجو) */
  getInstructorQuestions(params: {
    courseId?: string | null;
    status?: 'all' | 'unanswered' | 'answered';
    q?: string;
    page?: number;
    limit?: number;
  }): Observable<PaginatedResponse<InstructorQuestion>> {
    return this.api.getPaginated<InstructorQuestion>('/discussions/instructor/questions', {
      courseId: params.courseId && params.courseId !== 'all' ? params.courseId : undefined,
      status: params.status && params.status !== 'all' ? params.status : undefined,
      q: params.q?.trim() || undefined,
      page: params.page || 1,
      limit: params.limit || 20,
    });
  }

  /** دوره‌های مدرس برای فیلتر کردن */
  getInstructorQuestionCourses(): Observable<
    ApiResponse<InstructorQuestionCourse[]>
  > {
    return this.api.get<InstructorQuestionCourse[]>('/discussions/instructor/courses');
  }

  /** آمار پرسش‌های مدرس */
  getInstructorQuestionStats(): Observable<ApiResponse<InstructorQuestionStats>> {
    return this.api.get<InstructorQuestionStats>('/discussions/instructor/stats');
  }

  /** مدیریت پرسش: سنجاق / علامت‌گذاری به‌عنوان حل‌شده */
  moderateDiscussion(
    discussionId: string,
    payload: { isPinned?: boolean; isResolved?: boolean },
  ): Observable<ApiResponse<Discussion>> {
    return this.api.patch<Discussion>(`/discussions/${discussionId}/moderate`, payload);
  }
}
