import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AppComponent } from './app.component';
import { PosApiService } from './services/pos-api.service';
import { PREVIEW_MENU, PREVIEW_RULES } from './services/preview-menu';
import { Order, Staff } from './models/pos';
import { TimeoutError } from 'rxjs';

const ORDER: Order = { order_id: 8, order_no: 'test', business_date: '2026-10-28', source: 'TAKE_OUT', payment: 'CASH', total: 25, status: 'PENDING', created_at: '2026-10-28T10:00:00', received_cash: 100, change_cash: 75, note: '', items: [] };

describe('POS 工作台', () => {
  let app: AppComponent;
  let api: jasmine.SpyObj<PosApiService>;
  const staff = signal<Staff | null>(null);
  beforeEach(async () => {
    sessionStorage.clear(); staff.set(null);
    api = jasmine.createSpyObj<PosApiService>('PosApiService', ['login', 'logout', 'menu', 'rules', 'orders', 'order', 'create', 'collect', 'status', 'statusAll', 'cancel', 'upload', 'photo'], { staff });
    api.menu.and.resolveTo(PREVIEW_MENU); api.rules.and.resolveTo(PREVIEW_RULES); api.orders.and.resolveTo([]);
    api.login.and.callFake(async () => { staff.set({ staffId: 3, username: 'test', name: '測試員工', level: 'STAFF' }); });
    api.logout.and.callFake(() => staff.set(null));
    await TestBed.configureTestingModule({ imports: [AppComponent], providers: [{ provide: PosApiService, useValue: api }] }).compileComponents();
    app = TestBed.createComponent(AppComponent).componentInstance;
  });
  afterEach(() => sessionStorage.clear());
  function addTea(qty = 1): void { app.openProduct(PREVIEW_MENU.products[0]); app.selection.qty = qty; app.addToCart(); }
  async function signIn(): Promise<void> { app.username = 'test'; app.password = 'example'; await app.login(); }

  it('預覽會標示範例內容，而且不呼叫訂單 API', async () => {
    addTea(); app.openCheckout();
    expect(app.preview).toBeTrue(); expect(app.loginOpen).toBeTrue(); expect(api.create).not.toHaveBeenCalled();
    const fixture = TestBed.createComponent(AppComponent); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('介面預覽');
    expect(fixture.nativeElement.querySelectorAll('.product-card').length).toBe(5);
  });
  it('登入後載入門市菜單，清除登入密碼與預覽購物車', async () => {
    addTea(); await signIn();
    expect(app.preview).toBeFalse(); expect(app.password).toBe(''); expect(app.cart.length).toBe(0);
    expect(api.menu).toHaveBeenCalled();
  });
  it('點左上角品牌只回點餐頁，保留登入與購物車', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const page = fixture.componentInstance;
    page.username = 'test'; page.password = 'example'; await page.login();
    page.openProduct(PREVIEW_MENU.products[0]); page.selection.qty = 2; page.addToCart();
    page.view = 'orders'; fixture.detectChanges();
    const before = api.staff();
    const logo = fixture.nativeElement.querySelector('.brand-symbol') as HTMLButtonElement;
    expect(logo.getAttribute('href')).toBeNull();
    logo.click(); fixture.detectChanges();
    expect(page.view).toBe('pos'); expect(page.preview).toBeFalse();
    expect(api.staff()).toBe(before); expect(page.cups).toBe(2);
    expect(api.logout).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#menu-title')?.textContent).toContain('今天，來杯好茶');
  });
  it('相同規格可合併多杯，包含加料計價並能修改杯數', () => {
    app.openProduct(PREVIEW_MENU.products[0]); app.toggleTopping(1); app.selection.qty = 2; app.addToCart();
    app.openProduct(PREVIEW_MENU.products[0]); app.toggleTopping(1); app.addToCart();
    expect(app.cart.length).toBe(1); expect(app.cups).toBe(3); expect(app.totalCents).toBe(10500);
    app.quantity(app.cart[0], -1); expect(app.totalCents).toBe(7000);
  });
  it('茶凍切換熱飲會自動退選並顯示原因', () => {
    app.openProduct(PREVIEW_MENU.products[0]); app.toggleTopping(2); app.choose('temperature', 'HOT');
    expect(app.selection.toppingIds).toEqual([]); expect(app.selection.ice).toBe('NONE');
    expect(app.adjustment).toContain('已移除'); expect(app.toppingReason(2)).toContain('溫熱飲');
  });
  it('現金不足不送出訂單', async () => {
    await signIn(); addTea(); app.received = 1; await app.checkout();
    expect(api.create).not.toHaveBeenCalled(); expect(app.modalError).toContain('足夠');
  });
  it('送單不含前端單價，成功後顯示後端結果並清空購物車', async () => {
    await signIn(); addTea(); app.received = 100; api.create.and.resolveTo(ORDER); await app.checkout();
    const sent = api.create.calls.mostRecent().args[0];
    expect(Object.keys(sent.items[0])).not.toContain('unitPrice');
    expect(app.cart).toEqual([]); expect(app.lastOrder?.change_cash).toBe(75); expect(app.pending).toBeNull();
  });
  it('連線失敗保留同一個 requestId，重試不重建送單內容', async () => {
    await signIn(); addTea(); app.received = 100;
    api.create.and.rejectWith(new HttpErrorResponse({ status: 0 })); await app.checkout();
    const first = api.create.calls.mostRecent().args[0];
    expect(app.pending?.requestId).toBe(first.requestId); expect(app.cart.length).toBe(1);
    app.quantity(app.cart[0], 1); expect(app.cups).toBe(1);
    api.create.and.resolveTo(ORDER); await app.checkout();
    expect(api.create.calls.mostRecent().args[0]).toEqual(first);
    expect(sessionStorage.getItem('qingri.pending.3')).toBeNull();
  });
  it('同一員工重新登入可恢復待確認訂單', async () => {
    await signIn(); addTea(); app.received = 100;
    api.create.and.rejectWith(new HttpErrorResponse({ status: 0 })); await app.checkout();
    const id = app.pending?.requestId; app.logout(); expect(app.cart).toEqual([]);
    await signIn(); expect(app.pending?.requestId).toBe(id); expect(app.cart.length).toBe(1);
  });
  it('後端明確拒絕庫存時，保留購物車並允許調整', async () => {
    await signIn(); addTea(); app.received = 100;
    api.create.and.rejectWith(new HttpErrorResponse({ status: 409, error: { message: '庫存不足' } })); await app.checkout();
    expect(app.pending).toBeNull(); expect(app.cart.length).toBe(1); expect(app.modalError).toBe('庫存不足');
  });
  it('未確認人工退款時，不送出取消操作', async () => {
    const line = { item_id: 1, product_name: '紅茶', size: 'M', temperature: 'COLD', sugar: 'HALF', ice: 'LESS', qty: 2, unit_price: 25, status: 'PENDING', note: null, reason: null, approved_by: null, photo_url: null, toppings: [] } as const;
    app.selectedOrder = { ...ORDER, items: [{ ...line, toppings: [] }] }; app.openCancel(app.selectedOrder.items[0]);
    app.cancelReason = '取消'; await app.confirmCancel(); expect(api.cancel).not.toHaveBeenCalled();
  });
  it('付款方式只有三種，Uber Eats 仍可作為訂單來源', () => {
    expect(app.paymentOptions).toEqual(['CASH', 'CREDIT_CARD', 'LINE_PAY']);
    expect(app.sources.UBER_EATS).toBe('Uber Eats');
  });
  it('送單逾時解除忙碌狀態，保留內容供重試且不重複建單', async () => {
    await signIn(); addTea(); app.received = 100; app.checkoutOpen = true;
    api.create.and.rejectWith(new TimeoutError()); await app.checkout();
    const original = api.create.calls.mostRecent().args[0];
    expect(app.busy).toBeFalse(); expect(app.checkoutOpen).toBeTrue(); expect(app.modalError).toContain('逾時');
    expect(app.cart.length).toBe(1);
    api.create.and.resolveTo(ORDER); await app.checkout();
    expect(api.create.calls.mostRecent().args[0]).toEqual(original);
    expect(app.cart).toEqual([]);
  });
  function prepareCancel(): void {
    app.selectedOrder = { ...ORDER, items: [{ item_id: 1, product_name: '紅茶', size: 'M', temperature: 'COLD', sugar: 'HALF', ice: 'LESS', qty: 1, unit_price: 25, status: 'PENDING', note: null, reason: null, approved_by: null, photo_url: null, toppings: [] }] };
    app.openCancel(app.selectedOrder.items[0]); app.refundConfirmed = true;
    api.cancel.and.resolveTo({ ...ORDER, status: 'CANCELLED' });
  }
  it('已製作品項不需店長帳號或 PIN，保留原因與退款確認', async () => {
    prepareCancel(); app.selectedOrder!.items[0].status = 'MAKING';
    app.openCancel(app.selectedOrder!.items[0]); app.cancelReasonChoice = '顧客未取餐'; app.wantsRefund = false;
    await app.confirmCancel();
    expect(api.cancel.calls.mostRecent().args[2]).toEqual({ reason: '顧客未取餐', refundAmount: 0 });
  });
  it('待處理與待取餐依整單狀態篩選，當日紀錄保留所有狀態並顯示筆數', () => {
    const fixture = TestBed.createComponent(AppComponent); const page = fixture.componentInstance;
    page.preview = false; page.view = 'orders';
    page.orderList = ['PENDING', 'MAKING', 'DONE', 'PICKED_UP', 'CANCELLED'].map((status, i) => ({ ...ORDER, order_id: i + 1, status }));
    fixture.detectChanges();
    expect(page.visibleOrders.map(o => o.status)).toEqual(['PENDING', 'MAKING']);
    expect(page.orderCount('active')).toBe(2); expect(page.orderCount('ready')).toBe(1); expect(page.orderCount('history')).toBe(5);
    expect(fixture.nativeElement.querySelectorAll('.order-row').length).toBe(2);
    const tabs = fixture.nativeElement.querySelectorAll('.order-tabs button') as NodeListOf<HTMLButtonElement>;
    tabs[1].click(); fixture.detectChanges(); expect(page.visibleOrders[0].status).toBe('DONE');
    expect(tabs[1].getAttribute('aria-pressed')).toBe('true');
    tabs[2].click(); fixture.detectChanges(); expect(fixture.nativeElement.querySelectorAll('.order-row').length).toBe(5);
  });
  it('完成製作及取餐會移出目前頁籤並清空明細，紀錄仍存在', async () => {
    await signIn(); const ready: Order = { ...ORDER, status: 'DONE' };
    app.selectedOrder = ORDER; app.orderList = [ORDER]; api.statusAll.and.resolveTo(ready); api.orders.and.resolveTo([ready]);
    await app.advanceAll('DONE');
    expect(app.visibleOrders.length).toBe(0); expect(app.selectedOrder).toBeNull(); expect(app.notice).toContain('待取餐');
    app.selectOrderTab('ready'); expect(app.visibleOrders.length).toBe(1);
    app.selectedOrder = ready; const picked: Order = { ...ready, status: 'PICKED_UP' };
    api.statusAll.and.resolveTo(picked); api.orders.and.resolveTo([picked]); await app.advanceAll('PICKED_UP');
    expect(app.visibleOrders.length).toBe(0); expect(app.selectedOrder).toBeNull(); expect(app.notice).toContain('當日紀錄');
    app.selectOrderTab('history'); expect(app.visibleOrders[0].order_id).toBe(8);
  });
  it('部分取消仍留在工作列表，整張取消才移至紀錄', async () => {
    await signIn(); prepareCancel();
    app.cancelReason = '配料不足';
    const partial: Order = { ...app.selectedOrder!, status: 'PENDING' };
    api.cancel.and.resolveTo(partial); api.orders.and.resolveTo([partial]); await app.confirmCancel();
    expect(app.visibleOrders.length).toBe(1); expect(app.selectedOrder?.order_id).toBe(8);
    app.openCancel(null); app.cancelReason = '顧客取消'; app.refundConfirmed = true;
    const cancelled: Order = { ...partial, status: 'CANCELLED' };
    api.cancel.and.resolveTo(cancelled); api.orders.and.resolveTo([cancelled]); await app.confirmCancel();
    expect(app.visibleOrders.length).toBe(0); expect(app.selectedOrder).toBeNull();
    app.selectOrderTab('history'); expect(app.visibleOrders[0].status).toBe('CANCELLED');
  });
  it('切換營業日及查看剛建立的訂單會進入完整紀錄', async () => {
    await signIn(); app.selectedOrder = ORDER; app.orderDate = '2026-10-27'; app.changeOrderDate();
    expect(app.orderTab).toBe('history'); expect(app.selectedOrder).toBeNull(); expect(api.orders).toHaveBeenCalledWith('2026-10-27');
    app.orderTab = 'active'; app.lastOrder = { ...ORDER, status: 'PICKED_UP' };
    api.order.and.resolveTo(app.lastOrder); api.orders.and.resolveTo([app.lastOrder]);
    await app.showLastOrder(); expect(app.orderTab).toBe('history'); expect(app.selectedOrder?.order_id).toBe(8);
  });
  it('整單取餐需全部完成且已收款，允許部分已取餐與已取消', () => {
    prepareCancel(); const line = app.selectedOrder!.items[0];
    const order: Order = { ...ORDER, payment_status: 'PAID', items: [{ ...line, status: 'DONE' }, { ...line, item_id: 2, status: 'CANCELLED' }, { ...line, item_id: 3, status: 'PICKED_UP' }] };
    expect(app.canPickUpAll(order)).toBeTrue();
    expect(app.canPickUpAll({ ...order, payment_status: 'UNPAID' })).toBeFalse();
    for (const status of ['PENDING', 'MAKING'] as const) expect(app.canPickUpAll({ ...order, items: [...order.items, { ...line, status }] })).toBeFalse();
    expect(app.canPickUpAll({ ...order, items: [{ ...line, status: 'CANCELLED' }] })).toBeFalse();
  });
  it('整單操作使用單次後端批次 API，失敗後解除忙碌狀態', async () => {
    prepareCancel(); api.statusAll.and.resolveTo({ ...app.selectedOrder!, status: 'MAKING' });
    await app.advanceAll('MAKING'); expect(api.statusAll).toHaveBeenCalledWith(8, 'MAKING'); expect(api.status).not.toHaveBeenCalled();
    expect(app.selectedOrder?.status).toBe('MAKING');
    api.statusAll.and.rejectWith(new HttpErrorResponse({ status: 409, error: { message: '還有飲品尚未完成' } }));
    await app.advanceAll('PICKED_UP'); expect(app.error).toContain('尚未完成'); expect(app.busy).toBeFalse();
  });
  it('稍後收款可不填現金，送出未付款且沒有付款方式', async () => {
    await signIn(); addTea(); app.unpaid = true; api.create.and.resolveTo({ ...ORDER, payment: null, payment_status: 'UNPAID', paid_amount: 0 });
    await app.checkout();
    const sent = api.create.calls.mostRecent().args[0];
    expect(sent.unpaid).toBeTrue(); expect(sent.payment).toBeNull(); expect(sent.receivedCash).toBeUndefined();
  });
  it('未付款取消不需退款勾選，明確傳送退款零元', async () => {
    prepareCancel(); app.selectedOrder = { ...app.selectedOrder!, payment: null, payment_status: 'UNPAID', paid_amount: 0 };
    app.openCancel(app.selectedOrder.items[0]); app.cancelReasonChoice = '顧客未取餐';
    expect(app.refundNeedsConfirmation).toBeFalse(); expect(app.refundAmount).toBe(0);
    await app.confirmCancel(); expect(api.cancel.calls.mostRecent().args[2].refundAmount).toBe(0);
  });
  it('已付款可以不退款，或限制退款金額與要求人工退款確認', async () => {
    prepareCancel(); app.wantsRefund = false; app.refundConfirmed = false; app.cancelReason = '顧客未取餐';
    await app.confirmCancel(); expect(api.cancel.calls.mostRecent().args[2].refundAmount).toBe(0);
    api.cancel.calls.reset(); prepareCancel(); app.cancelReason = '顧客取消'; app.refundInput = 26;
    await app.confirmCancel(); expect(api.cancel).not.toHaveBeenCalled(); expect(app.modalError).toContain('上限');
    app.refundInput = 10.25; app.refundConfirmed = false; await app.confirmCancel(); expect(api.cancel).not.toHaveBeenCalled();
    app.refundConfirmed = true; await app.confirmCancel(); expect(api.cancel.calls.mostRecent().args[2].refundAmount).toBe(10.25);
  });
  it('損耗只加總已製作的成本，未知成本不顯示零元', () => {
    prepareCancel(); const line = app.selectedOrder!.items[0];
    app.selectedOrder = { ...app.selectedOrder!, items: [{ ...line, status: 'WASTED', material_cost: 6.8 }, { ...line, item_id: 2, status: 'CANCELLED', material_cost: 99 }] };
    expect(app.wasteCost(app.selectedOrder)).toBe('$6.8');
    expect(app.costText([{ ...line, material_cost: null }])).toContain('未建檔');
  });
  it('稍後收款會使用原訂單編號並更新詳情', async () => {
    const unpaid: Order = { ...ORDER, payment_status: 'UNPAID', payment: null, paid_amount: 0 };
    api.collect.and.resolveTo({ ...ORDER, payment_status: 'PAID', paid_amount: 25 });
    app.openCollect(unpaid); app.received = 100; await app.confirmCollect();
    expect(api.collect).toHaveBeenCalledWith(8, 'CASH', 100); expect(app.collecting).toBeNull(); expect(app.selectedOrder?.payment_status).toBe('PAID');
  });
  it('常用原因可以單獨使用或加上補充說明，重新開啟會清空選項', async () => {
    prepareCancel(); app.cancelReasonChoice = '配料不足'; app.cancelReason = ' 珍珠售完 ';
    await app.confirmCancel(); expect(api.cancel.calls.mostRecent().args[2].reason).toBe('配料不足：珍珠售完');
    prepareCancel(); expect(app.cancelReasonChoice).toBe(''); expect(app.cancelReason).toBe('');
    app.cancelReasonChoice = '茶湯不足（茶沒了）'; await app.confirmCancel();
    expect(api.cancel.calls.mostRecent().args[2].reason).toBe('茶湯不足（茶沒了）');
  });
  it('不選常用原因也能直接手填', async () => {
    prepareCancel(); app.cancelReason = ' 冰箱故障 ';
    await app.confirmCancel(); expect(api.cancel.calls.mostRecent().args[2].reason).toBe('冰箱故障');
  });
  it('其他原因必須填寫內容，不能只存其他兩字', async () => {
    prepareCancel(); app.cancelReasonChoice = '其他'; app.cancelReason = ' ';
    await app.confirmCancel(); expect(api.cancel).not.toHaveBeenCalled();
    app.cancelReason = '封膜破裂'; await app.confirmCancel();
    expect(api.cancel.calls.mostRecent().args[2].reason).toBe('封膜破裂');
  });
  it('切換原因後合計超過欄位長度時不送出', async () => {
    prepareCancel(); app.cancelReason = '字'.repeat(255); app.cancelReasonChoice = '配料不足';
    await app.confirmCancel(); expect(api.cancel).not.toHaveBeenCalled(); expect(app.modalError).toContain('255');
  });
});
