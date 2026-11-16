import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantPlugin } from '../plugins/tenantPlugin';

export interface IWishlist extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  courses: {
    course: mongoose.Types.ObjectId;
    addedAt: Date;
  }[];

  // Multi-tenancy
  tenant: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const wishlistSchema = new Schema<IWishlist>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    courses: [
      {
        course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    // Multi-tenancy
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

// ✅ ایندکس ترکیبی یکتا: هر کاربر در هر آموزشگاه (تننت) یک لیست علاقه‌مندی مستقل دارد
wishlistSchema.index({ tenant: 1, user: 1 }, { unique: true });

// اعمال پلاگین ایزولاسیون تننت
wishlistSchema.plugin(tenantPlugin);

const Wishlist: Model<IWishlist> = mongoose.model<IWishlist>('Wishlist', wishlistSchema);
export default Wishlist;
