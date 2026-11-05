import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AppComponent } from './app.component';
import { PosStateService } from './features/pos/pos-state.service';
import { OrdersStateService } from './features/orders/orders-state.service';
import { UiStateService } from './shared/ui-state.service';
import { PosApiService } from './services/pos-api.service';
import { PREVIEW_MENU, PREVIEW_RULES } from './services/preview-menu';
import { Order, Staff } from './models/pos';

describe('會員外送送單與登出回歸測試', () => {
  let app: AppComponent;
  let pos: PosStateService;
  let orders: OrdersStateService;
  let ui: UiStateService;
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
    pos = TestBed.inject(PosStateService); orders = TestBed.inject(OrdersStateService); ui = TestBed.inject(UiStateService);
    ui.username = 'review'; ui.password = 'review'; await app.login();
    pos.onMemberSelected({ member: { phone: '0912345678', name: 'review member' }, delivery: { lat: 25, lng: 121, distanceM: 1200, addressNote: 'review address' } });
  });
  afterEach(() => sessionStorage.clear());
  function addTea(): void { pos.openProduct(PREVIEW_MENU.products[0]); pos.addToCart(); pos.payment = 'LINE_PAY'; }
  it('成功送單後清除已選會員與外送資料', async () => {
    addTea(); await pos.checkout();
    expect(api.create.calls.mostRecent().args[0].memberPhone).toBe('0912345678');
    expect(pos.member).toBeNull(); expect(pos.delivery).toBeNull();
  });
  it('登出同時關閉會員選擇彈窗', () => {
    pos.memberPickerOpen = true; app.logout();
    expect(pos.member).toBeNull(); expect(pos.delivery).toBeNull(); expect(pos.memberPickerOpen).toBeFalse();
  });
  it('庫存不足保留購物車時也保留外送會員，修正後仍送同一位會員', async () => {
    addTea(); api.create.and.rejectWith(new HttpErrorResponse({ status: 409, error: { message: '庫存不足' } }));
    await pos.checkout();
    expect(pos.cart.length).toBe(1); expect(pos.pending).toBeNull();
    expect(pos.source).toBe('PHONE_DELIVERY'); expect(pos.member?.phone).toBe('0912345678');
    expect(pos.delivery?.distanceM).toBe(1200); expect(pos.delivery?.addressNote).toBe('review address');
    api.create.and.resolveTo({ order_id: 100, items: [] } as unknown as Order);
    await pos.checkout();
    expect(api.create.calls.mostRecent().args[0].source).toBe('PHONE_DELIVERY');
    expect(api.create.calls.mostRecent().args[0].memberPhone).toBe('0912345678');
    expect(api.create.calls.mostRecent().args[0].distance).toBe(1200);
    expect(api.create.calls.mostRecent().args[0].addressNote).toBe('review address');
  });
  it('斷線重登入後保留原請求與配送資料，重送不換 requestId', async () => {
    addTea(); api.create.and.rejectWith(new HttpErrorResponse({ status: 0 }));
    await pos.checkout();
    const original = api.create.calls.mostRecent().args[0];
    app.logout(); ui.password = 'review'; await app.login();
    expect(pos.source).toBe('PHONE_DELIVERY'); expect(pos.member?.phone).toBe('0912345678');
    expect(pos.delivery?.distanceM).toBe(1200); expect(pos.cart.length).toBe(1);
    api.create.and.resolveTo({ order_id: 100, items: [] } as unknown as Order);
    await pos.checkout();
    expect(api.create.calls.mostRecent().args[0]).toEqual(original);
    expect(pos.member).toBeNull(); expect(pos.delivery).toBeNull();
  });
});
