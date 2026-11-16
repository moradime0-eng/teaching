import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.scss',
})
export class PaginationComponent implements OnChanges {
  @Input() currentPage = 1;
  @Input() totalPages = 1;
  @Input() maxVisible = 5;
  @Input() showFirstLast = false;
  @Input() showSummary = false;
  @Input() totalItems?: number;

  @Output() pageChange = new EventEmitter<number>();

  pages: (number | string)[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentPage'] || changes['totalPages'] || changes['maxVisible']) {
      this.buildPages();
    }
  }

  private buildPages(): void {
    if (this.totalPages <= 1) {
      this.pages = [];
      return;
    }

    const pages: (number | string)[] = [];
    const half = Math.floor(this.maxVisible / 2);

    let start = Math.max(1, this.currentPage - half);
    let end = Math.min(this.totalPages, start + this.maxVisible - 1);

    if (end - start < this.maxVisible - 1) {
      start = Math.max(1, end - this.maxVisible + 1);
    }

    if (start > 1) {
      pages.push(1);
      if (start > 2) pages.push('...');
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (end < this.totalPages) {
      if (end < this.totalPages - 1) pages.push('...');
      pages.push(this.totalPages);
    }

    this.pages = pages;
  }

  goToPage(page: number | string): void {
    if (
      typeof page === 'number' &&
      page >= 1 &&
      page <= this.totalPages &&
      page !== this.currentPage
    ) {
      this.pageChange.emit(page);
    }
  }

  isNumber(val: number | string): val is number {
    return typeof val === 'number';
  }
}
