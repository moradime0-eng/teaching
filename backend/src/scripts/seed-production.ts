/**
 * 🌱 اسکریپت Seed Production
 * ============================================================
 * این اسکریپت فقط داده‌های حیاتی و پایه‌ای سیستم را ایجاد می‌کند:
 * ۱. ادمین (از متغیرهای محیطی)
 * ۲. تنظیمات پیش‌فرض سایت
 * ۳. دسته‌بندی‌های اصلی و زیردسته‌ها
 *
 * 🚫 هیچ دیتای تستی یا Dummy ایجاد نمی‌کند
 * ✅ Idempotent — اجرای مکرر باعث ایجاد داده تکراری نمی‌شود
 *
 * نحوه اجرا:
 *   npx ts-node src/scripts/seed-production.ts
 * ============================================================
 */

import mongoose from 'mongoose';
// FIRST import: load .env + Docker `_FILE` secrets (MONGODB_URI, ADMIN_PASSWORD).
import '../config/loadEnv';
import User from '../models/User';
import Tenant from '../models/Tenant';
import Membership from '../models/Membership';
import Cart from '../models/Cart';
import Wishlist from '../models/Wishlist';
import Category from '../models/Category';
import Setting from '../models/Setting';
import { UserRole } from '../types';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/iranian-udemy';

async function seed(): Promise<void> {
  console.log('🌱 Starting production seed...\n');

  // ============================================
  // 1. Connect to Database
  // ============================================
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // ============================================
  // 2. Validate environment variables
  // ============================================
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.error('❌ ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env file');
    console.error('   Example:');
    console.error('   ADMIN_EMAIL=admin@example.com');
    console.error('   ADMIN_PASSWORD=YourSecurePassword123!');
    process.exit(1);
  }

  // ============================================
  // 3. Create Admin + Default Tenant (if not exists)
  // ============================================
  const existingAdmin = await User.findOne({ email: adminEmail });
  let adminUser;

  if (existingAdmin) {
    console.log('✅ Admin already exists:', adminEmail);
    adminUser = existingAdmin;
  } else {
    adminUser = await User.create({
      fullName: process.env.ADMIN_NAME || 'مدیر سیستم',
      email: adminEmail,
      password: adminPassword,
      role: UserRole.ADMIN,
      isActive: true,
      isEmailVerified: true,
    });
    console.log('✅ Admin created:', adminEmail);
  }

  // Create default tenant if not exists
  let tenant = await Tenant.findOne({ isActive: true });
  if (!tenant) {
    tenant = await Tenant.create({
      name: process.env.TENANT_NAME || 'آموزشگاه پیش‌فرض',
      subdomain: process.env.TENANT_SUBDOMAIN || 'main',
      isActive: true,
      isDefault: true,
      owner: adminUser._id,
      branding: {
        primaryColor: '#a435f0',
        secondaryColor: '#1c1d1f',
        fontFamily: 'Vazirmatn',
      },
      paymentSettings: {
        sandbox: true,
      },
    });
    console.log('✅ Default tenant created:', tenant.name, '(' + tenant.subdomain + ')');
  } else {
    console.log('✅ Tenant already exists:', tenant.name);
  }

  // Create admin membership if not exists
  const existingMembership = await Membership.findOne({ user: adminUser._id, tenant: tenant._id });
  if (!existingMembership) {
    await Membership.create({
      user: adminUser._id,
      tenant: tenant._id,
      role: 'admin',
      status: 'active',
    });
    await Cart.create({ user: adminUser._id, items: [], tenant: tenant._id });
    await Wishlist.create({ user: adminUser._id, courses: [], tenant: tenant._id });
    console.log('✅ Admin membership and cart/wishlist created');
  }

  // ============================================
  // 4. Create default Settings (if not exists)
  // ============================================
  const existingSettings = await Setting.findOne(); // Singleton pattern - first document
  if (existingSettings) {
    console.log('✅ Settings already exist');
  } else {
    await Setting.create({
      siteName: 'همایون',
      siteDescription: 'مرکز تخصصی آموزش آنلاین',
      supportEmail: 'info@iranianudemy.com',
      supportPhone: '09138721504',
      address: 'اصفهان',
      socialLinks: {
        instagram: 'https://instagram.com/homayoon_academy',
        telegram: 'https://t.me/homayoon_academy',
        linkedin: 'https://linkedin.com/company/homayoon-academy',
        twitter: '',
        youtube: 'https://youtube.com/@homayoon_academy',
      },
      seo: {
        defaultMetaTitle: 'همایون - مرکز تخصصی آموزش آنلاین',
        defaultMetaDescription: 'مرجع تخصصی آموزش برنامه‌نویسی، هوش مصنوعی و مهارت‌های دیجیتال',
        defaultMetaKeywords: ['آموزش', 'برنامه‌نویسی', 'دوره آنلاین', 'همایون', 'هوش مصنوعی'],
      },
    });
    console.log('✅ Default settings created');
  }

  // ============================================
  // 5. Create Categories (if not exists)
  // ============================================
  const existingCategories = await Category.countDocuments();
  if (existingCategories > 0) {
    console.log(`✅ ${existingCategories} categories already exist`);
  } else {
    const categories = [
      {
        name: 'هوش مصنوعی و یادگیری ماشین',
        slug: 'ai-machine-learning',
        description: 'یادگیری عمیق، شبکه‌های عصبی و علم داده',
        icon: 'psychology',
        level: 0,
        order: 1,
        isActive: true,
        children: [
          { name: 'یادگیری عمیق (Deep Learning)', slug: 'deep-learning', level: 1, order: 1 },
          { name: 'علم داده (Data Science)', slug: 'data-science', level: 1, order: 2 },
          { name: 'ChatGPT و مهندسی پرامپت', slug: 'chatgpt', level: 1, order: 3 },
          { name: 'رباتیک و اتوماسیون', slug: 'robotics', level: 1, order: 4 },
        ],
      },
      {
        name: 'برنامه‌نویسی و توسعه نرم‌افزار',
        slug: 'programming',
        description: 'فرانت‌اند، بک‌اند، موبایل و دواپس',
        icon: 'code',
        level: 0,
        order: 2,
        isActive: true,
        children: [
          { name: 'توسعه فرانت‌اند', slug: 'frontend', level: 1, order: 1 },
          { name: 'توسعه بک‌اند', slug: 'backend', level: 1, order: 2 },
          { name: 'توسعه موبایل', slug: 'mobile', level: 1, order: 3 },
          { name: 'دواپس و زیرساخت', slug: 'devops', level: 1, order: 4 },
        ],
      },
      {
        name: 'آی‌تی و نرم‌افزار',
        slug: 'it-software',
        description: 'شبکه، امنیت، پایگاه داده و مدیریت پروژه',
        icon: 'computer',
        level: 0,
        order: 3,
        isActive: true,
        children: [
          { name: 'شبکه و امنیت', slug: 'network-security', level: 1, order: 1 },
          { name: 'مدیریت پروژه و چابک', slug: 'agile-project-management', level: 1, order: 2 },
          { name: 'پایگاه داده', slug: 'database', level: 1, order: 3 },
          { name: 'لینوکس و سرور', slug: 'linux-server', level: 1, order: 4 },
        ],
      },
      {
        name: 'زبان‌های خارجی',
        slug: 'languages',
        description: 'انگلیسی، آلمانی، فرانسه و ترکی',
        icon: 'language',
        level: 0,
        order: 4,
        isActive: true,
        children: [
          { name: 'انگلیسی', slug: 'english', level: 1, order: 1 },
          { name: 'آلمانی', slug: 'german', level: 1, order: 2 },
          { name: 'فرانسه', slug: 'french', level: 1, order: 3 },
          { name: 'ترکی استانبولی', slug: 'turkish', level: 1, order: 4 },
        ],
      },
      {
        name: 'مدیریت و کسب و کار',
        slug: 'business',
        description: 'بازاریابی، فروش، کارآفرینی و مدیریت',
        icon: 'business',
        level: 0,
        order: 5,
        isActive: true,
        children: [
          { name: 'مدیریت منابع انسانی', slug: 'hr-management', level: 1, order: 1 },
          { name: 'بازاریابی دیجیتال', slug: 'digital-marketing', level: 1, order: 2 },
          { name: 'فروش و مذاکره', slug: 'sales-negotiation', level: 1, order: 3 },
          { name: 'کارآفرینی و استارتاپ', slug: 'entrepreneurship', level: 1, order: 4 },
        ],
      },
      {
        name: 'مالی و سرمایه‌گذاری',
        slug: 'finance',
        description: 'حسابداری، بورس و ارز دیجیتال',
        icon: 'account_balance',
        level: 0,
        order: 6,
        isActive: true,
        children: [
          { name: 'حسابداری', slug: 'accounting', level: 1, order: 1 },
          { name: 'بورس و بازار سرمایه', slug: 'stock-market', level: 1, order: 2 },
          { name: 'ارز دیجیتال و بلاکچین', slug: 'cryptocurrency', level: 1, order: 3 },
        ],
      },
      {
        name: 'هنر و خلاقیت',
        slug: 'art-creativity',
        description: 'طراحی گرافیک، موشن گرافیک، عکاسی و موسیقی',
        icon: 'palette',
        level: 0,
        order: 7,
        isActive: true,
        children: [
          { name: 'طراحی گرافیک', slug: 'graphic-design', level: 1, order: 1 },
          { name: 'موشن گرافیک و تدوین', slug: 'motion-graphics', level: 1, order: 2 },
          { name: 'عکاسی', slug: 'photography', level: 1, order: 3 },
          { name: 'موسیقی', slug: 'music', level: 1, order: 4 },
        ],
      },
      {
        name: 'مهارت‌های زندگی',
        slug: 'life-skills',
        description: 'مهارت‌های ارتباطی، مدیریت زمان و تفکر نقاد',
        icon: 'self_improvement',
        level: 0,
        order: 8,
        isActive: true,
        children: [
          { name: 'مهارت‌های ارتباطی', slug: 'communication-skills', level: 1, order: 1 },
          { name: 'مدیریت زمان و بهره‌وری', slug: 'time-management', level: 1, order: 2 },
          { name: 'تفکر نقاد و حل مسئله', slug: 'critical-thinking', level: 1, order: 3 },
        ],
      },
      {
        name: 'دانشگاهی: فنی و مهندسی',
        slug: 'university-engineering',
        description: 'مهندسی کامپیوتر، برق، عمران و مکانیک',
        icon: 'engineering',
        level: 0,
        order: 9,
        isActive: true,
        children: [
          { name: 'مهندسی کامپیوتر', slug: 'computer-engineering', level: 1, order: 1 },
          { name: 'مهندسی برق', slug: 'electrical-engineering', level: 1, order: 2 },
          { name: 'مهندسی عمران', slug: 'civil-engineering', level: 1, order: 3 },
          { name: 'مهندسی مکانیک', slug: 'mechanical-engineering', level: 1, order: 4 },
        ],
      },
      {
        name: 'کودک و نوجوان',
        slug: 'kids-teens',
        description: 'برنامه‌نویسی، رباتیک و خلاقیت برای کودکان',
        icon: 'child_care',
        level: 0,
        order: 10,
        isActive: true,
        children: [
          { name: 'برنامه‌نویسی کودکان', slug: 'kids-coding', level: 1, order: 1 },
          { name: 'رباتیک کودکان', slug: 'kids-robotics', level: 1, order: 2 },
          { name: 'خلاقیت و نقاشی', slug: 'kids-art', level: 1, order: 3 },
        ],
      },
    ];

    // Create parent categories first, then children
    for (const catData of categories) {
      const { children, ...parentData } = catData;
      const parent = await Category.create(parentData);
      console.log(`  ✅ Parent category: ${parent.name}`);

      for (const childData of children) {
        await Category.create({
          ...childData,
          parent: parent._id,
          isActive: true,
        });
        console.log(`    └─ Subcategory: ${childData.name}`);
      }
    }

    console.log(`✅ ${categories.length} parent categories with subcategories created`);
  }

  // ============================================
  // 6. Summary
  // ============================================
  const adminCount = await User.countDocuments({ role: UserRole.ADMIN });
  const categoryCount = await Category.countDocuments({ level: 0 });
  const subcategoryCount = await Category.countDocuments({ level: 1 });

  console.log('\n📊 Seed Summary:');
  console.log(`   Admins: ${adminCount}`);
  console.log(`   Tenants: ${await Tenant.countDocuments()}`);
  console.log(`   Categories: ${categoryCount}`);
  console.log(`   Subcategories: ${subcategoryCount}`);
  console.log(`   Settings: ${existingSettings ? '✅' : '✅ Created'}`);
  console.log('\n🎉 Production seed completed successfully!');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
