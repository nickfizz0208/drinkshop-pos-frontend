import { Injectable, effect, inject, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { PosApiService, errorMessage } from '../../services/pos-api.service';
import { InventoryCountApiService } from '../../services/inventory-count-api.service';
import { UiStateService } from '../../shared/ui-state.service';
import { CountRow, CountSubmit, InventoryItem } from '../../models/inventory-count';
import { cents, taipeiDate } from '../../models/pos';

/** 一項原料的輸入：有包裝單位時填「幾包＋零散」，沒有包裝單位只填 loose（基本單位）。 */
export interface CountEntry { packs: number | null; loose: number | null; }
/** 確認彈窗裡的一列。 */
export interface CountLine { item: InventoryItem; counted: number; diff: number; }
/** 歷史紀錄依「一次送出」分組。 */
export interface CountGroup {
  requestId: string; countedAt: string; countedByName: string | null; note: string | null;
  rows: CountRow[]; shortCount: number; overCount: number;
  /** 盤虧＋盤盈的成本合計；有原料沒有單位成本時為 null（不能當成 0）。 */
  diffCost: number | null;
}

const MAX_QTY = 9999999999.99;
const twoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
const addDays = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);

/**
 * 原料盤點：員工本人用個人帳號盤點，送出後只記錄實點與差異，不修改帳面庫存。
 * root scope：切到別頁再回來，輸入到一半的數量還在；登出時清除。
 */
@Injectable({ providedIn: 'root' })
export class InventoryCountStateService {
  private readonly api = inject(InventoryCountApiService);
  private readonly pos = inject(PosApiService);
  readonly ui = inject(UiStateService);

  items: InventoryItem[] = [];
  entries: Record<number, CountEntry> = {};
  note = '';
  search = '';
  /** null＝還沒查到；false＝資料庫還沒升級 016，不能送出。 */
  enabled: boolean | null = null;
  loading = false;
  loaded = false;
  error = '';
  confirmOpen = false;
  confirmError = '';
  /** 已送出但結果不明（逾時、斷線）：內容沒改就沿用同一個 requestId 重送，後端不會重複記錄。 */
  pending: { requestId: string; body: string } | null = null;
  lastResult: CountRow[] | null = null;

  historyFrom = addDays(taipeiDate(), -6);
  historyTo = taipeiDate();
  history: CountRow[] = [];
  historyLoading = false;
  historyError = '';
  expanded: string | null = null;
  private version = 0;
  private historyVersion = 0;
  private loadedStaff: number | null = null;

  constructor() {
    // 登出（或登入逾時）時清掉輸入到一半的盤點，下一位登入的人看不到
    effect(() => { if (!this.pos.staff()) untracked(() => this.reset()); });
  }

  entry(id: number): CountEntry { return this.entries[id] ??= { packs: null, loose: null }; }
  hasPack(item: InventoryItem): boolean { return !!item.packUnit && !!item.perPack && item.perPack > 0; }
  /** 這項原料實點多少（基本單位）；沒填就是 null（不盤這項）。 */
  counted(item: InventoryItem): number | null {
    const e = this.entries[item.inventoryId];
    if (!e || (e.packs === null && e.loose === null)) return null;
    const packs = this.hasPack(item) ? (e.packs ?? 0) : 0;
    return (cents(packs * (item.perPack ?? 0)) + cents(e.loose ?? 0)) / 100;
  }
  diff(item: InventoryItem): number | null {
    const c = this.counted(item);
    return c === null ? null : (cents(c) - cents(item.bookQty)) / 100;
  }
  /** 輸入有問題時回傳原因，沒問題回傳空字串。 */
  invalid(item: InventoryItem): string {
    const e = this.entries[item.inventoryId];
    if (!e) return '';
    if (e.packs !== null && (!Number.isInteger(e.packs) || e.packs < 0)) return '包數要是 0 以上的整數';
    if (e.loose !== null && (e.loose < 0 || !twoDecimals(e.loose))) return '數量要是 0 以上、最多兩位小數';
    const c = this.counted(item);
    if (c !== null && c > MAX_QTY) return '數量太大';
    return '';
  }
  get visibleItems(): InventoryItem[] {
    const q = this.search.trim();
    return q ? this.items.filter(i => i.name.includes(q)) : this.items;
  }
  get lines(): CountLine[] {
    return this.items.flatMap(item => {
      const counted = this.counted(item);
      return counted === null ? [] : [{ item, counted, diff: this.diff(item)! }];
    });
  }
  get countedCount(): number { return this.lines.length; }
  get hasInvalid(): boolean { return this.items.some(i => this.invalid(i)); }
  get canSubmit(): boolean {
    return this.enabled === true && this.loaded && !this.ui.busy && this.countedCount > 0 && !this.hasInvalid && this.note.length <= 255;
  }
  get groups(): CountGroup[] {
    const map = new Map<string, CountGroup>();
    for (const row of this.history) {
      let g = map.get(row.requestId);
      if (!g) {
        g = { requestId: row.requestId, countedAt: row.countedAt, countedByName: row.countedByName, note: row.note, rows: [], shortCount: 0, overCount: 0, diffCost: 0 };
        map.set(row.requestId, g);
      }
      g.rows.push(row);
      if (row.diffQty < 0) g.shortCount++; else if (row.diffQty > 0) g.overCount++;
      g.diffCost = g.diffCost === null || row.diffCost === null ? null : (cents(g.diffCost) + cents(row.diffCost)) / 100;
    }
    return [...map.values()];
  }

  async load(): Promise<void> {
    const token = ++this.version; const staff = this.pos.staff()?.staffId ?? null;
    if (this.ui.preview || staff === null) return;
    // 換了一個人登入：清掉上一位沒送出的輸入
    if (this.loadedStaff !== staff) { this.clearInput(); this.lastResult = null; this.pending = null; }
    this.loading = true; this.error = '';
    try {
      const [items, history] = await Promise.all([this.api.inventories(), this.api.history(this.historyFrom, this.historyTo)]);
      if (token !== this.version) return;
      this.items = [...items].sort((a, b) => a.inventoryId - b.inventoryId);
      this.enabled = history.enabled; this.history = history.rows;
      this.loaded = true; this.loadedStaff = staff;
    } catch (error) { if (token === this.version) { this.error = errorMessage(error); this.loaded = false; } }
    finally { if (token === this.version) this.loading = false; }
  }

  async loadHistory(): Promise<void> {
    if (this.historyFrom > this.historyTo) { this.historyError = '開始日期不能晚於結束日期'; return; }
    const token = ++this.historyVersion;
    this.historyLoading = true; this.historyError = '';
    try {
      const history = await this.api.history(this.historyFrom, this.historyTo);
      if (token !== this.historyVersion) return;
      this.enabled = history.enabled; this.history = history.rows; this.expanded = null;
    } catch (error) { if (token === this.historyVersion) this.historyError = errorMessage(error); }
    finally { if (token === this.historyVersion) this.historyLoading = false; }
  }

  openConfirm(): void {
    if (!this.canSubmit) return;
    this.confirmError = ''; this.confirmOpen = true;
  }
  closeConfirm(): void { if (!this.ui.busy) this.confirmOpen = false; }

  async submit(): Promise<void> {
    if (!this.canSubmit) return;
    const note = this.note.trim() || null;
    const lines = this.lines.map(l => ({ inventoryId: l.item.inventoryId, countedQty: l.counted }));
    const body = JSON.stringify({ note, lines });
    // 上次結果不明而且內容沒改：沿用同一個 requestId，後端只會記錄一次
    const requestId = this.pending && this.pending.body === body ? this.pending.requestId : crypto.randomUUID();
    const request: CountSubmit = { requestId, note, lines };
    this.pending = { requestId, body };
    this.ui.busy = true; this.confirmError = '';
    try {
      const rows = await this.api.submit(request);
      this.pending = null; this.lastResult = rows; this.confirmOpen = false;
      this.clearInput();
      this.ui.notice = `已記錄 ${rows.length} 項原料的盤點。帳面庫存不會因盤點而改變。`;
    } catch (error) {
      // 後端明確拒絕（資料錯誤、沒權限、未啟用）：一定沒有記錄，下次送出用新的 requestId
      if (error instanceof HttpErrorResponse && [400, 401, 403, 404, 409, 503].includes(error.status)) {
        this.pending = null; this.confirmError = errorMessage(error);
      } else {
        this.confirmError = errorMessage(error) + ' 結果不確定：內容不要修改，直接再按一次「確認送出」，不會重複記錄。';
      }
      return;
    } finally { this.ui.busy = false; }
    await this.loadHistory();
  }

  /** 把帳面數量帶入（數到和帳面一樣時省得一格一格打）。 */
  fillBook(item: InventoryItem): void {
    const e = this.entry(item.inventoryId);
    if (this.hasPack(item)) {
      const packs = Math.floor(item.bookQty / item.perPack!);
      e.packs = packs; e.loose = (cents(item.bookQty) - cents(packs * item.perPack!)) / 100;
    } else { e.packs = null; e.loose = item.bookQty; }
  }
  clearEntry(item: InventoryItem): void { delete this.entries[item.inventoryId]; }
  clearInput(): void { this.entries = {}; this.note = ''; }
  closeTransient(): void { this.confirmOpen = false; this.confirmError = ''; }
  reset(): void {
    this.version++; this.historyVersion++; this.closeTransient(); this.clearInput();
    this.items = []; this.enabled = null; this.loading = false; this.loaded = false; this.error = '';
    this.pending = null; this.lastResult = null; this.search = ''; this.loadedStaff = null;
    this.history = []; this.historyError = ''; this.historyLoading = false; this.expanded = null;
    this.historyFrom = addDays(taipeiDate(), -6); this.historyTo = taipeiDate();
  }
}
