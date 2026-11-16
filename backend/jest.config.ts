import type { Config } from 'jest';

/**
 * ⚙️ پیکربندی Jest برای بک‌اند TypeScript
 *
 * نکات:
 *  - `roots` فقط `src/` است تا فایل‌های کامپایل‌شده در `dist/` دوباره اجرا نشوند.
 *  - `ts-jest` فایل‌های .ts را ترنسپایل می‌کند (پیش‌تر هیچ transform ای تنظیم نشده بود).
 *  - `@types/jest` با `jest` هم‌ماژور هستند (هر دو نسخه ۲۹).
 *
 * اجرا: `npx jest`  |  `npx jest --passWithNoTests`  |  `npm test`
 */
const config: Config = {
  // TypeScript transform
  preset: 'ts-jest',
  testEnvironment: 'node',

  // فقط سورس‌های TypeScript (از dist/ و node_modules/ صرف‌نظر می‌کنیم)
  roots: ['<rootDir>/src'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],

  // راه‌اندازی MongoDB درون‌حافظه‌ای (mongodb-memory-server) در بار اول نیاز به
  // دانلود باینری mongod دارد؛ به همین دلیل timeout پیش‌فرض ۵ ثانیه کافی نیست.
  testTimeout: 30000,

  // اگر روی ماشین mongod نصب باشد، از همان استفاده می‌شود (بدون دانلود ۶۰۰ مگابایتی)
  setupFiles: ['<rootDir>/jest.setup.ts'],

  // نگاشت aliasهای مسیر (در حال حاضر tsconfig فاقد `paths` است؛
  // این نگاشت‌ها آماده‌اند اگر بعداً alias اضافه شد)
  moduleNameMapper: {
    '^@app/(.*)$': '<rootDir>/src/$1',
    '^src/(.*)$': '<rootDir>/src/$1',
  },

  // ترنسپایل فایل‌های TypeScript با ts-jest
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // tsconfig اصلی پروژه (شامل typeRoots و strict بودن)
        tsconfig: '<rootDir>/tsconfig.json',
        // خطاهای type را در تست‌ها گزارش کن (با رفع مغایرت @types/jest برطرف شد)
        diagnostics: true,
      },
    ],
    // ⚠️ برخی وابستگی‌ها (مثل htmlparser2 که sanitize-html از آن استفاده می‌کند)
    // فقط ESM توزیع می‌کنند؛ این فایل‌ها باید به CJS تبدیل شوند تا Jest بتواند آن‌ها را load کند.
    '^.+\\.m?js$': [
      'ts-jest',
      {
        tsconfig: { allowJs: true, target: 'ES2022', module: 'CommonJS' },
        diagnostics: false,
      },
    ],
  },

  transformIgnorePatterns: [
    '/node_modules/(?!(htmlparser2|domhandler|domutils|domelementtype|entities|dom-serializer)/)',
  ],

  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/types/**', '!src/enums/**'],
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '/types/', '/__tests__/'],
};

export default config;
