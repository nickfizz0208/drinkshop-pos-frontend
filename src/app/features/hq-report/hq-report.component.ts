import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HqReportResponse, HqTopProduct, HqTrendPoint } from '../../models/hq-report';
import { money } from '../../models/pos';
import { PosApiService, errorMessage } from '../../services/pos-api.service';
import { HqDetailComponent } from './hq-detail/hq-detail.component';

@Component({
  selector: 'app-hq-report',
  imports: [FormsModule, HqDetailComponent],
  templateUrl: './hq-report.component.html',
  styleUrl: './hq-report.component.scss'
})
export class HqReportComponent implements OnInit {
  private readonly api = inject(PosApiService);
  readonly money = money;

  mode: 'month' | 'day' = 'month';
  /** 分頁：總覽（營收、熱銷、訂單）、飲品、加料、客製、冷熱甜度。總覽以外都讀 /api/hq-reports/details。 */
  tab: 'overview' | 'products' | 'toppings' | 'options' | 'tempSugar' = 'overview';
  readonly tabs: { key: 'overview' | 'products' | 'toppings' | 'options' | 'tempSugar'; label: string }[] = [
    { key: 'overview', label: '總覽' }, { key: 'products', label: '飲品' }, { key: 'toppings', label: '加料' },
    { key: 'options', label: '客製' }, { key: 'tempSugar', label: '冷熱甜度' }];
  /** 細項分頁的期間：日＝那一天；月＝那個月的第一天到最後一天。 */
  get detailFrom(): string {
    return this.mode === 'day' ? this.selectedDate : `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}-01`;
  }
  get detailTo(): string {
    if (this.mode === 'day') return this.selectedDate;
    const last = new Date(Number(this.selectedYear), Number(this.selectedMonth), 0).getDate();
    return `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  }
  selectedDate = this.todayString();
  selectedYear = new Date().getFullYear();
  selectedMonth = new Date().getMonth() + 1;

  readonly years = [2025, 2026, 2027];
  readonly months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  loading = false;
  error = '';
  report: HqReportResponse | null = null;

  ngOnInit(): void {
    void this.load();
  }

  private todayString(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  setMode(mode: 'month' | 'day'): void {
    if (this.mode === mode || this.loading) return;
    this.mode = mode;
    void this.load();
  }

  selectMonth(month: number): void {
    if (this.selectedMonth === month || this.loading) return;
    this.selectedMonth = month;
    void this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      this.report = await this.api.hqReport(
        this.mode === 'day'
          ? { mode: 'day', date: this.selectedDate }
          : { mode: 'month', year: this.selectedYear, month: this.selectedMonth }
      );
    } catch (err) {
      this.error = errorMessage(err);
    } finally {
      this.loading = false;
    }
  }

  get maxTrendRevenue(): number {
    const list = this.report?.trend ?? [];
    return Math.max(1, ...list.map(p => Number(p.revenue) || 0));
  }

  get maxProductRevenue(): number {
    const list = this.report?.topProducts ?? [];
    return Math.max(1, ...list.map(p => Number(p.revenue) || 0));
  }

  barHeightPercent(point: HqTrendPoint): number {
    const rev = Number(point.revenue) || 0;
    if (rev <= 0) return 0;
    return Math.max(6, Math.round((rev / this.maxTrendRevenue) * 100));
  }

  productWidthPercent(item: HqTopProduct): number {
    const rev = Number(item.revenue) || 0;
    if (rev <= 0) return 0;
    return Math.max(6, Math.round((rev / this.maxProductRevenue) * 100));
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'COMPLETED':
      case 'DONE': return '已完成';
      case 'PICKED_UP': return '已取餐';
      case 'PREPARING':
      case 'MAKING': return '製作中';
      case 'PENDING': return '待製作';
      case 'CANCELLED': return '已取消';
      default: return status;
    }
  }

  paymentLabel(payment: string): string {
    switch (payment) {
      case 'CASH': return '現金';
      case 'LINE_PAY': return 'LINE Pay';
      case 'CREDIT_CARD':
      case 'CARD': return '信用卡';
      case 'UBER_EATS': return 'Uber Eats';
      default: return payment || '未收款';
    }
  }
}
