import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ModalComponent } from '../../shared/modal.component';
import { PosApiService, errorMessage } from '../../services/pos-api.service';
import { OrderSummary, PAYMENT_LABELS, cents, money } from '../../models/pos';
import { DailyShift } from '../../models/store-ops';
import { FormsModule } from '@angular/forms';
import { taipeiDate } from '../../models/pos';
import { NumpadButtonComponent } from '../../shared/numpad-button.component';

/**
 * 訂單管理的「班次與現金」彈窗（POS 帳號）：這個營業日的開班底金、各付款方式淨收款與應有現金。
 * 店長可選日期補記系統關班後的實際清點；開班、關班統一在上方工具列。
 */
@Component({
  selector: 'app-shift-cash',
  imports: [ModalComponent, FormsModule, NumpadButtonComponent],
  templateUrl: './shift-cash.component.html',
  styleUrl: './shift-cash.component.scss'
})
export class ShiftCashComponent implements OnInit {
  private readonly api = inject(PosApiService);
  /** 營業日（YYYY-MM-DD），通常是訂單管理目前選的日期。 */
  @Input() date = taipeiDate();
  @Output() dismissed = new EventEmitter<void>();
  readonly money = money;
  shift: DailyShift | null = null;
  orders: OrderSummary[] = [];
  loading = false;
  loaded = false;
  error = '';
  saving = false;
  countedCash: number | null = null;
  diffReason = '';
  get isManager(): boolean { return this.api.staff()?.level === 'MANAGER'; }
  get automatic(): boolean { return this.shift?.diffReason?.startsWith('系統逾午夜自動收班') ?? false; }
  get needsCount(): boolean {
    return this.shift?.status === 'CLOSED' && (this.shift.countedCash === null
      || this.shift.diffReason === '系統逾午夜自動收班');
  }
  get differenceText(): string {
    if (this.needsCount || this.shift?.countedCash == null || this.expectedCash === null) return '待清點';
    const difference = cents(this.shift.countedCash) - cents(this.expectedCash);
    return difference === 0 ? '金額相符' : (difference < 0 ? '短少 ' : '溢收 ') + money(Math.abs(difference) / 100);
  }

  async reconcile(): Promise<void> {
    if (this.saving || this.loading || !this.isManager || !this.needsCount || this.countedCash === null) return;
    this.saving = true; this.error = '';
    try {
      this.shift = await this.api.reconcileCash(this.date, this.countedCash, this.diffReason.trim());
      this.countedCash = null; this.diffReason = '';
    } catch (error) { this.error = errorMessage(error); }
    finally { this.saving = false; }
  }

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    if (this.saving || this.loading) return;
    if (!this.date) { this.loaded = false; this.shift = null; this.error = '請選擇營業日期'; return; }
    this.countedCash = null; this.diffReason = '';
    this.loading = true; this.loaded = false; this.error = '';
    try {
      const [shift, orders] = await Promise.all([
        // 班次 404＝這天沒有開班；其他錯誤照常顯示
        this.api.shift(this.date).catch(error => { if (error instanceof HttpErrorResponse && error.status === 404) return null; throw error; }),
        this.isManager ? Promise.resolve([]) : this.api.orders(this.date)
      ]);
      this.shift = shift; this.orders = orders; this.loaded = true;
    } catch (error) { this.error = errorMessage(error); }
    finally { this.loading = false; }
  }

  /** 應有現金＝底金＋現金淨收款（已扣找零與退款）；已關班用關班時保存的值。帳務欄位不完整時不猜，回傳 null。 */
  get expectedCash(): number | null {
    if (!this.loaded || !this.shift) return null;
    if (this.shift.status === 'CLOSED' || this.isManager) return this.shift.expectedCash;
    const cash = this.orders.filter(o => o.payment === 'CASH');
    if (cash.some(o => typeof o.paid_amount !== 'number' || typeof o.refunded_amount !== 'number' || !Number.isFinite(o.paid_amount) || !Number.isFinite(o.refunded_amount))) return null;
    return (cents(this.shift.pettyCash) + cash.reduce((n, o) => n + cents(o.paid_amount!) - cents(o.refunded_amount!), 0)) / 100;
  }
  get unfinished(): number { return this.orders.filter(o => ['PENDING', 'MAKING', 'DONE'].includes(o.status)).length; }
  get unpaid(): number { return this.orders.filter(o => o.payment_status === 'UNPAID' && !['CANCELLED', 'WASTED'].includes(o.status)).length; }
  /** 各付款方式淨收款；已關班用關班時保存的彙總。 */
  get receipts(): { label: string; value: number }[] {
    if (this.shift?.status === 'CLOSED') {
      try {
        const saved = JSON.parse(this.shift.revenueByPayment ?? '{}');
        return Object.entries(saved).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)).map(([key, value]) => ({ label: PAYMENT_LABELS[key as keyof typeof PAYMENT_LABELS] ?? key, value: value as number }));
      } catch { return []; }
    }
    return ['CASH', 'CREDIT_CARD', 'LINE_PAY', 'UBER_EATS'].flatMap(key => {
      const rows = this.orders.filter(o => o.payment === key);
      return rows.length && rows.every(o => typeof o.paid_amount === 'number' && typeof o.refunded_amount === 'number') ? [{ label: PAYMENT_LABELS[key as keyof typeof PAYMENT_LABELS], value: rows.reduce((n, o) => n + cents(o.paid_amount!) - cents(o.refunded_amount!), 0) / 100 }] : [];
    });
  }
}
