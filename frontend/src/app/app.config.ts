import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions, withRouterConfig } from '@angular/router';
import { provideHttpClient, withInterceptors, withFetch } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideServiceWorker } from '@angular/service-worker';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { loadingInterceptor } from './core/interceptors/loading.interceptor';
import { tenantInterceptor } from './core/interceptors/tenant.interceptor';
import { environment } from '../environments/environment.development';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withRouterConfig({
        canceledNavigationResolution: 'computed',
      }),
      // 👈 اصلاح بخش ترنزیشن‌ها برای جلوگیری از ارور InvalidStateError
      withViewTransitions({
        skipInitialTransition: true,
        onViewTransitionCreated: ({ transition }) => {
          transition.ready.catch(() => {});
          transition.updateCallbackDone.catch(() => {});
          transition.finished.catch(() => {});
        },
      }),
    ),
    provideHttpClient(
      withFetch(),
      withInterceptors([
        authInterceptor,
        tenantInterceptor, // Add tenant ID to all requests
        errorInterceptor,
        loadingInterceptor,
      ]),
    ),
    provideAnimationsAsync(),
    provideStore(),
    provideEffects(),
    provideStoreDevtools({
      maxAge: 25,
      logOnly: environment.production,
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: environment.production,
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
