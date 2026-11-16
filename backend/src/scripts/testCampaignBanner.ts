import * as dotenv from 'dotenv';
import * as mongoose from 'mongoose';

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const Campaign = require('../models/Campaign').default;
  const User = require('../models/User').default;

  const admin = await User.findOne({ role: 'admin' });
  console.log('admin:', admin?._id?.toString(), admin?.email);

  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days

  const c = await Campaign.create({
    title: 'جشنواره تست بنر',
    bannerText: 'تا ۵۰٪ تخفیف روی همه دوره‌ها',
    startAt: start,
    endAt: end,
    discountType: 'percentage',
    discountValue: 50,
    scope: 'all',
    categories: [],
    excludedCourses: [],
    theme: 'fire',
    isActive: true,
    createdBy: admin._id,
  });

  console.log('created campaign:', c._id.toString());
  console.log('  startAt:', c.startAt.toISOString());
  console.log('  endAt:  ', c.endAt.toISOString());
  console.log('  now:    ', now.toISOString());
  console.log('  isActive:', c.isActive);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
