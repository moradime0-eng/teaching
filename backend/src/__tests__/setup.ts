/// <reference types="jest" />
/**
 * 🔧 راه‌اندازی MongoDB درون‌حافظه‌ای برای تست‌های مالی
 *
 * هر فایل تستی که به تراکنش‌های MongoDB نیاز دارد (پرداخت/کیف پول/بازپرداخت)
 * باید این فایل را import کند:
 *   import './setup';
 *
 * ⚠️ حتماً `MongoMemoryReplSet` (نه MongoMemoryServer تنها):
 * کنترلر پرداخت و سرویس بازپرداخت از `mongoose.startSession()` +
 * `withTransaction` استفاده می‌کنند که فقط روی replica set کار می‌کند.
 *
 * اجرای تست‌ها: `npx jest --forceExit`
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(mongod.getUri());
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
}, 60000);

afterEach(async () => {
  // پاک‌سازی کامل بین تست‌ها — هر تست مستقل از قبلی است
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  jest.restoreAllMocks();
});
