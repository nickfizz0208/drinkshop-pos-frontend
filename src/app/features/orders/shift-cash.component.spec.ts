import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { PosApiService } from '../../services/pos-api.service';
import { ShiftCashComponent } from './shift-cash.component';
import { DailyShift } from '../../models/store-ops';
import { OrderSummary } from '../../models/pos';
import { signal } from '@angular/core';

// 原本在日結與報廢頁的現金預估測試，移到訂單管理的「班次與現金」彈窗
describe('班次與現金（訂單管理彈窗，隔離 API）', () => {
  let api: jasmine.SpyObj<PosApiService>;
  let shift: DailyShift;
  const date = '2026-11-06';
  function order(overrides: Partial<OrderSummary> = {}): OrderSummary {
    return { order_id: 1, order_no: 'test', business_date: date, source: 'TAKE_OUT', payment: 'CASH', payment_status: 'PAID', paid_amount: 25, refunded_amount: 10, total: 25, status: 'PENDING', created_at: date, ...overrides };
  }
  async function open(): Promise<ShiftCashComponent> {
    const fixture = TestBed.createComponent(ShiftCashComponent);
    fixture.componentInstance.date = date; fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return fixture.componentInstance;
  }
  beforeEach(async () => {
    shift = { businessDate: date, status: 'OPEN', pettyCash: 1000, openedBy: 5, openedAt: date + 'T09:00:00', closedBy: null, closedAt: null, expectedCash: null, countedCash: null, diffReason: null, revenueByPayment: null, cups: null, rolesJson: '[]' };
    api = jasmine.createSpyObj<PosApiService>('api', ['shift', 'orders', 'reconcileCash'], { staff: signal(null) });
    api.shift.and.callFake(async () => shift); api.orders.and.resolveTo([]);
    await TestBed.configureTestingModule({ imports: [ShiftCashComponent], providers: [{ provide: PosApiService, useValue: api }] }).compileComponents();
  });

  it('現金預估扣退款但不扣損耗、不加非現金或未付款，並保留整數分精度', async () => {
    api.orders.and.resolveTo([order(), order({ payment: 'LINE_PAY', paid_amount: 99 }), order({ payment: null, payment_status: 'UNPAID', paid_amount: 0 }), order({ paid_amount: .3, refunded_amount: .1 })]);
    const page = await open();
    expect(api.shift).toHaveBeenCalledWith(date); expect(api.orders).toHaveBeenCalledWith(date);
    expect(page.expectedCash).toBe(1015.2); expect(page.unpaid).toBe(1);
    expect(page.receipts.find(row => row.label === 'LINE Pay')?.value).toBe(89);
  });
  it('缺少帳務欄位時不以售價猜測現金', async () => {
    api.orders.and.resolveTo([order({ paid_amount: undefined })]); expect((await open()).expectedCash).toBeNull();
  });
  it('已關班的現金與付款彙總使用保存值', async () => {
    shift = { ...shift, status: 'CLOSED', expectedCash: 1200, countedCash: 1190, revenueByPayment: '{"CASH":200}' };
    api.orders.and.resolveTo([order({ paid_amount: 999 })]); const page = await open();
    expect(page.expectedCash).toBe(1200); expect(page.receipts).toEqual([{ label: '現金', value: 200 }]);
  });
  it('只有班次 404 是未開班，其他錯誤顯示錯誤', async () => {
    api.shift.and.rejectWith(new HttpErrorResponse({ status: 404 })); let page = await open();
    expect(page.loaded).toBeTrue(); expect(page.shift).toBeNull(); expect(page.expectedCash).toBeNull();
    api.shift.and.rejectWith(new HttpErrorResponse({ status: 503 })); page = await open();
    expect(page.loaded).toBeFalse(); expect(page.error).toBeTruthy();
  });
  it('舊版系統關班的假實點顯示待清點，人工關班仍顯示差額', async () => {
    shift = { ...shift, status: 'CLOSED', expectedCash: 1000, countedCash: 1000, closedBy: 5, diffReason: '系統逾午夜自動收班' };
    const page = await open();
    expect(page.automatic).toBeTrue(); expect(page.needsCount).toBeTrue(); expect(page.differenceText).toBe('待清點');
    shift.diffReason = '人工清點'; shift.countedCash = 980;
    expect(page.needsCount).toBeFalse(); expect(page.differenceText).toContain('短少');
    expect(page.differenceText).toContain('20');
  });
  it('店長不查 POS 訂單，確認成功後顯示清點差額；失敗保留輸入供核對', async () => {
    Object.defineProperty(api, 'staff', { value: signal({ level: 'MANAGER' }) });
    shift = { ...shift, status: 'CLOSED', expectedCash: 1000, diffReason: '系統逾午夜自動收班' };
    const page = await open();
    expect(api.orders).not.toHaveBeenCalled();
    page.countedCash = 980; page.diffReason = '找零短少';
    api.reconcileCash.and.rejectWith(new HttpErrorResponse({ status: 0 }));
    await page.reconcile(); expect(page.countedCash).toBe(980); expect(page.needsCount).toBeTrue();
    api.reconcileCash.and.resolveTo({ ...shift, countedCash: 980, closedBy: 5, diffReason: '系統逾午夜自動收班；清點確認 2026-11-07T09:00；差異原因：找零短少' });
    await page.reconcile();
    expect(api.reconcileCash).toHaveBeenCalledWith(date, 980, '找零短少');
    expect(page.needsCount).toBeFalse(); expect(page.differenceText).toContain('短少');
  });
});
