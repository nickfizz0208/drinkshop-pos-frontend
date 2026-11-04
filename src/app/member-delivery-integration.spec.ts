import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AppComponent } from './app.component';
import { PosApiService } from './services/pos-api.service';
import { PREVIEW_MENU, PREVIEW_RULES } from './services/preview-menu';
import { Order, Staff } from './models/pos';

describe('會員外送送單與登出回歸測試', () => {
  let app: AppComponent;
  let api: jasmine.SpyObj<PosApiService>;
  const staff = signal<Staff | null>(null);
  beforeEach(async () => {
    sessionStorage.clear(); staff.set(null);
    api = jasmine.createSpyObj<PosApiService>('PosApiService', ['login', 'logout', 'menu', 'rules', 'create', 'orders'], { staff });
    api.login.and.callFake(async () => { staff.set({ staffId: 1, username: 'review', name: 'review', level: 'STAFF' }); });
    api.logout.and.callFake(() => staff.set(null));
    api.menu.and.resolveTo(PREVIEW_MENU); api.rules.and.resolveTo(PREVIEW_RULES); api.orders.and.resolveTo([]);
    api.create.and.resolveTo({ order_id: 99, business_date: '2026-11-04', items: [] } as unknown as Order);
    await TestBed.configureTestingModule({ imports: [AppComponent], providers: [{ provide: PosApiService, useValue: api }] }).compileComponents();
    app = TestBed.createComponent(AppComponent).componentInstance;
    app.username = 'review'; app.password = 'review'; await app.login();
    app.onMemberSelected({ member: { phone: '0912345678', name: 'review member' }, delivery: { lat: 25, lng: 121, distanceM: 1200, addressNote: 'review address' } });
  });
  afterEach(() => sessionStorage.clear());
  function addTea(): void { app.openProduct(PREVIEW_MENU.products[0]); app.addToCart(); app.payment = 'LINE_PAY'; }
  it('成功送單後清除已選會員與外送資料', async () => {
    addTea(); await app.checkout();
    expect(api.create.calls.mostRecent().args[0].memberPhone).toBe('0912345678');
    expect(app.member).toBeNull(); expect(app.delivery).toBeNull();
  });
  it('登出同時關閉會員選擇彈窗', () => {
    app.memberPickerOpen = true; app.logout();
    expect(app.member).toBeNull(); expect(app.delivery).toBeNull(); expect(app.memberPickerOpen).toBeFalse();
  });
  it('庫存不足保留購物車時也保留外送會員，修正後仍送同一位會員', async () => {
    addTea(); api.create.and.rejectWith(new HttpErrorResponse({ status: 409, error: { message: '庫存不足' } }));
    await app.checkout();
    expect(app.cart.length).toBe(1); expect(app.pending).toBeNull();
    expect(app.source).toBe('PHONE_DELIVERY'); expect(app.member?.phone).toBe('0912345678');
    expect(app.delivery?.distanceM).toBe(1200); expect(app.delivery?.addressNote).toBe('review address');
    api.create.and.resolveTo({ order_id: 100, items: [] } as unknown as Order);
    await app.checkout();
    expect(api.create.calls.mostRecent().args[0].source).toBe('PHONE_DELIVERY');
    expect(api.create.calls.mostRecent().args[0].memberPhone).toBe('0912345678');
    expect(api.create.calls.mostRecent().args[0].distance).toBe(1200);
    expect(api.create.calls.mostRecent().args[0].addressNote).toBe('review address');
  });
  it('斷線重登入後保留原請求與配送資料，重送不換 requestId', async () => {
    addTea(); api.create.and.rejectWith(new HttpErrorResponse({ status: 0 }));
    await app.checkout();
    const original = api.create.calls.mostRecent().args[0];
    app.logout(); app.password = 'review'; await app.login();
    expect(app.source).toBe('PHONE_DELIVERY'); expect(app.member?.phone).toBe('0912345678');
    expect(app.delivery?.distanceM).toBe(1200); expect(app.cart.length).toBe(1);
    api.create.and.resolveTo({ order_id: 100, items: [] } as unknown as Order);
    await app.checkout();
    expect(api.create.calls.mostRecent().args[0]).toEqual(original);
    expect(app.member).toBeNull(); expect(app.delivery).toBeNull();
  });
});
