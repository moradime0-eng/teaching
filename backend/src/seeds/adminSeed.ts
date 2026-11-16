import crypto from 'crypto';
import User from '../models/User';
import Membership from '../models/Membership';
import Cart from '../models/Cart';
import Wishlist from '../models/Wishlist';
import { UserRole } from '../types';

/**
 * Seed the initial admin user.
 * Admin credentials should be set via environment variables:
 *   ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FULLNAME
 *
 * This script is safe to run multiple times — it will skip if admin already exists.
 */
export const seedAdmin = async () => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@iranianudemy.com';
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminName = process.env.ADMIN_FULLNAME || 'Super Admin';

    if (!adminPassword) {
      console.warn(
        '⚠️  ADMIN_PASSWORD env var not set. Using generated password. Set ADMIN_PASSWORD for production.',
      );
    }

    const password = adminPassword || crypto.randomBytes(12).toString('hex');

    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      console.log('✅ Admin user already exists:', adminEmail);
      return existingAdmin;
    }

    // Get the first active tenant for membership
    const Tenant = (await import('../models/Tenant')).default;
    const tenant = await Tenant.findOne({ isActive: true });

    const admin = await User.create({
      fullName: adminName,
      email: adminEmail,
      password,
      role: UserRole.ADMIN,
      isEmailVerified: true,
      isActive: true,
    });

    // Create membership if tenant exists
    if (tenant) {
      await Membership.create({
        user: admin._id,
        tenant: tenant._id,
        role: 'admin',
        status: 'active',
      });
      await Cart.create({ user: admin._id, items: [], tenant: tenant._id });
      await Wishlist.create({ user: admin._id, courses: [], tenant: tenant._id });
    }

    console.log(`✅ Admin user created: ${adminEmail}`);
    if (!adminPassword) {
      console.log(`⚠️  Generated password: ${password} — SAVE THIS!`);
    }
    return admin;
  } catch (error) {
    console.error('❌ Admin seed error:', error);
    throw error;
  }
};
