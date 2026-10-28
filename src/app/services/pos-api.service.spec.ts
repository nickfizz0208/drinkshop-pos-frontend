import { TestBed, fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PosApiService, API_TIMEOUT_MS, errorMessage } from './pos-api.service';

describe('POS API 與員工驗證', () => {
  let api: PosApiService; let http: HttpTestingController;
  beforeEach(() => { TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }); api = TestBed.inject(PosApiService); http = TestBed.inject(HttpTestingController); });
  afterEach(() => http.verify());
  it('登入呼叫員工身份 API，後續請求帶 Basic Auth，登出清除', async () => {
    const login = api.login('pos_cashier', 'test-only-password');
    const identity = http.expectOne('/api/auth/me'); expect(identity.request.headers.get('Authorization')).toBe('Basic ' + btoa('pos_cashier:test-only-password'));
    identity.flush({ staffId: 3, username: 'pos_cashier', name: '測試店員', level: 'STAFF' }); await login;
    const menu = api.menu(); const request = http.expectOne('/api/menu'); expect(request.request.headers.has('Authorization')).toBeTrue(); request.flush({ products: [], toppings: [] }); await menu;
    api.logout(); expect(api.staff()).toBeNull();
  });
  it('登入失敗不建立員工身份', async () => {
    const login = api.login('invalid', 'wrong'); const failed = expectAsync(login).toBeRejected();
    http.expectOne('/api/auth/me').flush({ message: '無效帳號' }, { status: 401, statusText: 'Unauthorized' }); await failed;
    expect(api.staff()).toBeNull();
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
