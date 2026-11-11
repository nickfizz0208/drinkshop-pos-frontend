import { Injectable, effect, inject, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { PosApiService, errorMessage } from '../../services/pos-api.service';
import { InventoryCountApiService } from '../../services/inventory-count-api.service';
import { UiStateService } from '../../shared/ui-state.service';
import { CountRow, CountSubmit, CountType, InputMode, InventoryItem, SaveType } from '../../models/inventory-count';
import { cents, taipeiDate } from '../../models/pos';
import { PackInfo, byPack } from '../../shared/pack-format';

/** 一項原料的輸入：有包裝單位時填「幾包＋零散」，沒有包裝單位只填 loose（基本單位）。 */
export interface CountEntry { packs: number | null; loose: number | null; }
/** 確認彈窗裡的一列。 */
export interface CountLine { item: InventoryItem; counted: number; diff: number; }
/** 歷史紀錄依「一次送出」分組。 */
export interface CountGroup {
  requestId: string; countedAt: string; countedByName: string | null; note: string | null;
  typeName: string; inputMode: InputMode;
  rows: CountRow[]; shortCount: number; overCount: number;
  /** 盤虧＋盤盈的成本合計；有原料沒有單位成本時為 null（不能當成 0）。 */
  diffCost: number | null;
}

/** 店長管理盤點類型時的表單；typeId 為 null 是新增。 */
export interface TypeForm { typeId: number | null; name: string; inputMode: InputMode; allItems: boolean; itemIds: Set<number>; active: boolean; }

const MAX_QTY = 9999999999.99;
const addDays = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);

/**
 * 原料盤點：員工本人用個人帳號盤點，送出後記錄差異，並把帳面庫存改成實點數量。
 * 盤點前先選盤點類型（大盤、小盤…）：類型決定要盤哪些原料，以及只填箱數還是箱數＋零散。
 * root scope：切到別頁再回來，輸入到一半的數量還在；登出時清除。
 */
@Injectable({ providedIn: 'root' })
export class InventoryCountStateService {
  private readonly api = inject(InventoryCountApiService);
  private readonly pos = inject(PosApiService);
  readonly ui = inject(UiStateService);

  items: InventoryItem[] = [];
  /** 啟用中的盤點類型（盤點時選）。 */
  types: CountType[] = [];
  typeId: number | null = null;
  /** 店長管理用：含停用的全部類型，以及新增／修改表單。 */
  manageOpen = false;
  allTypes: CountType[] = [];
  typeForm: TypeForm | null = null;
  typeError = '';
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

  /** 盤點紀錄用：依原料編號找顯示方式；原料已刪除時照基本單位顯示。 */
  packInfo(inventoryId: number, baseUnit: string): PackInfo {
    return this.items.find(i => i.inventoryId === inventoryId) ?? { baseUnit };
  }
  get isManager(): boolean { const level = this.pos.staff()?.level; return level === 'MANAGER' || level === 'HQ'; }
  get type(): CountType | undefined { return this.types.find(t => t.typeId === this.typeId); }
  /** 只填箱數：有包裝單位的原料只看箱數，零頭不計。 */
  get packOnly(): boolean { return this.type?.inputMode === 'PACK_ONLY'; }
  packOnlyFor(item: InventoryItem): boolean { return this.packOnly && this.hasPack(item); }
  /** 這個類型要盤的原料。 */
  get typeItems(): InventoryItem[] {
    const t = this.type;
    if (!t) return [];
    return t.allItems ? this.items : this.items.filter(i => t.itemIds.includes(i.inventoryId));
  }
  /** 換盤點類型：已填的數量會清空（不同類型的原料範圍與輸入方式不同）。 */
  selectType(id: number): void {
    if (this.ui.busy || id === this.typeId) return;
    this.typeId = id; this.entries = {}; this.pending = null;
  }

  entry(id: number): CountEntry { return this.entries[id] ??= { packs: null, loose: null }; }
  hasPack(item: InventoryItem): boolean { return !!item.packUnit && !!item.perPack && item.perPack > 0; }
  /** 這項原料實點多少（基本單位）；沒填就是 null（不盤這項）。 */
  counted(item: InventoryItem): number | null {
    const e = this.entries[item.inventoryId];
    if (!e || (e.packs === null && e.loose === null)) return null;
    if (this.packOnlyFor(item)) return e.packs === null ? null : (cents(e.packs * item.perPack!)) / 100;
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
    if (this.packOnlyFor(item)) return '';
    if (e.loose !== null && e.loose < 0) return '數量不能小於 0';
    // 盤點一律整數：數包裝或數得出的個數，開封、用到一半的不算
    if (e.loose !== null && !Number.isInteger(e.loose)) return '只能填整數（開封、用到一半的不算）';
    // 用「幾籃幾顆」記錄的原料：零散要少於 1 籃，不然顯示時「1 籃 33 顆」會變成「2 籃 3 顆」
    if (e.loose !== null && byPack(item) && e.loose >= item.perPack!) return `零散要少於 1 ${item.packUnit}（${item.perPack} ${item.baseUnit}）`;
    const c = this.counted(item);
    if (c !== null && c > MAX_QTY) return '數量太大';
    return '';
  }
  get visibleItems(): InventoryItem[] {
    const q = this.search.trim();
    return q ? this.typeItems.filter(i => i.name.includes(q)) : this.typeItems;
  }
  get lines(): CountLine[] {
    return this.typeItems.flatMap(item => {
      const counted = this.counted(item);
      return counted === null ? [] : [{ item, counted, diff: this.diff(item)! }];
    });
  }
  get countedCount(): number { return this.lines.length; }
  get hasInvalid(): boolean { return this.typeItems.some(i => this.invalid(i)); }
  get canSubmit(): boolean {
    return this.enabled === true && this.loaded && !this.ui.busy && !!this.type && this.countedCount > 0 && !this.hasInvalid && this.note.length <= 255;
  }
  get groups(): CountGroup[] {
    const map = new Map<string, CountGroup>();
    for (const row of this.history) {
      let g = map.get(row.requestId);
      if (!g) {
        g = { requestId: row.requestId, countedAt: row.countedAt, countedByName: row.countedByName, note: row.note,
          typeName: row.typeName, inputMode: row.inputMode, rows: [], shortCount: 0, overCount: 0, diffCost: 0 };
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
      const [items, history, types] = await Promise.all([this.api.items(), this.api.history(this.historyFrom, this.historyTo), this.api.types()]);
      if (token !== this.version) return;
      this.items = [...items].sort((a, b) => a.inventoryId - b.inventoryId);
      this.setTypes(types);
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
    const typeId = this.typeId!;
    const body = JSON.stringify({ typeId, note, lines });
    // 上次結果不明而且內容沒改：沿用同一個 requestId，後端只會記錄一次
    const requestId = this.pending && this.pending.body === body ? this.pending.requestId : crypto.randomUUID();
    const request: CountSubmit = { requestId, typeId, note, lines };
    this.pending = { requestId, body };
    this.ui.busy = true; this.confirmError = '';
    try {
      const rows = await this.api.submit(request);
      this.pending = null; this.lastResult = rows; this.confirmOpen = false;
      this.clearInput();
      this.ui.notice = `已記錄 ${rows.length} 項原料的盤點，帳面庫存已更新為實點數量。`;
    } catch (error) {
      // 後端明確拒絕（資料錯誤、沒權限、未啟用）：一定沒有記錄，下次送出用新的 requestId
      if (error instanceof HttpErrorResponse && [400, 401, 403, 404, 409, 503].includes(error.status)) {
        this.pending = null; this.confirmError = errorMessage(error);
        // 例如類型剛被店長停用（409）：重新讀取類型
        if (error.status === 409) this.api.types().then(t => this.setTypes(t)).catch(() => undefined);
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
    if (this.packOnlyFor(item)) { e.packs = Math.floor(item.bookQty / item.perPack!); e.loose = null; return; }
    if (this.hasPack(item)) {
      const packs = Math.floor(item.bookQty / item.perPack!);
      e.packs = packs; e.loose = (cents(item.bookQty) - cents(packs * item.perPack!)) / 100;
    } else { e.packs = null; e.loose = item.bookQty; }
  }
  // ---- 盤點類型管理（店長、總部） ----
  async openManage(): Promise<void> {
    if (!this.isManager || this.ui.busy) return;
    this.manageOpen = true; this.typeForm = null; this.typeError = '';
    try { this.allTypes = await this.api.types(true); } catch (error) { this.typeError = errorMessage(error); }
  }
  closeManage(): void { if (!this.ui.busy) { this.manageOpen = false; this.typeForm = null; } }
  editType(t?: CountType): void {
    this.typeError = '';
    this.typeForm = t
      ? { typeId: t.typeId, name: t.name, inputMode: t.inputMode, allItems: t.allItems, itemIds: new Set(t.itemIds), active: t.active }
      : { typeId: null, name: '', inputMode: 'PACK_ONLY', allItems: false, itemIds: new Set(), active: true };
  }
  toggleTypeItem(id: number): void {
    const f = this.typeForm; if (!f) return;
    if (f.itemIds.has(id)) f.itemIds.delete(id); else f.itemIds.add(id);
  }
  async saveType(): Promise<void> {
    const f = this.typeForm;
    if (!f || this.ui.busy) return;
    const name = f.name.trim();
    if (!name || name.length > 20) { this.typeError = '請填寫 20 字以內的類型名稱'; return; }
    if (!f.allItems && f.itemIds.size === 0) { this.typeError = '請至少選一項要盤的原料，或勾選「全部原料」'; return; }
    const body: SaveType = { name, inputMode: f.inputMode, allItems: f.allItems, itemIds: f.allItems ? [] : [...f.itemIds].sort((a, b) => a - b), active: f.active };
    this.ui.busy = true; this.typeError = '';
    try {
      if (f.typeId === null) await this.api.createType(body); else await this.api.updateType(f.typeId, body);
      this.typeForm = null;
      const [all, active] = await Promise.all([this.api.types(true), this.api.types()]);
      this.allTypes = all; this.setTypes(active);
      this.ui.notice = `已儲存盤點類型「${name}」。`;
    } catch (error) { this.typeError = errorMessage(error); }
    finally { this.ui.busy = false; }
  }
  /** 更新啟用中的類型；目前選的類型被停用或刪掉時，改選第一個並清空輸入。 */
  private setTypes(types: CountType[]): void {
    this.types = types;
    if (!types.some(t => t.typeId === this.typeId)) { this.typeId = types[0]?.typeId ?? null; this.entries = {}; }
  }

  clearEntry(item: InventoryItem): void { delete this.entries[item.inventoryId]; }
  clearInput(): void { this.entries = {}; this.note = ''; }
  closeTransient(): void { this.confirmOpen = false; this.confirmError = ''; }
  reset(): void {
    this.version++; this.historyVersion++; this.closeTransient(); this.clearInput();
    this.items = []; this.types = []; this.typeId = null; this.allTypes = []; this.manageOpen = false; this.typeForm = null; this.typeError = '';
    this.enabled = null; this.loading = false; this.loaded = false; this.error = '';
    this.pending = null; this.lastResult = null; this.search = ''; this.loadedStaff = null;
    this.history = []; this.historyError = ''; this.historyLoading = false; this.expanded = null;
    this.historyFrom = addDays(taipeiDate(), -6); this.historyTo = taipeiDate();
  }
}
