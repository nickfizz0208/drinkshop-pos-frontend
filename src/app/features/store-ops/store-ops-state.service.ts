import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { PosApiService, errorMessage } from '../../services/pos-api.service';
import { UiStateService } from '../../shared/ui-state.service';
import { money, taipeiDate } from '../../models/pos';
import { Inventory, RawReview, RawWastage, WastageSummary } from '../../models/store-ops';
import { ShiftStatus } from '../../models/time-clock';

const validNumber = (n: number | null, max = 99999999.99) => n !== null && Number.isFinite(n) && n >= 0 && n <= max && Math.abs(n * 100 - Math.round(n * 100)) < .00001;

/**
 * 原料報廢回報（店員、店長的個人帳號）：登記原料報廢，並查看每日的原料報廢紀錄。
 * 飲品取消與報廢在門市 POS 的訂單管理處理。
 * 班次與現金核對移到訂單管理的「班次與現金」彈窗（POS 帳號）；開班、關班統一在上方工具列。
 */
@Injectable({ providedIn: 'root' })
export class StoreOpsStateService {
  readonly api = inject(PosApiService);
  readonly ui = inject(UiStateService);
  readonly money = money;
  date = taipeiDate();
  month = taipeiDate().slice(0, 7);
  viewMode: 'date' | 'month' = 'date';
  filterInventoryId: number | null = null;
  filterReporterId: number | null = null;
  filterKeyword = '';
  /** 今天的班次狀態（只用來判斷能不能登記原料報廢）；null＝還沒查到。 */
  shiftStatus: ShiftStatus | null = null;
  private shiftDate = '';
  wastage: WastageSummary | null = null;
  inventory: Inventory[] = [];
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

  get isManager(): boolean { return ['MANAGER', 'HQ'].includes(this.api.staff()?.level ?? ''); }
  get currentTarget(): string { return this.viewMode === 'month' ? this.month : this.date; }
  get ready(): boolean { return this.loaded && !this.loading && this.loadedDate === this.currentTarget && this.loadedStaff === this.api.staff()?.staffId && !this.ui.preview; }
  get selectedMaterial(): Inventory | undefined { return this.inventory.find(i => i.inventoryId === this.rawId); }
  /** 只能登記台北今日、而且今天開班中的原料報廢。 */
  get canRaw(): boolean {
    const today = taipeiDate();
    return this.viewMode === 'date' && this.ready && this.storageReadable && this.date === today && this.shiftDate === today && this.shiftStatus === 'OPEN'
      && this.wastage?.rawWastageEnabled === true && !this.rawReview;
  }
  get hasFilter(): boolean { return this.filterInventoryId !== null || this.filterReporterId !== null || this.filterKeyword.trim().length > 0; }
  get reporterOptions(): { id: number; name: string }[] {
    const map = new Map<number, string>();
    for (const r of this.wastage?.rawMaterialWastages ?? []) {
      if (!map.has(r.reportedBy)) map.set(r.reportedBy, this.reporterLabel(r));
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }
  get visibleRawWastages(): RawWastage[] {
    const rows = this.wastage?.rawMaterialWastages ?? [];
    if (this.isManager) return rows;
    const myId = this.api.staff()?.staffId;
    return myId ? rows.filter(r => r.reportedBy === myId) : [];
  }
  get filteredRawWastages(): RawWastage[] {
    const rows = this.visibleRawWastages;
    const kw = this.filterKeyword.trim().toLocaleLowerCase();
    return rows.filter(item => {
      if (this.filterInventoryId !== null && item.inventoryId !== this.filterInventoryId) return false;
      if (this.isManager && this.filterReporterId !== null && item.reportedBy !== this.filterReporterId) return false;
      if (!kw) return true;
      const matName = (this.inventory.find(i => i.inventoryId === item.inventoryId)?.name ?? '#' + item.inventoryId).toLocaleLowerCase();
      const staffText = this.reporterLabel(item).toLocaleLowerCase();
      return matName.includes(kw) || item.reason.toLocaleLowerCase().includes(kw)
        || (item.businessDate ?? '').toLocaleLowerCase().includes(kw)
        || item.reportedAt.toLocaleLowerCase().includes(kw) || staffText.includes(kw);
    });
  }
  get filteredCostLabel(): string {
    if (!this.wastage) return this.money(0);
    const hasHiddenOthers = !this.isManager && this.visibleRawWastages.length !== this.wastage.rawMaterialWastages.length;
    if (!this.hasFilter && !hasHiddenOthers) {
      return this.wastage.costComplete && this.wastage.totalWastageCost !== null
        ? this.money(this.wastage.totalWastageCost) : '成本未建檔，無法完整估算';
    }
    const rows = this.filteredRawWastages;
    if (rows.some(r => r.materialCost === null)) return '成本未建檔，無法完整估算';
    const totalCents = rows.reduce((sum, r) => sum + Math.round((r.materialCost ?? 0) * 100), 0);
    return this.money(totalCents / 100);
  }
  reporterLabel(item: RawWastage): string {
    const name = item.reportedByName?.trim();
    return name ? name : `員工 #${item.reportedBy}`;
  }
  clearFilters(): void {
    this.filterInventoryId = null;
    this.filterReporterId = null;
    this.filterKeyword = '';
  }
  async switchViewMode(mode: 'date' | 'month'): Promise<void> {
    if (this.viewMode === mode && this.ready) return;
    this.viewMode = mode;
    if (!this.month) this.month = this.date.slice(0, 7) || taipeiDate().slice(0, 7);
    await this.load();
  }
  async load(): Promise<void> {
    const token = ++this.version;
    const target = this.currentTarget; const staff = this.api.staff()?.staffId;
    this.clearData(); this.rawConfirm = null; this.error = '';
    if (this.ui.preview || !staff) return;
    this.restoreReview(); this.loading = true;
    try {
      const wastageReq = this.viewMode === 'month' ? this.api.monthlyWastages(this.month) : this.api.wastages(this.date);
      const [today, wastage, inventory] = await Promise.all([this.api.shiftToday(), wastageReq, this.api.inventories()]);
      if (token !== this.version || staff !== this.api.staff()?.staffId || target !== this.currentTarget) return;
      this.shiftStatus = today.shiftStatus; this.shiftDate = today.businessDate;
      this.wastage = wastage; this.inventory = inventory;
      this.loadedDate = target; this.loadedStaff = staff; this.loaded = true;
    } catch (error) { if (token === this.version) this.error = errorMessage(error); }
    finally { if (token === this.version) this.loading = false; }
  }
  prepareRaw(): void {
    if (this.ui.busy || !this.canRaw) return;
    const material = this.selectedMaterial;
    if (!material || !validNumber(this.rawQty, 9999999999.99) || !this.rawQty || !this.rawReason.trim() || this.rawReason.trim().length > 255) {
      this.error = '請選原料、填寫大於零的數量（最多兩位小數），以及 255 字內原因。'; return;
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
      this.rawQty = null; this.rawReason = ''; this.ui.notice = '已登記原料報廢。帳面庫存不變，以盤點為準。';
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
  closeTransient(): void { this.version++; this.loading = false; this.loaded = false; this.rawConfirm = null; }
  reset(): void {
    this.closeTransient(); this.clearData(); this.date = taipeiDate(); this.month = taipeiDate().slice(0, 7);
    this.viewMode = 'date'; this.filterInventoryId = null; this.filterReporterId = null; this.filterKeyword = ''; this.error = '';
    this.rawId = null; this.rawQty = null; this.rawReason = '';
    this.rawReview = null; this.reviewRows = []; this.reviewLoaded = false; this.reviewChecked = false;
  }
  private async refreshAfterWrite(): Promise<void> {
    await this.load();
    if (this.error) this.error = '操作已完成，但資料重新讀取失敗。請重新整理，不要重複提交。' + this.error;
  }
  private clearData(): void { this.loaded = false; this.loading = false; this.shiftStatus = null; this.shiftDate = ''; this.wastage = null; this.inventory = []; }
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
