export enum UserRole {
  STUDENT = 'student',
  INSTRUCTOR = 'instructor',
  ADMIN = 'admin',
}

export enum CourseStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  PUBLISHED = 'published',
  REJECTED = 'rejected',
  ARCHIVED = 'archived',
}

export enum CourseLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  ALL_LEVELS = 'all-levels',
}

export enum LectureType {
  VIDEO = 'video',
  ARTICLE = 'article',
  QUIZ = 'quiz',
  ASSIGNMENT = 'assignment',
}

export enum PaymentStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  REVERSED = 'reversed',
  EXPIRED = 'expired',
}

export enum NotificationType {
  COURSE_UPDATE = 'course_update',
  COURSE_REJECTED = 'course_rejected',
  COURSE_APPROVED = 'course_approved',
  NEW_MESSAGE = 'new_message',
  PAYMENT = 'payment',
  REVIEW = 'review',
  SYSTEM = 'system',
  ENROLLMENT = 'enrollment',
  QA_QUESTION = 'qa_question',
  QA_REPLY = 'qa_reply',
}

export enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export interface JwtPayload {
  id: string;
  email: string;
  role: UserRole;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface ApiResponseData<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}
