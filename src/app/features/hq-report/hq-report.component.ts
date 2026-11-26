import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HqReportResponse, HqStore, HqStoreRow, HqTopProduct, HqTrendPoint } from '../../models/hq-report';
import { money } from '../../models/pos';
import { PosApiService, errorMessage, hqFeatureError } from '../../services/pos-api.service';
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

  mode: 'month' | 'day' | 'range' = 'month';
  /** 區間模式：開始、結束日期（含），最多 MAX_RANGE_DAYS 天。 */
  rangeFrom = this.dateString(this.addDays(new Date(), -6));
  rangeTo = this.dateString(new Date());
  rangeError = '';
  readonly MAX_RANGE_DAYS = 92;
  readonly rangePresets: { label: string; days: number }[] = [
    { label: '近 7 天', days: 7 }, { label: '近 14 天', days: 14 }, { label: '近 30 天', days: 30 }, { label: '近 90 天', days: 90 }];
  /** 分頁：總覽（營收、熱銷、訂單）、飲品、加料、客製、冷熱甜度。總覽以外都讀 /api/hq-reports/details。 */
  tab: 'overview' | 'products' | 'toppings' | 'options' | 'tempSugar' = 'overview';
  readonly tabs: { key: 'overview' | 'products' | 'toppings' | 'options' | 'tempSugar'; label: string }[] = [
    { key: 'overview', label: '總覽' }, { key: 'products', label: '飲品' }, { key: 'toppings', label: '加料' },
    { key: 'options', label: '客製' }, { key: 'tempSugar', label: '冷熱甜度' }];
  /** 細項分頁的期間：日＝那一天；月＝那個月的第一天到最後一天。 */
  get detailFrom(): string {
    if (this.mode === 'range') return this.rangeFrom;
    return this.mode === 'day' ? this.selectedDate : `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}-01`;
  }
  get detailTo(): string {
    if (this.mode === 'range') return this.rangeTo;
    if (this.mode === 'day') return this.selectedDate;
    const last = new Date(Number(this.selectedYear), Number(this.selectedMonth), 0).getDate();
    return `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  }
  selectedDate = this.todayString();
  selectedYear = new Date().getFullYear();
  selectedMonth = new Date().getMonth() + 1;

  readonly years = [2025, 2026, 2027];
  readonly months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  /** 分店篩選（區域 → 縣市 → 分店）：都是 null＝全部分店合計。 */
  stores: HqStore[] = [];
  storeLookupError = '';
  selectedRegion: string | null = null;
  /** 縣市；'' 代表「未設定縣市」。 */
  selectedCity: string | null = null;
  selectedStoreId: number | null = null;
  readonly noCity = '';

  loading = false;
  error = '';
  report: HqReportResponse | null = null;

  ngOnInit(): void {
    void this.loadStores();
    void this.load();
  }

  private async loadStores(): Promise<void> {
    this.storeLookupError = '';
    try { this.stores = await this.api.hqStores(); }
    catch (err) {
      this.stores = [];
      this.storeLookupError = hqFeatureError(err, '分店篩選');
    }
  }

  /** 有分店的區域（照後端排好的順序）。 */
  get regions(): { name: string; count: number }[] {
    const list: { name: string; count: number }[] = [];
    for (const s of this.stores) {
      const hit = list.find(r => r.name === s.region);
      if (hit) hit.count++; else list.push({ name: s.region, count: 1 });
    }
    return list;
  }

  /** 選定區域裡有分店的縣市。 */
  get cities(): { key: string; label: string; count: number }[] {
    if (this.selectedRegion === null) return [];
    const list: { key: string; label: string; count: number }[] = [];
    for (const s of this.stores.filter(x => x.region === this.selectedRegion)) {
      const key = s.city ?? this.noCity;
      const hit = list.find(c => c.key === key);
      if (hit) hit.count++; else list.push({ key, label: s.city ?? '未設定縣市', count: 1 });
    }
    return list;
  }

  /** 選定縣市裡的分店。 */
  get cityStores(): HqStore[] {
    if (this.selectedRegion === null || this.selectedCity === null) return [];
    return this.stores.filter(s => s.region === this.selectedRegion && (s.city ?? this.noCity) === this.selectedCity);
  }

  /** 目前篩選範圍的分店 id；null＝全部分店。 */
  get scopeStoreIds(): number[] | null {
    if (this.selectedStoreId !== null) return [this.selectedStoreId];
    if (this.selectedRegion === null) return null;
    const ids = this.stores
      .filter(s => s.region === this.selectedRegion && (this.selectedCity === null || (s.city ?? this.noCity) === this.selectedCity))
      .map(s => s.storeId);
    return ids.length ? ids : null;
  }

  /** 目前範圍的文字，例如「南部 › 高雄市 › 前鎮店」。 */
  get scopeLabel(): string {
    if (this.selectedRegion === null) return '全部分店';
    const parts = [this.selectedRegion];
    if (this.selectedCity !== null) parts.push(this.selectedCity === this.noCity ? '未設定縣市' : this.selectedCity);
    const store = this.stores.find(s => s.storeId === this.selectedStoreId);
    if (store) parts.push(store.name);
    return parts.join(' › ');
  }

  selectRegion(region: string | null): void {
    if (this.loading) return;
    this.selectedRegion = region;
    this.selectedCity = null;
    this.selectedStoreId = null;
    void this.load();
  }

  selectCity(city: string | null): void {
    if (this.loading) return;
    this.selectedCity = city;
    this.selectedStoreId = null;
    void this.load();
  }

  /** 選分店（下拉選單或點各分店表格的列）：區域、縣市跟著帶入。null＝回到上一層（縣市）。 */
  selectStore(storeId: number | null): void {
    if (this.loading) return;
    const store = storeId === null ? undefined : this.stores.find(s => s.storeId === Number(storeId));
    if (store) {
      this.selectedRegion = store.region;
      this.selectedCity = store.city ?? this.noCity;
    }
    this.selectedStoreId = store ? store.storeId : null;
    void this.load();
  }

  /** 清除篩選，回到全部分店。 */
  clearScope(): void {
    if (this.loading) return;
    this.selectedRegion = null;
    this.selectedCity = null;
    this.selectedStoreId = null;
    void this.load();
  }

  get maxStoreRevenue(): number {
    return Math.max(1, ...(this.report?.byStore ?? []).map(s => Number(s.revenue) || 0));
  }

  storeWidthPercent(row: HqStoreRow): number {
    const rev = Number(row.revenue) || 0;
    return rev <= 0 ? 0 : Math.max(4, Math.round((rev / this.maxStoreRevenue) * 100));
  }

  /** 營收占比（各分店合計為分母）。 */
  storeShare(row: HqStoreRow): number {
    const total = (this.report?.byStore ?? []).reduce((sum, s) => sum + (Number(s.revenue) || 0), 0);
    return total > 0 ? Math.round(((Number(row.revenue) || 0) / total) * 1000) / 10 : 0;
  }

  avgTicket(row: HqStoreRow): number {
    return row.orderCount > 0 ? Math.round((Number(row.revenue) || 0) / row.orderCount) : 0;
  }

  private todayString(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private addDays(d: Date, days: number): Date {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  private dateString(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** 區間天數（含頭尾）；日期不完整回傳 0。 */
  get rangeDays(): number {
    if (!this.rangeFrom || !this.rangeTo) return 0;
    const ms = new Date(this.rangeTo + 'T00:00:00').getTime() - new Date(this.rangeFrom + 'T00:00:00').getTime();
    return Math.round(ms / 86400000) + 1;
  }

  /** 快速區間：到今天為止的最近 N 天。 */
  applyPreset(days: number): void {
    if (this.loading) return;
    const today = new Date();
    this.rangeTo = this.dateString(today);
    this.rangeFrom = this.dateString(this.addDays(today, -(days - 1)));
    void this.load();
  }

  isPresetActive(days: number): boolean {
    return this.rangeTo === this.dateString(new Date()) && this.rangeDays === days;
  }

  /** 改了開始或結束日期：檢查通過才重新查詢。 */
  changeRange(): void { void this.load(); }

  private getRangeError(): string {
    if (!this.rangeFrom || !this.rangeTo) return '請選擇開始和結束日期';
    if (this.rangeFrom > this.rangeTo) return '開始日期不能晚於結束日期';
    if (this.rangeDays > this.MAX_RANGE_DAYS) return `一次最多查詢 ${this.MAX_RANGE_DAYS} 天`;
    return '';
  }

  /** 報表期間文字（標題用）。 */
  periodLabel(data: HqReportResponse): string {
    if (data.mode === 'day') return data.date;
    if (data.mode === 'range') return data.from === data.to ? `${data.from}` : `${data.from} ～ ${data.to}`;
    return `${data.year} 年 ${data.month} 月`;
  }

  setMode(mode: 'month' | 'day' | 'range'): void {
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
    this.report = null;
    this.error = '';
    this.rangeError = this.mode === 'range' ? this.getRangeError() : '';
    if (this.rangeError) return;
    this.loading = true;
    try {
      const report = await this.api.hqReport(
        this.mode === 'range'
          ? { mode: 'range', from: this.rangeFrom, to: this.rangeTo, storeIds: this.scopeStoreIds }
          : this.mode === 'day'
          ? { mode: 'day', date: this.selectedDate, storeIds: this.scopeStoreIds }
          : { mode: 'month', year: this.selectedYear, month: this.selectedMonth, storeIds: this.scopeStoreIds }
      );
      if (this.mode === 'range' && (report.mode !== 'range' || report.from !== this.rangeFrom || report.to !== this.rangeTo)) {
        throw new Error('後端回傳的期間與所選區間不符，請重新查詢。');
      }
      this.report = report;
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
