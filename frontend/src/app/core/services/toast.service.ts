import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  type: ToastType;
  title?: string;
  message: string;
  duration: number;
  action?: ToastAction;
  timerRef?: any;
  startTime?: number;
  remainingTime?: number;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private counter = 0;
  toasts = signal<Toast[]>([]);

  show(options: {
    message: string;
    title?: string;
    type?: ToastType;
    duration?: number;
    action?: ToastAction;
  }): number {
    const id = ++this.counter;
    const duration = options.duration ?? 4500;
    const type = options.type ?? 'info';

    const newToast: Toast = {
      id,
      title: options.title,
      message: options.message,
      type,
      duration,
      action: options.action,
      remainingTime: duration,
      startTime: Date.now(),
    };

    newToast.timerRef = setTimeout(() => this.remove(id), duration);

    this.toasts.update((current) => [newToast, ...current]);
    return id;
  }

  success(message: string, title = 'موفقیت‌آمیز', duration = 4000, action?: ToastAction): number {
    return this.show({ message, title, type: 'success', duration, action });
  }

  error(message: string, title = 'خطا', duration = 5500, action?: ToastAction): number {
    return this.show({ message, title, type: 'error', duration, action });
  }

  warning(message: string, title = 'هشدار', duration = 4500, action?: ToastAction): number {
    return this.show({ message, title, type: 'warning', duration, action });
  }

  info(message: string, title = 'اطلاعیه', duration = 4000, action?: ToastAction): number {
    return this.show({ message, title, type: 'info', duration, action });
  }

  remove(id: number): void {
    const currentToast = this.toasts().find((t) => t.id === id);
    if (currentToast?.timerRef) {
      clearTimeout(currentToast.timerRef);
    }
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  pause(id: number): void {
    const toast = this.toasts().find((t) => t.id === id);
    if (toast && toast.timerRef && toast.startTime) {
      clearTimeout(toast.timerRef);
      const elapsed = Date.now() - toast.startTime;
      toast.remainingTime = Math.max(0, (toast.remainingTime || toast.duration) - elapsed);
      toast.timerRef = undefined;
    }
  }

  resume(id: number): void {
    const toast = this.toasts().find((t) => t.id === id);
    if (toast && !toast.timerRef && toast.remainingTime && toast.remainingTime > 0) {
      toast.startTime = Date.now();
      toast.timerRef = setTimeout(() => this.remove(id), toast.remainingTime);
    }
  }
}
