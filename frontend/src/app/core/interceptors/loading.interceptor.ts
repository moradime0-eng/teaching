import { HttpInterceptorFn, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { finalize } from 'rxjs';
import { BehaviorSubject } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';

export const loadingState = new BehaviorSubject<boolean>(false);

export const loadingInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const platformId = inject(PLATFORM_ID);
  const isBrowser = isPlatformBrowser(platformId);

  // Skip loading for background requests and polling endpoints
  if (req.url.includes('/notifications') || req.url.includes('/refresh-token') || req.url.includes('/unread-summary')) {
    return next(req);
  }

  // Use setTimeout to avoid ExpressionChangedAfterItHasBeenCheckedError
  if (isBrowser) {
    setTimeout(() => loadingState.next(true), 0);
  }

  return next(req).pipe(
    finalize(() => {
      if (isBrowser) {
        setTimeout(() => loadingState.next(false), 0);
      }
    }),
  );
};