import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { environment } from '../../../../environments/environment.development';
import { RatingStarsComponent } from '../../../shared/components/rating-stars/rating-stars.component';
import { TomanPipe } from '../../../shared/pipes/toman.pipe';
import { FaNumPipe } from '../../../shared/pipes/fa-num.pipe';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';
import { SeoService } from '../../../core/services/seo.service';
import { SanitizeHtmlPipe } from '../../../shared/pipes/sanitize-html.pipe';

export interface PublicInstructor {
  _id: string;
  fullName: string;
  avatar?: string;
  email?: string;
  bio?: string;
  instructorProfile: {
    headline?: string;
    biography?: string;
    expertise?: string[];
    socialLinks?: {
      linkedin?: string;
      twitter?: string;
      youtube?: string;
      instagram?: string;
    };
    website?: string;
    education?: Array<{ degree: string; university: string; year: number }>;
    experience?: Array<{ title: string; company: string; years: number }>;
    languages?: string[];
  };
  stats: {
    totalStudents: number;
    totalCourses: number;
    totalReviews: number;
    averageRating: number;
  };
  courses: Array<{
    _id: string;
    title: string;
    slug: string;
    thumbnail?: string;
    totalStudents: number;
    averageRating: number;
    price: number;
    discountPrice?: number;
    isFree: boolean;
    totalLectures: number;
    totalDuration: number;
  }>;
}

@Component({
  selector: 'app-public-instructor-profile',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    RatingStarsComponent,
    TomanPipe,
    FaNumPipe,
    ImageFallbackDirective,
    SanitizeHtmlPipe,
  ],
  templateUrl: './public-instructor-profile.component.html',
  styleUrl: './public-instructor-profile.component.scss',
})
export class PublicInstructorProfileComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private seoService = inject(SeoService);
  private router = inject(Router);

  instructor = signal<PublicInstructor | null>(null);
  isLoading = signal(true);
  hasError = signal(false);
  errorMessage = signal('');
  activeSection = signal<'about' | 'courses' | 'reviews'>('about');
  courseFilter = signal<'all' | 'popular' | 'newest' | 'free'>('all');
  showFullBio = signal(false);

  // ── نظرات ──
  reviews = signal<any[]>([]);
  isLoadingReviews = signal(false);
  ratingDistribution = computed(() => {
    const revs = this.reviews();
    const dist: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    revs.forEach((r: any) => {
      if (r.rating >= 1 && r.rating <= 5) {
        dist[r.rating]++;
      }
    });
    return dist;
  });
  ratingPercentages = computed(() => {
    const dist = this.ratingDistribution();
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    if (total === 0) return { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } as Record<number, number>;
    const result: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const key of [5, 4, 3, 2, 1]) {
      result[key] = (dist[key] / total) * 100;
    }
    return result;
  });

  defaultAvatar =
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="%236c5ce7"/><text x="50" y="58" font-size="40" fill="white" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">👤</text></svg>';

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadInstructorProfile(id);
    } else {
      this.isLoading.set(false);
      this.hasError.set(true);
      this.errorMessage.set('آدرس پروفایل مدرس نامعتبر است.');
    }
  }

  loadInstructorProfile(id: string): void {
    this.isLoading.set(true);
    this.hasError.set(false);

    this.api.get<PublicInstructor>(`/instructors/${id}`).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          const data = res.data;
          this.instructor.set(data);
          this.seoService.setFullSeo({
            title: `پروفایل ${data.fullName} — مدرس دوره‌های آموزشی`,
            description: data.instructorProfile?.headline || data.bio || `پروفایل ${data.fullName}`,
          });
        } else {
          this.hasError.set(true);
          this.errorMessage.set('مدرس مورد نظر یافت نشد.');
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.hasError.set(true);
        this.errorMessage.set(
          err.status === 404
            ? 'مدرس مورد نظر یافت نشد.'
            : 'خطا در دریافت اطلاعات مدرس. لطفاً مجدداً تلاش کنید.',
        );
      },
    });
  }

  retryLoad(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.loadInstructorProfile(id);
  }

  resolveMediaUrl(raw: string | undefined | null): string {
    if (!raw) return '';
    if (raw === 'null' || raw === 'undefined') return '';
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.startsWith('//')) return `https:${raw}`;
    if (raw.startsWith('data:')) return raw;
    const base = environment.socketUrl
      ? environment.socketUrl.replace(/\/$/, '')
      : window.location.origin;
    return raw.startsWith('/') ? `${base}${raw}` : `${base}/${raw}`;
  }

  getInitials(): string {
    const name = this.instructor()?.fullName || 'کاربر';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`;
    return parts[0]?.[0] || 'ک';
  }

  getAvatar(): string {
    const data = this.instructor();
    if (!data) return this.defaultAvatar;
    const avatar = data.avatar;
    if (!avatar || avatar === 'null' || avatar === 'undefined') return this.defaultAvatar;
    return this.resolveMediaUrl(avatar) || this.defaultAvatar;
  }

  handleAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.onerror = null;
      img.src = this.defaultAvatar;
    }
  }

  filteredCourses = computed(() => {
    const inst = this.instructor();
    if (!inst || !inst.courses) return [];
    const courses = inst.courses;
    const filter = this.courseFilter();

    switch (filter) {
      case 'popular':
        return [...courses].sort((a, b) => b.totalStudents - a.totalStudents);
      case 'newest':
        return [...courses];
      case 'free':
        return courses.filter((c) => c.isFree);
      default:
        return courses;
    }
  });

  setActiveSection(section: 'about' | 'courses' | 'reviews'): void {
    this.activeSection.set(section);
    if (section === 'reviews' && this.reviews().length === 0) {
      this.loadReviews();
    }
  }

  loadReviews(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    this.isLoadingReviews.set(true);
    this.api.get<any[]>(`/instructors/${id}/reviews`).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.reviews.set(res.data);
        }
        this.isLoadingReviews.set(false);
      },
      error: () => {
        this.isLoadingReviews.set(false);
      },
    });
  }

  getReviewUserName(review: any): string {
    return review.user?.fullName || 'دانشجو';
  }

  getReviewUserAvatar(review: any): string | null {
    const avatar = review.user?.avatar;
    if (!avatar || avatar === 'null' || avatar === 'undefined') return null;
    return this.resolveMediaUrl(avatar);
  }

  getReviewUserInitial(review: any): string {
    const name = this.getReviewUserName(review);
    return name.charAt(0) || 'ک';
  }

  getReviewAvatarGradient(review: any): string {
    const colors = ['#6366f1', '#8b5cf6', '#a435f0', '#ec4899', '#f43f5e'];
    const idx = this.getReviewUserName(review).charCodeAt(0) % colors.length;
    return `linear-gradient(135deg, ${colors[idx]}, ${colors[(idx + 1) % colors.length]})`;
  }

  getReviewCourseName(review: any): string {
    return review.course?.title || '';
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  setCourseFilter(filter: 'all' | 'popular' | 'newest' | 'free'): void {
    this.courseFilter.set(filter);
  }

  toggleBio(): void {
    this.showFullBio.update((v) => !v);
  }

  getSocialLinks() {
    return this.instructor()?.instructorProfile?.socialLinks || {};
  }

  getExpertise(): string[] {
    return this.instructor()?.instructorProfile?.expertise || [];
  }

  hasSocialLinks(): boolean {
    const links = this.getSocialLinks();
    const profile = this.instructor()?.instructorProfile;
    return !!(
      links.linkedin ||
      links.twitter ||
      links.youtube ||
      links.instagram ||
      profile?.website
    );
  }

  hasAboutContent(): boolean {
    const profile = this.instructor()?.instructorProfile;
    if (!profile) return false;
    return !!(
      profile.biography ||
      profile.expertise?.length ||
      profile.education?.length ||
      profile.experience?.length ||
      profile.languages?.length
    );
  }

  getDiscountPercent(course: { price: number; discountPrice?: number }): number {
    if (!course.discountPrice || course.price <= 0) return 0;
    return Math.round(((course.price - course.discountPrice) / course.price) * 100);
  }

  trackByCourseId(index: number, course: { _id: string }): string {
    return course._id;
  }
  /**
 * محاسبه طول متن خالص بیو (بدون تگ‌های HTML)
 * برای تصمیم‌گیری در نمایش دکمه "ادامه مطلب"
 */
getBioTextLength(bio: string): number {
  if (!bio) return 0;
  // حذف تگ‌های HTML و &nbsp; و فاصله‌های اضافی
  const plainText = bio
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return plainText.length;
}
}
