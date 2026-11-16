import Category from '../models/Category';
import { generateSlug } from '../utils/slugGenerator';

const categories = [
  {
    name: 'برنامه‌نویسی و توسعه',
    icon: 'code',
    description: 'دوره‌های برنامه‌نویسی وب، موبایل و دسکتاپ',
    order: 1,
    children: [
      { name: 'توسعه وب', icon: 'globe', order: 1 },
      { name: 'توسعه موبایل', icon: 'smartphone', order: 2 },
      { name: 'پایتون', icon: 'python', order: 3 },
      { name: 'جاوااسکریپت', icon: 'js', order: 4 },
      { name: 'React و Angular', icon: 'react', order: 5 },
      { name: 'Node.js', icon: 'node', order: 6 },
    ],
  },
  {
    name: 'طراحی و گرافیک',
    icon: 'palette',
    description: 'دوره‌های طراحی UI/UX، گرافیک و انیمیشن',
    order: 2,
    children: [
      { name: 'طراحی UI/UX', icon: 'figma', order: 1 },
      { name: 'فتوشاپ', icon: 'photoshop', order: 2 },
      { name: 'ایلاستریتور', icon: 'illustrator', order: 3 },
      { name: 'طراحی لوگو', icon: 'pen', order: 4 },
    ],
  },
  {
    name: 'هوش مصنوعی و داده',
    icon: 'brain',
    description: 'دوره‌های یادگیری ماشین، داده‌کاوی و هوش مصنوعی',
    order: 3,
    children: [
      { name: 'یادگیری ماشین', icon: 'ml', order: 1 },
      { name: 'یادگیری عمیق', icon: 'dl', order: 2 },
      { name: 'علم داده', icon: 'data', order: 3 },
      { name: 'پردازش زبان طبیعی', icon: 'nlp', order: 4 },
    ],
  },
  {
    name: 'کسب‌وکار و مدیریت',
    icon: 'briefcase',
    description: 'دوره‌های مدیریت، بازاریابی و کارآفرینی',
    order: 4,
    children: [
      { name: 'بازاریابی دیجیتال', icon: 'marketing', order: 1 },
      { name: 'مدیریت پروژه', icon: 'project', order: 2 },
      { name: 'کارآفرینی', icon: 'startup', order: 3 },
      { name: 'سئو', icon: 'seo', order: 4 },
    ],
  },
  {
    name: 'شبکه و امنیت',
    icon: 'shield',
    description: 'دوره‌های شبکه، امنیت سایبری و DevOps',
    order: 5,
    children: [
      { name: 'امنیت سایبری', icon: 'lock', order: 1 },
      { name: 'شبکه', icon: 'network', order: 2 },
      { name: 'DevOps', icon: 'devops', order: 3 },
      { name: 'کلاد و AWS', icon: 'cloud', order: 4 },
    ],
  },
  {
    name: 'زبان‌های خارجی',
    icon: 'language',
    description: 'دوره‌های آموزش زبان انگلیسی، آلمانی و ...',
    order: 6,
    children: [
      { name: 'انگلیسی', icon: 'uk', order: 1 },
      { name: 'آلمانی', icon: 'de', order: 2 },
      { name: 'فرانسوی', icon: 'fr', order: 3 },
      { name: 'آیلتس و تافل', icon: 'ielts', order: 4 },
    ],
  },
];

export const seedCategories = async () => {
  try {
    const existingCount = await Category.countDocuments();
    if (existingCount > 0) {
      console.log(`✅ Categories already exist (${existingCount} found)`);
      return;
    }

    for (const cat of categories) {
      const parent = await Category.create({
        name: cat.name,
        slug: generateSlug(cat.name),
        icon: cat.icon,
        description: cat.description,
        order: cat.order,
        parent: null,
      });

      if (cat.children) {
        for (const child of cat.children) {
          await Category.create({
            name: child.name,
            slug: generateSlug(child.name),
            icon: child.icon,
            order: child.order,
            parent: parent._id,
          });
        }
      }
    }

    console.log(`✅ ${categories.length} parent categories with children seeded`);
  } catch (error) {
    console.error('❌ Category seed error:', error);
    throw error;
  }
};
