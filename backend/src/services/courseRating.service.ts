/**
 * Course Rating Service
 *
 * محاسبه averageRating، totalReviews و ratingDistribution
 * مستقیماً از جدول Review — و همگام‌سازی با Course document
 */
import mongoose from 'mongoose';
import Review from '../models/Review';
import Course from '../models/Course';

export interface RatingStats {
  averageRating: number;
  totalReviews: number;
  ratingDistribution: {
    five: number;
    four: number;
    three: number;
    two: number;
    one: number;
  };
}

const EMPTY_DIST = { five: 0, four: 0, three: 0, two: 0, one: 0 };

/**
 * محاسبه ریتینگ یک دوره از جدول Review
 */
export async function computeCourseRating(
  courseId: string | mongoose.Types.ObjectId,
): Promise<RatingStats> {
  const oid =
    typeof courseId === 'string'
      ? new mongoose.Types.ObjectId(courseId)
      : courseId;

  const [stats, distribution] = await Promise.all([
    Review.aggregate([
      { $match: { course: oid, isHidden: { $ne: true } } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
        },
      },
    ]),
    Review.aggregate([
      { $match: { course: oid, isHidden: { $ne: true } } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]),
  ]);

  const dist = { five: 0, four: 0, three: 0, two: 0, one: 0 };
  distribution.forEach((d: any) => {
    if (d._id === 5) dist.five = d.count;
    else if (d._id === 4) dist.four = d.count;
    else if (d._id === 3) dist.three = d.count;
    else if (d._id === 2) dist.two = d.count;
    else if (d._id === 1) dist.one = d.count;
  });

  if (stats.length > 0) {
    return {
      averageRating: Math.round(stats[0].averageRating * 10) / 10,
      totalReviews: stats[0].totalReviews,
      ratingDistribution: dist,
    };
  }

  return {
    averageRating: 0,
    totalReviews: 0,
    ratingDistribution: { ...EMPTY_DIST },
  };
}

/**
 * محاسبه ریتینگ چند دوره به‌صورت یکجا (bulk)
 */
export async function computeBulkCourseRatings(
  courseIds: (string | mongoose.Types.ObjectId)[],
): Promise<Map<string, RatingStats>> {
  const result = new Map<string, RatingStats>();

  if (courseIds.length === 0) return result;

  const oids = courseIds.map((id) =>
    typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id,
  );

  const [statsRows, distRows] = await Promise.all([
    Review.aggregate([
      { $match: { course: { $in: oids }, isHidden: { $ne: true } } },
      {
        $group: {
          _id: '$course',
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
        },
      },
    ]),
    Review.aggregate([
      { $match: { course: { $in: oids }, isHidden: { $ne: true } } },
      {
        $group: {
          _id: { course: '$course', rating: '$rating' },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  // ساخت نقشه توزیع
  const distMap = new Map<
    string,
    { five: number; four: number; three: number; two: number; one: number }
  >();
  for (const row of distRows) {
    const cid = row._id.course.toString();
    if (!distMap.has(cid)) {
      distMap.set(cid, { five: 0, four: 0, three: 0, two: 0, one: 0 });
    }
    const d = distMap.get(cid)!;
    if (row._id.rating === 5) d.five = row.count;
    else if (row._id.rating === 4) d.four = row.count;
    else if (row._id.rating === 3) d.three = row.count;
    else if (row._id.rating === 2) d.two = row.count;
    else if (row._id.rating === 1) d.one = row.count;
  }

  // ساخت نقشه آمار
  for (const row of statsRows) {
    const cid = row._id.toString();
    result.set(cid, {
      averageRating: Math.round(row.averageRating * 10) / 10,
      totalReviews: row.totalReviews,
      ratingDistribution: distMap.get(cid) || { ...EMPTY_DIST },
    });
  }

  // برای دوره‌هایی که نظری ندارند، آمار خالی اضافه کن
  for (const id of oids) {
    const cid = id.toString();
    if (!result.has(cid)) {
      result.set(cid, {
        averageRating: 0,
        totalReviews: 0,
        ratingDistribution: { ...EMPTY_DIST },
      });
    }
  }

  return result;
}

/**
 * اعمال آمار ریتینگ محاسبه‌شده به آرایه‌ای از دوره‌ها (mutate in place)
 */
export function applyRatingStatsToCourses(
  courses: any[],
  ratingMap: Map<string, RatingStats>,
): void {
  for (const course of courses) {
    const id = (course._id || course.id)?.toString();
    if (!id) continue;
    const stats = ratingMap.get(id);
    if (stats) {
      course.averageRating = stats.averageRating;
      course.totalReviews = stats.totalReviews;
      course.ratingDistribution = stats.ratingDistribution;
    }
  }
}

/**
 * ⭐ همگام‌سازی ریتینگ یک دوره — محاسبه از Review و ذخیره در Course document
 * این تابع بعد از هر create/update/delete نظر صدا زده می‌شود
 */
export async function syncCourseRating(
  courseId: string | mongoose.Types.ObjectId,
): Promise<RatingStats> {
  const stats = await computeCourseRating(courseId);

  await Course.findByIdAndUpdate(
    courseId,
    {
      averageRating: stats.averageRating,
      totalReviews: stats.totalReviews,
      ratingDistribution: stats.ratingDistribution,
    },
    { new: true },
  );

  console.log(
    `✅ [Rating Sync] Course ${courseId}: avg=${stats.averageRating}, ` +
      `total=${stats.totalReviews}, dist=[5:${stats.ratingDistribution.five} ` +
      `4:${stats.ratingDistribution.four} 3:${stats.ratingDistribution.three} ` +
      `2:${stats.ratingDistribution.two} 1:${stats.ratingDistribution.one}]`,
  );

  return stats;
}

/**
 * ⭐ همگام‌سازی ریتینگ مدرس — محاسبه میانگین از تمام دوره‌های منتشرشده
 */
export async function syncInstructorRating(
  instructorId: string | mongoose.Types.ObjectId,
): Promise<void> {
  try {
    const User = require('../models/User').default;

    // پیدا کردن تمام دوره‌های منتشرشده مدرس
    const courses = await Course.find({
      instructor: instructorId,
      status: 'published',
    }).select('_id');

    const courseIds = courses.map((c) => c._id);

    if (courseIds.length === 0) {
      await User.findByIdAndUpdate(instructorId, {
        'instructorProfile.totalReviews': 0,
        'instructorProfile.averageRating': 0,
        'instructorProfile.totalCourses': 0,
      });
      return;
    }

    // محاسبه تعداد و میانگین نظرات
    const reviewStats = await Review.aggregate([
      {
        $match: {
          course: { $in: courseIds },
          isHidden: { $ne: true },
        },
      },
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          averageRating: { $avg: '$rating' },
        },
      },
    ]);

    const totalReviews = reviewStats[0]?.totalReviews || 0;
    const averageRating =
      Math.round((reviewStats[0]?.averageRating || 0) * 10) / 10;

    await User.findByIdAndUpdate(instructorId, {
      'instructorProfile.totalReviews': totalReviews,
      'instructorProfile.averageRating': averageRating,
      'instructorProfile.totalCourses': courseIds.length,
    });

    console.log(
      `✅ [Instructor Rating Sync] Instructor ${instructorId}: avg=${averageRating}, reviews=${totalReviews}, courses=${courseIds.length}`,
    );
  } catch (error) {
    console.error(
      `❌ [Instructor Rating Sync] Failed for instructor ${instructorId}:`,
      error,
    );
  }
}