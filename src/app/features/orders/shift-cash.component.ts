import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ModalComponent } from '../../shared/modal.component';
import { PosApiService, errorMessage } from '../../services/pos-api.service';
import { OrderSummary, PAYMENT_LABELS, cents, money } from '../../models/pos';
import { DailyShift } from '../../models/store-ops';

/**
 * 訂單管理的「班次與現金」彈窗（POS 帳號）：這個營業日的開班底金、各付款方式淨收款與應有現金。
 * 只讀不寫；開班、關班統一在上方工具列。原本放在日結與報廢頁，那一頁改成店員、店長的原料報廢回報後移到這裡。
 */
@Component({
  selector: 'app-shift-cash',
  imports: [ModalComponent],
  templateUrl: './shift-cash.component.html',
  styleUrl: './shift-cash.component.scss'
})
export class ShiftCashComponent implements OnInit {
  private readonly api = inject(PosApiService);
  /** 營業日（YYYY-MM-DD），通常是訂單管理目前選的日期。 */
  @Input({ required: true }) date = '';
  @Output() dismissed = new EventEmitter<void>();
  readonly money = money;
  shift: DailyShift | null = null;
  orders: OrderSummary[] = [];
  loading = false;
  loaded = false;
  error = '';

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading = true; this.loaded = false; this.error = '';
    try {
      const [shift, orders] = await Promise.all([
        // 班次 404＝這天沒有開班；其他錯誤照常顯示
        this.api.shift(this.date).catch(error => { if (error instanceof HttpErrorResponse && error.status === 404) return null; throw error; }),
        this.api.orders(this.date)
      ]);
      this.shift = shift; this.orders = orders; this.loaded = true;
    } catch (error) { this.error = errorMessage(error); }
    finally { this.loading = false; }
  }

  /** 應有現金＝底金＋現金淨收款（已扣找零與退款）；已關班用關班時保存的值。帳務欄位不完整時不猜，回傳 null。 */
  get expectedCash(): number | null {
    if (!this.loaded || !this.shift) return null;
    if (this.shift.status === 'CLOSED') return this.shift.expectedCash;
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
