/**
 * Migration: Fix ratingDistribution for all courses
 * AND sync instructor profiles
 */
import mongoose from 'mongoose';
import '../config/loadEnv';
import Course from '../models/Course';
import User from '../models/User';
import {
  syncCourseRating,
  syncInstructorRating,
} from '../services/courseRating.service';

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/mihanrayan';

async function migrate() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // --- Phase 1: Sync all course ratings ---
    const courses = await Course.find({}).select('_id title');
    console.log(`📊 Found ${courses.length} courses to process`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const course of courses) {
      const stats = await syncCourseRating(course._id);

      if (stats.totalReviews === 0) {
        skippedCount++;
      } else {
        console.log(
          `✅ ${course.title}: avg=${stats.averageRating}, ` +
            `total=${stats.totalReviews}, dist=[5:${stats.ratingDistribution.five} ` +
            `4:${stats.ratingDistribution.four} 3:${stats.ratingDistribution.three} ` +
            `2:${stats.ratingDistribution.two} 1:${stats.ratingDistribution.one}]`,
        );
        updatedCount++;
      }
    }

    console.log(
      `\n📊 Courses: Updated=${updatedCount}, Skipped (no reviews)=${skippedCount}`,
    );

    // --- Phase 2: Sync all instructor ratings ---
    const instructors = await User.find({
      role: { $in: ['instructor', 'admin'] },
    }).select('_id fullName');
    console.log(
      `\n👨‍🏫 Found ${instructors.length} instructors to process`,
    );

    for (const instructor of instructors) {
      await syncInstructorRating(instructor._id);
    }

    console.log(`\n🎉 Migration complete!`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

migrate();