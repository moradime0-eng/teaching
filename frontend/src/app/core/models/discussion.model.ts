

export type DiscussionType = 'question' | 'note' | 'announcement';

export interface DiscussionUser {
  _id: string;
  fullName?: string;
  avatar?: string;
  role?: string;
}

export interface DiscussionReply {
  _id?: string;
  user: DiscussionUser | null;
  content: string;
  isInstructorReply: boolean;
  createdAt: string;
  updatedAt?: string;
  upvotesCount: number;
  downvotesCount: number;
  hasUpvoted?: boolean;
  hasDownvoted?: boolean;
}

export interface Discussion {
  _id: string;
  course: string;
  lecture: string | null;
  user: DiscussionUser | null;
  title: string;
  content: string;
  type: DiscussionType;
  isPinned: boolean;
  isResolved: boolean;
  tags?: string[];
  createdAt: string;
  updatedAt?: string;
  replies: DiscussionReply[];
  upvotesCount: number;
  downvotesCount: number;
  hasUpvoted?: boolean;
  hasDownvoted?: boolean;
  replyCount?: number;
}

/** پرسش + اطلاعات دوره/درس — خروجی صندوق پرسش مدرس */
export interface InstructorQuestion extends Discussion {
  courseId: string | null;
  courseTitle: string | null;
  courseSlug: string | null;
  lectureTitle: string | null;
  hasInstructorReply: boolean;
}

/** دوره‌های قابل فیلتر در صندوق پرسش */
export interface InstructorQuestionCourse {
  _id: string;
  title: string;
  slug?: string;
  thumbnail?: string | null;
  status?: string;
}

/** آمار صندوق پرسش */
export interface InstructorQuestionStats {
  total: number;
  unanswered: number;
  answered: number;
}
