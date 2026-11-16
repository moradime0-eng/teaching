import { Component, input, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

type TagSize = 'sm' | 'md' | 'lg';
type TagVariant = 'default' | 'gradient' | 'outline' | 'glass';

@Component({
  selector: 'app-tag-list',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './tag-list.component.html',
  styleUrl: './tag-list.component.scss',
})
export class TagListComponent {
  private router = inject(Router);

  /** آرایه تگ‌ها */
  tags = input<string[]>([]);
  /** حداکثر تگ قابل نمایش (بقیه در +N) */
  maxVisible = input<number>(3);
  /** اندازه: sm | md | lg */
  size = input<TagSize>('sm');
  /** استایل: default | gradient | outline | glass */
  variant = input<TagVariant>('default');
  /** اگر true، کلیک روی تگ به /courses?tag=X می‌رود */
  clickable = input<boolean>(false);

  visibleTags = computed(() => this.tags().slice(0, this.maxVisible()));
  hiddenTags = computed(() => this.tags().slice(this.maxVisible()));
  hiddenCount = computed(() => Math.max(0, this.tags().length - this.maxVisible()));

  showHidden = signal(false);
  pressedTag = signal<string | null>(null);

  setPressed(tag: string, state: boolean): void {
    this.pressedTag.set(state ? tag : null);
  }

  toggleHidden(): void {
    this.showHidden.update((v) => !v);
  }

  navigateToTag(tag: string): void {
    this.router.navigate(['/courses'], { queryParams: { tags: tag } });
  }
}
