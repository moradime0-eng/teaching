// frontend/src/app/features/student-dashboard/my-learning-paths/my-learning-paths.component.ts

import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import {
  LearningPathService,
  ILearningPathEnrollment,
} from '../../../services/learning-path.service';
import { ToastService } from '../../../core/services/toast.service';
import { DurationPipe } from '../../../shared/pipes/duration.pipe';
import { FaNumPipe } from '../../../shared/pipes/fa-num.pipe';

@Component({
  selector: 'app-my-learning-paths',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
    MatTooltipModule,
    DurationPipe,
    FaNumPipe,
  ],
  template: `
    <div class="mlp" dir="rtl">
      <!-- ═══ Header ═══ -->
      <header class="mlp__head">
        <div class="mlp__head-inner">
          <div class="mlp__head-text">
            <h1 class="mlp__title">
              <mat-icon>route</mat-icon>
              مسیرهای یادگیری من
            </h1>
            @if (!loading()) {
              <p class="mlp__count">
                {{ activeEnrollments().length | faNum }} مسیر فعال
                @if (archivedEnrollments().length > 0) {
                  <span class="mlp__count-sep">·</span>
                  <span class="mlp__count-alt">
                    {{ archivedEnrollments().length | faNum }} آرشیو
                  </span>
                }
              </p>
            }
          </div>

          <a routerLink="/learning-paths" class="mlp__browse">
            همه مسیرها
            <mat-icon>arrow_back</mat-icon>
          </a>
        </div>

        <!-- Stats -->
        @if (!loading() && activeEnrollments().length > 0) {
          <div class="mlp__stats">
            <div class="mstat">
              <span class="mstat__value">{{ activeCount() | faNum }}</span>
              <span class="mstat__label">در حال یادگیری</span>
            </div>
            <div class="mstat">
              <span class="mstat__value">{{ completedCount() | faNum }}</span>
              <span class="mstat__label">تکمیل شده</span>
            </div>
            <div class="mstat">
              <span class="mstat__value">{{ avgProgress() | faNum }}٪</span>
              <span class="mstat__label">میانگین پیشرفت</span>
            </div>
            <div class="mstat">
              <span class="mstat__value">{{ certificateCount() | faNum }}</span>
              <span class="mstat__label">گواهینامه</span>
            </div>
          </div>
        }
      </header>

      <!-- ═══ Content ═══ -->
      <section class="mlp__body">
        @if (loading()) {
          <!-- Skeletons -->
          <div class="mlp__grid">
            @for (i of [1, 2, 3]; track i) {
              <div class="mcard mcard--sk">
                <div class="sk sk--cover"></div>
                <div class="mcard__body">
                  <div class="sk" style="width: 75%; height: 15px"></div>
                  <div class="sk" style="width: 100%; height: 12px; margin-top: 10px"></div>
                  <div class="sk" style="width: 100%; height: 6px; margin-top: 18px"></div>
                  <div class="sk" style="width: 100%; height: 36px; margin-top: 16px"></div>
                </div>
              </div>
            }
          </div>
        } @else if (allEnrollments().length === 0) {
          <!-- Empty -->
          <div class="mlp__empty">
            <div class="mlp__empty-icon">🛤️</div>
            <h2>هنوز در مسیری ثبت‌نام نکرده‌اید</h2>
            <p>
              یک مسیر یادگیری انتخاب کنید تا قدم‌به‌قدم تا مهارت واقعی پیش بروید.
            </p>
            <a mat-flat-button color="primary" routerLink="/learning-paths">
              <mat-icon>explore</mat-icon>
              مشاهده مسیرهای یادگیری
            </a>
          </div>
        } @else {
          <!-- Active paths -->
          @if (activeEnrollments().length > 0) {
            <div class="mlp__grid">
              @for (enrollment of activeEnrollments(); track enrollment._id) {
                @let lp = enrollment.learningPath;
                @if (lp) {
                <article class="mcard">
                  <a
                    class="mcard__cover"
                    [routerLink]="['/learning-paths', lp.slug]"
                    [attr.aria-label]="lp.title">
                    @if (lp.coverImage) {
                      <img [src]="lp.coverImage" [alt]="lp.title" loading="lazy" />
                    } @else {
                      <span class="mcard__emoji">{{ lp.icon || '🛤️' }}</span>
                    }
                    @if (enrollment.status === 'completed' || enrollment.progress >= 100) {
                      <span class="mcard__done">
                        <mat-icon>verified</mat-icon>
                        تکمیل‌شده
                      </span>
                    }
                  </a>

                  <div class="mcard__body">
                    <h3 class="mcard__title">{{ lp.title }}</h3>
                    @if (lp.shortDescription) {
                      <p class="mcard__desc">{{ lp.shortDescription }}</p>
                    }

                    <div class="mcard__progress">
                      <div class="mcard__progress-head">
                        <span>پیشرفت</span>
                        <span class="mcard__progress-val">
                          {{ enrollment.progress | faNum }}٪
                        </span>
                      </div>
                      <mat-progress-bar
                        mode="determinate"
                        [value]="enrollment.progress"
                        [color]="enrollment.progress >= 100 ? 'accent' : 'primary'" />
                    </div>

                    <div class="mcard__meta">
                      <span>
                        <mat-icon>layers</mat-icon>
                        {{ lp.stages.length | faNum }} مرحله
                      </span>
                      <span>
                        <mat-icon>school</mat-icon>
                        {{ lp.totalCourses | faNum }} دوره
                      </span>
                      <span>
                        <mat-icon>schedule</mat-icon>
                        {{ lp.estimatedTotalDuration | duration }}
                      </span>
                    </div>

                    <a
                      mat-flat-button
                      color="primary"
                      class="mcard__cta"
                      [routerLink]="['/learning-paths', lp.slug]">
                      <mat-icon>
                        {{ enrollment.progress > 0 ? 'play_arrow' : 'how_to_reg' }}
                      </mat-icon>
                      {{ enrollment.progress > 0 ? 'ادامه' : 'شروع' }}
                    </a>
                  </div>
                </article>
                }
              }
            </div>
          }

          <!-- Archived paths -->
          @if (archivedEnrollments().length > 0) {
            <div class="mlp__section-head">
              <mat-icon>inventory_2</mat-icon>
              <h2>مسیرهای آرشیو شده</h2>
              <span class="mlp__section-note">
                این مسیرها دیگر در دسترس نیستند؛ پیشرفت شما محفوظ می‌ماند.
              </span>
            </div>

            <div class="mlp__grid mlp__grid--archived">
              @for (enrollment of archivedEnrollments(); track enrollment._id) {
                @let lp = enrollment.learningPath;
                @if (lp) {
                <article class="mcard mcard--archived">
                  <div class="mcard__cover mcard__cover--static">
                    @if (lp.coverImage) {
                      <img [src]="lp.coverImage" [alt]="lp.title" loading="lazy" />
                    } @else {
                      <span class="mcard__emoji">{{ lp.icon || '🛤️' }}</span>
                    }
                    <span class="mcard__archived-tag">
                      <mat-icon>inventory_2</mat-icon>
                      آرشیو شده
                    </span>
                  </div>

                  <div class="mcard__body">
                    <h3 class="mcard__title">{{ lp.title }}</h3>

                    <div class="mcard__archived-note">
                      <mat-icon>info_outline</mat-icon>
                      این مسیر دیگر قابل ادامه نیست.
                    </div>

                    <div class="mcard__progress">
                      <div class="mcard__progress-head">
                        <span>پیشرفت شما</span>
                        <span class="mcard__progress-val">
                          {{ enrollment.progress | faNum }}٪
                        </span>
                      </div>
                      <mat-progress-bar mode="determinate" [value]="enrollment.progress" />
                    </div>

                    <button
                      mat-stroked-button
                      class="mcard__cta mcard__cta--disabled"
                      disabled
                      matTooltip="این مسیر آرشیو شده است">
                      <mat-icon>block</mat-icon>
                      غیرقابل ادامه
                    </button>
                  </div>
                </article>
                }
              }
            </div>
          }
        }
      </section>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;

        /* ── توکن‌های تم (روشن + تیره) از styles.scss ── */
        --mlp-bg: var(--bg, #f7f5ff);
        --mlp-surface: var(--card-solid, #ffffff);
        --mlp-surface-2: var(--card-2, rgba(23, 14, 60, 0.065));
        --mlp-border: var(--border, rgba(23, 14, 60, 0.1));
        --mlp-text: var(--text, #171233);
        --mlp-text-2: var(--text-2, rgba(23, 18, 51, 0.68));
        --mlp-text-3: var(--text-3, rgba(23, 18, 51, 0.46));
        --mlp-brand: var(--brand, #7c3aed);
        --mlp-success: var(--success, #10b981);
        --mlp-shadow: var(--shadow-sm, 0 10px 30px -12px rgba(0, 0, 0, 0.18));
      }

      .mlp {
        min-height: 100vh;
        background: var(--mlp-bg);
        color: var(--mlp-text);
        font-family: var(--font-vazir), 'Vazirmatn', system-ui, sans-serif;
      }

      /* ═══ Header ═══ */
      .mlp__head {
        background: var(--mlp-bg);
        border-bottom: 1px solid var(--mlp-border);
        padding: 2rem 1.25rem 1.5rem;
      }

      .mlp__head-inner {
        max-width: 1200px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
      }

      .mlp__title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0;
        font-size: 1.4rem;
        font-weight: 800;
        color: var(--mlp-text);

        mat-icon {
          font-size: 24px;
          width: 24px;
          height: 24px;
          color: var(--mlp-brand);
        }
      }

      .mlp__count {
        margin: 6px 0 0;
        font-size: 0.85rem;
        color: var(--mlp-text-2);

        .mlp__count-sep {
          margin: 0 6px;
          color: var(--mlp-text-3);
        }
        .mlp__count-alt {
          color: var(--mlp-text-3);
        }
      }

      .mlp__browse {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 0.55rem 1rem;
        background: var(--mlp-surface);
        border: 1px solid var(--mlp-border);
        border-radius: 10px;
        color: var(--mlp-text-2);
        font-size: 0.85rem;
        font-weight: 600;
        text-decoration: none;
        white-space: nowrap;
        transition: border-color 0.2s, color 0.2s;

        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }

        &:hover {
          border-color: var(--mlp-brand);
          color: var(--mlp-brand);
        }

        &:focus-visible {
          outline: 2px solid var(--mlp-brand);
          outline-offset: 2px;
        }
      }

      /* ═══ Stats ═══ */
      .mlp__stats {
        max-width: 1200px;
        margin: 1.5rem auto 0;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;

        @media (min-width: 768px) {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      .mstat {
        background: var(--mlp-surface);
        border: 1px solid var(--mlp-border);
        border-radius: 12px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .mstat__value {
        font-size: 1.5rem;
        font-weight: 800;
        color: var(--mlp-text);
        line-height: 1.3;
      }

      .mstat__label {
        font-size: 0.78rem;
        color: var(--mlp-text-2);
      }

      /* ═══ Body / Grid ═══ */
      .mlp__body {
        max-width: 1200px;
        margin: 0 auto;
        padding: 2rem 1.25rem 4rem;
      }

      .mlp__grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 16px;
      }

      /* ═══ Card ═══ */
      .mcard {
        display: flex;
        flex-direction: column;
        background: var(--mlp-surface);
        border: 1px solid var(--mlp-border);
        border-radius: 12px;
        overflow: hidden;
        transition: box-shadow 0.25s ease, transform 0.25s ease;

        &:hover {
          transform: translateY(-2px);
          box-shadow: var(--mlp-shadow);
        }
      }

      .mcard__cover {
        position: relative;
        display: block;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--mlp-brand) 16%, transparent),
          color-mix(in srgb, var(--mlp-brand) 34%, transparent)
        );
        text-decoration: none;

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.4s ease;
        }
      }

      .mcard:hover .mcard__cover img {
        transform: scale(1.04);
      }

      .mcard__emoji {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        font-size: 2.5rem;
        opacity: 0.65;
      }

      .mcard__done {
        position: absolute;
        top: 10px;
        inset-inline-start: 10px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--mlp-surface) 92%, transparent);
        color: var(--mlp-success);
        font-size: 0.68rem;
        font-weight: 700;

        mat-icon {
          font-size: 14px;
          width: 14px;
          height: 14px;
        }
      }

      .mcard__body {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 16px;
        flex: 1;
      }

      .mcard__title {
        margin: 0;
        font-size: 0.98rem;
        font-weight: 700;
        color: var(--mlp-text);
        line-height: 1.7;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .mcard__desc {
        margin: 0;
        font-size: 0.82rem;
        color: var(--mlp-text-2);
        line-height: 1.9;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      /* Progress */
      .mcard__progress {
        .mcard__progress-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--mlp-text-2);
        }

        .mcard__progress-val {
          font-weight: 800;
          color: var(--mlp-text);
        }
      }

      /* Meta */
      .mcard__meta {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;

        span {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-size: 0.73rem;
          color: var(--mlp-text-3);

          mat-icon {
            font-size: 14px;
            width: 14px;
            height: 14px;
          }
        }
      }

      /* CTA */
      .mcard__cta {
        width: 100%;
        margin-top: auto;

        &--disabled {
          color: var(--mlp-text-3) !important;
          border-color: var(--mlp-border) !important;
          cursor: not-allowed;
        }
      }

      /* ═══ Archived ═══ */
      .mcard--archived {
        filter: grayscale(0.8);
        opacity: 0.7;

        &:hover {
          transform: none;
          box-shadow: none;
        }
      }

      .mcard__cover--static {
        cursor: default;
      }

      .mcard:hover .mcard__cover--static img {
        transform: none;
      }

      .mcard__archived-tag {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background: rgba(17, 24, 39, 0.45);
        color: #fff;
        font-size: 0.82rem;
        font-weight: 700;

        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }
      }

      .mcard__archived-note {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 0.75rem;
        color: var(--mlp-text-3);

        mat-icon {
          font-size: 15px;
          width: 15px;
          height: 15px;
        }
      }

      /* ═══ Section head (archived) ═══ */
      .mlp__section-head {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin: 3rem 0 1rem;

        mat-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
          color: var(--mlp-text-3);
        }

        h2 {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
          color: var(--mlp-text-2);
        }
      }

      .mlp__section-note {
        font-size: 0.78rem;
        color: var(--mlp-text-3);
      }

      /* ═══ Empty ═══ */
      .mlp__empty {
        text-align: center;
        padding: 4rem 1.5rem;
        background: var(--mlp-surface);
        border: 1px dashed var(--mlp-border);
        border-radius: 12px;

        .mlp__empty-icon {
          font-size: 3rem;
          margin-bottom: 12px;
          line-height: 1;
        }

        h2 {
          margin: 0 0 6px;
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--mlp-text);
        }

        p {
          margin: 0 0 24px;
          font-size: 0.88rem;
          color: var(--mlp-text-2);
          line-height: 1.9;
        }
      }

      /* ═══ Skeletons ═══ */
      .mcard--sk {
        pointer-events: none;
      }

      .sk {
        position: relative;
        overflow: hidden;
        background: var(--mlp-surface-2);
        border-radius: 6px;

        &--cover {
          width: 100%;
          aspect-ratio: 16 / 9;
          border-radius: 0;
        }

        &::after {
          content: '';
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.7),
            transparent
          );
          animation: msk 1.4s linear infinite;
        }
      }

      @keyframes msk {
        100% {
          transform: translateX(100%);
        }
      }

      /* ═══ Dark mode ═══
         ⚠️ قبلاً از @media (prefers-color-scheme: dark) استفاده می‌شد که فقط
         تنظیم سیستم‌عامل را می‌دید و دکمه تم سایت را نادیده می‌گرفت.
         اکنون همه رنگ‌ها از توکن‌های data-theme (styles.scss) می‌آیند. ═══ */

      /* ═══ Reduced motion ═══ */
      @media (prefers-reduced-motion: reduce) {
        .mcard,
        .mcard:hover,
        .mcard__cover img,
        .mlp__browse {
          transition: none !important;
          transform: none !important;
        }

        .sk::after {
          animation: none !important;
        }
      }

      /* ═══ Responsive ═══ */
      @media (max-width: 360px) {
        .mlp__grid {
          grid-template-columns: 1fr;
        }
        .mlp__head {
          padding: 1.5rem 1rem 1.25rem;
        }
        .mlp__body {
          padding: 1.5rem 1rem 3rem;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyLearningPathsComponent implements OnInit {
  private lpService = inject(LearningPathService);
  private toast = inject(ToastService);

  readonly loading = signal(true);
  readonly allEnrollments = signal<ILearningPathEnrollment[]>([]);

  /** مسیرهای قابل ادامه (منتشرشده) */
  readonly activeEnrollments = computed(() =>
    this.allEnrollments().filter((e) => e.learningPath?.status !== 'archived'),
  );

  /** مسیرهای آرشیو شده — فقط نمایش، بدون CTA فعال */
  readonly archivedEnrollments = computed(() =>
    this.allEnrollments().filter((e) => e.learningPath?.status === 'archived'),
  );

  /** نام مستعار سازگار با کدهای قبلی: فقط مسیرهای قابل مشاهده و ادامه */
  readonly visibleEnrollments = this.activeEnrollments;

  readonly activeCount = computed(
    () => this.activeEnrollments().filter((e) => e.status === 'active').length,
  );

  readonly completedCount = computed(
    () =>
      this.activeEnrollments().filter((e) => e.status === 'completed' || e.progress >= 100)
        .length,
  );

  readonly avgProgress = computed(() => {
    const list = this.activeEnrollments();
    if (list.length === 0) return 0;
    const sum = list.reduce((acc, e) => acc + (e.progress || 0), 0);
    return Math.round(sum / list.length);
  });

  readonly certificateCount = computed(
    () => this.allEnrollments().filter((e) => e.certificateIssued && e.learningPath?.status !== 'archived').length,
  );

  ngOnInit(): void {
    this.loadPaths();
  }

  private loadPaths(): void {
    this.loading.set(true);
    this.lpService.getMyPaths().subscribe({
      next: (res: any) => {
        const all: ILearningPathEnrollment[] = res?.data || [];
        // فقط رکوردهایی که مسیرشان populate شده است
        this.allEnrollments.set(
          all.filter((e) => e.learningPath && typeof e.learningPath === 'object'),
        );
        this.loading.set(false);
      },
      error: (err: any) => {
        this.loading.set(false);
        this.toast.error(err?.error?.message || 'خطا در بارگذاری مسیرهای یادگیری');
      },
    });
  }
}