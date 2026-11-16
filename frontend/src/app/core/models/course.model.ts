import { User } from './user.model';
import { Category } from './category.model';
import { Review } from './review.model';

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
  DOWNLOAD = 'download',
  LIVE = 'live',
}

export enum PromoVideoType {
  UPLOAD = 'upload',
  YOUTUBE = 'youtube',
  VIMEO = 'vimeo',
}

export interface Course {
  rating: number;
  id: string | number;
  _id: string;
  title: string;
  slug: string;
  subtitle?: string;
  description: string;
  shortDescription?: string;
  thumbnail: string;
  promoVideo?: string;
  promoVideoType?: PromoVideoType;
  promoVideoUrl?: string;
  /** 🔒 true یعنی ویدیوی معرفی آپلودشده است و باید از مسیر محافظت‌شدهٔ بک‌اند پخش شود */
  promoVideoProtected?: boolean;
  instructor: User; // همیشه populated شده از API
  coInstructors?: (User | string)[];
  category: Category; // همیشه populated شده از API
  subCategory?: Category | string;
  level: CourseLevel;
  language: string;
  price: number;
  discountPrice?: number;
  discountEndsAt?: string;
  discountType?: 'none' | 'manual' | 'countdown';
  countdownDiscount?: {
    enabled: boolean;
    startAt: string;
    endAt: string;
    initialPercent: number;
    finalPercent: number;
    mode: 'linear' | 'step';
    stepIntervalMinutes?: number;
    stepPercent?: number;
  };
  isFree: boolean;
  status: CourseStatus;
  rejectionReason?: string;
  requirements: string[];
  requirementCourses: { _id: string; title: string; slug: string }[];
  learningOutcomes: string[];
  targetAudience: string[];
  tags: string[];
  totalDuration: number;
  totalLectures: number;
  totalSections: number;
  totalStudents: number;
  totalReviews: number;
  averageRating: number;
  ratingDistribution: {
    five: number;
    four: number;
    three: number;
    two: number;
    one: number;
  };
  totalRevenue: number;
  hasCertificate: boolean;
  hasLifetimeAccess: boolean;
  hasSupport: boolean;
  maxStudents?: number;
  installmentEnabled: boolean;
  installmentCount: number;
  isFeatured: boolean;
  isBestseller: boolean;
  isRecentlyPublished: boolean;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  currentPrice?: number;
  discountPercentage?: number;
  pricing?: {
    originalPrice: number;
    discountType: 'none' | 'manual' | 'countdown';
    currentDiscountPercent: number;
    currentPrice: number;
    serverTime: string;
    discountStartAt?: string;
    discountEndAt?: string;
    discountActive: boolean;
    countdownProgress?: number;
    countdownMode?: 'linear' | 'step';
    // ⭐ فیلدهای محاسبه زنده دقیق
    initialPercent?: number;
    finalPercent?: number;
    stepPercent?: number;
    stepIntervalMinutes?: number;
    // 🎯 فیلدهای کمپین (D2 Best-of strategy)
    campaignApplied?: boolean;
    campaignDiscountPercent?: number;
    priceBeforeCampaign?: number;
  };
  // 🎯 خلاصهٔ کمپین فعال برای نمایش بنر
  activeCampaign?: {
    title?: string;
    bannerText?: string;
    endAt?: string;
    theme?: 'fire' | 'cold' | 'gold' | 'green';
  };
  sections?: Section[];
  reviews?: Review[];
  // SEO fields
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
}

export interface Section {
  _id: string;
  course: string;
  title: string;
  description?: string;
  order: number;
  totalLectures: number;
  totalDuration: number;
  lectures?: Lecture[];
}

export interface Lecture {
  _id: string;
  section: string;
  course: string;
  title: string;
  description?: string;
  type: LectureType;
  order: number;
  duration: number;
  videoUrl?: string;
  videoThumbnail?: string;
  videoFileName?: string;
  videoFileSize?: number;
  articleContent?: string;
  content?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  size?: number;
  storage?: {
    provider: string;
    bucket: string;
    key: string;
    originalFileName: string;
  };
  processing?: {
    status: 'PENDING' | 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED';
    progress: number;
    hls: { masterPlaylist: string; qualities: string[] };
    thumbnails: string[];
    error: string;
  };
  quiz?: Quiz;
  assignment?: Assignment;
  resources: Resource[];
  contentItems: ContentItem[];
  isFreePreview: boolean;
  isPublished: boolean;
}

export interface Assignment {
  instructions?: string;
  submissionType: 'text' | 'file' | 'both';
  dueDate?: string;
}

export interface Quiz {
  questions: QuizQuestion[];
  passingScore: number;
  timeLimit?: number;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
}

export interface Resource {
  id: any;
  _id: any;
  title: string;
  url: string;
  type: string;
  size?: number;
}
export interface ContentItem {
  _id: string;
  type: 'video' | 'rich-text' | 'attachment' | 'external-link' | 'image' | 'audio';
  title: string;
  description?: string;
  order: number;
  isRequired?: boolean;
  // Video specific
  videoUrl?: string;
  videoFileName?: string;
  videoFileSize?: number;
  videoDuration?: number;
  storage?: {
    provider: string;
    bucket: string;
    key: string;
    originalFileName: string;
  };
  processing?: {
    status: 'PENDING' | 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED';
    progress: number;
    hls: { masterPlaylist: string; qualities: string[] };
    thumbnails: string[];
    error: string;
    startedAt?: string;
    completedAt?: string;
  };
  // Rich text specific
  richTextContent?: string;
  // Attachment specific
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  // External link specific
  externalUrl?: string;
  // Image specific
  imageUrl?: string;
  // Audio specific
  audioUrl?: string;
  audioFileName?: string;
  audioFileSize?: number;
  audioDuration?: number;
  createdAt: string;
  updatedAt: string;
}
export interface CourseFilter {
  category?: string;
  subCategory?: string;
  level?: CourseLevel;
  price_min?: number | string;
  price_max?: number | string;
  minPrice?: number | string;
  maxPrice?: number | string;
  rating?: number | string;
  isFree?: boolean;
  sort?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateCourseRequest {
  title: string;
  subtitle?: string;
  description: string;
  shortDescription?: string;
  category: string;
  subCategory?: string;
  level?: CourseLevel;
  language?: string;
  price: number;
  discountPrice?: number;
  discountEndsAt?: string;
  isFree?: boolean;
  requirements?: string[];
  requirementCourses?: { _id: string; title: string; slug: string }[];
  learningOutcomes?: string[];
  targetAudience?: string[];
  tags?: string[];
  hasCertificate?: boolean;
  hasLifetimeAccess?: boolean;
  hasSupport?: boolean;
  maxStudents?: number;
  installmentEnabled?: boolean;
  installmentCount?: number;
  thumbnail?: string;
  promoVideo?: string;
  promoVideoType?: PromoVideoType;
  promoVideoUrl?: string;
  /** 🔒 true یعنی ویدیوی معرفی آپلودشده است و باید از مسیر محافظت‌شدهٔ بک‌اند پخش شود */
  promoVideoProtected?: boolean;
  slug?: string;
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  sections?: CreateSectionRequest[];
}

export interface CreateSectionRequest {
  title: string;
  description?: string;
  lectures?: CreateLectureRequest[];
}

export interface CreateLectureRequest {
  title: string;
  type: LectureType;
  duration?: number;
  isFreePreview?: boolean;
  content?: string;
  videoUrl?: string;
  videoFileName?: string; // 🆕
  videoFileSize?: number; // 🆕
  fileUrl?: string;
  fileName?: string; // 🆕
  fileSize?: number; // 🆕
  contentItems?: CreateContentItemRequest[];
}

export interface CreateContentItemRequest {
  type: 'video' | 'rich-text' | 'attachment' | 'external-link' | 'image' | 'audio';
  title: string;
  description?: string;
  order?: number;
  // Video specific
  videoUrl?: string;
  videoFileName?: string;
  videoFileSize?: number;
  videoDuration?: number;
  // Rich text specific
  richTextContent?: string;
  // Attachment specific
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  // External link specific
  externalUrl?: string;
  // Image specific
  imageUrl?: string;
  // Audio specific
  audioUrl?: string;
  audioFileName?: string;
  audioFileSize?: number;
  audioDuration?: number;
}

export interface UpdateCourseRequest extends Partial<CreateCourseRequest> {
  _id?: string;
}

// ═══════════════════════════════════════════
// ✅ NEW: انتساب دوره به مسیر یادگیری
// ═══════════════════════════════════════════

export interface LearningPathSummary {
  _id: string;
  title: string;
  icon: string;
  status: string;
  stages: {
    _id: string;
    title: string;
    coursesCount: number;
  }[];
  totalCourses: number;
}

export interface LearningPathDetailForAssignment {
  _id: string;
  title: string;
  icon: string;
  status: string;
  stages: {
    _id: string;
    title: string;
    description?: string;
    icon: string;
    color: string;
    order: number;
    courses: {
      _id: string;
      course: {
        _id: string;
        title: string;
        slug: string;
        thumbnail?: string;
      };
      order: number;
      isRequired: boolean;
    }[];
  }[];
}

export interface CourseInPathSettings {
  isRequired: boolean;
  order: number | null;
  customTitle: string;
  customDescription: string;
  estimatedDuration: number | null;
  prerequisites: string[];
}

export interface QuickCreatePathData {
  title: string;
  subtitle?: string;
  icon: string;
  difficulty: string;
  shortDescription?: string;
  description?: string;
  category?: string;
  firstStage: {
    title: string;
    description?: string;
    icon: string;
    color: string;
  };
  courseId: string;
  courseSettings: CourseInPathSettings;
}

export interface LearningPathAssignment {
  mode: 'none' | 'existing' | 'new';
  pathId?: string;
  stageId?: string;
  courseSettings?: CourseInPathSettings;
  newPath?: QuickCreatePathData;
}
