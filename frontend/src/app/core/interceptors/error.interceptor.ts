import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse,
} from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

export const errorInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorMessage = 'خطای نامشخص رخ داده است';

      if (error.error?.message) {
        errorMessage = error.error.message;
      } else if (error.status === 0) {
        errorMessage = 'اتصال به سرور برقرار نشد. لطفاً اینترنت خود را بررسی کنید.';
      } else if (error.status === 403) {
        errorMessage = 'شما دسترسی لازم برای انجام این عملیات را ندارید.';
      } else if (error.status === 404) {
        errorMessage = 'مورد درخواستی یافت نشد.';
      } else if (error.status === 409) {
        errorMessage = error.error?.message || 'این مورد قبلاً ثبت شده است.';
      } else if (error.status === 429) {
        errorMessage = 'تعداد درخواست‌ها بیش از حد مجاز است. لطفاً صبر کنید.';
      } else if (error.status >= 500) {
        errorMessage = 'خطای داخلی سرور. لطفاً بعداً تلاش کنید.';
      }

      console.error(`[HTTP Error ${error.status}]:`, errorMessage);

      return throwError(() => ({
        status: error.status,
        message: errorMessage,
        errors: error.error?.errors,
      }));
    }),
  );
};
