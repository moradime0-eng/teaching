import { HttpInterceptorFn } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, defer, finalize } from 'rxjs';

export const loadingState = new BehaviorSubject<boolean>(false);

// Loading indicators are advisory, never a lock on the whole application.
// Forget a long-running indicator without cancelling its request (especially uploads).
const MAX_INDICATOR_MS = 15000;
let activeIndicators = 0;

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const browser = isPlatformBrowser(inject(PLATFORM_ID));
  if (!browser || ['/notifications', '/refresh-token', '/unread-summary'].some(path => req.url.includes(path))) {
    return next(req);
  }

  return defer(() => {
    let active = true;
    activeIndicators++;
    // Schedule updates to avoid changing a bound value during Angular's check.
    const publish = () => setTimeout(() => loadingState.next(activeIndicators > 0), 0);
    const release = () => {
      if (!active) return;
      active = false;
      activeIndicators--;
      publish();
    };
    publish();
    const timer = setTimeout(release, MAX_INDICATOR_MS);
    return next(req).pipe(finalize(() => {
      clearTimeout(timer);
      release();
    }));
  });
};
