import mongoose from 'mongoose';
// FIRST import: load .env + Docker `_FILE` secrets (MONGODB_URI).
import '../config/loadEnv';
import Course from '../models/Course';
import { generateUniqueSlug } from '../utils/slugGenerator';
import { LectureType, PromoVideoType } from '../enums/LectureType';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mihanrayan';

async function migrateCourses() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all courses
    const courses = await Course.find({});
    console.log(`📊 Found ${courses.length} courses to migrate`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const course of courses) {
      let needsUpdate = false;
      const updates: any = {};

      // Add missing fields with default values
      if (course.hasLifetimeAccess === undefined) {
        updates.hasLifetimeAccess = true;
        needsUpdate = true;
      }

      if (course.hasSupport === undefined) {
        updates.hasSupport = false;
        needsUpdate = true;
      }

      if (course.installmentEnabled === undefined) {
        updates.installmentEnabled = false;
        needsUpdate = true;
      }

      if (course.installmentCount === undefined) {
        updates.installmentCount = 3;
        needsUpdate = true;
      }

      if (course.maxStudents === undefined) {
        updates.maxStudents = null;
        needsUpdate = true;
      }

      if (course.subCategory === undefined) {
        updates.subCategory = null;
        needsUpdate = true;
      }

      if (course.discountEndsAt === undefined) {
        updates.discountEndsAt = null;
        needsUpdate = true;
      }

      if (!course.tags || course.tags.length === 0) {
        updates.tags = [];
        needsUpdate = true;
      }

      if (!course.targetAudience || course.targetAudience.length === 0) {
        updates.targetAudience = [];
        needsUpdate = true;
      }

      if (!course.metaKeywords || course.metaKeywords.length === 0) {
        updates.metaKeywords = [];
        needsUpdate = true;
      }

      if (!course.promoVideoType) {
        updates.promoVideoType = PromoVideoType.UPLOAD;
        needsUpdate = true;
      }

      if (!course.promoVideoUrl) {
        updates.promoVideoUrl = '';
        needsUpdate = true;
      }

      // Generate metaTitle from title if missing
      if (!course.metaTitle && course.title) {
        updates.metaTitle = course.title.substring(0, 60);
        needsUpdate = true;
      }

      // Generate metaDescription from shortDescription if missing
      if (!course.metaDescription && course.shortDescription) {
        updates.metaDescription = course.shortDescription.substring(0, 200);
        needsUpdate = true;
      } else if (!course.metaDescription && course.description) {
        updates.metaDescription = course.description.substring(0, 200);
        needsUpdate = true;
      }

      // Generate slug if missing
      if (!course.slug && course.title) {
        updates.slug = await generateUniqueSlug(course.title, Course, course._id.toString());
        needsUpdate = true;
      }

      // Ensure sections array exists
      if (!(course as any).sections) {
        (updates as any).sections = [];
        needsUpdate = true;
      }

      // Ensure sections have proper structure
      if ((course as any).sections && (course as any).sections.length > 0) {
        let sectionsUpdated = false;
        const updatedSections = (course as any).sections.map((section: any) => {
          const updatedSection = { ...(section.toObject ? section.toObject() : section) };

          if (!updatedSection.lectures) {
            updatedSection.lectures = [];
            sectionsUpdated = true;
          }

          if (updatedSection.lectures) {
            updatedSection.lectures = updatedSection.lectures.map((lecture: any) => {
              const updatedLecture = { ...(lecture.toObject ? lecture.toObject() : lecture) };

              if (!updatedLecture.type) {
                updatedLecture.type = LectureType.VIDEO;
                sectionsUpdated = true;
              }
              if (updatedLecture.duration === undefined) {
                updatedLecture.duration = 0;
                sectionsUpdated = true;
              }
              if (updatedLecture.isFreePreview === undefined) {
                updatedLecture.isFreePreview = false;
                sectionsUpdated = true;
              }
              if (!updatedLecture.content) {
                updatedLecture.content = '';
                sectionsUpdated = true;
              }
              if (!updatedLecture.videoUrl) {
                updatedLecture.videoUrl = '';
                sectionsUpdated = true;
              }
              if (!updatedLecture.fileUrl) {
                updatedLecture.fileUrl = '';
                sectionsUpdated = true;
              }
              if (updatedLecture.order === undefined) {
                updatedLecture.order = 0;
                sectionsUpdated = true;
              }

              return updatedLecture;
            });
          }

          if (updatedSection.order === undefined) {
            updatedSection.order = 0;
            sectionsUpdated = true;
          }

          return updatedSection;
        });

        if (sectionsUpdated) {
          updates.sections = updatedSections;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        await Course.findByIdAndUpdate(course._id, { $set: updates }, { runValidators: false });
        updatedCount++;
        console.log(`✅ Updated course: ${course.title} (${course._id})`);
      } else {
        skippedCount++;
        console.log(`⏭️  Skipped (already up to date): ${course.title} (${course._id})`);
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`   Total courses: ${courses.length}`);
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run migration
migrateCourses();
