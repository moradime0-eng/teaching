import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { ApiService } from './api.service';
import { ApiResponse } from '../models/api-response.model';

export interface TopInstructor {
  _id: string;
  name: string;
  avatar: string;
  headline: string;
  totalStudents: number;
  totalCourses: number;
  averageRating: number;
  expertise: string[];
}

@Injectable({ providedIn: 'root' })
export class InstructorService {
  private api = inject(ApiService);

  getTopInstructors(limit: number = 6): Observable<ApiResponse<TopInstructor[]>> {
    return this.api.get<TopInstructor[]>('/instructors/top', { limit }).pipe(
      catchError((error) => {
        console.error('Error fetching top instructors:', error);
        return throwError(() => new Error('خطا در دریافت مدرسین برتر'));
      }),
    );
  }
}
