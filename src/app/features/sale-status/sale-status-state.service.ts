import { Injectable, effect, inject, untracked } from '@angular/core';
import { PosApiService, errorMessage } from '../../services/pos-api.service';
import { SaleStatusApiService } from '../../services/sale-status-api.service';
import { UiStateService } from '../../shared/ui-state.service';
import { DEFAULT_CATEGORIES, SaleChange, SaleInventory, SaleKind, SalePrep, SaleProduct, SaleStatus, SaleTopping, SaleUpdate, UNCATEGORIZED } from '../../models/sale-status';

/** 可以修改停售狀態的帳號等級（後端 SecurityConfig 也限制同樣的等級）。 */
export const SALE_EDIT_LEVELS: readonly string[] = ['POS', 'MANAGER', 'HQ'];
/** 可以改原料、半成品分類的帳號等級。 */
export const CATEGORY_EDIT_LEVELS: readonly string[] = ['MANAGER', 'HQ'];

/** 畫面上的一列（飲品、加料、原料、半成品共用）。 */
export interface SaleRow {
  kind: SaleKind; id: number; name: string;
  category: string | null; categoryLabel: string;
  state: SaleState; checked: boolean; changed: boolean;
  /** 連動停售的原因，例如「珍珠 停售」。 */
  reason: string;
  /** 補充說明，例如半成品「由 紅茶包 做成」。 */
  note: string;
  /** 原料、半成品：停售時會一起停售的飲品與加料。 */
  affects: string[];
}

/** 確認彈窗：這次要改的項目，以及因此連動停售／恢復的飲品與加料。 */
export interface SalePreview {
  stop: string[]; resume: string[];
  linkedStop: string[]; linkedResume: string[];
}
/** 一列飲品或加料目前（含尚未儲存的勾選）的狀態。 */
export type SaleState = 'on' | 'stopped' | 'linked';

/**
 * 停售管理：勾選要停售的飲品、加料、原料、半成品。
 * 勾選的變更先留在畫面（draft），按「儲存」前會即時算出連動停售的品項，確認後一次送出。
 */
@Injectable({ providedIn: 'root' })
export class SaleStatusStateService {
  private readonly api = inject(SaleStatusApiService);
  private readonly posApi = inject(PosApiService);
  readonly ui = inject(UiStateService);

  data: SaleStatus | null = null;
  loading = false;
  error = '';
  search = '';
  /** 只看停售中（含連動）的項目。 */
  onlyStopped = false;
  confirmOpen = false;
  confirmError = '';
  /** 尚未儲存的勾選：key 是編號，值是改成的 onSale。 */
  private draft: Record<SaleKind, Map<number, boolean>> = this.emptyDraft();
  private version = 0;

  constructor() {
    // 登出時清除；在這一頁登入（或換帳號）時重新讀取
    effect(() => {
      const staff = this.posApi.staff();
      untracked(() => { this.reset(); if (staff && this.ui.view === 'sale-status') void this.load(); });
    });
  }

  get canEdit(): boolean { return SALE_EDIT_LEVELS.includes(this.posApi.staff()?.level ?? ''); }
  get changeCount(): number { return Object.values(this.draft).reduce((n, m) => n + m.size, 0); }

  async load(): Promise<void> {
    const token = ++this.version;
    this.error = '';
    if (!this.posApi.staff()) { this.data = null; return; }
    this.loading = true;
    try {
      const data = await this.api.status();
      if (token !== this.version) return;
      this.data = data; this.draft = this.emptyDraft();
    } catch (error) { if (token === this.version) this.error = errorMessage(error); }
    finally { if (token === this.version) this.loading = false; }
  }

  // ---- 勾選（停售＝勾起來） ----
  onSale(kind: SaleKind, id: number): boolean {
    const drafted = this.draft[kind].get(id);
    return drafted ?? this.original(kind, id);
  }
  toggle(kind: SaleKind, id: number, stopped: boolean): void {
    if (!this.canEdit || this.ui.busy) return;
    const onSale = !stopped;
    if (onSale === this.original(kind, id)) this.draft[kind].delete(id); else this.draft[kind].set(id, onSale);
  }
  changed(kind: SaleKind, id: number): boolean { return this.draft[kind].has(id); }
  discard(): void { if (!this.ui.busy) this.draft = this.emptyDraft(); }

  // ---- 連動：依目前勾選（含未儲存）計算 ----
  prepAvailable(prep: SalePrep): boolean {
    return this.onSale('prep', prep.prepId) && prep.inventoryIds.every(id => this.onSale('inventory', id));
  }
  /** 讓這杯飲品不能賣的原料、半成品名稱（不含飲品自己停售）。 */
  productBlockers(p: SaleProduct): string[] { return this.blockers(p.inventoryIds, p.prepIds); }
  toppingBlockers(t: SaleTopping): string[] {
    return this.blockers(t.inventoryId === null ? [] : [t.inventoryId], t.prepId === null ? [] : [t.prepId]);
  }
  productState(p: SaleProduct): SaleState {
    return !this.onSale('product', p.productId) ? 'stopped' : this.productBlockers(p).length ? 'linked' : 'on';
  }
  toppingState(t: SaleTopping): SaleState {
    return !this.onSale('topping', t.toppingId) ? 'stopped' : this.toppingBlockers(t).length ? 'linked' : 'on';
  }
  prepState(x: SalePrep): SaleState {
    return !this.onSale('prep', x.prepId) ? 'stopped' : this.prepAvailable(x) ? 'on' : 'linked';
  }
  /** 原料、半成品被哪些飲品與加料用到（顯示用）。 */
  usedBy(m: SaleInventory | SalePrep): string { return this.usedByNames(m).join('、'); }
  private usedByNames(m: SaleInventory | SalePrep): string[] {
    return [
      ...m.usedByProducts.map(id => this.data?.products.find(p => p.productId === id)?.name),
      ...m.usedByToppings.map(id => { const t = this.data?.toppings.find(x => x.toppingId === id); return t ? '加料' + t.name : undefined; })
    ].filter((n): n is string => !!n);
  }
  madeFrom(x: SalePrep): string { return x.inventoryIds.map(id => this.inventoryName(id)).join('、'); }

  // ---- 種類 → 分類 → 品項 ----
  /** 目前選的種類（飲品、原料、半成品、加料）。 */
  kind: SaleKind = 'product';
  /** 目前選的分類；null＝全部。加料沒有分類。 */
  category: string | null = null;
  /** 店長、總部：在品項上直接改分類。 */
  editingCategories = false;

  get canEditCategory(): boolean { return CATEGORY_EDIT_LEVELS.includes(this.posApi.staff()?.level ?? ''); }
  selectKind(kind: SaleKind): void { this.kind = kind; this.category = null; this.editingCategories = false; }
  selectCategory(category: string | null): void { this.category = category; }

  /** 這個種類的所有品項（轉成同一種列，畫面只要一種寫法）。 */
  private rowsOf(kind: SaleKind): SaleRow[] {
    const d = this.data;
    if (!d) return [];
    if (kind === 'product') return d.products.map(p => {
      const state = this.productState(p);
      return this.row(kind, p.productId, p.name, p.category, state,
        state === 'linked' ? this.productBlockers(p).join('、') + ' 停售' : '',
        !p.inventoryIds.length && !p.prepIds.length ? '尚未建立配方，不會跟著原料停售' : '', []);
    });
    if (kind === 'topping') return d.toppings.map(t => {
      const state = this.toppingState(t);
      return this.row(kind, t.toppingId, t.name, null, state, state === 'linked' ? this.toppingBlockers(t).join('、') + ' 停售' : '', '', []);
    });
    if (kind === 'inventory') return d.inventories.map(i =>
      this.row(kind, i.inventoryId, i.name, i.category, this.onSale(kind, i.inventoryId) ? 'on' : 'stopped', '', '', this.usedByNames(i)));
    return d.preps.map(x => {
      const state = this.prepState(x);
      const stoppedParts = x.inventoryIds.filter(id => !this.onSale('inventory', id)).map(id => this.inventoryName(id));
      return this.row(kind, x.prepId, x.name, x.category, state, state === 'linked' ? stoppedParts.join('、') + ' 停售' : '',
        x.inventoryIds.length ? '由 ' + this.madeFrom(x) + ' 做成' : '', this.usedByNames(x));
    });
  }
  private row(kind: SaleKind, id: number, name: string, category: string | null, state: SaleState,
              reason: string, note: string, affects: string[]): SaleRow {
    return { kind, id, name, category, categoryLabel: category ?? UNCATEGORIZED, state, checked: !this.onSale(kind, id),
      changed: this.changed(kind, id), reason, note, affects };
  }
  /** 分類清單：常用分類＋資料裡出現的分類；有未分類的品項時最後加「未分類」。加料沒有分類。 */
  categoriesOf(kind: SaleKind): string[] {
    if (kind === 'topping') return [];
    const rows = this.rowsOf(kind);
    const names = [...(DEFAULT_CATEGORIES[kind] ?? [])];
    for (const r of rows) if (r.category && !names.includes(r.category)) names.push(r.category);
    if (rows.some(r => !r.category)) names.push(UNCATEGORIZED);
    return names;
  }
  /** 種類或分類裡停售中（含連動）的數量。 */
  stoppedCount(kind: SaleKind, category: string | null = null): number {
    return this.rowsOf(kind).filter(r => r.state !== 'on' && (category === null || r.categoryLabel === category)).length;
  }
  totalCount(kind: SaleKind, category: string | null = null): number {
    return this.rowsOf(kind).filter(r => category === null || r.categoryLabel === category).length;
  }
  /** 目前畫面要列的品項：依分類分組。有搜尋字時搜尋這個種類的全部分類。 */
  get groups(): { category: string; rows: SaleRow[] }[] {
    const keyword = this.search.trim().toLocaleLowerCase();
    const rows = this.rowsOf(this.kind).filter(r =>
      (keyword ? r.name.toLocaleLowerCase().includes(keyword) : this.category === null || r.categoryLabel === this.category)
      && (!this.onlyStopped || r.state !== 'on'));
    if (this.kind === 'topping') return rows.length ? [{ category: '', rows }] : [];
    const order = this.categoriesOf(this.kind);
    return order.map(category => ({ category, rows: rows.filter(r => r.categoryLabel === category) })).filter(g => g.rows.length);
  }
  /** 目前（含未儲存的勾選）停售中的數量。 */
  get counts(): { products: number; toppings: number; materials: number } {
    return { products: this.stoppedCount('product'), toppings: this.stoppedCount('topping'),
      materials: this.stoppedCount('inventory') + (this.data?.preps.filter(x => !this.onSale('prep', x.prepId)).length ?? 0) };
  }

  /** 改分類（店長、總部）：馬上存，不影響還沒儲存的停售勾選。 */
  async setCategory(kind: SaleKind, id: number, value: string): Promise<void> {
    if (!this.canEditCategory || this.ui.busy || (kind !== 'inventory' && kind !== 'prep')) return;
    const category = value.trim() === '' || value.trim() === UNCATEGORIZED ? null : value.trim();
    if (category && category.length > 20) { this.error = '分類最多 20 個字'; return; }
    this.ui.busy = true; this.error = '';
    try {
      this.data = await this.api.updateCategory({ kind: kind === 'inventory' ? 'INVENTORY' : 'PREP', id, category });
      this.ui.notice = `已把「${this.nameOf(kind, id)}」改到「${category ?? UNCATEGORIZED}」。`;
    } catch (error) { this.error = errorMessage(error); }
    finally { this.ui.busy = false; }
  }

  /** 和已儲存的狀態比：這次改了什麼、連帶哪些飲品與加料停售或恢復。 */
  get preview(): SalePreview {
    const result: SalePreview = { stop: [], resume: [], linkedStop: [], linkedResume: [] };
    const d = this.data;
    if (!d) return result;
    const label: Record<SaleKind, string> = { inventory: '原料', prep: '半成品', product: '飲品', topping: '加料' };
    for (const kind of ['inventory', 'prep', 'product', 'topping'] as SaleKind[]) {
      for (const [id, onSale] of this.draft[kind]) (onSale ? result.resume : result.stop).push(`${label[kind]}「${this.nameOf(kind, id)}」`);
    }
    for (const p of d.products) {
      if (!this.draft.product.has(p.productId)) this.linked(result, p.sellable, this.productState(p) === 'on', `飲品「${p.name}」`);
    }
    for (const t of d.toppings) {
      if (!this.draft.topping.has(t.toppingId)) this.linked(result, t.sellable, this.toppingState(t) === 'on', `加料「${t.name}」`);
    }
    return result;
  }

  openConfirm(): void {
    if (!this.canEdit || this.ui.busy || !this.changeCount) return;
    this.confirmError = ''; this.confirmOpen = true;
  }
  closeConfirm(): void { if (!this.ui.busy) this.confirmOpen = false; }

  async save(): Promise<void> {
    if (!this.canEdit || this.ui.busy || !this.changeCount) return;
    const list = (kind: SaleKind): SaleChange[] => [...this.draft[kind]].map(([id, onSale]) => ({ id, onSale }));
    const body: SaleUpdate = { inventories: list('inventory'), preps: list('prep'), products: list('product'), toppings: list('topping') };
    this.ui.busy = true; this.confirmError = '';
    try {
      this.data = await this.api.update(body);
      this.draft = this.emptyDraft(); this.confirmOpen = false;
      // 點餐菜單在回到「點餐收銀」時會自動重新讀取（AppComponent）
      this.ui.notice = '已儲存停售設定。';
    } catch (error) { this.confirmError = errorMessage(error); }
    finally { this.ui.busy = false; }
  }

  /** 登出或換帳號時清除。 */
  reset(): void {
    this.version++;
    this.data = null; this.loading = false; this.error = ''; this.search = ''; this.onlyStopped = false;
    this.kind = 'product'; this.category = null; this.editingCategories = false;
    this.confirmOpen = false; this.confirmError = ''; this.draft = this.emptyDraft();
  }
  closeTransient(): void { if (!this.ui.busy) this.confirmOpen = false; }

  private linked(result: SalePreview, before: boolean, after: boolean, name: string): void {
    if (before && !after) result.linkedStop.push(name);
    if (!before && after) result.linkedResume.push(name);
  }
  private blockers(inventoryIds: number[], prepIds: number[]): string[] {
    const names = new Set<string>();
    for (const id of inventoryIds) if (!this.onSale('inventory', id)) names.add(this.inventoryName(id));
    for (const id of prepIds) {
      const prep = this.data?.preps.find(x => x.prepId === id);
      if (!prep) continue;
      if (!this.onSale('prep', id)) names.add(prep.name);
      for (const inv of prep.inventoryIds) if (!this.onSale('inventory', inv)) names.add(this.inventoryName(inv));
    }
    return [...names];
  }
  private inventoryName(id: number): string { return this.data?.inventories.find(i => i.inventoryId === id)?.name ?? `#${id}`; }
  private nameOf(kind: SaleKind, id: number): string {
    const d = this.data;
    if (kind === 'inventory') return this.inventoryName(id);
    if (kind === 'prep') return d?.preps.find(x => x.prepId === id)?.name ?? `#${id}`;
    if (kind === 'product') return d?.products.find(p => p.productId === id)?.name ?? `#${id}`;
    return d?.toppings.find(t => t.toppingId === id)?.name ?? `#${id}`;
  }
  private original(kind: SaleKind, id: number): boolean {
    const d = this.data;
    if (!d) return true;
    if (kind === 'inventory') return d.inventories.find(i => i.inventoryId === id)?.onSale ?? true;
    if (kind === 'prep') return d.preps.find(x => x.prepId === id)?.onSale ?? true;
    if (kind === 'product') return d.products.find(p => p.productId === id)?.onSale ?? true;
    return d.toppings.find(t => t.toppingId === id)?.onSale ?? true;
  }
  private emptyDraft(): Record<SaleKind, Map<number, boolean>> {
    return { inventory: new Map(), prep: new Map(), product: new Map(), topping: new Map() };
  }
}
