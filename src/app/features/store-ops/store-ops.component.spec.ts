import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AppComponent } from '../../app.component';
import { PosApiService } from '../../services/pos-api.service';
import { UiStateService } from '../../shared/ui-state.service';
import { StoreOpsStateService } from './store-ops-state.service';
import { DailyShift, Inventory, WastageSummary } from '../../models/store-ops';
import { ClockToday } from '../../models/time-clock';
import { PREVIEW_MENU, PREVIEW_RULES } from '../../services/preview-menu';
import { Staff, taipeiDate } from '../../models/pos';

describe('原料報廢回報（隔離 API，不連共用庫）', () => {
  let api: jasmine.SpyObj<PosApiService>;
  let state: StoreOpsStateService;
  let ui: UiStateService;
  const staff = signal<Staff | null>(null);
  const material: Inventory = { inventoryId: 1, name: '紅茶湯', baseUnit: '份', bookQty: 20, unitCost: 2 };
  let shift: DailyShift;
  let waste: WastageSummary;
  beforeEach(async () => {
    sessionStorage.clear(); staff.set({ staffId: 5, name: '店員小華', username: 'test-only', level: 'STAFF' });
    const date = taipeiDate();
    shift = { businessDate: date, status: 'OPEN', pettyCash: 1000, openedBy: 5, openedAt: date + 'T09:00:00', closedBy: null, closedAt: null, expectedCash: null, countedCash: null, diffReason: null, revenueByPayment: null, cups: null, rolesJson: '[]' };
    waste = { date, totalWastedCount: 0, totalWastageCost: 0, wastedItems: [], costComplete: true, rawWastageEnabled: true, rawMaterialWastages: [] };
    api = jasmine.createSpyObj<PosApiService>('api', ['shift', 'openShift', 'closeShift', 'wastages', 'inventories', 'rawWastage', 'orders', 'order', 'logout', 'refreshStaff', 'menu', 'rules', 'shiftToday', 'staffOptions'], { staff });
    api.refreshStaff.and.resolveTo();
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
  function fillRaw(): void { state.rawId = 1; state.rawQty = 2; state.rawReason = '打翻'; state.prepareRaw(); }

  it('今天還沒開班或已關班都不能登記；只看今天的班次，不讀 POS 專用的班次與訂單 API', async () => {
    shift.status = 'OPEN'; await state.load(); expect(state.canRaw).toBeTrue();
    api.shiftToday.and.resolveTo({ businessDate: taipeiDate(), shiftStatus: 'NONE', records: [], canViewAll: false });
    await state.load(); expect(state.canRaw).toBeFalse(); fillRaw(); expect(state.rawConfirm).toBeNull();
    expect(api.shift).not.toHaveBeenCalled(); expect(api.orders).not.toHaveBeenCalled();
  });
  it('原料功能未啟用、歷史日期或關班都禁止報廢', async () => {
    waste.rawWastageEnabled = false; await state.load(); fillRaw(); expect(state.rawConfirm).toBeNull();
    waste.rawWastageEnabled = true; state.date = '2001-01-01'; await state.load(); expect(state.canRaw).toBeFalse();
    state.date = taipeiDate(); shift.status = 'CLOSED'; await state.load(); expect(state.canRaw).toBeFalse(); expect(api.rawWastage).not.toHaveBeenCalled();
  });
  it('原料數量不合法時不開確認窗；超過帳面也可以登記（帳面以盤點為準）', async () => {
    await state.load(); state.rawId = 1; state.rawReason = '打翻';
    for (const qty of [0, -1, 2.001, NaN]) { state.rawQty = qty; state.prepareRaw(); expect(state.rawConfirm).toBeNull(); }
    state.rawQty = 21; state.prepareRaw(); expect(state.rawConfirm?.request.wastageQty).toBe(21);   // 帳面只有 20
  });
  it('填表只預覽，明確確認才登記；成功後重新讀取失敗仍明示操作成功', async () => {
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
  it('日結頁不能開班或關班，也沒有班次與現金（移到訂單管理）', async () => {
    // 在原料報廢回報頁重新整理：恢復登入後留在這一頁
    ui.view = 'store'; const fixture = TestBed.createComponent(AppComponent); await fixture.whenStable();
    await fixture.componentInstance.switchView('store'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const page = fixture.nativeElement.querySelector('app-store-ops') as HTMLElement;
    expect(page.querySelector('input[name="countedCash"]')).toBeNull(); expect(page.querySelector('input[name="pettyCash"]')).toBeNull();
    expect(page.textContent).not.toContain('班次與現金'); expect(api.openShift).not.toHaveBeenCalled(); expect(api.closeShift).not.toHaveBeenCalled();
  });
  it('所有寫入遵守共用 busy，查詢版本使離頁與登出後的回應失效', async () => {
    await state.load(); fillRaw(); ui.busy = true; await state.submitRaw(); expect(api.rawWastage).not.toHaveBeenCalled(); ui.busy = false;
    let resolve!: (value: ClockToday) => void; api.shiftToday.and.returnValue(new Promise<ClockToday>(r => resolve = r));
    const loading = state.load(); state.reset(); resolve({ businessDate: taipeiDate(), shiftStatus: 'OPEN', records: [], canViewAll: false }); await loading;
    expect(state.shiftStatus).toBeNull(); expect(state.ready).toBeFalse(); expect(state.loading).toBeFalse();
  });
  it('不同員工不會繼承另一位的原料待核對內容', async () => {
    await state.load(); fillRaw(); api.rawWastage.and.rejectWith(new HttpErrorResponse({ status: 0 })); await state.submitRaw();
    state.reset(); staff.set({ staffId: 6, name: '另一員工', username: 'other', level: 'STAFF' }); await state.load(); expect(state.rawReview).toBeNull();
    staff.set({ staffId: 5, name: '原員工', username: 'test-only', level: 'STAFF' }); await state.load(); expect(state.rawReview).not.toBeNull();
  });
  it('真實選單可切到營運頁，未知成本不顯示零元，未啟用原料時表單停用', async () => {
    waste.costComplete = false; waste.totalWastageCost = null; waste.rawWastageEnabled = false;
    ui.view = 'store'; const fixture = TestBed.createComponent(AppComponent); await fixture.whenStable(); fixture.detectChanges();
    const menu = [...fixture.nativeElement.querySelectorAll('.rail-link')] as HTMLButtonElement[];
    menu.find(button => button.textContent!.includes('原料報廢回報'))!.click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-store-ops')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('成本未建檔'); expect(fixture.nativeElement.querySelector('fieldset').disabled).toBeTrue();
    expect(api.rawWastage).not.toHaveBeenCalled(); expect(api.closeShift).not.toHaveBeenCalled();
    fixture.componentInstance.logout(); fixture.detectChanges(); expect(state.shiftStatus).toBeNull(); expect(fixture.nativeElement.querySelector('app-store-ops')).toBeNull();
  });
  it('POS 共用帳號看不到原料報廢回報；店長看得到', async () => {
    staff.set({ staffId: 9, name: '門市 POS', username: 'pos', level: 'POS' });
    const fixture = TestBed.createComponent(AppComponent); await fixture.whenStable(); fixture.detectChanges();
    const labels = () => ([...fixture.nativeElement.querySelectorAll('.rail-link')] as HTMLElement[]).map(b => b.textContent!.trim()).join(' ');
    expect(labels()).not.toContain('原料報廢回報');
    await fixture.componentInstance.switchView('store'); expect(ui.view).not.toBe('store');
    staff.set({ staffId: 8, name: '店長', username: 'boss', level: 'MANAGER' }); fixture.detectChanges();
    expect(labels()).toContain('原料報廢回報');
  });
  it('沒有登入只顯示登入畫面，不呼叫受保護 API', async () => {
    staff.set(null); ui.preview = true; ui.view = 'store'; const fixture = TestBed.createComponent(AppComponent); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.login-screen')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-store-ops')).toBeNull(); expect(api.shift).not.toHaveBeenCalled();
  });
});
