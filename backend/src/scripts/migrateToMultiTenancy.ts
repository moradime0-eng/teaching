
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import Tenant from '../models/Tenant';
import User from '../models/User';
import Membership, { MembershipRole, MembershipStatus } from '../models/Membership';
import Course from '../models/Course';
import Enrollment from '../models/Enrollment';
import Review from '../models/Review';
import Payment from '../models/Payment';
import Coupon from '../models/Coupon';
import Certificate from '../models/Certificate';
import Section from '../models/Section';
import Lecture from '../models/Lecture';
import Cart from '../models/Cart';
import Wishlist from '../models/Wishlist';
import Progress from '../models/Progress';
import Notification from '../models/Notification';
import Message from '../models/Message';
import Conversation from '../models/Conversation';
import Ticket from '../models/Ticket';
import { runWithTenantContext } from '../utils/tenantContext';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/iranian-udemy';

interface MigrationStats {
  tenantCreated: boolean;
  usersMigrated: number;
  membershipsCreated: number;
  coursesUpdated: number;
  enrollmentsUpdated: number;
  reviewsUpdated: number;
  paymentsUpdated: number;
  couponsUpdated: number;
  certificatesUpdated: number;
  sectionsUpdated: number;
  lecturesUpdated: number;
  cartsUpdated: number;
  wishlistsUpdated: number;
  progressUpdated: number;
  notificationsUpdated: number;
  messagesUpdated: number;
  conversationsUpdated: number;
  ticketsUpdated: number;
  errors: string[];
}

async function migrate() {
  const stats: MigrationStats = {
    tenantCreated: false,
    usersMigrated: 0,
    membershipsCreated: 0,
    coursesUpdated: 0,
    enrollmentsUpdated: 0,
    reviewsUpdated: 0,
    paymentsUpdated: 0,
    couponsUpdated: 0,
    certificatesUpdated: 0,
    sectionsUpdated: 0,
    lecturesUpdated: 0,
    cartsUpdated: 0,
    wishlistsUpdated: 0,
    progressUpdated: 0,
    notificationsUpdated: 0,
    messagesUpdated: 0,
    conversationsUpdated: 0,
    ticketsUpdated: 0,
    errors: [],
  };

  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // ============================================
    // STEP 1: Create Default Tenant
    // ============================================
    console.log('\n📦 Step 1: Creating default tenant...');

    let defaultTenant = await Tenant.findOne({ subdomain: 'iranian-udemy' });

    if (!defaultTenant) {
      // Find a user to be the owner (prefer admin)
      const adminUser = await User.findOne({ role: 'admin' });
      const fallbackUser = await User.findOne();
      const ownerId = adminUser?._id || fallbackUser?._id;

      if (!ownerId) {
        throw new Error('No users found to assign as tenant owner');
      }

      defaultTenant = await Tenant.create({
        name: 'Iranian Udemy',
        subdomain: 'iranian-udemy',
        isActive: true,
        branding: {
          primaryColor: '#a435f0',
          secondaryColor: '#1c1d1f',
          fontFamily: 'Vazirmatn',
        },
        paymentSettings: {
          sandbox: true,
        },
        owner: ownerId,
      });
      stats.tenantCreated = true;
      console.log(`✅ Created default tenant: ${defaultTenant.name} (${defaultTenant._id})`);
    } else {
      console.log(`✅ Default tenant already exists: ${defaultTenant.name} (${defaultTenant._id})`);
    }

    const tenantId = defaultTenant._id;

    // ============================================
    // STEP 2: Create Memberships for All Users
    // ============================================
    console.log('\n👥 Step 2: Creating memberships for all users...');
    const users = await User.find({}).select('_id role');
    console.log(`Found ${users.length} users to migrate`);

    for (const user of users) {
      // Determine membership role based on user role
      let membershipRole = MembershipRole.STUDENT;
      if (user.role === 'admin') {
        membershipRole = MembershipRole.OWNER;
      } else if (user.role === 'instructor') {
        membershipRole = MembershipRole.INSTRUCTOR;
      }

      // Check if membership already exists
      const existingMembership = await Membership.findOne({
        user: user._id,
        tenant: tenantId,
      });

      if (!existingMembership) {
        await Membership.create({
          user: user._id,
          tenant: tenantId,
          role: membershipRole,
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
        });
        stats.membershipsCreated++;
      }

      // Update user's activeTenant
      if (!user.activeTenant) {
        user.activeTenant = tenantId;
        await user.save();
      }
      stats.usersMigrated++;
    }
    console.log(
      `✅ Migrated ${stats.usersMigrated} users, created ${stats.membershipsCreated} memberships`,
    );

    // ============================================
    // STEP 3: Update Tenant-Scoped Models
    // ============================================
    console.log('\n📝 Step 3: Updating tenant-scoped models...');

    // Helper function to update documents with tenant field
    const updateWithTenant = async (model: any, modelName: string, filter = {}) => {
      try {
        // Temporarily disable strict mode for migration
        const collection = model.collection;

        const result = await collection.updateMany(
          { ...filter, tenant: { $exists: false } },
          { $set: { tenant: tenantId } },
        );

        const count = result.modifiedCount || 0;
        console.log(`  ✅ ${modelName}: Updated ${count} documents`);
        return count;
      } catch (error: any) {
        const errorMsg = `${modelName}: ${error.message}`;
        stats.errors.push(errorMsg);
        console.error(`  ❌ ${errorMsg}`);
        return 0;
      }
    };

    // Update all tenant-scoped models
    stats.coursesUpdated = await updateWithTenant(Course, 'Course');
    stats.enrollmentsUpdated = await updateWithTenant(Enrollment, 'Enrollment');
    stats.reviewsUpdated = await updateWithTenant(Review, 'Review');
    stats.paymentsUpdated = await updateWithTenant(Payment, 'Payment');
    stats.couponsUpdated = await updateWithTenant(Coupon, 'Coupon');
    stats.certificatesUpdated = await updateWithTenant(Certificate, 'Certificate');
    stats.sectionsUpdated = await updateWithTenant(Section, 'Section');
    stats.lecturesUpdated = await updateWithTenant(Lecture, 'Lecture');
    stats.cartsUpdated = await updateWithTenant(Cart, 'Cart');
    stats.wishlistsUpdated = await updateWithTenant(Wishlist, 'Wishlist');
    stats.progressUpdated = await updateWithTenant(Progress, 'Progress');
    stats.notificationsUpdated = await updateWithTenant(Notification, 'Notification');
    stats.messagesUpdated = await updateWithTenant(Message, 'Message');
    stats.conversationsUpdated = await updateWithTenant(Conversation, 'Conversation');
    stats.ticketsUpdated = await updateWithTenant(Ticket, 'Ticket');

    // ============================================
    // STEP 4: Verify Migration
    // ============================================
    console.log('\n🔍 Step 4: Verifying migration...');
    const verifyCounts = async () => {
      const models: Array<{ model: mongoose.Model<any>; name: string }> = [
        { model: Course, name: 'Course' },
        { model: Enrollment, name: 'Enrollment' },
        { model: Review, name: 'Review' },
        { model: Payment, name: 'Payment' },
        { model: Coupon, name: 'Coupon' },
        { model: Certificate, name: 'Certificate' },
        { model: Section, name: 'Section' },
        { model: Lecture, name: 'Lecture' },
        { model: Cart, name: 'Cart' },
        { model: Wishlist, name: 'Wishlist' },
        { model: Progress, name: 'Progress' },
        { model: Notification, name: 'Notification' },
        { model: Message, name: 'Message' },
        { model: Conversation, name: 'Conversation' },
        { model: Ticket, name: 'Ticket' },
      ];

      for (const { model, name } of models) {
        const total = await model.countDocuments({});
        const withTenant = await model.countDocuments({ tenant: tenantId });
        const withoutTenant = await model.countDocuments({ tenant: { $exists: false } });

        console.log(
          `  ${name}: Total=${total}, With Tenant=${withTenant}, Without Tenant=${withoutTenant}`,
        );

        if (withoutTenant > 0) {
          stats.errors.push(`${name}: ${withoutTenant} documents still missing tenant field`);
        }
      }
    };

    await verifyCounts();

    // ============================================
    // STEP 5: Create Indexes
    // ============================================
    console.log('\n📊 Step 5: Ensuring indexes exist...');

    // The indexes are defined in the model files and will be created automatically
    // when the models are used. We can force creation here if needed.
    const modelsWithIndexes = [
      Course,
      Enrollment,
      Review,
      Payment,
      Coupon,
      Certificate,
      Section,
      Lecture,
      Cart,
      Wishlist,
      Progress,
      Notification,
      Message,
      Conversation,
      Ticket,
      Membership,
    ];

    for (const model of modelsWithIndexes) {
      try {
        await model.createIndexes();
        console.log(`  ✅ Indexes created for ${model.modelName}`);
      } catch (error: any) {
        console.warn(`  ⚠️ Index creation warning for ${model.modelName}: ${error.message}`);
      }
    }

    // ============================================
    // SUMMARY
    // ============================================
    console.log('\n📋 Migration Summary:');
    console.log('====================');
    console.log(`Default Tenant Created: ${stats.tenantCreated ? 'Yes' : 'No (already existed)'}`);
    console.log(`Users Migrated: ${stats.usersMigrated}`);
    console.log(`Memberships Created: ${stats.membershipsCreated}`);
    console.log(`Courses Updated: ${stats.coursesUpdated}`);
    console.log(`Enrollments Updated: ${stats.enrollmentsUpdated}`);
    console.log(`Reviews Updated: ${stats.reviewsUpdated}`);
    console.log(`Payments Updated: ${stats.paymentsUpdated}`);
    console.log(`Coupons Updated: ${stats.couponsUpdated}`);
    console.log(`Certificates Updated: ${stats.certificatesUpdated}`);
    console.log(`Sections Updated: ${stats.sectionsUpdated}`);
    console.log(`Lectures Updated: ${stats.lecturesUpdated}`);
    console.log(`Carts Updated: ${stats.cartsUpdated}`);
    console.log(`Wishlists Updated: ${stats.wishlistsUpdated}`);
    console.log(`Progress Updated: ${stats.progressUpdated}`);
    console.log(`Notifications Updated: ${stats.notificationsUpdated}`);
    console.log(`Messages Updated: ${stats.messagesUpdated}`);
    console.log(`Conversations Updated: ${stats.conversationsUpdated}`);
    console.log(`Tickets Updated: ${stats.ticketsUpdated}`);

    if (stats.errors.length > 0) {
      console.log('\n❌ Errors:');
      stats.errors.forEach((err) => console.log(`  - ${err}`));
    } else {
      console.log('\n✅ Migration completed successfully with no errors!');
    }
  } catch (error: any) {
    console.error('\n💥 Migration failed:', error);
    stats.errors.push(`Fatal: ${error.message}`);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }

  return stats;
}

// Run migration if executed directly
if (require.main === module) {
  migrate()
    .then((stats) => {
      process.exit(stats.errors.length > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('Migration script error:', err);
      process.exit(1);
    });
}

export default migrate;
