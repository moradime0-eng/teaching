import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export type ModalType = 'danger' | 'warning' | 'info' | 'success';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './confirm-modal.component.html',
  styleUrl: './confirm-modal.component.scss',
})
export class ConfirmModalComponent {
  @Input() isOpen = false;
  @Input() title = 'آیا مطمئن هستید؟';
  @Input() message = '';
  @Input() confirmText = 'تأیید';
  @Input() cancelText = 'انصراف';
  @Input() type: ModalType = 'warning';
  @Input() isLoading = false;
  @Input() showCloseBtn = true;

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  // Close when pressing the ESC key
  @HostListener('document:keydown.escape')
  handleEscapeKey(): void {
    if (this.isOpen && !this.isLoading) {
      this.onCancel();
    }
  }

  getIconName(): string {
    switch (this.type) {
      case 'danger':
        return 'delete_forever';
      case 'warning':
        return 'warning_amber';
      case 'info':
        return 'info';
      case 'success':
        return 'check_circle';
      default:
        return 'help_outline';
    }
  }

  onConfirm(): void {
    if (!this.isLoading) {
      this.confirmed.emit();
    }
  }

  onCancel(): void {
    if (!this.isLoading) {
      this.cancelled.emit();
    }
  }
}
