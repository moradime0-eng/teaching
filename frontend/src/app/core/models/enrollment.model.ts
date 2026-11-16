import { Course } from './course.model';

export interface Enrollment {
  _id: string;
  student: string;
  course: Course | string;
  pricePaid: number;
  progress: number;
  completedLectures: string[];
  currentLecture?: string;
  isCompleted: boolean;
  completedAt?: string;
  certificateIssued: boolean;
  totalTimeSpent: number;
  lastAccessedAt?: string;
  hasReviewed: boolean;
  createdAt: string;
  updatedAt: string;
}