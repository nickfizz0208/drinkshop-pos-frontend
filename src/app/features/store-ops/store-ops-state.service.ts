import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { PosApiService, errorMessage } from '../../services/pos-api.service';
import { UiStateService } from '../../shared/ui-state.service';
import { PosStateService } from '../pos/pos-state.service';
import { OrdersStateService } from '../orders/orders-state.service';
import { OrderSummary, cents, money, taipeiDate, PAYMENT_LABELS } from '../../models/pos';
import { DailyShift, Inventory, RawReview, WastageSummary } from '../../models/store-ops';

const validNumber = (n: number | null, max = 99999999.99) => n !== null && Number.isFinite(n) && n >= 0 && n <= max && Math.abs(n * 100 - Math.round(n * 100)) < .00001;

/** 唯讀對帳預估與原料報廢登記。開班／關班統一在上方工具列（AppComponent），由 POS 帳號選擇開關班人員。 */
@Injectable({ providedIn: 'root' })
export class StoreOpsStateService {
  readonly api = inject(PosApiService);
  readonly ui = inject(UiStateService);
  readonly pos = inject(PosStateService);
  private readonly ordersState = inject(OrdersStateService);
  readonly money = money;
  date = taipeiDate();
  shift: DailyShift | null = null;
  wastage: WastageSummary | null = null;
  inventory: Inventory[] = [];
  orders: OrderSummary[] = [];
  loading = false;
  loaded = false;
  error = '';
  rawId: number | null = null;
  rawQty: number | null = null;
  rawReason = '';
  rawConfirm: RawReview | null = null;
  rawReview: RawReview | null = null;
  reviewRows: WastageSummary[] = [];
  reviewChecked = false;
  reviewLoaded = false;
  private version = 0;
  private loadedDate = '';
  private loadedStaff: number | null = null;
  private storageReadable = true;
  private reviewedThrough = '';

  get ready(): boolean { return this.loaded && !this.loading && this.loadedDate === this.date && this.loadedStaff === this.api.staff()?.staffId && !this.ui.preview; }
  get selectedMaterial(): Inventory | undefined { return this.inventory.find(i => i.inventoryId === this.rawId); }
  get canRaw(): boolean { return this.ready && this.storageReadable && this.date === taipeiDate() && this.shift?.status === 'OPEN' && this.wastage?.rawWastageEnabled === true && !this.rawReview; }
  get expectedCash(): number | null {
    if (!this.ready || !this.shift) return null;
    if (this.shift.status === 'CLOSED') return this.shift.expectedCash;
    const cash = this.orders.filter(o => o.payment === 'CASH');
    if (cash.some(o => typeof o.paid_amount !== 'number' || typeof o.refunded_amount !== 'number' || !Number.isFinite(o.paid_amount) || !Number.isFinite(o.refunded_amount))) return null;
    return (cents(this.shift.pettyCash) + cash.reduce((n, o) => n + cents(o.paid_amount!) - cents(o.refunded_amount!), 0)) / 100;
  }
  get unfinished(): number { return this.orders.filter(o => ['PENDING', 'MAKING', 'DONE'].includes(o.status)).length; }
  get unpaid(): number { return this.orders.filter(o => o.payment_status === 'UNPAID' && !['CANCELLED', 'WASTED'].includes(o.status)).length; }
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
  async load(): Promise<void> {
    const token = ++this.version; const date = this.date; const staff = this.api.staff()?.staffId;
    this.clearData(); this.rawConfirm = null; this.error = '';
    if (this.ui.preview || !staff) return;
    this.restoreReview(); this.loading = true;
    try {
      const [shift, wastage, inventory, orders] = await Promise.all([
        this.api.shift(date).catch(error => { if (error instanceof HttpErrorResponse && error.status === 404) return null; throw error; }),
        this.api.wastages(date), this.api.inventories(), this.api.orders(date)
      ]);
      if (token !== this.version || staff !== this.api.staff()?.staffId || date !== this.date) return;
      this.shift = shift; this.wastage = wastage; this.inventory = inventory; this.orders = orders;
      this.loadedDate = date; this.loadedStaff = staff; this.loaded = true;
    } catch (error) { if (token === this.version) this.error = errorMessage(error); }
    finally { if (token === this.version) this.loading = false; }
  }
  prepareRaw(): void {
    if (this.ui.busy || !this.canRaw) return;
    const material = this.selectedMaterial;
    if (!material || !validNumber(this.rawQty, 9999999999.99) || !this.rawQty || this.rawQty > material.bookQty || !this.rawReason.trim() || this.rawReason.trim().length > 255) {
      this.error = '請選原料、填寫大於零且不超過庫存的數量（最多兩位小數），以及 255 字內原因。'; return;
    }
    this.error = '';
    this.rawConfirm = { staffId: this.api.staff()!.staffId, date: this.date, sentAt: new Date().toISOString(), materialName: material.name, unit: material.baseUnit,
      request: { inventoryId: material.inventoryId, wastageQty: this.rawQty, reason: this.rawReason.trim() } };
  }
  async submitRaw(): Promise<void> {
    if (this.ui.busy || !this.rawConfirm) return;
    const review = this.rawConfirm;
    if (review.date !== taipeiDate() || review.date !== this.date || review.staffId !== this.api.staff()?.staffId) { this.rawConfirm = null; this.error = '日期或員工已改變，請重新整理並再次確認。'; this.loaded = false; return; }
    if (!this.canRaw) return;
    review.sentAt = new Date().toISOString();
    try { sessionStorage.setItem(this.reviewKey(), JSON.stringify(review)); }
    catch { this.error = '瀏覽器無法保存待核對紀錄，本次未送出；請允許分頁儲存後再試。'; this.rawConfirm = null; return; }
    this.rawReview = review; this.reviewLoaded = false; this.reviewChecked = false;
    this.ui.busy = true; this.error = '';
    try {
      await this.api.rawWastage(review.request); this.clearReview();
      this.rawQty = null; this.rawReason = ''; this.ui.notice = '已登記原料報廢並扣除庫存。';
    } catch (error) {
      if (error instanceof HttpErrorResponse && [400, 401, 403, 404, 409, 422].includes(error.status)) this.clearReview();
      this.error = errorMessage(error) + (this.rawReview ? ' 結果待核對，已鎖住再次登記；請先查閱紀錄。' : ' 本次未完成，請重新整理狀態。');
      this.loaded = false; return;
    } finally { this.ui.busy = false; this.rawConfirm = null; }
    await this.refreshAfterWrite();
  }
  async inspectReview(): Promise<void> {
    if (!this.rawReview || this.ui.busy || this.ui.preview) return;
    const review = this.rawReview; const token = this.version;
    const today = taipeiDate();
    const dates = this.reviewDates(review.date, today);
    this.reviewLoaded = false; this.reviewChecked = false; this.ui.busy = true; this.error = '';
    try {
      if (!dates.length) { this.error = '待核對時間超過 31 天或日期不完整，請由負責人協助核對；目前保持登記鎖定。'; return; }
      const rows = await Promise.all(dates.map(date => this.api.wastages(date)));
      if (token === this.version && this.rawReview === review) {
        this.reviewRows = rows;
        this.reviewLoaded = today === taipeiDate() && dates.every(date => rows.some(row => row.date === date));
        this.reviewedThrough = today;
        if (!this.reviewLoaded) this.error = '核對日期已改變或紀錄不完整，請重新讀取全部日期。';
      }
    } catch (error) { this.error = errorMessage(error); }
    finally { this.ui.busy = false; }
  }
  async acknowledgeReview(): Promise<void> {
    if (this.ui.busy || !this.reviewLoaded || !this.reviewChecked || !this.rawReview) return;
    const dates = this.reviewDates(this.rawReview.date, taipeiDate());
    if (this.reviewedThrough !== taipeiDate() || !dates.length || !dates.every(date => this.reviewRows.some(row => row.date === date))) {
      this.reviewLoaded = false; this.reviewChecked = false; this.error = '核對後日期已改變，請重新讀取全部日期再確認。'; return;
    }
    this.clearReview(); await this.load();
  }
  async showOrder(id?: number): Promise<void> {
    if (this.ui.busy) return;
    if (id) { this.ordersState.orderDate = this.date; this.ordersState.orderTab = 'history'; await this.ordersState.showOrder(id); await this.ordersState.loadOrders(); }
    else if (this.ui.navigate('orders')) await this.ordersState.loadOrders();
  }
  closeTransient(): void { this.version++; this.loading = false; this.loaded = false; this.rawConfirm = null; }
  reset(): void {
    this.closeTransient(); this.clearData(); this.date = taipeiDate(); this.error = '';
    this.rawId = null; this.rawQty = null; this.rawReason = '';
    this.rawReview = null; this.reviewRows = []; this.reviewLoaded = false; this.reviewChecked = false;
  }
  private async refreshAfterWrite(): Promise<void> {
    await this.load();
    if (this.error) this.error = '操作已完成，但資料重新讀取失敗。請重新整理，不要重複提交。' + this.error;
  }
  private clearData(): void { this.loaded = false; this.loading = false; this.shift = null; this.wastage = null; this.inventory = []; this.orders = []; }
  private reviewKey(): string { return 'qingri.raw-review.' + this.api.staff()?.staffId; }
  private reviewDates(from: string, through: string): string[] {
    const start = Date.parse(from + 'T00:00:00Z'); const end = Date.parse(through + 'T00:00:00Z');
    const days = (end - start) / 86400000;
    if (!Number.isInteger(days) || days < 0 || days > 30) return [];
    return Array.from({ length: days + 1 }, (_, i) => new Date(start + i * 86400000).toISOString().slice(0, 10));
  }
  private restoreReview(): void {
    this.storageReadable = true;
    this.rawReview = null; this.reviewLoaded = false; this.reviewChecked = false; this.reviewRows = [];
    try {
      const raw = sessionStorage.getItem(this.reviewKey());
      if (raw) {
        const saved = JSON.parse(raw) as RawReview;
        if (saved.staffId === this.api.staff()?.staffId && /^\d{4}-\d{2}-\d{2}$/.test(saved.date) && saved.request?.inventoryId > 0) this.rawReview = saved;
      }
    } catch { this.storageReadable = false; this.error = '無法讀取報廢待核對紀錄，請先確認瀏覽器儲存功能。'; }
  }
  private clearReview(): void {
    try { sessionStorage.removeItem(this.reviewKey()); } catch { /* 殘留標記會要求額外核對，不能造成盲目重送。 */ }
    this.rawReview = null; this.reviewRows = []; this.reviewLoaded = false; this.reviewChecked = false;
  }
}
