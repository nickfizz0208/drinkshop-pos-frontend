import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AppComponent } from './app.component';
import { OrdersComponent } from './features/orders/orders.component';
import { PosStateService } from './features/pos/pos-state.service';
import { OrdersStateService } from './features/orders/orders-state.service';
import { UiStateService } from './shared/ui-state.service';
import { PosApiService } from './services/pos-api.service';
import { PREVIEW_MENU, PREVIEW_RULES } from './services/preview-menu';
import { Order, Staff } from './models/pos';
import { TimeoutError } from 'rxjs';

const ORDER: Order = { order_id: 8, order_no: 'test', business_date: '2026-10-28', source: 'TAKE_OUT', payment: 'CASH', total: 25, status: 'PENDING', created_at: '2026-10-28T10:00:00', received_cash: 100, change_cash: 75, note: '', items: [] };

describe('POS 工作台', () => {
  let app: AppComponent;
  let pos: PosStateService;
  let orders: OrdersStateService;
  let ui: UiStateService;
  let api: jasmine.SpyObj<PosApiService>;
  const staff = signal<Staff | null>(null);
  beforeEach(async () => {
    sessionStorage.clear(); staff.set(null);
    api = jasmine.createSpyObj<PosApiService>('PosApiService', ['login', 'logout', 'menu', 'rules', 'orders', 'order', 'create', 'collect', 'status', 'statusAll', 'cancel', 'upload', 'photo', 'shiftToday', 'staffOptions', 'openShift', 'shift', 'closeShift', 'reopenShift'], { staff });
    api.menu.and.resolveTo(PREVIEW_MENU); api.rules.and.resolveTo(PREVIEW_RULES); api.orders.and.resolveTo([]);
    api.login.and.callFake(async () => { staff.set({ staffId: 3, username: 'test', name: '門市 POS', level: 'POS' }); });
    api.logout.and.callFake(() => staff.set(null));
    api.shiftToday.and.resolveTo({ businessDate: '2026-11-06', shiftStatus: 'OPEN', records: [], canViewAll: false });
    api.staffOptions.and.resolveTo([]); api.shift.and.resolveTo({ businessDate: '2026-11-06', status: 'OPEN', openedBy: 7, openedAt: '2026-11-06T09:05:00', closedBy: null, closedAt: null, pettyCash: 2000, expectedCash: null, countedCash: null, diffReason: null, revenueByPayment: null, cups: null, rolesJson: '[]' });
    await TestBed.configureTestingModule({ imports: [AppComponent], providers: [{ provide: PosApiService, useValue: api }] }).compileComponents();
    app = TestBed.createComponent(AppComponent).componentInstance;
    pos = TestBed.inject(PosStateService); orders = TestBed.inject(OrdersStateService); ui = TestBed.inject(UiStateService);
  });
  afterEach(() => sessionStorage.clear());
  function addTea(qty = 1): void { pos.openProduct(PREVIEW_MENU.products[0]); pos.selection.qty = qty; pos.addToCart(); }
  async function signIn(): Promise<void> { ui.username = 'test'; ui.password = 'example'; await app.login(); }

  it('回到點餐收銀會重新讀菜單：停售的飲品、加料馬上消失；讀不到就沿用原菜單', async () => {
    await signIn(); await app.switchView('store');
    const stopped = { products: PREVIEW_MENU.products.slice(1), toppings: [] };
    api.menu.and.resolveTo(stopped);
    await app.switchView('pos'); await Promise.resolve(); await Promise.resolve();
    expect(pos.menu).toBe(stopped);
    expect(pos.toppingsText([PREVIEW_MENU.toppings[0].topping_id])).toBe('（已停售的加料）');
    api.menu.and.rejectWith(new Error('offline'));
    await app.switchView('store'); await app.switchView('pos'); await Promise.resolve(); await Promise.resolve();
    expect(pos.menu).toBe(stopped); expect(ui.error).toBe('');
  });
  it('操作成功的提示幾秒後自動消失', () => {
    jasmine.clock().install();
    try {
      ui.notice = '已儲存停售設定。'; expect(ui.notice).toBe('已儲存停售設定。');
      jasmine.clock().tick(3900); expect(ui.notice).toBe('已儲存停售設定。');
      jasmine.clock().tick(200); expect(ui.notice).toBe('');
    } finally { jasmine.clock().uninstall(); }
  });
  it('沒有登入只顯示登入畫面，看不到工作台；登入後進入工作台，登出又回到登入畫面', async () => {
    const fixture = TestBed.createComponent(AppComponent); app = fixture.componentInstance; fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.login-screen')).not.toBeNull();
    expect(el.querySelector('.workspace')).toBeNull(); expect(el.querySelectorAll('.rail-link').length).toBe(0);
    expect(el.querySelector('app-pos')).toBeNull(); expect(api.orders).not.toHaveBeenCalled();
    const submit = el.querySelector('.login-submit') as HTMLButtonElement;
    expect(submit.disabled).toBeTrue();
    await signIn(); fixture.detectChanges();
    expect(el.querySelector('.login-screen')).toBeNull(); expect(el.querySelector('app-pos')).not.toBeNull();
    app.logout(); fixture.detectChanges();
    expect(el.querySelector('.login-screen')).not.toBeNull(); expect(el.querySelector('.workspace')).toBeNull();
  });
  it('登入失敗留在登入畫面並顯示原因', async () => {
    api.login.and.rejectWith(new HttpErrorResponse({ status: 401, error: { message: '帳號或密碼錯誤' } }));
    const fixture = TestBed.createComponent(AppComponent); app = fixture.componentInstance;
    await signIn(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.login-screen')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.login-card .alert.error')?.textContent).toBeTruthy();
  });
  it('個人帳號登入後直接進工時管理，不能切到點餐、訂單', async () => {
    api.login.and.callFake(async () => { staff.set({ staffId: 4, username: 'clerk', name: '一般員工', level: 'STAFF' }); });
    await signIn();
    expect(ui.view).toBe('time-tracker'); expect(app.counterAllowed).toBeFalse();
    await app.switchView('pos'); expect(ui.view).toBe('time-tracker');
    await app.switchView('orders'); expect(ui.view).toBe('time-tracker');
    expect(api.orders).not.toHaveBeenCalled();
  });
  it('POS 帳號未開班時鎖住功能，從上方工具列選開班人員開班後才能使用', async () => {
    api.shiftToday.and.resolveTo({ businessDate: '2026-11-06', shiftStatus: 'NONE', records: [], canViewAll: false });
    api.staffOptions.and.resolveTo([{ staffId: 7, name: '王小明', level: 'STAFF' }]);
    api.openShift.and.callFake(async () => {
      api.shiftToday.and.resolveTo({ businessDate: '2026-11-06', shiftStatus: 'OPEN', records: [], canViewAll: false });
      api.shift.and.resolveTo({ businessDate: '2026-11-06', status: 'OPEN', openedBy: 7, openedAt: '2026-11-06T09:05:00', closedBy: null, closedAt: null, pettyCash: 2000, expectedCash: null, countedCash: null, diffReason: null, revenueByPayment: null, cups: null, rolesJson: '[]' });
      return {};
    });
    const fixture = TestBed.createComponent(AppComponent); const page = fixture.componentInstance;
    ui.username = 'test'; ui.password = 'example'; await page.login(); fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(page.shiftLocked).toBeTrue();
    expect(el.querySelector('.shift-pill')?.textContent).toContain('未開班');
    expect(el.querySelector('.product-card')).toBeNull();
    const openButton = Array.from(el.querySelectorAll('.top-right button')).find(b => b.textContent?.trim() === '開班') as HTMLButtonElement;
    openButton.click(); fixture.detectChanges();
    expect(page.shiftModal).toBe('open');
    await page.openShift();
    expect(api.openShift).not.toHaveBeenCalled(); expect(page.shiftError).toBe('請選擇開班人員');
    page.openerId = 7; await page.openShift(); fixture.detectChanges();
    expect(api.openShift).toHaveBeenCalledWith({ businessDate: '2026-11-06', staffId: 7, pettyCash: 2000, rolesJson: '[]' });
    expect(page.shiftLocked).toBeFalse(); expect(page.shiftModal).toBeNull(); expect(ui.notice).toContain('王小明');
    expect(el.querySelector('.shift-pill')?.textContent?.trim()).toBe('營業中');
    expect(el.querySelector('.product-card')).not.toBeNull();
  });
  it('關班要選關班人員與清點現金，關班後顯示日結並鎖住功能', async () => {
    api.staffOptions.and.resolveTo([{ staffId: 7, name: '王小明', level: 'STAFF' }]);
    api.closeShift.and.callFake(async () => {
      api.shiftToday.and.resolveTo({ businessDate: '2026-11-06', shiftStatus: 'CLOSED', records: [], canViewAll: false });
      return { businessDate: '2026-11-06', status: 'CLOSED', pettyCash: 2000, totalRevenue: 500, totalWastageCost: 0, expectedCash: 2500, countedCash: 2450, diffAmount: -50, totalCups: 9, diffReason: null, costComplete: true, rawWastageEnabled: false };
    });
    await signIn();
    expect(app.shiftLocked).toBeFalse();
    app.openShiftModal('close');
    app.closerId = 7; await app.closeShift();
    expect(api.closeShift).not.toHaveBeenCalled(); expect(app.shiftError).toContain('清點的現金');
    app.countedCash = 2450; await app.closeShift();
    expect(api.closeShift).toHaveBeenCalledWith({ businessDate: '2026-11-06', staffId: 7, countedCash: 2450, diffReason: null });
    expect(app.closeSummary?.diffAmount).toBe(-50); expect(app.shiftModal).toBe('close');
    expect(app.shiftLocked).toBeTrue(); expect(app.shiftLabel).toBe('已關班');
    app.closeShiftModal(); expect(app.shiftModal).toBeNull();
  });
  it('本機還有送單結果待確認時，不能從工具列關班', async () => {
    api.staffOptions.and.resolveTo([{ staffId: 7, name: '王小明', level: 'STAFF' }]);
    await signIn();
    pos.pending = { requestId: 'x' } as never;
    app.openShiftModal('close'); app.closerId = 7; app.countedCash = 2000; await app.closeShift();
    expect(api.closeShift).not.toHaveBeenCalled(); expect(app.shiftError).toContain('待確認');
  });
  it('個人帳號不能切到日結與報廢', async () => {
    api.login.and.callFake(async () => { staff.set({ staffId: 4, username: 'clerk', name: '一般員工', level: 'STAFF' }); });
    await signIn();
    await app.switchView('store'); expect(ui.view).toBe('time-tracker');
  });
  it('開關班只鎖點餐與訂單，工時、排班、檢查表照常使用', async () => {
    api.shiftToday.and.resolveTo({ businessDate: '2026-11-06', shiftStatus: 'NONE', records: [], canViewAll: false });
    await signIn();
    expect(app.shiftLocked).toBeTrue();
    for (const view of ['time-tracker', 'schedule', 'checklist'] as const) { await app.switchView(view); expect(app.shiftLocked).toBeFalse(); }
    await app.switchView('orders'); expect(app.shiftLocked).toBeTrue(); expect(api.orders).not.toHaveBeenCalled();
  });
  it('關班後可以重新開班，接續營業', async () => {
    api.shiftToday.and.resolveTo({ businessDate: '2026-11-06', shiftStatus: 'CLOSED', records: [], canViewAll: false });
    api.reopenShift.and.callFake(async () => {
      api.shiftToday.and.resolveTo({ businessDate: '2026-11-06', shiftStatus: 'OPEN', records: [], canViewAll: false });
      return {};
    });
    await signIn();
    expect(app.shiftLocked).toBeTrue(); expect(app.shiftLabel).toBe('已關班');
    app.openShiftModal('reopen'); await app.reopenShift();
    expect(api.reopenShift).toHaveBeenCalledWith('2026-11-06');
    expect(app.shiftLocked).toBeFalse(); expect(app.shiftModal).toBeNull(); expect(ui.notice).toContain('重新開班');
  });
  it('登入後載入門市菜單，清除登入密碼與預覽購物車', async () => {
    addTea(); await signIn();
    expect(ui.preview).toBeFalse(); expect(ui.password).toBe(''); expect(pos.cart.length).toBe(0);
    expect(api.menu).toHaveBeenCalled();
  });
  it('點左上角品牌只回點餐頁，保留登入與購物車', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const page = fixture.componentInstance;
    ui.username = 'test'; ui.password = 'example'; await page.login();
    pos.openProduct(PREVIEW_MENU.products[0]); pos.selection.qty = 2; pos.addToCart();
    ui.view = 'orders'; fixture.detectChanges();
    const before = api.staff();
    const logo = fixture.nativeElement.querySelector('.brand-symbol') as HTMLButtonElement;
    expect(logo.getAttribute('href')).toBeNull();
    logo.click(); fixture.detectChanges();
    expect(ui.view).toBe('pos'); expect(ui.preview).toBeFalse();
    expect(api.staff()).toBe(before); expect(pos.cups).toBe(2);
    expect(api.logout).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.page-title')?.textContent).toContain('點餐收銀');
    expect(fixture.nativeElement.querySelector('app-pos')).not.toBeNull();
  });
  it('相同規格可合併多杯，包含加料計價並能修改杯數', () => {
    pos.openProduct(PREVIEW_MENU.products[0]); pos.toggleTopping(1); pos.selection.qty = 2; pos.addToCart();
    pos.openProduct(PREVIEW_MENU.products[0]); pos.toggleTopping(1); pos.addToCart();
    expect(pos.cart.length).toBe(1); expect(pos.cups).toBe(3); expect(pos.totalCents).toBe(10500);
    pos.quantity(pos.cart[0], -1); expect(pos.totalCents).toBe(7000);
  });
  it('茶凍切換熱飲會自動退選並顯示原因', () => {
    pos.openProduct(PREVIEW_MENU.products[0]); pos.toggleTopping(2); pos.choose('temperature', 'HOT');
    expect(pos.selection.toppingIds).toEqual([]); expect(pos.selection.ice).toBe('NONE');
    expect(pos.adjustment).toContain('已移除'); expect(pos.toppingReason(2)).toContain('溫熱飲');
  });
  it('現金不足不送出訂單', async () => {
    await signIn(); addTea(); pos.received = 1; await pos.checkout();
    expect(api.create).not.toHaveBeenCalled(); expect(ui.modalError).toContain('足夠');
  });
  it('送單不含前端單價，成功後顯示後端結果並清空購物車', async () => {
    await signIn(); addTea(); pos.received = 100; api.create.and.resolveTo(ORDER); await pos.checkout();
    const sent = api.create.calls.mostRecent().args[0];
    expect(Object.keys(sent.items[0])).not.toContain('unitPrice');
    expect(pos.cart).toEqual([]); expect(pos.lastOrder?.change_cash).toBe(75); expect(pos.pending).toBeNull();
  });
  it('連線失敗保留同一個 requestId，重試不重建送單內容', async () => {
    await signIn(); addTea(); pos.received = 100;
    api.create.and.rejectWith(new HttpErrorResponse({ status: 0 })); await pos.checkout();
    const first = api.create.calls.mostRecent().args[0];
    expect(pos.pending?.requestId).toBe(first.requestId); expect(pos.cart.length).toBe(1);
    pos.quantity(pos.cart[0], 1); expect(pos.cups).toBe(1);
    api.create.and.resolveTo(ORDER); await pos.checkout();
    expect(api.create.calls.mostRecent().args[0]).toEqual(first);
    expect(sessionStorage.getItem('qingri.pending.3')).toBeNull();
  });
  it('同一員工重新登入可恢復待確認訂單', async () => {
    await signIn(); addTea(); pos.received = 100;
    api.create.and.rejectWith(new HttpErrorResponse({ status: 0 })); await pos.checkout();
    const id = pos.pending?.requestId; app.logout(); expect(pos.cart).toEqual([]);
    await signIn(); expect(pos.pending?.requestId).toBe(id); expect(pos.cart.length).toBe(1);
  });
  it('後端明確拒絕庫存時，保留購物車並允許調整', async () => {
    await signIn(); addTea(); pos.received = 100;
    api.create.and.rejectWith(new HttpErrorResponse({ status: 409, error: { message: '庫存不足' } })); await pos.checkout();
    expect(pos.pending).toBeNull(); expect(pos.cart.length).toBe(1); expect(ui.modalError).toBe('庫存不足');
  });
  it('未確認人工退款時，不送出取消操作', async () => {
    const line = { item_id: 1, product_name: '紅茶', size: 'M', temperature: 'COLD', sugar: 'HALF', ice: 'LESS', qty: 2, unit_price: 25, status: 'PENDING', note: null, reason: null, approved_by: null, photo_url: null, toppings: [] } as const;
    orders.selectedOrder = { ...ORDER, items: [{ ...line, toppings: [] }] }; orders.openCancel(orders.selectedOrder.items[0]);
    orders.cancelReason = '取消'; await orders.confirmCancel(); expect(api.cancel).not.toHaveBeenCalled();
  });
  it('付款方式只有三種，Uber Eats 仍可作為訂單來源', () => {
    expect(pos.paymentOptions).toEqual(['CASH', 'CREDIT_CARD', 'LINE_PAY']);
    expect(pos.sources.UBER_EATS).toBe('Uber Eats');
  });
  it('送單逾時解除忙碌狀態，保留內容供重試且不重複建單', async () => {
    await signIn(); addTea(); pos.received = 100; pos.checkoutOpen = true;
    api.create.and.rejectWith(new TimeoutError()); await pos.checkout();
    const original = api.create.calls.mostRecent().args[0];
    expect(ui.busy).toBeFalse(); expect(pos.checkoutOpen).toBeTrue(); expect(ui.modalError).toContain('逾時');
    expect(pos.cart.length).toBe(1);
    api.create.and.resolveTo(ORDER); await pos.checkout();
    expect(api.create.calls.mostRecent().args[0]).toEqual(original);
    expect(pos.cart).toEqual([]);
  });
  function prepareCancel(): void {
    orders.selectedOrder = { ...ORDER, items: [{ item_id: 1, product_name: '紅茶', size: 'M', temperature: 'COLD', sugar: 'HALF', ice: 'LESS', qty: 1, unit_price: 25, status: 'PENDING', note: null, reason: null, approved_by: null, photo_url: null, toppings: [] }] };
    orders.openCancel(orders.selectedOrder.items[0]); orders.refundConfirmed = true;
    api.cancel.and.resolveTo({ ...ORDER, status: 'CANCELLED' });
  }
  it('已製作品項不需店長帳號或 PIN，保留原因與退款確認', async () => {
    prepareCancel(); orders.selectedOrder!.items[0].status = 'MAKING';
    orders.openCancel(orders.selectedOrder!.items[0]); orders.cancelReasonChoice = '顧客未取餐'; orders.wantsRefund = false;
    await orders.confirmCancel();
    expect(api.cancel.calls.mostRecent().args[2]).toEqual({ reason: '顧客未取餐', refundAmount: 0 });
  });
  it('待處理與待取餐依整單狀態篩選，當日紀錄保留所有狀態並顯示筆數', () => {
    const fixture = TestBed.createComponent(AppComponent); const page = fixture.componentInstance;
    ui.preview = false; ui.view = 'orders';
    orders.orderList = ['PENDING', 'MAKING', 'DONE', 'PICKED_UP', 'CANCELLED'].map((status, i) => ({ ...ORDER, order_id: i + 1, status }));
    fixture.detectChanges();
    expect(orders.visibleOrders.map(o => o.status)).toEqual(['PENDING', 'MAKING']);
    expect(orders.orderCount('active')).toBe(2); expect(orders.orderCount('ready')).toBe(1); expect(orders.orderCount('history')).toBe(5);
    expect(fixture.nativeElement.querySelectorAll('.order-row').length).toBe(2);
    const tabs = fixture.nativeElement.querySelectorAll('.order-tabs button') as NodeListOf<HTMLButtonElement>;
    tabs[1].click(); fixture.detectChanges(); expect(orders.visibleOrders[0].status).toBe('DONE');
    expect(tabs[1].getAttribute('aria-pressed')).toBe('true');
    tabs[2].click(); fixture.detectChanges(); expect(fixture.nativeElement.querySelectorAll('.order-row').length).toBe(5);
  });
  it('完成製作及取餐會移出目前頁籤並清空明細，紀錄仍存在', async () => {
    await signIn(); const ready: Order = { ...ORDER, status: 'DONE' };
    orders.selectedOrder = ORDER; orders.orderList = [ORDER]; api.statusAll.and.resolveTo(ready); api.orders.and.resolveTo([ready]);
    await orders.advanceAll('DONE');
    expect(orders.visibleOrders.length).toBe(0); expect(orders.selectedOrder).toBeNull(); expect(ui.notice).toContain('待取餐');
    orders.selectOrderTab('ready'); expect(orders.visibleOrders.length).toBe(1);
    orders.selectedOrder = ready; const picked: Order = { ...ready, status: 'PICKED_UP' };
    api.statusAll.and.resolveTo(picked); api.orders.and.resolveTo([picked]); await orders.advanceAll('PICKED_UP');
    expect(orders.visibleOrders.length).toBe(0); expect(orders.selectedOrder).toBeNull(); expect(ui.notice).toContain('當日紀錄');
    orders.selectOrderTab('history'); expect(orders.visibleOrders[0].order_id).toBe(8);
  });
  it('部分取消仍留在工作列表，整張取消才移至紀錄', async () => {
    await signIn(); prepareCancel();
    orders.cancelReason = '配料不足';
    const partial: Order = { ...orders.selectedOrder!, status: 'PENDING' };
    api.cancel.and.resolveTo(partial); api.orders.and.resolveTo([partial]); await orders.confirmCancel();
    expect(orders.visibleOrders.length).toBe(1); expect(orders.selectedOrder?.order_id).toBe(8);
    orders.openCancel(null); orders.cancelReason = '顧客取消'; orders.refundConfirmed = true;
    const cancelled: Order = { ...partial, status: 'CANCELLED' };
    api.cancel.and.resolveTo(cancelled); api.orders.and.resolveTo([cancelled]); await orders.confirmCancel();
    expect(orders.visibleOrders.length).toBe(0); expect(orders.selectedOrder).toBeNull();
    orders.selectOrderTab('history'); expect(orders.visibleOrders[0].status).toBe('CANCELLED');
  });
  it('切換營業日及查看剛建立的訂單會進入完整紀錄', async () => {
    await signIn(); orders.selectedOrder = ORDER; orders.orderDate = '2026-10-27'; orders.changeOrderDate();
    expect(orders.orderTab).toBe('history'); expect(orders.selectedOrder).toBeNull(); expect(api.orders).toHaveBeenCalledWith('2026-10-27');
    orders.orderTab = 'active'; pos.lastOrder = { ...ORDER, status: 'PICKED_UP' };
    api.order.and.resolveTo(pos.lastOrder); api.orders.and.resolveTo([pos.lastOrder]);
    await pos.showLastOrder(); expect(orders.orderTab).toBe('history'); expect(orders.selectedOrder?.order_id).toBe(8);
  });
  it('整單取餐需全部完成且已收款，允許部分已取餐與已取消', () => {
    prepareCancel(); const line = orders.selectedOrder!.items[0];
    const order: Order = { ...ORDER, payment_status: 'PAID', items: [{ ...line, status: 'DONE' }, { ...line, item_id: 2, status: 'CANCELLED' }, { ...line, item_id: 3, status: 'PICKED_UP' }] };
    expect(orders.canPickUpAll(order)).toBeTrue();
    expect(orders.canPickUpAll({ ...order, payment_status: 'UNPAID' })).toBeFalse();
    for (const status of ['PENDING', 'MAKING'] as const) expect(orders.canPickUpAll({ ...order, items: [...order.items, { ...line, status }] })).toBeFalse();
    expect(orders.canPickUpAll({ ...order, items: [{ ...line, status: 'CANCELLED' }] })).toBeFalse();
  });
  it('整單操作使用單次後端批次 API，失敗後解除忙碌狀態', async () => {
    prepareCancel(); api.statusAll.and.resolveTo({ ...orders.selectedOrder!, status: 'MAKING' });
    await orders.advanceAll('MAKING'); expect(api.statusAll).toHaveBeenCalledWith(8, 'MAKING'); expect(api.status).not.toHaveBeenCalled();
    expect(orders.selectedOrder?.status).toBe('MAKING');
    api.statusAll.and.rejectWith(new HttpErrorResponse({ status: 409, error: { message: '還有飲品尚未完成' } }));
    await orders.advanceAll('PICKED_UP'); expect(ui.error).toContain('尚未完成'); expect(ui.busy).toBeFalse();
  });
  it('稍後收款可不填現金，送出未付款且沒有付款方式', async () => {
    await signIn(); addTea(); pos.unpaid = true; api.create.and.resolveTo({ ...ORDER, payment: null, payment_status: 'UNPAID', paid_amount: 0 });
    await pos.checkout();
    const sent = api.create.calls.mostRecent().args[0];
    expect(sent.unpaid).toBeTrue(); expect(sent.payment).toBeNull(); expect(sent.receivedCash).toBeUndefined();
  });
  it('未付款取消不需退款勾選，明確傳送退款零元', async () => {
    prepareCancel(); orders.selectedOrder = { ...orders.selectedOrder!, payment: null, payment_status: 'UNPAID', paid_amount: 0 };
    orders.openCancel(orders.selectedOrder.items[0]); orders.cancelReasonChoice = '顧客未取餐';
    expect(orders.refundNeedsConfirmation).toBeFalse(); expect(orders.refundAmount).toBe(0);
    await orders.confirmCancel(); expect(api.cancel.calls.mostRecent().args[2].refundAmount).toBe(0);
  });
  it('已付款可以不退款，或限制退款金額與要求人工退款確認', async () => {
    prepareCancel(); orders.wantsRefund = false; orders.refundConfirmed = false; orders.cancelReason = '顧客未取餐';
    await orders.confirmCancel(); expect(api.cancel.calls.mostRecent().args[2].refundAmount).toBe(0);
    api.cancel.calls.reset(); prepareCancel(); orders.cancelReason = '顧客取消'; orders.refundInput = 26;
    await orders.confirmCancel(); expect(api.cancel).not.toHaveBeenCalled(); expect(ui.modalError).toContain('上限');
    orders.refundInput = 10.25; orders.refundConfirmed = false; await orders.confirmCancel(); expect(api.cancel).not.toHaveBeenCalled();
    orders.refundConfirmed = true; await orders.confirmCancel(); expect(api.cancel.calls.mostRecent().args[2].refundAmount).toBe(10.25);
  });
  it('取消視窗不再顯示原料損耗估算（飲品不計原料成本）', async () => {
    prepareCancel(); const view = TestBed.createComponent(OrdersComponent); view.detectChanges(); await view.whenStable(); view.detectChanges();
    expect(view.nativeElement.textContent).toContain('不計原料成本');
    expect(view.nativeElement.textContent).not.toContain('原料損耗估算');
  });
  it('稍後收款會使用原訂單編號並更新詳情', async () => {
    const unpaid: Order = { ...ORDER, payment_status: 'UNPAID', payment: null, paid_amount: 0 };
    api.collect.and.resolveTo({ ...ORDER, payment_status: 'PAID', paid_amount: 25 });
    orders.openCollect(unpaid); orders.received = 100; await orders.confirmCollect();
    expect(api.collect).toHaveBeenCalledWith(8, 'CASH', 100); expect(orders.collecting).toBeNull(); expect(orders.selectedOrder?.payment_status).toBe('PAID');
  });
  it('常用原因可以單獨使用或加上補充說明，重新開啟會清空選項', async () => {
    prepareCancel(); orders.cancelReasonChoice = '配料不足'; orders.cancelReason = ' 珍珠售完 ';
    await orders.confirmCancel(); expect(api.cancel.calls.mostRecent().args[2].reason).toBe('配料不足：珍珠售完');
    prepareCancel(); expect(orders.cancelReasonChoice).toBe(''); expect(orders.cancelReason).toBe('');
    orders.cancelReasonChoice = '茶湯不足（茶沒了）'; await orders.confirmCancel();
    expect(api.cancel.calls.mostRecent().args[2].reason).toBe('茶湯不足（茶沒了）');
  });
  it('不選常用原因也能直接手填', async () => {
    prepareCancel(); orders.cancelReason = ' 冰箱故障 ';
    await orders.confirmCancel(); expect(api.cancel.calls.mostRecent().args[2].reason).toBe('冰箱故障');
  });
  it('其他原因必須填寫內容，不能只存其他兩字', async () => {
    prepareCancel(); orders.cancelReasonChoice = '其他'; orders.cancelReason = ' ';
    await orders.confirmCancel(); expect(api.cancel).not.toHaveBeenCalled();
    orders.cancelReason = '封膜破裂'; await orders.confirmCancel();
    expect(api.cancel.calls.mostRecent().args[2].reason).toBe('封膜破裂');
  });
  it('切換原因後合計超過欄位長度時不送出', async () => {
    prepareCancel(); orders.cancelReason = '字'.repeat(255); orders.cancelReasonChoice = '配料不足';
    await orders.confirmCancel(); expect(api.cancel).not.toHaveBeenCalled(); expect(ui.modalError).toContain('255');
  });

  it('@switch 銷毀點餐頁後，回來仍保留購物車、會員與配送位置', async () => {
    const fixture = TestBed.createComponent(AppComponent); app = fixture.componentInstance;
    await signIn(); fixture.detectChanges();
    pos.onMemberSelected({ member: { name: '測試會員', phone: '0912345678' }, delivery: { lat: 25, lng: 121, distanceM: 1200 } });
    const card = fixture.nativeElement.querySelector('.product-card') as HTMLButtonElement;
    card.click(); fixture.detectChanges();
    const add = fixture.nativeElement.querySelector('.modal-footer .button.primary') as HTMLButtonElement;
    add.click(); fixture.detectChanges();
    expect(pos.cups).toBe(1);
    await app.switchView('orders'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-pos')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-orders')).not.toBeNull();
    await app.switchView('pos'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.cart-line').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.member-card').textContent).toContain('測試會員');
    expect(pos.delivery?.distanceM).toBe(1200);
  });

  it('切頁保留固定 pending，回點餐按繼續確認會顯示結帳並重試相同內容', async () => {
    const fixture = TestBed.createComponent(AppComponent); app = fixture.componentInstance;
    await signIn(); addTea(); pos.received = 100;
    api.create.and.rejectWith(new HttpErrorResponse({ status: 0 })); await pos.checkout();
    const original = api.create.calls.mostRecent().args[0];
    fixture.detectChanges();
    await app.switchView('orders'); fixture.detectChanges();
    expect(pos.checkoutOpen).toBeFalse();
    expect(fixture.nativeElement.querySelector('app-pos')).toBeNull();
    await app.switchView('pos'); fixture.detectChanges();
    const resume = fixture.nativeElement.querySelector('app-pos .alert.warning .text-button') as HTMLButtonElement;
    resume.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog[aria-label="確認這一單。"]')).not.toBeNull();
    expect(pos.pending).toEqual(original);
    api.create.and.resolveTo(ORDER); await pos.checkout();
    expect(api.create.calls.mostRecent().args[0]).toEqual(original);
  });

  it('共用 busy 同時鎖住主選單、直接切頁與購物車修改', async () => {
    await signIn(); addTea(); const fixture = TestBed.createComponent(AppComponent); fixture.detectChanges();
    ui.busy = true; fixture.detectChanges();
    const menu = fixture.nativeElement.querySelectorAll('.rail-link') as NodeListOf<HTMLButtonElement>;
    expect(menu[0].disabled).toBeTrue(); expect(menu[1].disabled).toBeTrue();
    await app.switchView('orders'); pos.quantity(pos.cart[0], 1);
    expect(ui.view).toBe('pos'); expect(pos.cups).toBe(1);
  });

  it('查看新訂單走統一導航，回點餐不復活客製或結帳彈窗', async () => {
    const fixture = TestBed.createComponent(AppComponent); app = fixture.componentInstance;
    await signIn(); fixture.detectChanges();
    pos.lastOrder = ORDER; pos.openProduct(PREVIEW_MENU.products[0]);
    orders.orderTab = 'history'; api.order.and.resolveTo(ORDER); api.orders.and.resolveTo([ORDER]);
    await pos.showLastOrder(); fixture.detectChanges();
    expect(ui.view).toBe('orders');
    expect(fixture.nativeElement.querySelector('.detail-heading').textContent).toContain('#8');
    await app.switchView('pos'); fixture.detectChanges();
    expect(pos.product).toBeNull(); expect(pos.checkoutOpen).toBeFalse();
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
  });

  it('點餐結帳與既有訂單補收款不互相覆寫付款表單', () => {
    pos.payment = 'LINE_PAY'; pos.received = 250;
    orders.openCollect({ ...ORDER, payment: null, payment_status: 'UNPAID' });
    expect(orders.payment).toBe('CASH'); expect(orders.received).toBeNull();
    expect(pos.payment).toBe('LINE_PAY'); expect(pos.received).toBe(250);
  });

  it('離開訂單頁釋放照片，尚在解碼的選檔不會重新建立預覽', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    ui.preview = false; ui.view = 'orders'; fixture.detectChanges();
    prepareCancel(); orders.cancelTarget = null; orders.photoItem = orders.selectedOrder!.items[0];
    orders.photoUrl = 'blob:old-preview';
    const revoke = spyOn(URL, 'revokeObjectURL'); const create = spyOn(URL, 'createObjectURL');
    let resolveBitmap!: (bitmap: ImageBitmap) => void;
    spyOn(window, 'createImageBitmap').and.returnValue(new Promise<ImageBitmap>(resolve => resolveBitmap = resolve));
    const input = document.createElement('input'); input.type = 'file';
    Object.defineProperty(input, 'files', { value: [new File(['photo'], 'test.png', { type: 'image/png' })] });
    const decoding = orders.choosePhoto({ target: input } as unknown as Event);
    await app.switchView('pos'); fixture.detectChanges();
    resolveBitmap({ width: 10, height: 10, close: () => {} } as ImageBitmap); await decoding;
    expect(revoke).toHaveBeenCalledWith('blob:old-preview');
    expect(create).not.toHaveBeenCalled(); expect(orders.photoItem).toBeNull(); expect(orders.photoUrl).toBe('');
  });

  it('登出使較晚回來的訂單列表失效，並清除所有彈窗與會員資料', async () => {
    await signIn();
    let resolveRows!: (rows: Order[]) => void;
    api.orders.and.returnValue(new Promise<Order[]>(resolve => resolveRows = resolve));
    const loading = orders.loadOrders();
    pos.memberPickerOpen = true; pos.checkoutOpen = true; pos.openProduct(PREVIEW_MENU.products[0]);
    orders.openCollect(ORDER); app.logout(); resolveRows([ORDER]); await loading;
    expect(orders.orderList).toEqual([]); expect(orders.orderLoading).toBeFalse();
    expect(pos.memberPickerOpen).toBeFalse(); expect(pos.checkoutOpen).toBeFalse(); expect(pos.product).toBeNull();
    expect(orders.collecting).toBeNull(); expect(ui.preview).toBeTrue(); expect(ui.password).toBe('');
  });
  it('登入中 token 失效（被登出）時回到預覽並要求重新登入', async () => {
    const fixture = TestBed.createComponent(AppComponent); const page = fixture.componentInstance;
    ui.username = 'test'; ui.password = 'example'; await page.login(); fixture.detectChanges();
    expect(ui.preview).toBeFalse();
    staff.set(null); fixture.detectChanges();   // 模擬 auth.interceptor 收到 401 後登出
    expect(ui.preview).toBeTrue(); expect(ui.loginOpen).toBeTrue(); expect(ui.modalError).toContain('重新登入');
  });
  it('重新整理後還有登入資料就直接恢復，不用重新輸入密碼', async () => {
    staff.set({ staffId: 3, username: 'test', name: '門市 POS', level: 'POS' });
    const fixture = TestBed.createComponent(AppComponent); const page = fixture.componentInstance;
    await fixture.whenStable();
    expect(api.login).not.toHaveBeenCalled(); expect(api.menu).toHaveBeenCalled();
    expect(ui.preview).toBeFalse(); expect(ui.loginOpen).toBeFalse();
  });
});
