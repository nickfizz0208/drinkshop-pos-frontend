import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AppComponent } from '../../app.component';
import { PosApiService } from '../../services/pos-api.service';
import { UiStateService } from '../../shared/ui-state.service';
import { StoreOpsStateService } from './store-ops-state.service';
import { DailyShift, Inventory, WastageSummary } from '../../models/store-ops';
import { PREVIEW_MENU, PREVIEW_RULES } from '../../services/preview-menu';
import { OrderSummary, Staff, taipeiDate } from '../../models/pos';

describe('日結與報廢操作（隔離 API，不連共用庫）', () => {
  let api: jasmine.SpyObj<PosApiService>;
  let state: StoreOpsStateService;
  let ui: UiStateService;
  const staff = signal<Staff | null>(null);
  const material: Inventory = { inventoryId: 1, name: '紅茶湯', baseUnit: '份', bookQty: 20, unitCost: 2 };
  let shift: DailyShift;
  let waste: WastageSummary;
  beforeEach(async () => {
    sessionStorage.clear(); staff.set({ staffId: 5, name: '門市 POS', username: 'test-only', level: 'POS' });
    const date = taipeiDate();
    shift = { businessDate: date, status: 'OPEN', pettyCash: 1000, openedBy: 5, openedAt: date + 'T09:00:00', closedBy: null, closedAt: null, expectedCash: null, countedCash: null, diffReason: null, revenueByPayment: null, cups: null, rolesJson: '[]' };
    waste = { date, totalWastedCount: 0, totalWastageCost: 0, wastedItems: [], costComplete: true, rawWastageEnabled: true, rawMaterialWastages: [] };
    api = jasmine.createSpyObj<PosApiService>('api', ['shift', 'openShift', 'closeShift', 'wastages', 'inventories', 'rawWastage', 'orders', 'order', 'logout', 'menu', 'rules', 'shiftToday', 'staffOptions'], { staff });
    api.shift.and.callFake(async () => shift); api.wastages.and.callFake(async date => ({ ...waste, date })); api.inventories.and.resolveTo([material]); api.orders.and.resolveTo([]);
    api.rawWastage.and.resolveTo(material);
    // 工作台外框重新整理後會恢復登入：載入菜單與今日班次
    api.menu.and.resolveTo(PREVIEW_MENU); api.rules.and.resolveTo(PREVIEW_RULES); api.staffOptions.and.resolveTo([]);
    api.shiftToday.and.callFake(async () => ({ businessDate: taipeiDate(), shiftStatus: shift.status, records: [], canViewAll: false }));
    api.logout.and.callFake(() => staff.set(null));
    await TestBed.configureTestingModule({ imports: [AppComponent], providers: [{ provide: PosApiService, useValue: api }] }).compileComponents();
    state = TestBed.inject(StoreOpsStateService); ui = TestBed.inject(UiStateService); ui.preview = false;
  });
  afterEach(() => sessionStorage.clear());
  function order(overrides: Partial<OrderSummary> = {}): OrderSummary {
    return { order_id: 1, order_no: 'test', business_date: state.date, source: 'TAKE_OUT', payment: 'CASH', payment_status: 'PAID', paid_amount: 25, refunded_amount: 10, total: 25, status: 'PENDING', created_at: state.date, ...overrides };
  }
  function fillRaw(): void { state.rawId = 1; state.rawQty = 2; state.rawReason = '打翻'; state.prepareRaw(); }

  it('現金預估扣退款但不扣損耗、不加非現金或未付款，並保留整數分精度', async () => {
    api.orders.and.resolveTo([order(), order({ payment: 'LINE_PAY', paid_amount: 99 }), order({ payment: null, payment_status: 'UNPAID', paid_amount: 0 }), order({ paid_amount: .3, refunded_amount: .1 })]);
    waste.totalWastageCost = 999; await state.load();
    expect(state.expectedCash).toBe(1015.2); expect(state.unpaid).toBe(1);
    expect(state.receipts.find(row => row.label === 'LINE Pay')?.value).toBe(89);
  });
  it('缺少帳務欄位時不以售價猜測現金', async () => {
    api.orders.and.resolveTo([order({ paid_amount: undefined })]); await state.load(); expect(state.expectedCash).toBeNull();
  });
  it('已關班的現金與付款彙總使用保存值', async () => {
    shift = { ...shift, status: 'CLOSED', expectedCash: 1200, countedCash: 1190, revenueByPayment: '{"CASH":200}' };
    api.orders.and.resolveTo([order({ paid_amount: 999 })]); await state.load();
    expect(state.expectedCash).toBe(1200); expect(state.receipts).toEqual([{ label: '現金', value: 200 }]); expect(state.canRaw).toBeFalse();
  });
  it('只有班次 404 是未開班，其他錯誤禁止寫入', async () => {
    api.shift.and.rejectWith(new HttpErrorResponse({ status: 404 })); await state.load(); expect(state.ready).toBeTrue(); expect(state.shift).toBeNull();
    api.shift.and.rejectWith(new HttpErrorResponse({ status: 503 })); await state.load(); expect(state.ready).toBeFalse();
  });
  it('原料功能未啟用、歷史日期或關班都禁止報廢', async () => {
    waste.rawWastageEnabled = false; await state.load(); fillRaw(); expect(state.rawConfirm).toBeNull();
    waste.rawWastageEnabled = true; state.date = '2001-01-01'; await state.load(); expect(state.canRaw).toBeFalse();
    state.date = taipeiDate(); shift.status = 'CLOSED'; await state.load(); expect(state.canRaw).toBeFalse(); expect(api.rawWastage).not.toHaveBeenCalled();
  });
  it('原料數量不合法或超庫存時不開確認窗', async () => {
    await state.load(); state.rawId = 1; state.rawReason = '打翻';
    for (const qty of [0, -1, 2.001, 21, NaN]) { state.rawQty = qty; state.prepareRaw(); expect(state.rawConfirm).toBeNull(); }
  });
  it('填表只預覽，明確確認才扣料；成功後重新讀取失敗仍明示操作成功', async () => {
    await state.load(); fillRaw(); expect(api.rawWastage).not.toHaveBeenCalled();
    api.rawWastage.and.callFake(async request => {
      const saved = JSON.parse(sessionStorage.getItem('qingri.raw-review.5')!);
      expect(saved.request).toEqual(request); api.inventories.and.rejectWith(new Error('reload failed')); return material;
    });
    await state.submitRaw(); expect(api.rawWastage).toHaveBeenCalledWith({ inventoryId: 1, wastageQty: 2, reason: '打翻' });
    expect(state.error).toContain('操作已完成'); expect(state.rawReview).toBeNull(); expect(sessionStorage.getItem('qingri.raw-review.5')).toBeNull();
  });
  it('瀏覽器不能保存待核對標記時絕不送出原料 POST', async () => {
    await state.load(); fillRaw(); spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
    await state.submitRaw(); expect(api.rawWastage).not.toHaveBeenCalled(); expect(state.error).toContain('本次未送出');
  });
  it('請求尚未完成就重載 state，仍從預先保存的標記鎖住再次登記', async () => {
    await state.load(); fillRaw(); let resolve!: (value: Inventory) => void;
    api.rawWastage.and.returnValue(new Promise<Inventory>(r => resolve = r)); const sending = state.submitRaw();
    expect(sessionStorage.getItem('qingri.raw-review.5')).not.toBeNull();
    const reloaded = TestBed.runInInjectionContext(() => new StoreOpsStateService()); await reloaded.load();
    expect(reloaded.rawReview?.request.wastageQty).toBe(2); expect(reloaded.canRaw).toBeFalse();
    resolve(material); await sending;
  });
  it('斷線與伺服器錯誤後禁止重送，查詢失敗不可解除核對鎖', async () => {
    await state.load(); fillRaw(); api.rawWastage.and.rejectWith(new HttpErrorResponse({ status: 0 }));
    await state.submitRaw(); expect(state.rawReview).not.toBeNull(); await state.submitRaw(); expect(api.rawWastage).toHaveBeenCalledTimes(1);
    api.wastages.and.rejectWith(new Error('offline')); await state.inspectReview(); state.reviewChecked = true;
    await state.acknowledgeReview(); expect(state.rawReview).not.toBeNull();
    api.wastages.and.resolveTo(waste); await state.inspectReview(); state.reviewChecked = true; await state.acknowledgeReview();
    expect(state.rawReview).toBeNull(); expect(state.canRaw).toBeTrue();
  });
  it('明確庫存拒絕解除 pending；503 保留待核對且不自動重送', async () => {
    await state.load(); fillRaw(); api.rawWastage.and.rejectWith(new HttpErrorResponse({ status: 409, error: { message: '庫存不足' } }));
    await state.submitRaw(); expect(state.rawReview).toBeNull(); expect(state.error).toContain('庫存不足');
    await state.load(); fillRaw(); api.rawWastage.and.rejectWith(new HttpErrorResponse({ status: 503 })); await state.submitRaw();
    expect(state.rawReview).not.toBeNull(); expect(api.rawWastage).toHaveBeenCalledTimes(2);
  });
  it('確認窗跨台北午夜立即失效，不把前一日確認送到今日', async () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date('2026-11-05T15:59:50Z')); state.date = taipeiDate(); await state.load(); fillRaw();
      jasmine.clock().mockDate(new Date('2026-11-05T16:00:10Z')); await state.submitRaw();
      expect(api.rawWastage).not.toHaveBeenCalled(); expect(state.rawConfirm).toBeNull(); expect(state.error).toContain('日期');
    } finally { jasmine.clock().uninstall(); }
  });
  it('跨日不明結果同時核對送出日及台北今日', async () => {
    await state.load(); fillRaw(); api.rawWastage.and.rejectWith(new HttpErrorResponse({ status: 0 })); await state.submitRaw();
    const sentDay = state.rawReview!.date;
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date(Date.now() + 86400000)); api.wastages.calls.reset(); await state.inspectReview();
      expect(api.wastages.calls.allArgs().map(args => args[0])).toEqual([sentDay, taipeiDate()]); expect(state.reviewLoaded).toBeTrue();
    } finally { jasmine.clock().uninstall(); }
  });
  it('午夜送出隔兩日才核對，仍包含中間可能實際扣料的日期；核對後跨日不可直接解除', async () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date('2026-11-05T15:59:59Z')); state.date = taipeiDate(); await state.load(); fillRaw();
      api.rawWastage.and.rejectWith(new HttpErrorResponse({ status: 0 })); await state.submitRaw();
      jasmine.clock().mockDate(new Date('2026-11-07T03:00:00Z')); api.wastages.calls.reset(); await state.inspectReview();
      expect(api.wastages.calls.allArgs().map(args => args[0])).toEqual(['2026-11-05', '2026-11-06', '2026-11-07']);
      expect(state.reviewLoaded).toBeTrue(); state.reviewChecked = true;
      jasmine.clock().mockDate(new Date('2026-11-08T03:00:00Z')); await state.acknowledgeReview();
      expect(state.rawReview).not.toBeNull(); expect(state.reviewLoaded).toBeFalse();
    } finally { jasmine.clock().uninstall(); }
  });
  it('日結頁不能開班或關班，統一由上方工具列處理', async () => {
    const fixture = TestBed.createComponent(AppComponent); await fixture.whenStable();
    await fixture.componentInstance.switchView('store'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const page = fixture.nativeElement.querySelector('app-store-ops') as HTMLElement;
    expect(page.querySelector('input[name="countedCash"]')).toBeNull(); expect(page.querySelector('input[name="pettyCash"]')).toBeNull();
    expect(page.textContent).toContain('右上角'); expect(api.openShift).not.toHaveBeenCalled(); expect(api.closeShift).not.toHaveBeenCalled();
  });
  it('所有寫入遵守共用 busy，查詢版本使離頁與登出後的回應失效', async () => {
    await state.load(); fillRaw(); ui.busy = true; await state.submitRaw(); expect(api.rawWastage).not.toHaveBeenCalled(); ui.busy = false;
    let resolve!: (value: DailyShift) => void; api.shift.and.returnValue(new Promise<DailyShift>(r => resolve = r));
    const loading = state.load(); state.reset(); resolve(shift); await loading;
    expect(state.shift).toBeNull(); expect(state.ready).toBeFalse(); expect(state.loading).toBeFalse();
  });
  it('不同員工不會繼承另一位的原料待核對內容', async () => {
    await state.load(); fillRaw(); api.rawWastage.and.rejectWith(new HttpErrorResponse({ status: 0 })); await state.submitRaw();
    state.reset(); staff.set({ staffId: 6, name: '另一員工', username: 'other', level: 'STAFF' }); await state.load(); expect(state.rawReview).toBeNull();
    staff.set({ staffId: 5, name: '原員工', username: 'test-only', level: 'STAFF' }); await state.load(); expect(state.rawReview).not.toBeNull();
  });
  it('真實選單可切到營運頁，未知成本不顯示零元，未啟用原料時表單停用', async () => {
    waste.costComplete = false; waste.totalWastageCost = null; waste.rawWastageEnabled = false;
    const fixture = TestBed.createComponent(AppComponent); await fixture.whenStable(); fixture.detectChanges();
    const menu = [...fixture.nativeElement.querySelectorAll('.rail-link')] as HTMLButtonElement[];
    menu.find(button => button.textContent!.includes('日結與報廢'))!.click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-store-ops')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('成本未建檔'); expect(fixture.nativeElement.querySelector('fieldset').disabled).toBeTrue();
    expect(api.rawWastage).not.toHaveBeenCalled(); expect(api.closeShift).not.toHaveBeenCalled();
    fixture.componentInstance.logout(); fixture.detectChanges(); expect(state.shift).toBeNull(); expect(fixture.nativeElement.querySelector('app-store-ops')).toBeNull();
  });
  it('預覽只顯示登入入口，不呼叫受保護 API', async () => {
    staff.set(null); ui.preview = true; ui.view = 'store'; const fixture = TestBed.createComponent(AppComponent); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('登入後管理門市營運'); expect(api.shift).not.toHaveBeenCalled();
  });
});
