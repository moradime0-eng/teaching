import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  ChangeDetectionStrategy,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export type StarSize = 'small' | 'medium' | 'large' | 'xlarge';

@Component({
  selector: 'app-rating-stars',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rating-stars.component.html',
  styleUrl: './rating-stars.component.scss',
})
export class RatingStarsComponent implements OnChanges {
  @Input() rating: number | null | undefined = 0;
  @Input() maxStars = 5;
  @Input() size: StarSize = 'medium';
  @Input() readonly = true;
  @Input() showLabel = false;

  @Output() ratingChange = new EventEmitter<number>();

  // ⭐ Signal داخلی برای Reactive بودن با تغییرات Input
  private ratingSignal = signal<number>(0);
  hoveredRating = signal<number | null>(null);

  readonly ratingLabels: Record<number, string> = {
    1: 'خیلی ضعیف',
    2: 'ضعیف',
    3: 'متوسط',
    4: 'خوب',
    5: 'عالی',
  };

  readonly Math = Math; // برای استفاده در template

  // ⭐ computed می‌شود که خودکار reactive باشد
  readonly effectiveRating = computed(() => {
    const hover = this.hoveredRating();
    return hover !== null ? hover : this.ratingSignal();
  });

  readonly currentLabel = computed(() => {
    const rounded = Math.round(this.effectiveRating());
    return this.ratingLabels[rounded] || '';
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rating']) {
      const val = Number(changes['rating'].currentValue) || 0;
      this.ratingSignal.set(val);
    }
  }

  get stars(): number[] {
    return Array.from({ length: this.maxStars }, (_, i) => i + 1);
  }

  getStarIcon(star: number): string {
    const current = this.effectiveRating();
    if (current >= star) return 'star';
    if (current >= star - 0.5) return 'star_half';
    return 'star_border';
  }

  getStarState(star: number): 'full' | 'half' | 'empty' {
    const current = this.effectiveRating();
    if (current >= star) return 'full';
    if (current >= star - 0.5) return 'half';
    return 'empty';
  }

  onStarHover(star: number): void {
    if (!this.readonly) {
      this.hoveredRating.set(star);
    }
  }

  onMouseLeave(): void {
    if (!this.readonly) {
      this.hoveredRating.set(null);
    }
  }

  onRate(star: number): void {
    if (!this.readonly) {
      this.ratingSignal.set(star);
      this.rating = star;
      this.ratingChange.emit(star);
    }
  }

  handleKeyDown(event: KeyboardEvent, star: number): void {
    if (this.readonly) return;

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const prev = Math.max(1, star - 1);
      this.onRate(prev);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const next = Math.min(this.maxStars, star + 1);
      this.onRate(next);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onRate(star);
    }
  }
  ratingSignalValue(): number {
  return this.ratingSignal();
}

}