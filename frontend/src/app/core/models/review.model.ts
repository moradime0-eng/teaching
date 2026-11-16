import { User } from './user.model';

export interface Review {
  _id: string;
  user: User | string;
  course: string;
  rating: number;
  title?: string;
  comment: string;
  helpfulCount: number;
  instructorReply?: {
    content: string;
    repliedAt: string;
  };
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReviewRequest {
  courseId: string;
  rating: number;
  title?: string;
  comment: string;
}