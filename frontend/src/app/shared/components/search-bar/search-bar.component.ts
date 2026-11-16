import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  DestroyRef,
  inject,
  signal,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

export type SearchBarSize = 'small' | 'medium' | 'large';

@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './search-bar.component.html',
  styleUrl: './search-bar.component.scss',
})
export class SearchBarComponent implements OnInit, OnChanges {
  private destroyRef = inject(DestroyRef);

  @Input() placeholder = 'جستجو در دوره‌ها، مدرسین و...';
  @Input() initialValue = '';
  @Input() debounceMs = 350;
  @Input() isLoading = false;
  @Input() size: SearchBarSize = 'medium';
  @Input() autoFocus = false;
  @Input() clearOnEscape = true;

  @Output() searchChange = new EventEmitter<string>();
  @Output() searchSubmit = new EventEmitter<string>();
  @Output() cleared = new EventEmitter<void>();

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  query = '';
  isFocused = signal(false);
  private searchSubject = new Subject<string>();

  ngOnInit(): void {
    this.query = this.initialValue || '';

    this.searchSubject
      .pipe(
        debounceTime(this.debounceMs),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((value) => {
        this.searchChange.emit(value.trim());
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialValue'] && !changes['initialValue'].firstChange) {
      this.query = changes['initialValue'].currentValue || '';
    }
  }

  onInput(): void {
    this.searchSubject.next(this.query);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.searchSubmit.emit(this.query.trim());
    } else if (event.key === 'Escape' && this.clearOnEscape) {
      event.preventDefault();
      this.clear();
      this.searchInput.nativeElement.blur();
    }
  }

  clear(): void {
    if (this.query) {
      this.query = '';
      this.searchSubject.next('');
      this.cleared.emit();
      this.searchInput?.nativeElement.focus();
    }
  }
}
