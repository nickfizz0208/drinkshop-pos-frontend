import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { PosApiService } from './pos-api.service';

/**
 * 帶著 token 的請求被後端回 401（token 過期、被竄改、帳號已停用）時自動登出，
 * 畫面會由 AppComponent 偵測到登出並跳出登入視窗。登入請求本身的 401（帳密錯誤）不在此處理。
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const api = inject(PosApiService);
  return next(request).pipe(catchError((error: unknown) => {
    if (error instanceof HttpErrorResponse && error.status === 401
        && request.headers.get('Authorization')?.startsWith('Bearer ')) api.logout();
    return throwError(() => error);
  }));
};
