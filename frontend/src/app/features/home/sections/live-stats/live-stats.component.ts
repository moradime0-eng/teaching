import { Component, OnInit, inject, signal, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../../core/services/api.service';

export interface PlatformStats {
  totalStudents: number;
  totalCourses: number;
  totalHours: number;
  totalCertificates: number;
}

@Component({
  selector: 'app-live-stats',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './live-stats.component.html',
  styleUrl: './live-stats.component.scss',
})
export class LiveStatsComponent implements OnInit {
  private api = inject(ApiService);
  private platformId = inject(PLATFORM_ID);

  isLoading = signal(true);
  stats = signal<PlatformStats>({
    totalStudents: 0,
    totalCourses: 0,
    totalHours: 0,
    totalCertificates: 0,
  });

  // Animated values
  animatedStudents = signal(0);
  animatedCourses = signal(0);
  animatedHours = signal(0);
  animatedCerts = signal(0);

  ngOnInit(): void {
    this.loadStats();
  }

  private loadStats(): void {
    this.isLoading.set(true);
    this.api.get<PlatformStats>('/dashboard/stats').subscribe({
      next: (res: any) => {
        const data = res.data || res;
        this.stats.set({
          totalStudents: data.totalStudents || 0,
          totalCourses: data.totalCourses || 0,
          totalHours: data.totalHours || 0,
          totalCertificates: data.totalCertificates || 0,
        });
        this.isLoading.set(false);
        this.animateCounters();
      },
      error: () => {
        // Fallback: try to use existing data
        this.isLoading.set(false);
      },
    });
  }

  private animateCounters(): void {
    const s = this.stats();
    this.animateValue(this.animatedStudents, s.totalStudents, 1200);
    this.animateValue(this.animatedCourses, s.totalCourses, 1000);
    this.animateValue(this.animatedHours, s.totalHours, 1400);
    this.animateValue(this.animatedCerts, s.totalCertificates, 1100);
  }

  private animateValue(signalRef: any, target: number, duration: number): void {
    if (target === 0) return;
    if (!isPlatformBrowser(this.platformId)) {
      signalRef.set(target);
      return;
    }
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      signalRef.set(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  faNum(n?: number): string {
    return (n ?? 0).toLocaleString('fa-IR');
  }
}
