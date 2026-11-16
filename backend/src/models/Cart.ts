import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantPlugin } from '../plugins/tenantPlugin';

interface ICartItem {
  course: mongoose.Types.ObjectId;
  priceAtAdd: number;
  addedAt: Date;
}

export interface ICart extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  items: ICartItem[];
  coupon?: mongoose.Types.ObjectId;
  totalPrice: number;
  discountAmount: number;
  finalPrice: number;

  // Multi-tenancy
  tenant: mongoose.Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

const cartSchema = new Schema<ICart>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      // ⚠️ نکته مهم: unique: true از اینجا حذف شد تا تداخل ایندکس برطرف شود
    },
    items: [
      {
        course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
        priceAtAdd: { type: Number, required: true, min: 0 },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    coupon: { type: Schema.Types.ObjectId, ref: 'Coupon' },
    totalPrice: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    finalPrice: { type: Number, default: 0, min: 0 },
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

// ✅ ایندکس ترکیبی یکتا: هر کاربر در هر آموزشگاه (تننت) دقیقاً یک سبد خرید اختصاصی دارد
cartSchema.index({ tenant: 1, user: 1 }, { unique: true });

// اعمال پلاگین ایزولاسیون خودکار
cartSchema.plugin(tenantPlugin);

const Cart: Model<ICart> = mongoose.model<ICart>('Cart', cartSchema);
export default Cart;
