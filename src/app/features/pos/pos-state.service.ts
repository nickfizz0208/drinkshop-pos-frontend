import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { PosApiService, errorMessage } from '../../services/pos-api.service';
import { PREVIEW_MENU, PREVIEW_RULES } from '../../services/preview-menu';
import { applyRules, initialSelection, toppingLimit, unitCents } from '../../services/menu-rules';
import { CartLine, CreateOrder, CustomOption, FREE_TOPPING_CATEGORIES, MAX_TOPPINGS_PER_CUP, MenuEntry, freeToppingId, groupToppings, toppingMax, Size, sizesOf, Menu, Order, PAYMENT_LABELS, Payment, Product, Rule, SIZE_LABELS, SOURCE_LABELS, SUGAR_LABELS, Sugar, TEMP_ICE_LABELS, TempIce, isHotOrWarm, cents, money, Delivery, DeliverySelection, Member, Source, distanceText } from '../../models/pos';
import { HereMapService } from '../../services/here-map.service';
import { UiStateService } from '../../shared/ui-state.service';
import { OrdersStateService } from '../orders/orders-state.service';
import { sortByTone } from '../../drink-cup/drink-cup.component';

/** 點餐資料與送單生命週期。root scope 保留切頁時的購物車與固定重試請求。 */
@Injectable({ providedIn: 'root' })
export class PosStateService {
  readonly ui = inject(UiStateService);
  readonly orders = inject(OrdersStateService);
  private readonly hereMap = inject(HereMapService);

  readonly api = inject(PosApiService);
  readonly distanceText = distanceText;
  // 把顯示工具與中文名稱提供給 HTML；送往後端仍使用 M、CASH 等固定代碼。
  readonly money = money;
  readonly sizes = SIZE_LABELS;
  readonly tempIces = TEMP_ICE_LABELS;
  readonly sugars = SUGAR_LABELS;
  readonly isHotOrWarm = isHotOrWarm;
  readonly sources = SOURCE_LABELS;
  readonly payments = PAYMENT_LABELS;
  /** 溫度冰量按鈕：熱、溫、常溫、完全去冰、去冰、微冰、少冰、正常冰、多冰。 */
  readonly tempIceOptions = Object.keys(TEMP_ICE_LABELS) as TempIce[];
  /** 甜度按鈕：無糖、0.5、1、3、5、7、10 分、多糖。 */
  readonly sugarOptions = Object.keys(SUGAR_LABELS) as Sugar[];
  // Uber Eats 是訂單來源；舊資料仍可顯示名稱，但新付款選項不包含它。
  readonly paymentOptions: Payment[] = ['CASH', 'CREDIT_CARD', 'LINE_PAY'];
  menu: Menu = PREVIEW_MENU;
  rules: Rule[] = PREVIEW_RULES;
  /** 選中的分類；空字串或不存在的分類（例如菜單剛換過）就用第一個分類，見 currentCategory。 */
  category = '';
  // 購物車尚未寫入資料庫；一列可有多杯，同列共用完整客製規格。
  cart: CartLine[] = [];
  source: CreateOrder['source'] = 'TAKE_OUT';
  orderNote = '';
  // product 有值就開客製彈窗；editingKey 有值表示正在修改購物車中的既有列。
  product: Product | null = null;
  editingKey: string | null = null;
  selection = initialSelection();
  blocked: Record<number, string> = {};
  locked: Record<string, string> = {};
  adjustment = '';
  checkoutOpen = false;
  payment: Payment = 'CASH';
  unpaid = false;
  received: number | null = null;
  // pending 是已送出但結果可能不明的請求；重試必須沿用內容與 requestId，不能當新單。
  pending: CreateOrder | null = null;
  lastOrder: Order | null = null;
  memberPickerOpen = false;
  member: Member | null = null;
  /** 外送的送達位置與路線距離；地圖服務失敗而略過時為 null。 */
  delivery: Delivery | null = null;

  /** 菜單上的分類，照飲品第一次出現的順序；沒有「全部飲品」。 */
  get categories(): string[] { return [...new Set(this.menu.products.map(p => p.category))]; }
  /** 目前顯示的分類：選中的分類還在菜單上就用它，否則用第一個分類。 */
  get currentCategory(): string { return this.categories.includes(this.category) ? this.category : this.categories[0] ?? ''; }
  /** 目前分類的飲品，依色系排序（黃綠紅橙奶紫白，見 drink-cup 的 TONE_ORDER）。 */
  get products(): Product[] {
    const category = this.currentCategory;
    return sortByTone(this.menu.products.filter(p => p.category === category));
  }
  /**
   * 飲品列表的卡片：這個分類的飲品；奶茶、鮮奶頁在每杯 main 飲品後面接著排出「{加料}{飲料}」的組合（046），
   * 每種 free 加料一張，顏色跟著 main 飲品。組合只是先幫你加好一份那個加料，規則照常鎖住不能選的。
   */
  get entries(): MenuEntry[] {
    const combos = FREE_TOPPING_CATEGORIES.includes(this.currentCategory) ? this.menu.toppings.filter(t => t.free) : [];
    return this.products.flatMap(p => [
      { key: `${p.product_id}`, product: p, topping: null, name: p.name },
      ...(p.main ? combos.map(t => ({ key: `${p.product_id}-${t.topping_id}`, product: p, topping: t, name: t.name + p.name })) : [])
    ]);
  }
  get cups(): number { return this.cart.reduce((sum, line) => sum + line.qty, 0); }
  // 前端先把金額乘 100 變整數「分」計算，顯示時除回 100；正式價格仍以後端重算為準。
  get totalCents(): number { return this.cart.reduce((sum, line) => sum + line.unitCents * line.qty, 0); }
  /** 目前這杯有賣的容量（由小到大）。 */
  get sizeOptions(): Size[] { return this.product ? sizesOf(this.product) : []; }
  /** 飲品卡片上列出有賣的容量（不顯示價格），例如「大杯・瓶」。 */
  sizesText(product: Product): string { return sizesOf(product).map(size => SIZE_LABELS[size]).join('・'); }
  /** 客製視窗裡「選擇加料」視窗開著沒。 */
  toppingPickerOpen = false;
  /** 客製視窗裡「客製」選項視窗開著沒（041）。 */
  optionPickerOpen = false;
  /** 這杯選的加料合計（元，一杯的）。 */
  get selectedToppingsPrice(): number {
    const free = this.freeToppingId;
    return this.selection.toppingIds.reduce((sum, id) => sum + (this.menu.toppings.find(t => t.topping_id === id)?.price ?? 0), 0)
      - (free === null ? 0 : this.menu.toppings.find(t => t.topping_id === free)?.price ?? 0);
  }
  /** 這杯免費的那一種加料（奶茶、鮮奶的第一份 free 加料，046）；沒有就是 null。 */
  get freeToppingId(): number | null {
    return this.product ? freeToppingId(this.product, this.selection.toppingIds, this.menu.toppings) : null;
  }
  /** 「波霸首份免費」；沒有就是空字串。 */
  get freeToppingText(): string {
    const free = this.freeToppingId;
    return free === null ? '' : (this.menu.toppings.find(t => t.topping_id === free)?.name ?? '') + '首份免費';
  }
  get selectedUnitCents(): number { return this.product ? unitCents(this.product, this.selection, this.menu.toppings) : 0; }
  get validCustomizerQuantity(): boolean {
    const { qty } = this.selection;
    return Number.isInteger(qty) && qty >= 1 && qty <= 100;
  }
  get changeCents(): number { return Math.max(0, cents(this.received ?? 0) - this.totalCents); }
  openProduct(product: Product, line?: CartLine): void {
    if (this.pending || this.ui.busy) return;
    this.product = product; this.editingKey = line?.key ?? null; this.toppingPickerOpen = false; this.optionPickerOpen = false;
    this.selection = line ? { size: line.size, tempIce: line.tempIce, sugar: line.sugar, qty: line.qty, toppingIds: [...line.toppingIds], optionIds: [...(line.optionIds ?? [])], note: line.note }
      : initialSelection(product);
    this.ui.modalError = ''; this.adjustment = ''; this.normalize();
  }
  /** 點了一張卡：組合就是 main 飲品先加好一份那個加料（規則不允許就不加，跟自己按加入一樣）。 */
  openEntry(entry: MenuEntry): void {
    this.openProduct(entry.product);
    if (entry.topping && this.product === entry.product) this.addTopping(entry.topping.topping_id);
  }
  // 每次切換規格重新套規則：例如冰沙固定冰甜、切熱飲後移除不相容加料。
  private normalize(): void {
    if (!this.product) return;
    // 購物車裡的舊選擇若這杯已經不賣那個容量（例如菜單剛改），改成有賣的最小容量
    const sizes = sizesOf(this.product);
    if (sizes.length && !sizes.includes(this.selection.size)) this.selection = { ...this.selection, size: sizes[0] };
    const result = applyRules(this.product, this.selection, this.rules);
    this.selection = result.selection; this.blocked = result.blocked; this.locked = result.locked;
    this.adjustment = result.notices.join(' ');
  }
  choose(field: 'size' | 'tempIce' | 'sugar', value: string): void {
    this.selection = { ...this.selection, [field]: value }; this.normalize();
  }
  /** 這杯已經加了幾份這種加料。 */
  toppingCount(id: number): number { return this.selection.toppingIds.filter(t => t === id).length; }
  /** 這種加料現在不能再加的原因；空字串＝可以加。 */
  toppingReason(id: number): string {
    if (this.blocked[id]) return this.blocked[id];
    // 每種加料的上限記在資料庫（topping.max_qty）；一杯全部加起來最多 5 份
    const max = toppingMax(this.menu.toppings.find(t => t.topping_id === id));
    if (this.toppingCount(id) >= max) return `這種加料最多加 ${max} 份`;
    if (this.selection.toppingIds.length >= MAX_TOPPINGS_PER_CUP) return `一杯最多加 ${MAX_TOPPINGS_PER_CUP} 份加料`;
    const kinds = new Set(this.selection.toppingIds).size;
    if (this.product && !this.selection.toppingIds.includes(id) && kinds >= toppingLimit(this.product, this.selection, this.rules)) return '已達加料種類上限';
    return '';
  }
  /** 一杯最多幾份加料（給畫面顯示「已加入 3／5 份」）。 */
  readonly maxToppingsPerCup = MAX_TOPPINGS_PER_CUP;
  /** 加入一份加料（同一種可以加多份，上限看 topping.max_qty）。 */
  addTopping(id: number): void {
    if (this.toppingReason(id)) return;
    this.selection.toppingIds = [...this.selection.toppingIds, id];
    this.normalize();
  }
  /** 移除一份加料（加了兩份就剩一份）。 */
  removeTopping(id: number): void {
    const index = this.selection.toppingIds.lastIndexOf(id);
    if (index < 0) return;
    this.selection.toppingIds = this.selection.toppingIds.filter((_, i) => i !== index);
    this.normalize();
  }
  /** 選擇加料視窗的「已加入」清單：照加入順序，同一種合成一行。 */
  get addedToppings(): { id: number; name: string; qty: number; price: number }[] {
    return groupToppings(this.selection.toppingIds).map(g => {
      const topping = this.menu.toppings.find(t => t.topping_id === g.id);
      const charged = g.qty - (g.id === this.freeToppingId ? 1 : 0);
      return { id: g.id, name: topping?.name ?? '（已停售的加料）', qty: g.qty, price: (topping?.price ?? 0) * charged };
    });
  }
  // 相同商品、杯型、冰甜、加料及備註才可合併杯數；不同客製必須保留不同列。
  addToCart(): void {
    if (!this.product || this.pending) return;
    if (!this.validCustomizerQuantity) { this.ui.modalError = '杯數請輸入 1～100 的整數。'; return; }
    if (this.cart.length >= 100 && !this.editingKey) { this.ui.modalError = '每張訂單最多 100 筆明細。'; return; }
    const next: CartLine = { ...this.selection, toppingIds: [...this.selection.toppingIds], optionIds: [...this.selection.optionIds], note: this.selection.note.trim(), key: this.editingKey ?? crypto.randomUUID(), product: this.product, unitCents: this.selectedUnitCents };
    const same = (a: CartLine, b: CartLine) => a.product.product_id === b.product.product_id && a.size === b.size && a.tempIce === b.tempIce && a.sugar === b.sugar && a.note === b.note && [...a.toppingIds].sort().join(',') === [...b.toppingIds].sort().join(',') && [...(a.optionIds ?? [])].sort().join(',') === [...(b.optionIds ?? [])].sort().join(',');
    const other = this.cart.filter(line => line.key !== this.editingKey);
    const duplicate = other.find(line => same(line, next));
    if (duplicate && duplicate.qty + next.qty <= 100) {
      this.cart = other.map(line => line.key === duplicate.key ? { ...line, qty: line.qty + next.qty } : line);
    } else if (this.editingKey) this.cart = this.cart.map(line => line.key === this.editingKey ? next : line);
    else this.cart = [...this.cart, next];
    this.product = null; this.ui.notice = '已更新本次點餐。'; this.lastOrder = null;
  }
  quantity(line: CartLine, delta: number): void {
    if (this.pending || this.ui.busy) return;
    const qty = line.qty + delta;
    if (qty < 1 || qty > 100) return;
    this.cart = this.cart.map(item => item.key === line.key ? { ...item, qty } : item);
  }
  remove(line: CartLine): void { if (!this.pending && !this.ui.busy) this.cart = this.cart.filter(item => item.key !== line.key); }
  // 購物車裡的加料若剛被停售，菜單已沒有它的名稱，照樣列出提醒員工（送單時後端會擋）
  // ---- 客製選項（041）：不用錢、沒有衝突，只有每種的份數上限（custom_option.max_qty，預設 1） ----
  /** 菜單上的客製選項（舊後端沒有就是空的）。 */
  get options(): CustomOption[] { return this.menu.options ?? []; }
  optionCount(id: number): number { return this.selection.optionIds.filter(o => o === id).length; }
  /** 這個客製選項現在不能再選的原因；空字串＝可以選。 */
  optionReason(id: number): string {
    const max = this.options.find(o => o.option_id === id)?.max_qty ?? 1;
    return this.optionCount(id) >= max ? (max === 1 ? '已經加入' : `最多 ${max} 份`) : '';
  }
  addOption(id: number): void {
    if (this.optionReason(id)) return;
    this.selection = { ...this.selection, optionIds: [...this.selection.optionIds, id] };
  }
  removeOption(id: number): void {
    const index = this.selection.optionIds.lastIndexOf(id);
    if (index < 0) return;
    this.selection = { ...this.selection, optionIds: this.selection.optionIds.filter((_, i) => i !== index) };
  }
  /** 「客製」視窗的已加入清單：照加入順序，同一種合成一行。 */
  get addedOptions(): { id: number; name: string; qty: number }[] {
    return groupToppings(this.selection.optionIds).map(g => ({ id: g.id, name: this.options.find(o => o.option_id === g.id)?.name ?? '（已停用的客製）', qty: g.qty }));
  }
  /** 例如「加酸、加梅子」；同一種兩份寫「×2」。 */
  optionsText(ids: number[] | undefined): string {
    return groupToppings(ids ?? []).map(g => (this.options.find(o => o.option_id === g.id)?.name ?? '（已停用的客製）') + (g.qty > 1 ? '×' + g.qty : '')).join('、');
  }

  /** 照加入順序，同一種寫「×2」：例如「波霸×2、芝芝」。 */
  toppingsText(ids: number[]): string { return groupToppings(ids).map(g => (this.menu.toppings.find(t => t.topping_id === g.id)?.name ?? '（已停售的加料）') + (g.qty > 1 ? '×' + g.qty : '')).join('、'); }
  openCheckout(): void {
    if (!this.cart.length || this.ui.busy) return;
    if (this.ui.preview) { this.ui.openLogin(); return; }
    this.ui.modalError = ''; this.checkoutOpen = true;
    this.unpaid = this.pending?.unpaid ?? false; this.payment = this.pending?.payment ?? 'CASH'; this.received = this.pending?.receivedCash ?? null;
  }
  // 待確認送單以員工分開存 sessionStorage；只存訂單內容，不存登入帳密。
  // 此儲存只協助同分頁恢復重試，不是離線接單功能。
  private pendingKey(): string { return 'qingri.pending.' + this.api.staff()?.staffId; }
  private storePending(): void {
    try { sessionStorage.setItem(this.pendingKey(), JSON.stringify({ request: this.pending, cart: this.cart, member: this.member, delivery: this.delivery })); }
    catch { /* In-memory retry remains available if browser storage is blocked. */ }
  }
  // 只清除送單重試資料：庫存不足時仍需保留購物車、會員與外送位置，供修正後再送。
  private clearPending(): void {
    try { sessionStorage.removeItem(this.pendingKey()); } catch { /* 瀏覽器儲存不可用時仍清除記憶體中的請求。 */ }
    this.pending = null;
  }
  restorePending(): void {
    try {
      const raw = sessionStorage.getItem(this.pendingKey());
      if (!raw) return;
      const saved = JSON.parse(raw) as { request: CreateOrder; cart: CartLine[]; member?: Member | null; delivery?: Delivery | null };
      if (!saved.request?.requestId || !Array.isArray(saved.request.items) || !Array.isArray(saved.cart)) return;
      this.pending = saved.request; this.cart = saved.cart; this.source = saved.request.source; this.orderNote = saved.request.note;
      this.member = saved.member ?? null;
      this.delivery = saved.delivery ?? null;
    } catch { /* Invalid browser data never becomes authentication state. */ }
  }
  /** 結帳：檢查輸入 → 保存固定請求 → 呼叫後端 → 成功才清空購物車。 */
  async checkout(): Promise<void> {
    if (this.ui.busy || this.ui.preview || !this.cart.length) return;
    this.ui.modalError = '';
    if (!this.pending) {
      if (!this.unpaid && this.payment === 'CASH' && (this.received === null || !Number.isFinite(this.received) || this.received > 99999999.99 || Math.abs(this.received * 100 - Math.round(this.received * 100)) > 0.00001 || cents(this.received) < this.totalCents)) {
        this.ui.modalError = '請輸入足夠的實收現金，金額最多兩位小數。'; return;
      }
      this.pending = {
        requestId: crypto.randomUUID(), source: this.source, payment: this.unpaid ? null : this.payment, ...(this.unpaid ? { unpaid: true } : {}), note: this.orderNote.trim(),
        ...(!this.unpaid && this.payment === 'CASH' ? { receivedCash: this.received! } : {}),
        items: this.cart.map(line => ({ productId: line.product.product_id, size: line.size, tempIce: line.tempIce, sugar: line.sugar, qty: line.qty, toppingIds: [...line.toppingIds], optionIds: [...(line.optionIds ?? [])], note: line.note })), ...this.deliveryFields()
      };
      this.storePending();
    }
    this.ui.busy = true;
    try {
      this.lastOrder = await this.api.create(this.pending);
      this.clearPending(); this.cart = []; this.checkoutOpen = false; this.orderNote = '';
      // 確認建單成功才清除這一單的會員及配送內容，避免帶到下一張單。
      this.member = null; this.delivery = null; this.source = 'DINE_IN';
      this.ui.notice = '訂單已建立，庫存已同步更新。'; this.ui.error = '';
    } catch (error) {
      // 明確被拒絕可修正後再送；斷線／逾時可能其實已建單，保留原請求供安全重試。
      if (error instanceof HttpErrorResponse && [400, 403, 404, 409].includes(error.status)) this.clearPending();
      this.ui.modalError = (this.pending ? '送單結果尚待確認，請用相同內容重試。' : '') + errorMessage(error);
    } finally { this.ui.busy = false; }
  }
  async showLastOrder(): Promise<void> {
    if (!this.lastOrder) return;
    const id = this.lastOrder.order_id; this.orders.orderDate = this.lastOrder.business_date;
    await this.orders.showOrder(id); await this.orders.loadOrders();
  }
  selectSource(next: Source): void {
    if (this.pending) return;
    if (next === 'PHONE_DELIVERY') {
      if (this.ui.preview) { this.ui.openLogin(); return; }   // 預覽模式沒有 API
      this.memberPickerOpen = true;                     // 先不改 source
      return;
    }
    this.source = next; this.member = null; this.delivery = null;
  }
  onMemberSelected(selection: DeliverySelection): void {
    this.member = selection.member; this.delivery = selection.delivery;
    this.source = 'PHONE_DELIVERY'; this.memberPickerOpen = false;
  }
  /** 電話外送時送出的會員、路線距離與臨時送達位置。 */
  private deliveryFields(): Pick<CreateOrder, 'memberPhone' | 'distance' | 'addressNote'> {
    if (this.source !== 'PHONE_DELIVERY' || !this.member) return {};
    return {
      memberPhone: this.member.phone,
      ...(this.delivery ? { distance: this.delivery.distanceM } : {}),
      ...(this.delivery?.addressNote ? { addressNote: this.delivery.addressNote } : {})
    };
  }
  onMemberDismissed(): void { this.memberPickerOpen = false; }
  closeTransient(): void {
    this.product = null; this.toppingPickerOpen = false; this.optionPickerOpen = false; this.checkoutOpen = false; this.memberPickerOpen = false;
  }
  reset(): void {
    this.closeTransient(); this.hereMap.reset();
    this.member = null; this.delivery = null; this.menu = PREVIEW_MENU; this.rules = PREVIEW_RULES;
    this.cart = []; this.pending = null; this.lastOrder = null; this.orderNote = ''; this.source = 'TAKE_OUT';
    this.category = ''; this.payment = 'CASH'; this.received = null; this.unpaid = false;
    this.editingKey = null; this.selection = initialSelection(); this.blocked = {}; this.locked = {}; this.adjustment = '';
  }
}
