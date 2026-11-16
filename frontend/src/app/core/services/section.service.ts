import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ApiResponse } from '../models/api-response.model';

export interface Section {
  _id: string;
  course: string;
  title: string;
  description?: string;
  order: number;
  totalLectures: number;
  totalDuration: number;
  tenant: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class SectionService {
  constructor(private api: ApiService) {}

  /** Get all sections for a course */
  getSections(courseId: string): Observable<ApiResponse<Section[]>> {
    return this.api.get<Section[]>(`/courses/${courseId}/sections`);
  }

  /** Create a new section */
  createSection(
    courseId: string,
    data: { title: string; description?: string }
  ): Observable<ApiResponse<Section>> {
    return this.api.post<Section>(`/courses/${courseId}/sections`, data);
  }

  /** Update a section */
  updateSection(
    courseId: string,
    sectionId: string,
    data: { title?: string; description?: string; order?: number }
  ): Observable<ApiResponse<Section>> {
    return this.api.put<Section>(`/courses/${courseId}/sections/${sectionId}`, data);
  }

  /** Delete a section */
  deleteSection(courseId: string, sectionId: string): Observable<ApiResponse<null>> {
    return this.api.delete<null>(`/courses/${courseId}/sections/${sectionId}`);
  }

  /** Reorder sections */
  reorderSections(
    courseId: string,
    sectionIds: string[]
  ): Observable<ApiResponse<Section[]>> {
    return this.api.put<Section[]>(`/courses/${courseId}/sections/reorder`, { sectionIds });
  }
}
