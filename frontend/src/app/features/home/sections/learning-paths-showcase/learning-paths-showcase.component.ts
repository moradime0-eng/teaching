// frontend/src/app/features/home/sections/learning-paths-showcase/learning-paths-showcase.component.ts

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

import {
  LearningPathService,
  ILearningPath,
} from '../../../../services/learning-path.service';
import { TiltGlareDirective } from '../../../../shared/directives/tilt-glare.directive';
import { FaNumPipe } from '../../../../shared/pipes/fa-num.pipe';
import { AuthService } from '../../../../core/services/auth.service';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';

@Component({
  selector: 'app-learning-paths-showcase',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, TiltGlareDirective, FaNumPipe],
  templateUrl: './learning-paths-showcase.component.html',
  styleUrl: './learning-paths-showcase.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LearningPathsShowcaseComponent implements OnInit {
  private learningPathService = inject(LearningPathService);
  private authService = inject(AuthService);

  readonly isLoading = signal(true);
  readonly paths = signal<ILearningPath[]>([]);

  readonly isLoggedIn = computed(() => !!this.authService.currentUser());

  readonly featuredPaths = computed(() => this.paths().slice(0, 4));

  ngOnInit(): void {
    this.loadFeaturedPaths();
  }

  private loadFeaturedPaths(): void {
    this.isLoading.set(true);

        this.learningPathService
      .getAll({ isFeatured: true, limit: 4, sort: 'displayOrder' })
      .pipe(
        switchMap((featuredRes: any) => {
          const featured = featuredRes?.data || [];
          if (featured.length > 0) {
            return of(featured);
          }
          // Fallback to recent paths
          return this.learningPathService
            .getAll({ limit: 4, sort: '-createdAt' })
            .pipe(map((recentRes: any) => recentRes?.data || []));
        }),
        catchError(() => of([] as ILearningPath[])),
      )
      .subscribe((paths) => {
        this.paths.set(paths);
        this.isLoading.set(false);
      });
  }

  /** تعداد دوره‌های مسیر */
  totalCoursesCount(path: ILearningPath): number {
    const fromStages = path?.stages?.reduce(
      (acc, stage) => acc + (stage?.courses?.length || 0),
      0,
    );
    return fromStages || path?.totalCourses || 0;
  }

  /** رنگ گرادیانت بر اساس index کارت */
  getCardGradient(index: number): string {
    const gradients = [
      'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    ];
    return gradients[index % gradients.length];
  }
}