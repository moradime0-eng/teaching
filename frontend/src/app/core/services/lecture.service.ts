import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ApiResponse } from '../models/api-response.model';
import { Lecture, ContentItem } from '../models/course.model';

@Injectable({ providedIn: 'root' })
export class LectureService {
  constructor(private api: ApiService) {}

  /** Get lectures for a section */
  getLectures(courseId: string, sectionId: string): Observable<ApiResponse<Lecture[]>> {
    return this.api.get<Lecture[]>(`/courses/${courseId}/sections/${sectionId}/lectures`);
  }

  /** Get all lectures for a course (flat) */
  getAllCourseLectures(courseId: string): Observable<ApiResponse<Lecture[]>> {
    return this.api.get<Lecture[]>(`/courses/${courseId}/sections/any/lectures/all`);
  }

  /** Create a new lecture */
  createLecture(
    courseId: string,
    sectionId: string,
    data: Partial<Lecture>,
  ): Observable<ApiResponse<Lecture>> {
    return this.api.post<Lecture>(`/courses/${courseId}/sections/${sectionId}/lectures`, data);
  }

  /** Update a lecture */
  updateLecture(
    courseId: string,
    sectionId: string,
    lectureId: string,
    data: Partial<Lecture>,
  ): Observable<ApiResponse<Lecture>> {
    return this.api.put<Lecture>(
      `/courses/${courseId}/sections/${sectionId}/lectures/${lectureId}`,
      data,
    );
  }

  /** Delete a lecture */
  deleteLecture(
    courseId: string,
    sectionId: string,
    lectureId: string,
  ): Observable<ApiResponse<null>> {
    return this.api.delete<null>(
      `/courses/${courseId}/sections/${sectionId}/lectures/${lectureId}`,
    );
  }

  /** Reorder lectures in a section */
  reorderLectures(
    courseId: string,
    sectionId: string,
    lectureIds: string[],
  ): Observable<ApiResponse<Lecture[]>> {
    return this.api.put<Lecture[]>(`/courses/${courseId}/sections/${sectionId}/lectures/reorder`, {
      lectureIds,
    });
  }

  // ==================== CONTENT ITEMS ====================

  /** Add a content item to a lecture */
  addContentItem(
    courseId: string,
    sectionId: string,
    lectureId: string,
    data: Partial<ContentItem>,
  ): Observable<ApiResponse<ContentItem>> {
    return this.api.post<ContentItem>(
      `/courses/${courseId}/sections/${sectionId}/lectures/${lectureId}/content-items`,
      data,
    );
  }

  /** Update a content item */
  updateContentItem(
    courseId: string,
    sectionId: string,
    lectureId: string,
    contentItemId: string,
    data: Partial<ContentItem>,
  ): Observable<ApiResponse<ContentItem>> {
    return this.api.put<ContentItem>(
      `/courses/${courseId}/sections/${sectionId}/lectures/${lectureId}/content-items/${contentItemId}`,
      data,
    );
  }

  /** Delete a content item */
  deleteContentItem(
    courseId: string,
    sectionId: string,
    lectureId: string,
    contentItemId: string,
  ): Observable<ApiResponse<null>> {
    return this.api.delete<null>(
      `/courses/${courseId}/sections/${sectionId}/lectures/${lectureId}/content-items/${contentItemId}`,
    );
  }

  /** Reorder content items in a lecture */
  reorderContentItems(
    courseId: string,
    sectionId: string,
    lectureId: string,
    contentItemIds: string[],
  ): Observable<ApiResponse<ContentItem[]>> {
    return this.api.put<ContentItem[]>(
      `/courses/${courseId}/sections/${sectionId}/lectures/${lectureId}/content-items/reorder`,
      { contentItemIds },
    );
  }

  /** Move a lecture to another section within the same course */
  moveLectureToSection(
    courseId: string,
    sectionId: string,
    lectureId: string,
    targetSectionId: string,
  ): Observable<ApiResponse<Lecture>> {
    return this.api.put<Lecture>(
      `/courses/${courseId}/sections/${sectionId}/lectures/${lectureId}/move-to-section`,
      { targetSectionId },
    );
  }
}
