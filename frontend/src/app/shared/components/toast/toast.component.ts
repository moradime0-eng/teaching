import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Toast, ToastService, ToastType} from '../../../core/services/toast.service';
@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss',
})
export class ToastComponent {
  public toastService = inject(ToastService);
  toasts = this.toastService.toasts;

  getIcon(type: ToastType): string {
    switch (type) {
      case 'success': return 'check_circle';
      case 'error': return 'error_outline';
      case 'warning': return 'warning_amber';
      case 'info': return 'info_outline';
    }
  }

  onActionClick(toast: Toast): void {
    if (toast.action?.onClick) {
      toast.action.onClick();
    }
    this.toastService.remove(toast.id);
  }
}