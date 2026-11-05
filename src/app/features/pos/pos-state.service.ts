import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { PosApiService, errorMessage } from '../../services/pos-api.service';
import { PREVIEW_MENU, PREVIEW_RULES } from '../../services/preview-menu';
import { applyRules, initialSelection, toppingLimit, unitCents } from '../../services/menu-rules';
import { CartLine, CreateOrder, ICE_LABELS, Ice, Menu, Order, PAYMENT_LABELS, Payment, Product, Rule, SIZE_LABELS, SOURCE_LABELS, SUGAR_LABELS, Sugar, TEMP_LABELS, Temperature, cents, money, Delivery, DeliverySelection, Member, Source, distanceText } from '../../models/pos';
import { HereMapService } from '../../services/here-map.service';
import { UiStateService } from '../../shared/ui-state.service';
import { OrdersStateService } from '../orders/orders-state.service';

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
  readonly temperatures = TEMP_LABELS;
  readonly sugars = SUGAR_LABELS;
  readonly ices = ICE_LABELS;
  readonly sources = SOURCE_LABELS;
  readonly payments = PAYMENT_LABELS;
  readonly sizeOptions = Object.keys(SIZE_LABELS) as ('M' | 'L')[];
  readonly temperatureOptions = Object.keys(TEMP_LABELS) as Temperature[];
  readonly sugarOptions = Object.keys(SUGAR_LABELS) as Sugar[];
  readonly iceOptions = Object.keys(ICE_LABELS) as Ice[];
  // Uber Eats 是訂單來源；舊資料仍可顯示名稱，但新付款選項不包含它。
  readonly paymentOptions: Payment[] = ['CASH', 'CREDIT_CARD', 'LINE_PAY'];
  menu: Menu = PREVIEW_MENU;
  rules: Rule[] = PREVIEW_RULES;
  category = '全部飲品';
  search = '';
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

  get categories(): string[] { return ['全部飲品', ...new Set(this.menu.products.map(p => p.category))]; }
  get products(): Product[] {
    const search = this.search.trim().toLocaleLowerCase();
    return this.menu.products.filter(p => (this.category === '全部飲品' || p.category === this.category) && p.name.toLocaleLowerCase().includes(search));
  }
  get cups(): number { return this.cart.reduce((sum, line) => sum + line.qty, 0); }
  // 前端先把金額乘 100 變整數「分」計算，顯示時除回 100；正式價格仍以後端重算為準。
  get totalCents(): number { return this.cart.reduce((sum, line) => sum + line.unitCents * line.qty, 0); }
  get selectedUnitCents(): number { return this.product ? unitCents(this.product, this.selection, this.menu.toppings) : 0; }
  get changeCents(): number { return Math.max(0, cents(this.received ?? 0) - this.totalCents); }
  openProduct(product: Product, line?: CartLine): void {
    if (this.pending || this.ui.busy) return;
    this.product = product; this.editingKey = line?.key ?? null;
    this.selection = line ? { size: line.size, temperature: line.temperature, sugar: line.sugar, ice: line.ice, qty: line.qty, toppingIds: [...line.toppingIds], note: line.note } : initialSelection();
    this.ui.modalError = ''; this.adjustment = ''; this.normalize();
  }
  // 每次切換規格重新套規則：例如冰沙固定冰甜、切熱飲後移除不相容加料。
  private normalize(): void {
    if (!this.product) return;
    const result = applyRules(this.product, this.selection, this.rules);
    this.selection = result.selection; this.blocked = result.blocked; this.locked = result.locked;
    this.adjustment = result.notices.join(' ');
  }
  choose(field: 'size' | 'temperature' | 'sugar' | 'ice', value: string): void {
    this.selection = { ...this.selection, [field]: value }; this.normalize();
  }
  toppingReason(id: number): string {
    if (this.blocked[id]) return this.blocked[id];
    if (this.product && !this.selection.toppingIds.includes(id) && this.selection.toppingIds.length >= toppingLimit(this.product, this.selection, this.rules)) return '已達加料種類上限';
    return '';
  }
  toggleTopping(id: number): void {
    if (this.toppingReason(id)) return;
    this.selection.toppingIds = this.selection.toppingIds.includes(id) ? this.selection.toppingIds.filter(t => t !== id) : [...this.selection.toppingIds, id];
    this.normalize();
  }
  // 相同商品、杯型、冰甜、加料及備註才可合併杯數；不同客製必須保留不同列。
  addToCart(): void {
    if (!this.product || this.pending) return;
    if (!Number.isInteger(this.selection.qty) || this.selection.qty < 1 || this.selection.qty > 100) { this.ui.modalError = '杯數請輸入 1～100 的整數。'; return; }
    if (this.cart.length >= 100 && !this.editingKey) { this.ui.modalError = '每張訂單最多 100 筆明細。'; return; }
    const next: CartLine = { ...this.selection, toppingIds: [...this.selection.toppingIds], note: this.selection.note.trim(), key: this.editingKey ?? crypto.randomUUID(), product: this.product, unitCents: this.selectedUnitCents };
    const same = (a: CartLine, b: CartLine) => a.product.product_id === b.product.product_id && a.size === b.size && a.temperature === b.temperature && a.sugar === b.sugar && a.ice === b.ice && a.note === b.note && [...a.toppingIds].sort().join(',') === [...b.toppingIds].sort().join(',');
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
  toppingsText(ids: number[]): string { return this.menu.toppings.filter(t => ids.includes(t.topping_id)).map(t => t.name).join('、'); }
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
        items: this.cart.map(line => ({ productId: line.product.product_id, size: line.size, temperature: line.temperature, sugar: line.sugar, ice: line.ice, qty: line.qty, toppingIds: [...line.toppingIds], note: line.note })), ...this.deliveryFields()
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
    const id = this.lastOrder.order_id; this.orders.orderDate = this.lastOrder.business_date; this.orders.orderTab = 'history';
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
    this.product = null; this.checkoutOpen = false; this.memberPickerOpen = false;
  }
  reset(): void {
    this.closeTransient(); this.hereMap.reset();
    this.member = null; this.delivery = null; this.menu = PREVIEW_MENU; this.rules = PREVIEW_RULES;
    this.cart = []; this.pending = null; this.lastOrder = null; this.orderNote = ''; this.source = 'TAKE_OUT';
    this.search = ''; this.category = '全部飲品'; this.payment = 'CASH'; this.received = null; this.unpaid = false;
    this.editingKey = null; this.selection = initialSelection(); this.blocked = {}; this.locked = {}; this.adjustment = '';
  }
}
