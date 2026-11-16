import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // روت‌های داینامیک و پارامتریک
  {
    path: 'course/:slug',
    renderMode: RenderMode.Server,
  },
  {
    path: 'learn/:courseId',
    renderMode: RenderMode.Client,
  },
  {
    path: 'instructor/course-builder/:id',
    renderMode: RenderMode.Client,
  },

  // مسیرهای احراز هویت (باید فقط Client-Side اجرا شوند)
  {
    path: 'auth/**',
    renderMode: RenderMode.Client,
  },

  // مسیرهای مسیر یادگیری
  {
    path: 'learning-paths',
    renderMode: RenderMode.Server,
  },
  {
    path: 'learning-paths/:slug',
    renderMode: RenderMode.Server,
  },

  // پنل‌ها و بخش‌های نیازمند لاگین
  {
    path: 'dashboard/**',
    renderMode: RenderMode.Client,
  },
  {
    path: 'admin/**',
    renderMode: RenderMode.Client,
  },
  {
    path: 'instructor/**',
    renderMode: RenderMode.Client,
  },
  {
    path: 'messages',
    renderMode: RenderMode.Client,
  },

  // برای بقیه تمام صفحات (SSR پویا)
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
