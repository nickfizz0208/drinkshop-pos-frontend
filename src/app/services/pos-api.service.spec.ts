import { TestBed, fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PosApiService, API_TIMEOUT_MS, AUTH_STORAGE_KEY, errorMessage } from './pos-api.service';
import { authInterceptor } from './auth.interceptor';

const FUTURE = new Date(Date.now() + 3600_000).toISOString();
const STAFF = { staffId: 3, username: 'pos_cashier', name: '測試店員', level: 'POS' };

describe('POS API 與員工驗證', () => {
  let api: PosApiService; let http: HttpTestingController;
  beforeEach(() => { sessionStorage.removeItem(AUTH_STORAGE_KEY); TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()] }); api = TestBed.inject(PosApiService); http = TestBed.inject(HttpTestingController); });
  afterEach(() => { http.verify(); sessionStorage.removeItem(AUTH_STORAGE_KEY); });
  it('登入用帳密換 token，後續請求帶 Bearer token，登出清除', async () => {
    const login = api.login('pos_cashier', 'test-only-password');
    const auth = http.expectOne('/api/auth/login');
    expect(auth.request.method).toBe('POST');
    expect(auth.request.body).toEqual({ username: 'pos_cashier', password: 'test-only-password' });
    auth.flush({ token: 'aaa.bbb.ccc', expiresAt: FUTURE, staff: STAFF }); await login;
    expect(api.staff()).toEqual(STAFF);
    const menu = api.menu(); const request = http.expectOne('/api/menu'); expect(request.request.headers.get('Authorization')).toBe('Bearer aaa.bbb.ccc'); request.flush({ products: [], toppings: [] }); await menu;
    // 只存 token 與員工資料，密碼不能出現在瀏覽器儲存空間
    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toContain('aaa.bbb.ccc');
    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).not.toContain('test-only-password');
    api.logout(); expect(api.staff()).toBeNull(); expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });
  it('登入失敗不建立員工身份', async () => {
    const login = api.login('invalid', 'wrong'); const failed = expectAsync(login).toBeRejected();
    http.expectOne('/api/auth/login').flush({ success: false, message: '帳號或密碼錯誤' }, { status: 401, statusText: 'Unauthorized' }); await failed;
    expect(api.staff()).toBeNull(); expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });
  it('重新整理後恢復未過期的登入，過期的不恢復', () => {
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: 'saved.token.x', expiresAt: FUTURE, staff: STAFF }));
    const restored = TestBed.runInInjectionContext(() => new PosApiService());
    expect(restored.staff()).toEqual(STAFF);
    expect(restored.authHeaders().get('Authorization')).toBe('Bearer saved.token.x');
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: 'old.token.x', expiresAt: '2020-01-01T00:00:00Z', staff: STAFF }));
    const expired = TestBed.runInInjectionContext(() => new PosApiService());
    expect(expired.staff()).toBeNull(); expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });
  it('token 失效（API 回 401）時自動登出', async () => {
    const login = api.login('pos_cashier', 'test-only-password');
    http.expectOne('/api/auth/login').flush({ token: 'aaa.bbb.ccc', expiresAt: FUTURE, staff: STAFF }); await login;
    const menu = api.menu(); const failed = expectAsync(menu).toBeRejected();
    http.expectOne('/api/menu').flush({ success: false, message: '請重新登入' }, { status: 401, statusText: 'Unauthorized' }); await failed;
    expect(api.staff()).toBeNull(); expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });
  it('查詢訂單帶營業日參數', async () => {
    const result = api.orders('2026-10-28'); const request = http.expectOne('/api/orders?date=2026-10-28'); expect(request.request.params.get('date')).toBe('2026-10-28'); request.flush([]); expect(await result).toEqual([]);
  });
  it('送單無回應時會在十五秒取消等待並回報逾時', fakeAsync(() => {
    let failure: unknown;
    api.create({ requestId: crypto.randomUUID(), source: 'TAKE_OUT', payment: 'CASH', receivedCash: 100, note: '', items: [] })
      .catch(error => { failure = error; });
    const request = http.expectOne('/api/orders');
    tick(API_TIMEOUT_MS); flushMicrotasks();
    expect(request.cancelled).toBeTrue();
    expect(errorMessage(failure)).toContain('逾時');
  }));
});
