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

/** اطلاعات فرستنده بعد از populate شدن در سرور */
export interface NotificationSender {
  _id: string;
  fullName?: string;
  avatar?: string;
}

export interface Notification {
  _id: string;
  recipient: string;
  /** رشته خام یا آبجکت populate شده (بسته به endpoint) */
  sender?: string | NotificationSender;
  type: NotificationType;
  title: string;
  message: string;
  data?: any;
  link?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}