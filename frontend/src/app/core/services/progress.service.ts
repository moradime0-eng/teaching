import { Injectable } from '@angular/core';
import { Observable, Subject, throttleTime, filter, switchMap } from 'rxjs';
import { ApiService } from './api.service';
import { ApiResponse } from '../models/api-response.model';

interface ProgressUpdate {
  courseId: string;
  lectureId: string;
  watchedDuration?: number;
  lastPosition?: number;
  isCompleted?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProgressService {
  private progressSubject = new Subject<ProgressUpdate>();
  private lastSentTime = 0;
  private readonly DEBOUNCE_MS = 30000; // 30 seconds between position updates

  constructor(private api: ApiService) {
    // Throttle position updates to max once every 30 seconds
    this.progressSubject
      .pipe(
        throttleTime(this.DEBOUNCE_MS),
        filter((data) => !data.isCompleted), // Completion events bypass throttle
      )
      .subscribe((data) => this._sendUpdate(data));
  }

  /**
   * Send a progress update with debouncing.
   * Position updates are throttled to every 30 seconds.
   * Completion events are sent immediately.
   */
  sendProgressUpdate(data: ProgressUpdate): void {
    if (data.isCompleted) {
      // Completion events bypass debounce — send immediately
      this._sendUpdate(data);
      return;
    }
    this.progressSubject.next(data);
  }

  /**
   * Direct API call for non-debounced updates (quiz submit, notes, etc.)
   */
  updateProgress(data: ProgressUpdate): Observable<ApiResponse<any>> {
    return this.api.put<any>('/progress', data);
  }

  getCourseProgress(courseId: string): Observable<ApiResponse<any>> {
    return this.api.get<any>(`/progress/course/${courseId}`);
  }

  submitQuiz(data: {
    courseId: string;
    lectureId: string;
    answers: number[];
  }): Observable<ApiResponse<any>> {
    return this.api.post<any>('/progress/quiz', data);
  }

  addNote(data: {
    courseId: string;
    lectureId: string;
    content: string;
    timestamp: number;
  }): Observable<ApiResponse<any>> {
    return this.api.post<any>('/progress/note', data);
  }

  private _sendUpdate(data: ProgressUpdate): void {
    this.api.put<any>('/progress', data).subscribe({
      error: (err) => console.warn('Progress update failed:', err),
    });
  }
}
