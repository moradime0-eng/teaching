import mongoose, { Schema, Document, Model } from 'mongoose';
import { LectureType } from '../enums/LectureType';
import { tenantPlugin } from '../plugins/tenantPlugin';

interface IResource {
  title: string;
  url: string;
  type: string;
  size?: number;
}

interface IContentItem extends Document {
  _id: mongoose.Types.ObjectId;
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
  storage?: IStorageInfo;
  processing?: IProcessingInfo;
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
  createdAt: Date;
  updatedAt: Date;
}

interface IStorageInfo {
  provider: 'arvan' | 's3' | 'b2' | 'cloudinary';
  bucket: string;
  key: string;
  originalFileName: string;
}

interface IProcessingInfo {
  status: 'PENDING' | 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED';
  progress: number;
  hls: {
    masterPlaylist: string;
    qualities: string[];
  };
  thumbnails: string[];
  error: string;
  startedAt: Date;
  completedAt: Date;
}

interface IQuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
}

export interface ILecture extends Document {
  _id: mongoose.Types.ObjectId;
  section: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  type: LectureType;
  order: number;
  duration: number;
  videoUrl?: string;
  videoPublicId?: string;
  videoFileName?: string;
  videoFileSize?: number;
  videoThumbnail?: string;
  videoQualities?: {
    quality: string;
    url: string;
  }[];
  articleContent?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  storage?: IStorageInfo;
  processing?: IProcessingInfo;
  size?: number;
  quiz?: {
    questions: IQuizQuestion[];
    passingScore: number;
    timeLimit?: number;
  };
  assignment?: {
    instructions: string;
    submissionType: 'text' | 'file' | 'both';
    dueDate?: Date;
  };
  resources: IResource[];
  contentItems: IContentItem[];
  isFreePreview: boolean;
  isPublished: boolean;
  tenant?: mongoose.Types.ObjectId; // ✅ FIX: optional برای multi-tenant غیرفعال
  createdAt: Date;
  updatedAt: Date;
}

// ✅ FIX: تشخیص فعال بودن multi-tenant از env
const IS_MULTI_TENANT = process.env.MULTI_TENANT_ENABLED === 'true';

const lectureSchema = new Schema<ILecture>(
  {
    section: {
      type: Schema.Types.ObjectId,
      ref: 'Section',
      required: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'عنوان درس الزامی است'],
      trim: true,
      maxlength: 200,
    },
    description: { type: String, maxlength: 2000 },
    type: {
      type: String,
      enum: Object.values(LectureType),
      default: LectureType.VIDEO,
    },
    order: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },

    videoUrl: { type: String },
    videoPublicId: { type: String },
    videoFileName: { type: String, default: '' },
    videoFileSize: { type: Number, default: 0 },
    videoThumbnail: { type: String },
    videoQualities: [
      {
        quality: String,
        url: String,
      },
    ],

    articleContent: { type: String },

    fileUrl: { type: String },
    fileName: { type: String, default: '' },
    fileSize: { type: Number, default: 0 },

    quiz: {
      questions: [
        {
          question: { type: String, required: true },
          options: [{ type: String, required: true }],
          correctAnswer: { type: Number, required: true },
          explanation: { type: String },
        },
      ],
      passingScore: { type: Number, default: 70 },
      timeLimit: { type: Number },
    },

    assignment: {
      instructions: { type: String },
      submissionType: {
        type: String,
        enum: ['text', 'file', 'both'],
        default: 'text',
      },
      dueDate: { type: Date },
    },

    resources: [
      {
        title: { type: String, required: true },
        url: { type: String, required: true },
        type: { type: String, required: true },
        size: { type: Number },
      },
    ],

    contentItems: [
      {
        _id: { type: Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
        type: {
          type: String,
          enum: ['video', 'rich-text', 'attachment', 'external-link', 'image', 'audio'],
          required: true,
        },
        title: { type: String, required: true, trim: true, maxlength: 200 },
        description: { type: String, maxlength: 2000 },
        order: { type: Number, default: 0 },
        isRequired: { type: Boolean, default: false },
        // Video specific
        videoUrl: { type: String },
        videoFileName: { type: String, default: '' },
        videoFileSize: { type: Number, default: 0 },
        videoDuration: { type: Number, default: 0 },
        storage: {
          provider: { type: String, enum: ['arvan', 's3', 'b2', 'cloudinary'], default: 'arvan' },
          bucket: { type: String },
          key: { type: String },
          originalFileName: { type: String },
        },
        processing: {
          status: {
            type: String,
            enum: ['PENDING', 'UPLOADING', 'PROCESSING', 'READY', 'FAILED'],
            default: 'PENDING',
          },
          progress: { type: Number, default: 0 },
          hls: {
            masterPlaylist: { type: String },
            qualities: [{ type: String }],
          },
          thumbnails: [{ type: String }],
          error: { type: String },
          startedAt: { type: Date },
          completedAt: { type: Date },
        },
        // Rich text specific
        richTextContent: { type: String },
        // Attachment specific
        fileUrl: { type: String },
        fileName: { type: String, default: '' },
        fileSize: { type: Number, default: 0 },
        fileType: { type: String },
        // External link specific
        externalUrl: { type: String },
        // Image specific
        imageUrl: { type: String },
        // Audio specific
        audioUrl: { type: String },
        audioFileName: { type: String, default: '' },
        audioFileSize: { type: Number, default: 0 },
        audioDuration: { type: Number, default: 0 },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
      },
    ],

    isFreePreview: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true },

    storage: {
      provider: { type: String, enum: ['arvan', 's3', 'b2', 'cloudinary'], default: 'arvan' },
      bucket: { type: String },
      key: { type: String },
      originalFileName: { type: String },
    },

    processing: {
      status: {
        type: String,
        enum: ['PENDING', 'UPLOADING', 'PROCESSING', 'READY', 'FAILED'],
        default: 'PENDING',
      },
      progress: { type: Number, default: 0 },
      hls: {
        masterPlaylist: { type: String },
        qualities: [{ type: String }],
      },
      thumbnails: [{ type: String }],
      error: { type: String },
      startedAt: { type: Date },
      completedAt: { type: Date },
    },

    size: { type: Number },

    // ✅ FIX: tenant فقط اگر multi-tenant فعال باشد required می‌شود
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: IS_MULTI_TENANT,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

lectureSchema.index({ section: 1, order: 1 });
lectureSchema.index({ 'processing.status': 1 });
lectureSchema.index({ tenant: 1, section: 1, order: 1 });
lectureSchema.index({ tenant: 1, course: 1, isPublished: 1 });

// ✅ FIX: plugin فقط اگر multi-tenant فعال باشد اعمال می‌شود
if (IS_MULTI_TENANT) {
  lectureSchema.plugin(tenantPlugin);
}

const Lecture: Model<ILecture> = mongoose.model<ILecture>('Lecture', lectureSchema);
export default Lecture;