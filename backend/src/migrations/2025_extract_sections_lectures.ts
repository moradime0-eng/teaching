/**
 * 🔄 Migration: Extract embedded Sections & Lectures from Course documents
 * into separate Section and Lecture collections.
 *
 * This migration:
 * 1. Reads all courses that have embedded sections
 * 2. Creates Section documents for each embedded section
 * 3. Creates Lecture documents for each embedded lecture
 * 4. Updates course stats (totalSections, totalLectures, totalDuration)
 * 5. Removes the embedded sections array from course documents
 *
 * Run: npx ts-node src/migrations/2025_extract_sections_lectures.ts
 */

import mongoose from 'mongoose';
// FIRST import: load .env + Docker `_FILE` secrets (MONGODB_URI).
import '../config/loadEnv';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@localhost:27017/iranian_udemy?authSource=admin';

async function migrate() {
  console.log('🔄 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db!;
  const coursesCollection = db.collection('courses');
  const sectionsCollection = db.collection('sections');
  const lecturesCollection = db.collection('lectures');

  // Count courses with embedded sections
  const coursesWithSections = await coursesCollection.countDocuments({
    sections: { $exists: true, $ne: [] },
  });

  console.log(`📚 Found ${coursesWithSections} courses with embedded sections`);

  if (coursesWithSections === 0) {
    console.log('✅ No courses to migrate. Done.');
    await mongoose.disconnect();
    return;
  }

  let migratedCourses = 0;
  let createdSections = 0;
  let createdLectures = 0;

  // Process each course with embedded sections
  const cursor = coursesCollection.find({
    sections: { $exists: true, $ne: [] },
  });

  while (await cursor.hasNext()) {
    const course = await cursor.next();
    if (!course || !course.sections || !Array.isArray(course.sections)) continue;

    console.log(`\n📝 Processing course: ${course.title} (${course._id})`);

    const tenantId = course.tenant;
    let courseTotalLectures = 0;
    let courseTotalDuration = 0;

    for (const [secIdx, embeddedSection] of course.sections.entries()) {
      // Create Section document
      const sectionDoc = {
        course: course._id,
        title: embeddedSection.title || `فصل ${secIdx + 1}`,
        description: embeddedSection.description || '',
        order: embeddedSection.order ?? secIdx,
        totalLectures: 0,
        totalDuration: 0,
        tenant: tenantId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sectionResult = await sectionsCollection.insertOne(sectionDoc);
      const sectionId = sectionResult.insertedId;
      createdSections++;

      let sectionTotalLectures = 0;
      let sectionTotalDuration = 0;

      if (Array.isArray(embeddedSection.lectures)) {
        for (const [lecIdx, embeddedLecture] of embeddedSection.lectures.entries()) {
          const lectureDoc = {
            section: sectionId,
            course: course._id,
            title: embeddedLecture.title || `درس ${lecIdx + 1}`,
            type: embeddedLecture.type || 'video',
            order: embeddedLecture.order ?? lecIdx,
            duration: embeddedLecture.duration || 0,
            isFreePreview: embeddedLecture.isFreePreview || false,
            content: embeddedLecture.content || '',
            videoUrl: embeddedLecture.videoUrl || '',
            videoFileName: embeddedLecture.videoFileName || '',
            videoFileSize: embeddedLecture.videoFileSize || 0,
            fileUrl: embeddedLecture.fileUrl || '',
            fileName: embeddedLecture.fileName || '',
            fileSize: embeddedLecture.fileSize || 0,
            isPublished: true,
            resources: [],
            tenant: tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          await lecturesCollection.insertOne(lectureDoc);
          createdLectures++;
          sectionTotalLectures++;
          sectionTotalDuration += embeddedLecture.duration || 0;
        }
      }

      // Update section stats
      await sectionsCollection.updateOne(
        { _id: sectionId },
        { $set: { totalLectures: sectionTotalLectures, totalDuration: sectionTotalDuration } },
      );

      courseTotalLectures += sectionTotalLectures;
      courseTotalDuration += sectionTotalDuration;

      console.log(
        `  ✅ Section "${sectionDoc.title}": ${sectionTotalLectures} lectures (${sectionTotalDuration}s)`,
      );
    }

    // Update course: set stats and remove embedded sections
    await coursesCollection.updateOne(
      { _id: course._id },
      {
        $set: {
          totalSections: course.sections.length,
          totalLectures: courseTotalLectures,
          totalDuration: courseTotalDuration,
          lastUpdatedContent: new Date(),
        },
        $unset: { sections: '' },
      },
    );

    migratedCourses++;
    console.log(
      `  📊 Course updated: ${course.sections.length} sections, ${courseTotalLectures} lectures, ${courseTotalDuration}s`,
    );
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 Migration Complete!');
  console.log('='.repeat(60));
  console.log(`  Migrated courses:  ${migratedCourses}`);
  console.log(`  Created sections:  ${createdSections}`);
  console.log(`  Created lectures:  ${createdLectures}`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
  console.log('✅ Disconnected from MongoDB');
}

migrate().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
