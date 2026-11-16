import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantPlugin } from '../plugins/tenantPlugin';

export interface ISection extends Document {
  _id: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  order: number;
  totalLectures: number;
  totalDuration: number;

  // Multi-tenancy
  tenant: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const sectionSchema = new Schema<ISection>(
  {
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'عنوان فصل الزامی است'],
      trim: true,
      maxlength: 200,
    },
    description: { type: String, maxlength: 1000 },
    order: { type: Number, default: 0, index: true },
    totalLectures: { type: Number, default: 0 },
    totalDuration: { type: Number, default: 0 },
    // Multi-tenancy
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

sectionSchema.index({ course: 1, order: 1 });

sectionSchema.index({ tenant: 1, course: 1, order: 1 });
sectionSchema.plugin(tenantPlugin);

const Section: Model<ISection> = mongoose.model<ISection>('Section', sectionSchema);
export default Section;
