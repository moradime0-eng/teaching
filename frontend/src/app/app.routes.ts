import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { unauthGuard } from './core/guards/unauth.guard';
import { roleGuard } from './core/guards/role.guard';
import { unsavedChangesGuard } from './core/guards/unsaved-changes.guard';

export const routes: Routes = [
  // ==========================================
  // Home
  // ==========================================
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
  },

  // ==========================================
  // 🔴 Google OAuth Callback (باید قبل از گروه Auth بیاید)
  // بدون هیچ گاردی تا کاربر بتواند بعد از لاگین گوگل به آن دسترسی داشته باشد
  // ==========================================
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./features/auth/callback/callback.component').then((m) => m.CallbackComponent),
  },

  // ==========================================
  // 🔴 Complete Registration (انتخاب نقش برای کاربران OAuth جدید)
  // ==========================================
  {
    path: 'auth/complete-registration',
    loadComponent: () =>
      import('./features/auth/complete-registration/complete-registration.component').then(
        (m) => m.CompleteRegistrationComponent,
      ),
  },

  // ==========================================
  // Auth Routes (فقط برای کاربران مهمان)
  // ==========================================
  {
    path: 'auth',
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login/login.component').then((m) => m.LoginComponent),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./features/auth/register/register.component').then((m) => m.RegisterComponent),
      },
      {
        path: 'forgot-password',
        loadComponent: () =>
          import('./features/auth/forgot-password/forgot-password.component').then(
            (m) => m.ForgotPasswordComponent,
          ),
      },
      {
        path: 'reset-password',
        loadComponent: () =>
          import('./features/auth/reset-password/reset-password.component').then(
            (m) => m.ResetPasswordComponent,
          ),
      },
      {
        path: 'callback',
        loadComponent: () =>
          import('./features/auth/callback/callback.component').then((m) => m.CallbackComponent),
      },
    ],
  },
  // ==========================================
  // Courses
  // ==========================================
  {
    path: 'courses',
    loadComponent: () =>
      import('./features/courses/catalog/catalog.component').then((m) => m.CatalogComponent),
  },
  {
    path: 'course/:slug',
    loadComponent: () =>
      import('./features/courses/detail/detail.component').then((m) => m.DetailComponent),
  },

  // ==========================================
  // Cart & Checkout
  // ==========================================
  {
    path: 'cart',
    canActivate: [authGuard],
    loadComponent: () => import('./features/cart/cart.component').then((m) => m.CartComponent),
  },
  {
    path: 'checkout',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/checkout/checkout.component').then((m) => m.CheckoutComponent),
  },
  {
    path: 'payment/success',
    loadComponent: () =>
      import('./features/payment/payment-success/payment-success.component').then(
        (m) => m.PaymentSuccessComponent,
      ),
  },
  {
    path: 'payment/failure',
    loadComponent: () =>
      import('./features/payment/payment-failure/payment-failure.component').then(
        (m) => m.PaymentFailureComponent,
      ),
  },
  {
    path: 'transactions',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/payment/payment-return/payment-return.component').then(
        (m) => m.PaymentReturnComponent,
      ),
  },

  {
    path: 'wallet',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/wallet/wallet-dashboard/wallet-dashboard.component').then(
        (m) => m.WalletDashboardComponent,
      ),
  },

  // ==========================================
  // Student Dashboard
  // ==========================================
  {
    path: 'dashboard',
    canActivate: [authGuard],
    children: [
      {
        path: 'my-courses',
        loadComponent: () =>
          import('./features/student-dashboard/my-courses/my-courses.component').then(
            (m) => m.MyCoursesComponent,
          ),
      },
      {
        path: 'learning-paths',
        loadComponent: () =>
          import('./features/student-dashboard/my-learning-paths/my-learning-paths.component').then(
            (m) => m.MyLearningPathsComponent,
          ),
      },
      {
        path: 'certificates',
        loadComponent: () =>
          import('./features/student-dashboard/certificates/certificates.component').then(
            (m) => m.CertificatesComponent,
          ),
      },
      {
        path: 'wishlist',
        loadComponent: () =>
          import('./features/student-dashboard/wishlist/wishlist.component').then(
            (m) => m.WishlistComponent,
          ),
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('./features/student-dashboard/orders/orders.component').then(
            (m) => m.OrdersComponent,
          ),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/student-dashboard/profile/profile.component').then(
            (m) => m.ProfileComponent,
          ),
      },
    ],
  },

  // ==========================================
  // Learning (Classroom)
  // ==========================================
  {
    path: 'learn/:courseId',
    // ✅ بدون authGuard — دسترسی برای دوره‌های رایگان بدون لاگین
    loadComponent: () =>
      import('./features/learning/classroom/classroom.component').then((m) => m.ClassroomComponent),
  },

  // ==========================================
  // Instructor Panel
  // ==========================================
  {
    path: 'instructor',
    canActivate: [authGuard, roleGuard(['instructor', 'admin'])],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/instructor/dashboard/instructor-dashboard.component').then(
            (m) => m.InstructorDashboardComponent,
          ),
      },
      {
        path: 'course-builder',
        loadComponent: () =>
          import('./features/instructor/course-builder/course-builder.component').then(
            (m) => m.CourseBuilderComponent,
          ),
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'course-builder/:id',
        loadComponent: () =>
          import('./features/instructor/course-builder/course-builder.component').then(
            (m) => m.CourseBuilderComponent,
          ),
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./features/instructor/analytics/analytics.component').then(
            (m) => m.AnalyticsComponent,
          ),
      },
      {
        path: 'questions',
        loadComponent: () =>
          import('./features/instructor/instructor-questions/instructor-questions.component').then(
            (m) => m.InstructorQuestionsComponent,
          ),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/instructor/instructor-profile/instructor-profile.component').then(
            (m) => m.InstructorProfileComponent,
          ),
      },
    ],
  },


  {
    path: 'instructor/register',
    redirectTo: '/auth/register',
    pathMatch: 'full',
  },

  // ==========================================
  // Public Instructor Profile (باید بعد از Instructor Panel بیاید)
  // ==========================================
  {
    path: 'instructor/:id',
    loadComponent: () =>
      import('./features/instructor/public-profile/public-instructor-profile.component').then(
        (m) => m.PublicInstructorProfileComponent,
      ),
  },

  // ==========================================
  // Admin Panel
  // ==========================================
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard(['admin'])],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/admin/dashboard/admin-dashboard.component').then(
            (m) => m.AdminDashboardComponent,
          ),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./features/admin/users/admin-users.component').then((m) => m.AdminUsersComponent),
      },
      {
        path: 'courses',
        loadComponent: () =>
          import('./features/admin/courses/admin-courses.component').then(
            (m) => m.AdminCoursesComponent,
          ),
      },
      {
        path: 'payments',
        loadComponent: () =>
          import('./features/admin/payments/admin-payments.component').then(
            (m) => m.AdminPaymentsComponent,
          ),
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./features/admin/categories-management/categories-management.component').then(
            (m) => m.CategoriesManagementComponent,
          ),
      },
      {
        path: 'campaigns',
        loadComponent: () =>
          import('./features/admin/campaigns/campaigns-list.component').then(
            (m) => m.CampaignsListComponent,
          ),
      },
      {
        path: 'campaigns/new',
        loadComponent: () =>
          import('./features/admin/campaigns/campaign-form.component').then(
            (m) => m.CampaignFormComponent,
          ),
      },
      {
        path: 'campaigns/:id/edit',
        loadComponent: () =>
          import('./features/admin/campaigns/campaign-form.component').then(
            (m) => m.CampaignFormComponent,
          ),
      },
      {
        path: 'tickets',
        loadComponent: () =>
          import('./features/admin/tickets/admin-tickets.component').then(
            (m) => m.AdminTicketsComponent,
          ),
      },
      {
        path: 'questions',
        loadComponent: () =>
          import('./features/instructor/instructor-questions/instructor-questions.component').then(
            (m) => m.InstructorQuestionsComponent,
          ),
      },
      {
        path: 'course-builder',
        loadComponent: () =>
          import('./features/instructor/course-builder/course-builder.component').then(
            (m) => m.CourseBuilderComponent,
          ),
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'course-builder/:id',
        loadComponent: () =>
          import('./features/instructor/course-builder/course-builder.component').then(
            (m) => m.CourseBuilderComponent,
          ),
        canDeactivate: [unsavedChangesGuard],
      },
    ],
  },

  // ==========================================
  // Messages & Support
  // ==========================================
  {
    path: 'messages',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/messages/messages.component').then((m) => m.MessagesComponent),
  },
  {
    path: 'support',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/support/support.component').then((m) => m.SupportComponent),
  },
  {
    // ⚠️ FIX: این مسیر از قبل در منوی موبایل لینک داشت ولی کامپوننتی نداشت
    path: 'notifications',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/notifications/notifications.component').then(
        (m) => m.NotificationsComponent,
      ),
  },

  // ==========================================
  // Learning Paths — Admin
  // ==========================================
  {
    path: 'admin/learning-paths',
    canActivate: [authGuard, roleGuard(['admin'])],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/admin/learning/learning-paths-list/learning-paths-list.component').then(
            (m) => m.LearningPathsListComponent,
          ),
      },
      {
        path: 'create',
        loadComponent: () =>
          import('./features/admin/learning/learning-path-builder/learning-path-builder.component').then(
            (m) => m.LearningPathBuilderComponent,
          ),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./features/admin/learning/learning-path-builder/learning-path-builder.component').then(
            (m) => m.LearningPathBuilderComponent,
          ),
      },
    ],
  },

  // ==========================================
  // Learning Paths — Public
  // ==========================================
  {
    path: 'learning-paths',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/learning-paths/learning-paths-catalog/learning-paths-catalog.component').then(
            (m) => m.LearningPathsCatalogComponent,
          ),
      },
      {
        path: ':slug',
        loadComponent: () =>
          import('./features/learning-paths/learning-path-detail/learning-path-detail.component').then(
            (m) => m.LearningPathDetailComponent,
          ),
      },
    ],
  },

  // ==========================================
  // 404 Fallback
  // ==========================================
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
];
