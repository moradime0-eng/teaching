/**
 * اسکریپت اصلاح سطح (level) دسته‌بندی‌های موجود
 *
 * اجرا: npx ts-node src/scripts/fix-category-levels.ts
 *
 * این اسکریپت تمام دسته‌بندی‌ها را بررسی می‌کند و level را
 * بر اساس parent به صورت خودکار تصحیح می‌کند:
 * - parent = null  → level = 0 (دسته اصلی)
 * - parent != null → level = parent.level + 1 (زیردسته)
 */

import mongoose from 'mongoose';
import Category from '../models/Category';

async function fixCategoryLevels() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/iranian-udemy');
    console.log('✅ Connected to MongoDB');

    // 1. First pass: reset all root categories (parent = null) to level 0
    const rootResult = await Category.updateMany({ parent: null }, { $set: { level: 0 } });
    console.log(`📊 Root categories set to level 0: ${rootResult.modifiedCount} items`);

    // 2. Second pass: fix subcategories based on their parent's level
    // We do this iteratively to handle nested levels
    let fixed = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await Category.aggregate([
        {
          $lookup: {
            from: 'categories',
            localField: 'parent',
            foreignField: '_id',
            as: 'parentInfo',
          },
        },
        { $unwind: { path: '$parentInfo', preserveNullAndEmptyArrays: true } },
        {
          $match: {
            parent: { $ne: null },
            $expr: {
              $ne: ['$level', { $add: ['$parentInfo.level', 1] }],
            },
          },
        },
        { $limit: 100 },
      ]);

      if (result.length === 0) {
        hasMore = false;
        break;
      }

      for (const cat of result) {
        const correctLevel = (cat.parentInfo?.level ?? -1) + 1;
        if (correctLevel >= 0) {
          await Category.updateOne({ _id: cat._id }, { $set: { level: correctLevel } });
          fixed++;
        }
      }
    }

    console.log(`📊 Subcategories fixed: ${fixed} items`);

    // 3. Report summary
    const counts = await Category.aggregate([
      { $group: { _id: '$level', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    console.log('\n📋 Summary of levels after fix:');
    counts.forEach((c: { _id: number; count: number }) => {
      console.log(`   Level ${c._id}: ${c.count} categories`);
    });

    const total = counts.reduce(
      (sum: number, c: { _id: number; count: number }) => sum + c.count,
      0,
    );
    console.log(`   Total: ${total} categories`);

    await mongoose.disconnect();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixCategoryLevels();
