import dotenv from 'dotenv';
dotenv.config();

import database from '../config/database';
import Tenant from '../models/Tenant';
import User from '../models/User';
import Membership from '../models/Membership';
import Cart from '../models/Cart';
import Wishlist from '../models/Wishlist';

/**
 * اسکریپت ساخت آموزشگاه جدید
 *
 * نحوه اجرا:
 *   npx ts-node src/scripts/createTenant.ts --name "آکادمی آلفا" --subdomain alfa --email admin@alfa.com --password MyPass123
 *
 * یا بدون آرگومان (حالت تعاملی):
 *   npx ts-node src/scripts/createTenant.ts
 */

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

const ask = (question: string): Promise<string> => {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.setEncoding('utf-8');
    let data = '';
    process.stdin.on('data', (chunk) => {
      data += chunk.toString().trim();
      process.stdin.pause();
    });
    process.stdin.once('readable', () => {
      process.stdin.resume();
    });
    process.stdin.once('end', () => resolve(data.trim()));
  });
};

const run = async () => {
  try {
    console.log('🏫 ─── اسکریپت ساخت آموزشگاه ───\n');

    // دریافت ورودی‌ها از آرگومان‌ها یا حالت تعاملی
    const name = getArg('--name') || await ask('   نام آموزشگاه: ');
    const subdomain = getArg('--subdomain') || await ask('   ساب‌دامین (فقط حروف کوچک و عدد و خط تیره): ');
    const customDomain = getArg('--domain') || await ask('   دامنه اختصاصی (خالی رها کنید): ');
    const email = getArg('--email') || await ask('   ایمیل مدیر آموزشگاه: ');
    const password = getArg('--password') || await ask('   رمز عبور مدیر: ');
    const fullName = getArg('--fullname') || await ask('   نام کامل مدیر: ') || 'مدیر آموزشگاه';

    if (!name || !subdomain || !email || !password) {
      console.error('\n❌ نام، ساب‌دامین، ایمیل و رمز عبور الزامی هستند.');
      process.exit(1);
    }

    if (!/^[a-z0-9-]+$/.test(subdomain)) {
      console.error('\n❌ ساب‌دامین فقط شامل حروف کوچک، اعداد و خط تیره باشد.');
      process.exit(1);
    }

    await database.connect();
    console.log('✅ اتصال به دیتابیس برقرار شد.\n');

    // ─── ۱. بررسی ساب‌دامین تکراری ───
    const existingTenant = await Tenant.findOne({ subdomain });
    if (existingTenant) {
      console.error(`❌ ساب‌دامین "${subdomain}" قبلاً ثبت شده.`);
      process.exit(1);
    }

    // ─── ۲. ساخت کاربر مدیر ───
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    let adminUser;

    if (existingUser) {
      console.log(`ℹ️  کاربر با ایمیل "${email}" قبلاً وجود دارد — به عنوان مدیر استفاده می‌شود.`);
      adminUser = existingUser;

      // اگر نقش قبلی admin نیست، ارتقا بده
      if (adminUser.role !== 'admin') {
        adminUser.role = 'admin' as any;
        await adminUser.save();
        console.log('   ↳ نقش کاربر به admin ارتقا یافت.');
      }
    } else {
      adminUser = await User.create({
        fullName,
        email: email.toLowerCase().trim(),
        password,
        role: 'admin',
        isEmailVerified: true,
        isActive: true,
      });
      console.log(`✅ کاربر مدیر ساخته شد: ${email}`);
    }

    // ─── ۳. ساخت آموزشگاه ───
    const tenant = await Tenant.create({
      name,
      subdomain: subdomain.toLowerCase(),
      customDomain: customDomain || undefined,
      isActive: true,
      isDefault: false,
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
    console.log(`✅ آموزشگاه ساخته شد: ${name} (${tenant._id})`);

    // ─── ۴. ساخت عضویت مدیر در آموزشگاه ───
    await Membership.create({
      user: adminUser._id,
      tenant: tenant._id,
      role: 'admin',
      status: 'active',
    });

    // ─── ۵. ساخت سبد خرید و علاقه‌مندی خالی ───
    await Cart.create({ user: adminUser._id, items: [], tenant: tenant._id });
    await Wishlist.create({ user: adminUser._id, courses: [], tenant: tenant._id });

    console.log('\n📋 ─── خلاصه ──────────────────────────────');
    console.log(`   آموزشگاه:  ${name}`);
    console.log(`   ساب‌دامین:  ${subdomain}`);
    if (customDomain) console.log(`   دامنه:     ${customDomain}`);
    console.log(`   مدیر:      ${email}`);
    console.log(`   شناسه:     ${tenant._id}`);
    console.log('────────────────────────────────────────────\n');

    // نمایش اطلاعات ورود اگر کاربر جدید بود
    if (!existingUser) {
      console.log('🔑 اطلاعات ورود مدیر:');
      console.log(`   ایمیل:     ${email}`);
      console.log(`   رمز عبور:  ${password}\n`);
      console.log('⚠️  رمز عبور را در جای امنی ذخیره کنید!');
    }

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ خطا در ساخت آموزشگاه:', error.message || error);
    process.exit(1);
  }
};

run();
