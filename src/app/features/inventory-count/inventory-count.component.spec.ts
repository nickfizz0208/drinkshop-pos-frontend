import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AppComponent } from '../../app.component';
import { PosApiService } from '../../services/pos-api.service';
import { InventoryCountApiService } from '../../services/inventory-count-api.service';
import { UiStateService } from '../../shared/ui-state.service';
import { InventoryCountStateService } from './inventory-count-state.service';
import { CountRow, InventoryItem } from '../../models/inventory-count';
import { Staff } from '../../models/pos';
import { PREVIEW_MENU, PREVIEW_RULES } from '../../services/preview-menu';

describe('原料盤點（隔離 API，不連共用庫）', () => {
  let api: jasmine.SpyObj<InventoryCountApiService>;
  let pos: jasmine.SpyObj<PosApiService>;
  let state: InventoryCountStateService;
  let ui: UiStateService;
  const staff = signal<Staff | null>(null);
  const cups: InventoryItem = { inventoryId: 1, name: '中杯紙杯', baseUnit: '個', packUnit: '袋', perPack: 50, bookQty: 120, safetyStock: 20, unitCost: 2, reportedQty: null, reportedBy: null, reportedAt: null };
  const milk: InventoryItem = { inventoryId: 5, name: '奶料', baseUnit: '份', packUnit: null, perPack: null, bookQty: 10, safetyStock: 20, unitCost: null, reportedQty: null, reportedBy: null, reportedAt: null };
  const row = (o: Partial<CountRow>): CountRow => ({ countId: 1, requestId: 'r1', inventoryId: 1, inventoryName: '中杯紙杯', baseUnit: '個', countedQty: 115, bookQty: 120, diffQty: -5, unitCost: 2, diffCost: -10, countedBy: 4, countedByName: '王小明', countedAt: '2026-11-09T14:00:00', note: null, ...o });

  beforeEach(async () => {
    sessionStorage.clear(); staff.set({ staffId: 4, username: 'clerk', name: '王小明', level: 'STAFF' });
    api = jasmine.createSpyObj<InventoryCountApiService>('api', ['inventories', 'history', 'submit']);
    api.inventories.and.resolveTo([milk, cups]); api.history.and.resolveTo({ enabled: true, rows: [] });
    pos = jasmine.createSpyObj<PosApiService>('pos', ['logout', 'menu', 'rules', 'shiftToday', 'staffOptions', 'authHeaders'], { staff });
    pos.menu.and.resolveTo(PREVIEW_MENU); pos.rules.and.resolveTo(PREVIEW_RULES);
    pos.logout.and.callFake(() => staff.set(null));
    // 個人帳號登入後預設進打卡頁；打卡元件自己的 API 用測試用 HttpClient，不會真的連線
    await TestBed.configureTestingModule({ imports: [AppComponent], providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: PosApiService, useValue: pos }, { provide: InventoryCountApiService, useValue: api }] }).compileComponents();
    state = TestBed.inject(InventoryCountStateService); ui = TestBed.inject(UiStateService); ui.preview = false;
  });
  afterEach(() => { sessionStorage.clear(); state.reset(); });

  it('包數＋零散換算成基本單位，並算出和帳面的差異', async () => {
    await state.load();
    expect(state.items.map(i => i.inventoryId)).toEqual([1, 5]);
    state.entry(1).packs = 2; state.entry(1).loose = 15;
    expect(state.counted(cups)).toBe(115); expect(state.diff(cups)).toBe(-5);
    state.entry(5).loose = 10.25; expect(state.diff(milk)).toBe(0.25);
    expect(state.counted({ ...milk, inventoryId: 99 })).toBeNull();
    expect(state.countedCount).toBe(2);
  });
  it('同帳面：把帳面數量拆成包數與零散', async () => {
    await state.load(); state.fillBook(cups);
    expect(state.entry(1)).toEqual({ packs: 2, loose: 20 }); expect(state.diff(cups)).toBe(0);
    state.fillBook(milk); expect(state.entry(5)).toEqual({ packs: null, loose: 10 });
  });
  it('負數、包數不是整數、超過兩位小數都不能送出', async () => {
    await state.load();
    state.entry(1).packs = 1.5; expect(state.invalid(cups)).toContain('整數'); expect(state.canSubmit).toBeFalse();
    state.entry(1).packs = 1; state.entry(1).loose = -1; expect(state.invalid(cups)).toContain('0 以上');
    state.entry(1).loose = 1.234; expect(state.canSubmit).toBeFalse();
    state.entry(1).loose = 1.23; expect(state.canSubmit).toBeTrue();
  });
  it('送出只帶有填的原料，不帶經手人；成功後清空輸入並重新讀紀錄', async () => {
    await state.load(); state.entry(1).packs = 2; state.entry(1).loose = 15; state.note = ' 月底 ';
    api.submit.and.resolveTo([row({})]);
    await state.submit();
    const body = api.submit.calls.mostRecent().args[0];
    expect(body.lines).toEqual([{ inventoryId: 1, countedQty: 115 }]); expect(body.note).toBe('月底');
    expect(Object.keys(body)).not.toContain('staffId');
    expect(state.entries).toEqual({}); expect(state.pending).toBeNull(); expect(ui.notice).toContain('1 項');
    expect(api.history).toHaveBeenCalledTimes(2);
  });
  it('結果不明時內容沒改就沿用同一個 requestId 重送；被後端拒絕就換新的', async () => {
    await state.load(); state.entry(5).loose = 8;
    api.submit.and.rejectWith(new HttpErrorResponse({ status: 0 }));
    await state.submit(); const first = api.submit.calls.mostRecent().args[0].requestId;
    expect(state.pending?.requestId).toBe(first); expect(state.confirmError).toContain('不會重複記錄');
    await state.submit(); expect(api.submit.calls.mostRecent().args[0].requestId).toBe(first);
    state.entry(5).loose = 9; await state.submit();
    const changed = api.submit.calls.mostRecent().args[0].requestId; expect(changed).not.toBe(first);
    api.submit.and.rejectWith(new HttpErrorResponse({ status: 400, error: { message: '資料錯誤' } }));
    await state.submit(); expect(state.pending).toBeNull(); expect(state.confirmError).toBe('資料錯誤');
  });
  it('016 尚未升級：顯示提示且不能送出', async () => {
    api.history.and.resolveTo({ enabled: false, rows: [] }); await state.load();
    state.entry(5).loose = 8; expect(state.canSubmit).toBeFalse();
    await state.submit(); expect(api.submit).not.toHaveBeenCalled();
  });
  it('歷史紀錄依每次送出分組，未建成本時不把差異金額當 0', async () => {
    api.history.and.resolveTo({ enabled: true, rows: [
      row({}), row({ countId: 2, inventoryId: 5, inventoryName: '奶料', diffQty: 3, unitCost: null, diffCost: null }),
      row({ countId: 3, requestId: 'r2', diffQty: 0, diffCost: 0 })] });
    await state.load();
    const [a, b] = state.groups;
    expect(a.rows.length).toBe(2); expect(a.shortCount).toBe(1); expect(a.overCount).toBe(1); expect(a.diffCost).toBeNull();
    expect(b.diffCost).toBe(0); expect(b.shortCount + b.overCount).toBe(0);
  });
  it('換人登入時不保留上一位沒送出的輸入', async () => {
    await state.load(); state.entry(1).loose = 3;
    staff.set({ staffId: 6, username: 'other', name: '另一位', level: 'STAFF' }); await state.load();
    expect(state.entries).toEqual({});
  });
  it('個人帳號的選單有盤點；POS 帳號看不到也切不過去', async () => {
    // 先以未登入建立畫面（避免重新整理恢復登入時進入打卡頁），再模擬個人帳號登入完成
    staff.set(null); ui.preview = true;
    const fixture = TestBed.createComponent(AppComponent); fixture.detectChanges();
    staff.set({ staffId: 4, username: 'clerk', name: '王小明', level: 'STAFF' }); ui.preview = false; fixture.detectChanges();
    const labels = () => [...fixture.nativeElement.querySelectorAll('.rail-link')].map((b: HTMLElement) => b.textContent!.trim());
    expect(labels()).toContain('盤點');
    await fixture.componentInstance.switchView('inventory-count'); fixture.detectChanges();
    await state.load(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-inventory-count')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('低於安全庫存');   // 奶料帳面 10 < 安全庫存 20
    expect(fixture.nativeElement.querySelectorAll('app-inventory-count tbody tr').length).toBe(2);
    staff.set({ staffId: 3, username: 'pos', name: '門市 POS', level: 'POS' }); ui.view = 'orders'; fixture.detectChanges();
    expect(labels()).not.toContain('盤點');
    await fixture.componentInstance.switchView('inventory-count'); expect(ui.view).toBe('orders');
  });
});
