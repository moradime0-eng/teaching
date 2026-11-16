import { Request, Response } from 'express';
import Course from '../models/Course';
import Category from '../models/Category';
import User from '../models/User';
import { CourseStatus } from '../types';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';

/**
 * Get trending tags based on popular course categories and search trends
 */
export const getTrendingTags = asyncHandler(
  async (req: Request, res: Response) => {
    // Get top categories by course count
    const topCategories = await Category.aggregate([
      { $match: { isActive: true, level: 0 } },
      { $sort: { totalCourses: -1 } },
      { $limit: 10 },
      { $project: { name: 1, slug: 1, totalCourses: 1 } },
    ]);

    // Get popular search terms from courses (tags, titles)
    const popularTerms = await Course.aggregate([
      { $match: { status: CourseStatus.PUBLISHED } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, tag: '$_id', count: 1 } },
    ]);

    // Combine and format trending tags
    const categoryTags = topCategories.map((cat) => ({
      label: cat.name,
      type: 'category',
      slug: cat.slug,
      count: cat.totalCourses,
    }));

    const searchTags = popularTerms.map((term) => ({
      label: term.tag,
      type: 'search',
      count: term.count,
    }));

    // Merge and deduplicate, prioritize categories
    const allTags = [...categoryTags, ...searchTags];
    const uniqueTags = allTags.filter(
      (tag, index, self) => index === self.findIndex((t) => t.label === tag.label)
    );

    // Return top 8 trending tags
    const trendingTags = uniqueTags.slice(0, 8).map((tag) => tag.label);

    return ApiResponse.success(res, { trendingTags });
  }
);

/**
 * Get popular searches based on course tags and categories
 */
export const getPopularSearches = asyncHandler(
  async (req: Request, res: Response) => {
    // Get popular search terms from course tags
    const popularTags = await Course.aggregate([
      { $match: { status: CourseStatus.PUBLISHED } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
      { $project: { _id: 0, term: '$_id', count: 1 } },
    ]);

    // Get top categories
    const topCategories = await Category.aggregate([
      { $match: { isActive: true, level: 0 } },
      { $sort: { totalCourses: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, term: '$name', count: '$totalCourses' } },
    ]);

    // Combine and deduplicate
    const allTerms = [...popularTags, ...topCategories];
    const uniqueTerms = allTerms.filter(
      (term, index, self) => index === self.findIndex((t) => t.term === term.term)
    );

    // Sort by count and return top 10
    const sortedTerms = uniqueTerms
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((t) => t.term);

    return ApiResponse.success(res, { popularSearches: sortedTerms });
  }
);

/**
 * Get home page features (platform benefits)
 */
export const getHomeFeatures = asyncHandler(
  async (req: Request, res: Response) => {
    // These are static platform features but could be made dynamic from settings
    // For now, return the standard features
    const features = [
      {
        icon: 'all_inclusive',
        accent: 'violet',
        title: 'دسترسی همیشگی',
        description: 'یک‌بار خرید، دسترسی نامحدود به تمام آپدیت‌های دوره',
      },
      {
        icon: 'code',
        accent: 'cyan',
        title: 'آموزش‌های پروژه‌محور',
        description: 'ساخت پروژه‌های واقعی برای ورود تضمینی به بازار کار',
      },
      {
        icon: 'support_agent',
        accent: 'emerald',
        title: 'پشتیبانی اختصاصی مدرس',
        description: 'رفع اشکال و پاسخ به سوالات شما در طول مسیر یادگیری',
      },
      {
        icon: 'verified',
        accent: 'amber',
        title: 'گواهی پایان دوره معتبر',
        description: 'ارائه مدرک دو زبانه قابل ترجمه و استعلام آنلاین',
      },
    ];

    return ApiResponse.success(res, { features });
  }
);

/**
 * Get FAQs for homepage
 */
export const getFAQs = asyncHandler(
  async (req: Request, res: Response) => {
    // FAQs could be stored in database, for now return standard ones
    // In future, this could come from a FAQ model or settings
    const faqs = [
      {
        question: 'آیا دوره‌ها پروژه‌محور هستند؟',
        answer: 'بله، تمام دوره‌های همایون به صورت پروژه‌محور طراحی شده‌اند. شما در طول دوره پروژه‌های واقعی می‌سازید که می‌توانید در رزومه خود قرار دهید.',
      },
      {
        question: 'دسترسی به دوره‌ها چگونه است؟',
        answer: 'پس از خرید دوره، دسترسی مادام‌العمر به تمام محتوای دوره شامل ویدیوها، پروژه‌ها و آپدیت‌های آینده خواهید داشت.',
      },
      {
        question: 'آیا گواهینامه پایان دوره معتبر است؟',
        answer: 'بله، گواهینامه همایون دو زبانه، قابل ترجمه رسمی و استعلام آنلاین از طریق QR Code است. این گواهینامه توسط بسیاری از شرکت‌های فناوری پذیرفته شده است.',
      },
      {
        question: 'آیا امکان بازگشت وجه وجود دارد؟',
        answer: 'بله، تا ۷ روز پس از خرید هر دوره، در صورت عدم رضایت می‌توانید درخواست بازگشت وجه ارسال کنید.',
      },
      {
        question: 'چگونه می‌توانم به عنوان مدرس در همایون فعالیت کنم؟',
        answer: 'از بخش «شروع تدریس» درخواست خود را ثبت کنید. پس از بررسی رزومه و نمونه تدریس، امکان انتشار دوره‌های شما فراهم خواهد شد.',
      },
      {
        question: 'آیا دوره‌های رایگان هم دارید؟',
        answer: 'بله، تعدادی از دوره‌ها به صورت رایگان ارائه شده‌اند. این دوره‌ها کیفیت بالایی دارند و برای شروع یادگیری بسیار مناسب هستند.',
      },
    ];

    return ApiResponse.success(res, { faqs });
  }
);

/**
 * Get platform stats for homepage (enhanced version)
 */
export const getHomeStats = asyncHandler(
  async (req: Request, res: Response) => {
    const [
      totalStudents,
      totalCourses,
      totalCertificates,
      totalHoursResult,
      totalInstructors,
      totalCategories,
    ] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      Course.countDocuments({ status: CourseStatus.PUBLISHED }),
      (async () => {
        try {
          const Certificate = require('../models/Certificate');
          return (await Certificate.default?.countDocuments()) || 0;
        } catch {
          return 0;
        }
      })(),
      (async () => {
        try {
          const result = await Course.aggregate([
            { $match: { status: CourseStatus.PUBLISHED } },
            { $group: { _id: null, totalDuration: { $sum: '$totalDuration' } } },
          ]);
          return Math.round((result[0]?.totalDuration || 0) / 3600);
        } catch {
          return 0;
        }
      })(),
      User.countDocuments({ role: 'instructor' }),
      Category.countDocuments({ isActive: true, level: 0 }),
    ]);

    return ApiResponse.success(res, {
      totalStudents,
      totalCourses,
      totalCertificates,
      totalHours: totalHoursResult,
      totalInstructors,
      totalCategories,
    });
  }
);

/**
 * Get category highlights (trending, new, featured) for mega menu
 */
export const getCategoryHighlights = asyncHandler(
  async (req: Request, res: Response) => {
    // Get trending categories (top by course count)
    const trendingCategories = await Category.aggregate([
      { $match: { isActive: true, level: 0 } },
      { $sort: { totalCourses: -1 } },
      { $limit: 5 },
      { $project: { _id: 1, name: 1, slug: 1, totalCourses: 1 } },
    ]);

    // Get new categories (recently created)
    const newCategories = await Category.aggregate([
      { $match: { isActive: true, level: 0 } },
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
      { $project: { _id: 1, name: 1, slug: 1, totalCourses: 1, createdAt: 1 } },
    ]);

    // Get featured categories (could be based on a flag or high engagement)
    const featuredCategories = await Category.aggregate([
      { $match: { isActive: true, level: 0 } },
      { $sort: { totalCourses: -1, updatedAt: -1 } },
      { $limit: 5 },
      { $project: { _id: 1, name: 1, slug: 1, totalCourses: 1 } },
    ]);

    return ApiResponse.success(res, {
      trending: trendingCategories.map(c => c.slug),
      new: newCategories.map(c => c.slug),
      featured: featuredCategories.map(c => c.slug),
    });
  }
);