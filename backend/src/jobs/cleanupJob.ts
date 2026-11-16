import cron from 'node-cron';
import User from '../models/User';
import Coupon from '../models/Coupon';
import Notification from '../models/Notification';
import Course from '../models/Course';
import Tenant from '../models/Tenant';
import { runWithTenantContext } from '../utils/tenantContext';
import { flushProgressToMongoDB } from '../controllers/progressController';
import { processPendingDeletions } from '../services/safeFileDeletionService';

export const startCleanupJobs = () => {
  // 0. Flush buffered progress from Redis to MongoDB (every 60 seconds)
  cron.schedule('* * * * *', async () => {
    try {
      const flushed = await flushProgressToMongoDB();
      if (flushed > 0) {
        console.log(`🔄 Flushed ${flushed} progress records from Redis to MongoDB`);
      }
    } catch (error) {
      console.error('Progress flush error:', error);
    }
  });

  // 1. Clean expired reset password OTPs (every hour)
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await User.updateMany(
        { resetPasswordOTPExpires: { $lt: new Date() } },
        { $unset: { resetPasswordOTP: 1, resetPasswordOTPExpires: 1 } },
      );
      if (result.modifiedCount > 0) {
        console.log(`🧹 Cleaned ${result.modifiedCount} expired reset OTPs`);
      }
    } catch (error) {
      console.error('Cleanup reset OTPs error:', error);
    }
  });

  // 3. Deactivate expired coupons (every day at midnight)
  cron.schedule('0 0 * * *', async () => {
    try {
      const tenants = await Tenant.find({ isActive: true }).select('_id');
      for (const tenant of tenants) {
        await runWithTenantContext({ tenantId: tenant._id.toString() }, async () => {
          const result = await Coupon.updateMany(
            { validUntil: { $lt: new Date() }, isActive: true },
            { $set: { isActive: false } },
          );
          if (result.modifiedCount > 0) {
            console.log(
              `🧹 [Tenant: ${tenant._id}] Deactivated ${result.modifiedCount} expired coupons`,
            );
          }
        });
      }
    } catch (error) {
      console.error('Cleanup coupons error:', error);
    }
  });

  // 4. Clean old notifications (every week - keep last 90 days)
  cron.schedule('0 0 * * 0', async () => {
    try {
      const tenants = await Tenant.find({ isActive: true }).select('_id');
      for (const tenant of tenants) {
        await runWithTenantContext({ tenantId: tenant._id.toString() }, async () => {
          const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
          const result = await Notification.deleteMany({
            createdAt: { $lt: ninetyDaysAgo },
            isRead: true,
          });
          if (result.deletedCount > 0) {
            console.log(
              `🧹 [Tenant: ${tenant._id}] Deleted ${result.deletedCount} old notifications`,
            );
          }
        });
      }
    } catch (error) {
      console.error('Cleanup notifications error:', error);
    }
  });

  // 5. Mark courses as "not new" after 30 days (every day)
  cron.schedule('0 1 * * *', async () => {
    try {
      const tenants = await Tenant.find({ isActive: true }).select('_id');
      for (const tenant of tenants) {
        await runWithTenantContext({ tenantId: tenant._id.toString() }, async () => {
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const result = await Course.updateMany(
            { isRecentlyPublished: true, publishedAt: { $lt: thirtyDaysAgo } },
            { $set: { isRecentlyPublished: false } },
          );
          if (result.modifiedCount > 0) {
            console.log(
              `🧹 [Tenant: ${tenant._id}] Updated ${result.modifiedCount} courses (no longer new)`,
            );
          }
        });
      }
    } catch (error) {
      console.error('Cleanup new courses error:', error);
    }
  });

  // 6. Clean old refresh tokens (every day - keep max 5 per user)
  cron.schedule('0 2 * * *', async () => {
    try {
      const tenants = await Tenant.find({ isActive: true }).select('_id');
      for (const tenant of tenants) {
        await runWithTenantContext({ tenantId: tenant._id.toString() }, async () => {
          const users = await User.find({
            $expr: { $gt: [{ $size: '$refreshTokens' }, 5] },
          }).select('+refreshTokens');

          for (const user of users) {
            user.refreshTokens = user.refreshTokens.slice(-5);
            await user.save();
          }

          if (users.length > 0) {
            console.log(
              `🧹 [Tenant: ${tenant._id}] Cleaned refresh tokens for ${users.length} users`,
            );
          }
        });
      }
    } catch (error) {
      console.error('Cleanup refresh tokens error:', error);
    }
  });

  // 7. [REPLACED] انقضای کورِ پرداخت‌های PENDING (کرون */10 دقیقه) حذف شد.
  //    اکنون reconciliationJob (هر ۵ دقیقه) قبل از EXPIRE کردن حتماً از خودِ
  //    درگاه استعلام می‌گیرد؛ پرداختِ واقعاً پرداخت‌شده هرگز منقضی نمی‌شود (رفع H4).
  //    رجوع شود به: backend/src/jobs/reconciliationJob.ts

  // 8. Process pending file deletions (every 5 minutes)
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await processPendingDeletions();
      if (result.processed > 0) {
        console.log(`🗑️ Processed ${result.processed} file deletions: ${result.succeeded} succeeded, ${result.failed} failed`);
      }
    } catch (error) {
      console.error('File deletion processing error:', error);
    }
  });

  console.log('✅ All cleanup cron jobs started');
};
