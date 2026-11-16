import { Injectable, signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment.development';
import { TokenService } from './token.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private socket: Socket | null = null;

  /**
   * رجیستری لیسنرهای کامپوننت‌ها.
   * ⚠️ FIX: قبلاً اگر لیسنر قبل از برقراری اتصال ثبت می‌شد یا سوکت بعداً
   * دوباره ساخته می‌شد (logout/login)، لیسنرها بی‌صدا از بین می‌رفتند.
   * اکنون لیسنرها نگه داشته می‌شوند و بعد از هر connect دوباره نصب می‌شوند.
   */
  private listeners = new Map<string, Set<(...args: any[]) => void>>();

  /** آخرین توکنی که با آن تلاش اتصال شد (برای جلوگیری از حلقه تلاش با توکن خراب) */
  private lastSocketToken: string | null = null;
  /** حداکثر ۳ تلاش احراز هویت مجدد پشت سر هم */
  private authRetries = 0;

  isConnected = signal(false);
  unreadCount = signal(0);
  /** Shared signal for unread summary — used by activity-snackbar & notification-panel */
  unreadSummary = signal<any>(null);

  constructor(
    private tokenService: TokenService,
    private authService: AuthService,
  ) {}

  connect(): void {
    if (!this.isBrowser) return;

    // Already connected
    if (this.socket?.connected) {
      return;
    }

    // Cleanup previous socket
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    const token = this.tokenService.getAccessToken();

    // Don't connect without authentication
    if (!token) {
      console.log('[Socket] No access token, connection skipped');
      return;
    }

    this.lastSocketToken = token;
    this.authRetries = 0;

    console.log('[Socket] Connecting...');

    this.socket = io(environment.socketUrl, {
      withCredentials: true,

      // Start with polling and upgrade to websocket
      transports: ['polling', 'websocket'],

      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 3000,
      reconnectionDelayMax: 15000,

      auth: {
        token,
      },
    });

    // ⚠️ FIX: دوباره‌نصب لیسنرهای ثبت‌شده توسط کامپوننت‌ها روی سوکت جدید
    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach((cb) => this.socket?.on(event, cb));
    });

    // ------------------------------------
    // Connected
    // ------------------------------------
    this.socket.on('connect', () => {
      this.isConnected.set(true);
      this.authRetries = 0;

      console.log(
        '[Socket] Connected:',
        this.socket?.id
      );

      this.socket?.emit('get_unread_count');
    });

    // ------------------------------------
    // Disconnected
    // ------------------------------------
    this.socket.on('disconnect', (reason) => {
      this.isConnected.set(false);

      console.warn(
        '[Socket] Disconnected:',
        reason
      );
    });

    // ------------------------------------
    // Connection error
    // ------------------------------------
    this.socket.on('connect_error', (error: any) => {
      this.isConnected.set(false);

      console.error(
        '[Socket] Connection error:',
        error?.message || error
      );

      if (
        error?.message === 'Authentication required' ||
        error?.message === 'Invalid token'
      ) {
        this.handleAuthFailure();
      }
    });

    // ------------------------------------
    // Unread messages
    // ------------------------------------
    this.socket.on(
      'unread_count',
      (data: { count: number }) => {
        this.unreadCount.set(data?.count ?? 0);
      }
    );
  }

  /**
   * ⚠️ FIX: توکن دسترسی فقط ۱۵ دقیقه اعتبار دارد. اینترسپتور HTTP بعد از refresh
   * کوکی را تازه می‌کند ولی سوکت همان توکن قدیمی را نگه داشته بود → "Invalid token"
   * و قطع دائمی اتصال. اینجا بعد از هر شکست احراز هویت، توکن تازه برمی‌داریم
   * (در صورت نیاز refresh می‌کنیم) و اتصال را دوباره تلاش می‌کنیم.
   */
  private handleAuthFailure(): void {
    if (!this.socket) return;

    if (this.authRetries >= 2) {
      console.warn('[Socket] Authentication failed after retries');
      this.disconnect();
      return;
    }
    this.authRetries++;

    const fresh = this.tokenService.getAccessToken();
    if (fresh && fresh !== this.lastSocketToken) {
      // اینترسپتور قبلاً توکن را تازه کرده — فقط همان را استفاده کن
      this.lastSocketToken = fresh;
      (this.socket as any).auth = { token: fresh };
      console.log('[Socket] Retrying with refreshed token');
      return; // socket.io به‌طور خودکار دوباره تلاش می‌کند
    }

    console.warn('[Socket] Refreshing token for socket reconnect...');
    this.authService.refreshToken().subscribe({
      next: () => {
        const token = this.tokenService.getAccessToken();
        if (token && this.socket) {
          this.lastSocketToken = token;
          (this.socket as any).auth = { token };
        } else {
          this.disconnect();
        }
      },
      error: () => {
        console.warn('[Socket] Token refresh failed');
        this.disconnect();
      },
    });
  }

  disconnect(): void {
    if (!this.isBrowser) return;

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.isConnected.set(false);

    // ⚠️ FIX: ریست کردن شمارنده‌ها هنگام خروج — جلوگیری از نمایش داده
    // کاربر قبلی روی دستگاه مشترک (بج و خلاصه اعلان‌ها)
    this.unreadCount.set(0);
    this.unreadSummary.set(null);
  }

  on(
    event: string,
    callback: (...args: any[]) => void
  ): void {
    if (!this.isBrowser) return;

    // ⚠️ FIX: ثبت در رجیستری تا حتی قبل از connect (یا بعد از reconnect) از دست نرود
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    this.socket?.on(event, callback);
  }

  off(
    event: string,
    callback?: (...args: any[]) => void
  ): void {
    if (!this.isBrowser) return;

    if (callback) {
      this.listeners.get(event)?.delete(callback);
      this.socket?.off(event, callback);
    } else {
      this.listeners.delete(event);
      this.socket?.off(event);
    }
  }

  emit(
    event: string,
    data?: any
  ): void {
    if (!this.isBrowser) return;

    if (!this.socket?.connected) {
      console.warn(
        `[Socket] Cannot emit "${event}" - socket not connected`
      );
      return;
    }

    this.socket.emit(event, data);
  }

  joinConversation(
    conversationId: string
  ): void {
    if (!this.isBrowser) return;

    if (!this.socket?.connected) {
      console.warn(
        '[Socket] Cannot join conversation - socket not connected'
      );
      return;
    }

    this.socket.emit(
      'join_conversation',
      conversationId
    );
  }

  leaveConversation(
    conversationId: string
  ): void {
    if (!this.isBrowser) return;

    if (!this.socket?.connected) {
      return;
    }

    this.socket.emit(
      'leave_conversation',
      conversationId
    );
  }

  sendMessage(
    conversationId: string,
    content: string,
    replyTo?: string,
    clientMsgId?: string
  ): void {
    if (!this.isBrowser) return;

    if (!this.socket?.connected) {
      console.warn(
        '[Socket] Cannot send message - socket not connected'
      );
      return;
    }

    this.socket.emit('send_message', {
      conversationId,
      content,
      replyTo,
      clientMsgId,
    });
  }

  isSocketConnected(): boolean {
    return !!this.socket?.connected;
  }
}