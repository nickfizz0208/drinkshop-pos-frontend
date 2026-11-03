import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ModalComponent } from './shared/modal.component';
import { PosApiService, errorMessage } from './services/pos-api.service';
import { PREVIEW_MENU, PREVIEW_RULES } from './services/preview-menu';
import { applyRules, initialSelection, toppingLimit, unitCents } from './services/menu-rules';
import { CartLine, CreateOrder, ICE_LABELS, Ice, ItemStatus, Menu, Order, OrderItem, OrderSummary, PAYMENT_LABELS, Payment, Product, Rule, Selection, SIZE_LABELS, SOURCE_LABELS, STATUS_LABELS, SUGAR_LABELS, Sugar, TEMP_LABELS, Temperature, cents, money, taipeiDate } from './models/pos';

/**
 * POS 畫面的操作中心：HTML 綁定下方狀態與方法；API 呼叫集中在 PosApiService。
 * 建議閱讀順序：login → openProduct／addToCart → checkout → loadOrders → confirmCancel。
 * 目前以 view 切換點餐與訂單管理，並非每個畫面都有獨立路由。
 */
@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, ModalComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnDestroy {
  readonly api = inject(PosApiService);
  readonly title = '青日茶所';
  // 把顯示工具與中文名稱提供給 HTML；送往後端仍使用 M、CASH 等固定代碼。
  readonly money = money;
  readonly sizes = SIZE_LABELS;
  readonly temperatures = TEMP_LABELS;
  readonly sugars = SUGAR_LABELS;
  readonly ices = ICE_LABELS;
  readonly sources = SOURCE_LABELS;
  readonly payments = PAYMENT_LABELS;
  readonly statuses = STATUS_LABELS;
  readonly sizeOptions = Object.keys(SIZE_LABELS) as ('M' | 'L')[];
  readonly temperatureOptions = Object.keys(TEMP_LABELS) as Temperature[];
  readonly sugarOptions = Object.keys(SUGAR_LABELS) as Sugar[];
  readonly iceOptions = Object.keys(ICE_LABELS) as Ice[];
  // Uber Eats 是訂單來源；舊資料仍可顯示名稱，但新付款選項不包含它。
  readonly paymentOptions: Payment[] = ['CASH', 'CREDIT_CARD', 'LINE_PAY'];
  // 未登入只展示假菜單；登入成功後才換成後端資料，結帳也必須登入。
  preview = true;
  view: 'pos' | 'orders' = 'pos';
  menu: Menu = PREVIEW_MENU;
  rules: Rule[] = PREVIEW_RULES;
  category = '全部飲品';
  search = '';
  // 購物車尚未寫入資料庫；一列可有多杯，同列共用完整客製規格。
  cart: CartLine[] = [];
  source: CreateOrder['source'] = 'TAKE_OUT';
  orderNote = '';
  // busy 防止重複操作；error／notice 顯示頁面訊息，modalError 顯示彈窗內錯誤。
  busy = false;
  error = '';
  notice = '';
  modalError = '';
  loginOpen = false;
  username = '';
  password = '';
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
  collecting: Order | null = null;
  wantsRefund = true;
  refundInput: number | null = null;
  received: number | null = null;
  // pending 是已送出但結果可能不明的請求；重試必須沿用內容與 requestId，不能當新單。
  pending: CreateOrder | null = null;
  lastOrder: Order | null = null;
  orderDate = taipeiDate();
  orderList: OrderSummary[] = [];
  orderTab: 'active' | 'ready' | 'history' = 'active';
  readonly orderTabs = [
    { key: 'active', label: '待處理' },
    { key: 'ready', label: '待取餐' },
    { key: 'history', label: '當日紀錄' }
  ] as const;
  orderLoading = false;
  selectedOrder: Order | null = null;
  cancelTarget: { order: Order; item: OrderItem | null } | null = null;
  cancelReason = '';
  cancelReasonChoice = '';
  readonly cancelReasonOptions = ['配料不足', '茶湯不足（茶沒了）', '顧客取消', '顧客未取餐', '點餐／輸入錯誤', '製作錯誤', '飲品打翻', '其他'];
  refundConfirmed = false;
  photoItem: OrderItem | null = null;
  photoFile: File | null = null;
  photoUrl = '';
  // 每次讀列表累加版本號，讓比較晚回來的舊請求不會覆寫新日期或登出後的畫面。
  private orderLoad = 0;

  // 這裡只篩選顯示，沒有刪訂單：待處理看 PENDING／MAKING，待取看 DONE，紀錄看全部。
  matchesOrderTab(order: OrderSummary, tab = this.orderTab): boolean {
    return tab === 'history' || (tab === 'active' ? ['PENDING', 'MAKING'].includes(order.status) : order.status === 'DONE');
  }
  get visibleOrders(): OrderSummary[] { return this.orderList.filter(order => this.matchesOrderTab(order)); }
  orderCount(tab: typeof this.orderTab): number { return this.orderList.filter(order => this.matchesOrderTab(order, tab)).length; }
  selectOrderTab(tab: typeof this.orderTab): void {
    if (this.busy) return;
    this.orderTab = tab; this.selectedOrder = null;
  }
  changeOrderDate(): void {
    this.orderTab = 'history'; this.selectedOrder = null; void this.loadOrders();
  }
  get emptyOrdersTitle(): string {
    return this.orderTab === 'active' ? '目前沒有待處理訂單。' : this.orderTab === 'ready' ? '目前沒有待取餐訂單。' : '這一天還沒有訂單。';
  }

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
  get hasMadeItems(): boolean {
    if (!this.cancelTarget) return false;
    const items = this.cancelTarget.item ? [this.cancelTarget.item] : this.cancelTarget.order.items;
    return items.some(i => i.status === 'MAKING' || i.status === 'DONE');
  }
  collectionChange(received: number | null, total: number): number { return Math.max(0, (cents(received ?? 0) - cents(total)) / 100); }
  isPaid(order: OrderSummary): boolean { return order.payment_status !== 'UNPAID'; }
  paymentText(order: OrderSummary): string { return this.isPaid(order) && order.payment ? '已付款 · ' + this.payments[order.payment] : '未付款'; }
  paidAmount(order: OrderSummary): number { return order.paid_amount ?? order.total; }
  netReceived(order: OrderSummary): number { return this.paidAmount(order) - (order.refunded_amount ?? 0); }
  // 這是本次「可退上限」；actualRefund 才是店員選擇要記錄的實際退款。
  // 已付款不代表一定全退，也不能退超過本次取消售價或尚未退還的已收款。
  get refundAmount(): number {
    if (!this.cancelTarget || !this.isPaid(this.cancelTarget.order)) return 0;
    const items = this.cancelTarget.item ? [this.cancelTarget.item] : this.cancelTarget.order.items.filter(i => this.canCancel(i));
    const value = items.reduce((sum, i) => sum + cents(i.unit_price) * i.qty, 0) / 100;
    return Math.min(value, this.netReceived(this.cancelTarget.order));
  }
  get actualRefund(): number { return this.wantsRefund && this.cancelTarget && this.isPaid(this.cancelTarget.order) ? this.refundInput ?? 0 : 0; }
  get refundNeedsConfirmation(): boolean { return this.actualRefund > 0; }
  // 原料成本與退款分開算；null 表示歷史成本未建檔，不可顯示成 $0。
  // material_cost 已包含這筆明細的全部杯數，所以這裡不能再乘 qty。
  costText(items: OrderItem[]): string {
    if (!items.length) return money(0);
    return items.some(i => i.material_cost == null) ? '成本未建檔，無法完整估算' : money(items.reduce((sum, i) => sum + cents(i.material_cost!), 0) / 100);
  }
  get cancelCost(): string {
    const items = this.cancelTarget ? this.cancelTarget.item ? [this.cancelTarget.item] : this.cancelTarget.order.items : [];
    return this.costText(items.filter(i => i.status === 'MAKING' || i.status === 'DONE'));
  }
  wasteCost(order: Order): string { return this.costText(order.items.filter(i => i.status === 'WASTED')); }
  get combinedCancelReason(): string {
    const selected = this.cancelReasonChoice === '其他' ? '' : this.cancelReasonChoice;
    const note = this.cancelReason.trim();
    return selected && note ? `${selected}：${note}` : selected || note;
  }
  get cancelNoteMaxLength(): number {
    return 255 - (this.cancelReasonChoice && this.cancelReasonChoice !== '其他' ? this.cancelReasonChoice.length + 1 : 0);
  }
  get todayLabel(): string { return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()); }

  // 先驗證員工，再同時取菜單與規則；其中任一步失敗，就清除登入狀態。
  async login(): Promise<void> {
    if (this.busy || !this.username.trim() || !this.password) return;
    this.busy = true; this.modalError = '';
    try {
      await this.api.login(this.username.trim(), this.password);
      const [menu, rules] = await Promise.all([this.api.menu(), this.api.rules()]);
      this.menu = menu; this.rules = rules; this.preview = false; this.category = '全部飲品';
      this.cart = []; this.pending = null; this.lastOrder = null;
      this.restorePending();
      this.loginOpen = false; this.password = ''; this.error = '';
      this.notice = this.pending ? '找到前次待確認訂單，請繼續確認送單結果。' : '登入成功，已載入門市菜單。';
      if (this.view === 'orders') await this.loadOrders();
    } catch (error) { this.api.logout(); this.modalError = errorMessage(error); }
    finally { this.busy = false; }
  }
  logout(): void {
    if (this.busy) return;
    this.api.logout(); this.preview = true; this.menu = PREVIEW_MENU; this.rules = PREVIEW_RULES;
    this.cart = []; this.pending = null; this.lastOrder = null; this.selectedOrder = null; this.orderList = [];
    this.orderLoad++; this.orderTab = 'active'; this.view = 'pos'; this.error = ''; this.notice = ''; this.orderNote = ''; this.source = 'TAKE_OUT';
  }
  openLogin(): void { this.modalError = ''; this.password = ''; this.loginOpen = true; }
  async switchView(view: 'pos' | 'orders'): Promise<void> {
    if (this.busy) return;
    this.view = view; this.error = '';
    if (view === 'orders' && !this.preview) await this.loadOrders();
  }
  openProduct(product: Product, line?: CartLine): void {
    if (this.pending || this.busy) return;
    this.product = product; this.editingKey = line?.key ?? null;
    this.selection = line ? { size: line.size, temperature: line.temperature, sugar: line.sugar, ice: line.ice, qty: line.qty, toppingIds: [...line.toppingIds], note: line.note } : initialSelection();
    this.modalError = ''; this.adjustment = ''; this.normalize();
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
    if (!Number.isInteger(this.selection.qty) || this.selection.qty < 1 || this.selection.qty > 100) { this.modalError = '杯數請輸入 1～100 的整數。'; return; }
    if (this.cart.length >= 100 && !this.editingKey) { this.modalError = '每張訂單最多 100 筆明細。'; return; }
    const next: CartLine = { ...this.selection, toppingIds: [...this.selection.toppingIds], note: this.selection.note.trim(), key: this.editingKey ?? crypto.randomUUID(), product: this.product, unitCents: this.selectedUnitCents };
    const same = (a: CartLine, b: CartLine) => a.product.product_id === b.product.product_id && a.size === b.size && a.temperature === b.temperature && a.sugar === b.sugar && a.ice === b.ice && a.note === b.note && [...a.toppingIds].sort().join(',') === [...b.toppingIds].sort().join(',');
    const other = this.cart.filter(line => line.key !== this.editingKey);
    const duplicate = other.find(line => same(line, next));
    if (duplicate && duplicate.qty + next.qty <= 100) {
      this.cart = other.map(line => line.key === duplicate.key ? { ...line, qty: line.qty + next.qty } : line);
    } else if (this.editingKey) this.cart = this.cart.map(line => line.key === this.editingKey ? next : line);
    else this.cart = [...this.cart, next];
    this.product = null; this.notice = '已更新本次點餐。'; this.lastOrder = null;
  }
  quantity(line: CartLine, delta: number): void {
    if (this.pending || this.busy) return;
    const qty = line.qty + delta;
    if (qty < 1 || qty > 100) return;
    this.cart = this.cart.map(item => item.key === line.key ? { ...item, qty } : item);
  }
  remove(line: CartLine): void { if (!this.pending && !this.busy) this.cart = this.cart.filter(item => item.key !== line.key); }
  toppingsText(ids: number[]): string { return this.menu.toppings.filter(t => ids.includes(t.topping_id)).map(t => t.name).join('、'); }
  openCheckout(): void {
    if (!this.cart.length || this.busy) return;
    if (this.preview) { this.openLogin(); return; }
    this.modalError = ''; this.checkoutOpen = true;
    this.unpaid = this.pending?.unpaid ?? false; this.payment = this.pending?.payment ?? 'CASH'; this.received = this.pending?.receivedCash ?? null;
  }
  // 待確認送單以員工分開存 sessionStorage；只存訂單內容，不存登入帳密。
  // 此儲存只協助同分頁恢復重試，不是離線接單功能。
  private pendingKey(): string { return 'qingri.pending.' + this.api.staff()?.staffId; }
  private storePending(): void {
    try { sessionStorage.setItem(this.pendingKey(), JSON.stringify({ request: this.pending, cart: this.cart })); }
    catch { /* 瀏覽器禁止儲存時，仍可用記憶體中的 pending 重試。 */ }
  }
  private clearPending(): void { try { sessionStorage.removeItem(this.pendingKey()); } catch { /* 儲存不可用時仍要清除記憶體中的請求。 */ } this.pending = null; }
  private restorePending(): void {
    try {
      const raw = sessionStorage.getItem(this.pendingKey());
      if (!raw) return;
      const saved = JSON.parse(raw) as { request: CreateOrder; cart: CartLine[] };
      if (!saved.request?.requestId || !Array.isArray(saved.request.items) || !Array.isArray(saved.cart)) return;
      this.pending = saved.request; this.cart = saved.cart; this.source = saved.request.source; this.orderNote = saved.request.note;
    } catch { /* 忽略壞掉的暫存；這裡的資料不能作為登入憑證。 */ }
  }
  /** 結帳：檢查輸入 → 保存固定請求 → 呼叫後端 → 成功才清空購物車。 */
  async checkout(): Promise<void> {
    if (this.busy || this.preview || !this.cart.length) return;
    this.modalError = '';
    if (!this.pending) {
      if (!this.unpaid && this.payment === 'CASH' && (this.received === null || !Number.isFinite(this.received) || this.received > 99999999.99 || Math.abs(this.received * 100 - Math.round(this.received * 100)) > 0.00001 || cents(this.received) < this.totalCents)) {
        this.modalError = '請輸入足夠的實收現金，金額最多兩位小數。'; return;
      }
      this.pending = { requestId: crypto.randomUUID(), source: this.source, payment: this.unpaid ? null : this.payment, ...(this.unpaid ? { unpaid: true } : {}), note: this.orderNote.trim(),
        ...(!this.unpaid && this.payment === 'CASH' ? { receivedCash: this.received! } : {}),
        items: this.cart.map(line => ({ productId: line.product.product_id, size: line.size, temperature: line.temperature, sugar: line.sugar, ice: line.ice, qty: line.qty, toppingIds: [...line.toppingIds], note: line.note })) };
      this.storePending();
    }
    this.busy = true;
    try {
      this.lastOrder = await this.api.create(this.pending);
      this.clearPending(); this.cart = []; this.checkoutOpen = false; this.orderNote = '';
      this.notice = '訂單已建立，庫存已同步更新。'; this.error = '';
    } catch (error) {
      // 明確被拒絕可修正後再送；斷線／逾時可能其實已建單，保留原請求供安全重試。
      if (error instanceof HttpErrorResponse && [400, 403, 404, 409].includes(error.status)) this.clearPending();
      this.modalError = (this.pending ? '送單結果尚待確認，請用相同內容重試。' : '') + errorMessage(error);
    } finally { this.busy = false; }
  }
  // 操作成功後重讀列表；訂單離開目前頁籤就收起詳情，避免完成／取消後仍佔工作區。
  async loadOrders(): Promise<void> {
    if (this.preview) return;
    if (this.selectedOrder && !this.matchesOrderTab(this.selectedOrder)) {
      const order = this.selectedOrder;
      this.notice = `訂單 #${order.order_id} 已移至「${order.status === 'DONE' ? '待取餐' : '當日紀錄'}」。`;
      this.selectedOrder = null;
    }
    const token = ++this.orderLoad; this.orderLoading = true; this.error = '';
    try {
      const rows = await this.api.orders(this.orderDate);
      if (token === this.orderLoad) {
        this.orderList = rows;
        if (this.selectedOrder && !rows.some(row => row.order_id === this.selectedOrder?.order_id && this.matchesOrderTab(row))) this.selectedOrder = null;
      }
    }
    catch (error) { if (token === this.orderLoad) this.error = errorMessage(error); }
    finally { if (token === this.orderLoad) this.orderLoading = false; }
  }
  async showOrder(id: number): Promise<void> {
    if (this.busy || this.preview) return;
    this.busy = true; this.error = '';
    try { this.selectedOrder = await this.api.order(id); this.view = 'orders'; }
    catch (error) { this.error = errorMessage(error); }
    finally { this.busy = false; }
  }
  async showLastOrder(): Promise<void> {
    if (!this.lastOrder) return;
    const id = this.lastOrder.order_id; this.orderDate = this.lastOrder.business_date; this.orderTab = 'history';
    await this.showOrder(id); await this.loadOrders();
  }
  // 每次只前進一階段；後端會再次檢查合法順序與是否已付款。
  nextStatus(item: OrderItem): ItemStatus | null {
    return item.status === 'PENDING' ? 'MAKING' : item.status === 'MAKING' ? 'DONE' : item.status === 'DONE' ? 'PICKED_UP' : null;
  }
  hasStatus(order: Order, status: ItemStatus): boolean { return order.items.some(item => item.status === status); }
  canPickUpAll(order: Order): boolean {
    return this.isPaid(order) && this.hasStatus(order, 'DONE') && !this.hasStatus(order, 'PENDING') && !this.hasStatus(order, 'MAKING');
  }
  // 整單按鈕與逐項按鈕並存，後端只更新符合上一階段的明細。
  async advanceAll(status: ItemStatus): Promise<void> {
    if (!this.selectedOrder || this.busy) return;
    this.busy = true; this.error = '';
    try {
      this.selectedOrder = await this.api.statusAll(this.selectedOrder.order_id, status);
      this.notice = status === 'PICKED_UP' ? '整張訂單已完成取餐。' : status === 'MAKING' ? '待製作品項已全部開始製作。' : '製作中的品項已全部完成。';
      await this.loadOrders();
    } catch (error) { this.error = errorMessage(error); }
    finally { this.busy = false; }
  }
  nextLabel(item: OrderItem): string { return item.status === 'PENDING' ? '開始製作' : item.status === 'MAKING' ? '製作完成' : '完成取餐'; }
  async advance(item: OrderItem): Promise<void> {
    const next = this.nextStatus(item);
    if (!next || !this.selectedOrder || this.busy) return;
    this.busy = true; this.error = '';
    try { this.selectedOrder = await this.api.status(this.selectedOrder.order_id, item.item_id, next); await this.loadOrders(); }
    catch (error) { this.error = errorMessage(error); }
    finally { this.busy = false; }
  }
  canCancel(item: OrderItem): boolean { return ['PENDING', 'MAKING', 'DONE'].includes(item.status); }
  canCancelWhole(order: Order): boolean { return order.items.some(item => this.canCancel(item)) && !order.items.some(item => item.status === 'PICKED_UP'); }
  // null 表示取消整單；指定 item 則取消該列的全部杯數，先預填可退上限。
  openCancel(item: OrderItem | null): void {
    if (!this.selectedOrder || this.busy) return;
    this.cancelTarget = { order: this.selectedOrder, item }; this.cancelReason = ''; this.cancelReasonChoice = ''; this.refundConfirmed = false; this.wantsRefund = true; this.refundInput = this.refundAmount; this.modalError = '';
  }
  // 人工退款完成後才勾選確認；API 只記錄退款，不會真的操作信用卡／LINE Pay。
  // 回補或轉損耗由後端依製作狀態判定，前端不自行改庫存。
  async confirmCancel(): Promise<void> {
    if (!this.cancelTarget || !this.combinedCancelReason || (this.refundNeedsConfirmation && !this.refundConfirmed) || this.busy) return;
    if (!Number.isFinite(this.actualRefund) || this.actualRefund < 0 || this.actualRefund > this.refundAmount || Math.abs(this.actualRefund * 100 - Math.round(this.actualRefund * 100)) > 0.00001 || (this.wantsRefund && this.refundAmount > 0 && this.actualRefund === 0)) { this.modalError = '請輸入大於零且不超過退款上限的金額（最多兩位小數），或選擇不退款。'; return; }
    if (this.combinedCancelReason.length > 255) { this.modalError = '原因與補充說明合計最多 255 字，請縮短內容。'; return; }
    this.busy = true; this.modalError = '';
    try {
      this.selectedOrder = await this.api.cancel(this.cancelTarget.order.order_id, this.cancelTarget.item?.item_id ?? null, {
        reason: this.combinedCancelReason, refundAmount: this.actualRefund
      });
      this.cancelTarget = null; this.notice = '已記錄取消結果並更新庫存。'; await this.loadOrders();
    } catch (error) { this.modalError = errorMessage(error); }
    finally { this.busy = false; }
  }
  openCollect(order: Order): void {
    if (this.busy) return;
    this.collecting = order; this.payment = 'CASH'; this.received = null; this.modalError = '';
  }
  // 補收款更新原訂單，不重新建單，也不再次扣料。
  async confirmCollect(): Promise<void> {
    if (!this.collecting || this.busy) return;
    this.busy = true; this.modalError = '';
    try {
      this.selectedOrder = await this.api.collect(this.collecting.order_id, this.payment, this.payment === 'CASH' ? this.received ?? undefined : undefined);
      this.collecting = null; this.notice = '已記錄收款。'; await this.loadOrders();
    } catch (error) { this.modalError = errorMessage(error); }
    finally { this.busy = false; }
  }
  // 既有照片需帶登入憑證讀成 Blob，再轉成本機預覽網址，不能直接公開檔案路徑。
  async openPhoto(item: OrderItem): Promise<void> {
    if (!this.selectedOrder || this.busy) return;
    this.clearPhoto(); this.photoItem = item; this.modalError = '';
    if (!item.photo_url) return;
    this.busy = true;
    try { this.photoUrl = URL.createObjectURL(await this.api.photo(this.selectedOrder.order_id, item.item_id)); }
    catch (error) { this.modalError = errorMessage(error); }
    finally { this.busy = false; }
  }
  // 選檔先驗證格式、大小與像素，再顯示預覽；確認上傳後才真正傳送檔案。
  async choosePhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
    if (!file) return;
    const target = this.photoItem;
    this.modalError = '';
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) { this.modalError = '請選擇 5 MB 以內的 JPEG 或 PNG 照片。'; return; }
    try {
      const image = await createImageBitmap(file); const pixels = image.width * image.height; image.close();
      if (pixels > 12000000) throw new Error('照片不可超過 1200 萬像素，請先縮小。');
      if (this.photoItem !== target) return;
      if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
      this.photoFile = file; this.photoUrl = URL.createObjectURL(file);
    } catch (error) { this.modalError = errorMessage(error); }
  }
  async uploadPhoto(): Promise<void> {
    if (!this.photoFile || !this.photoItem || !this.selectedOrder || this.busy) return;
    this.busy = true; this.modalError = '';
    try {
      await this.api.upload(this.selectedOrder.order_id, this.photoItem.item_id, this.photoFile);
      this.selectedOrder = await this.api.order(this.selectedOrder.order_id); this.clearPhoto(); this.notice = '損耗照片已儲存。';
    } catch (error) { this.modalError = errorMessage(error); }
    finally { this.busy = false; }
  }
  closePhoto(): void { if (!this.busy) this.clearPhoto(); }
  // Object URL 會佔用瀏覽器資源，換照片、關窗或離開元件時要釋放。
  private clearPhoto(): void { if (this.photoUrl) URL.revokeObjectURL(this.photoUrl); this.photoUrl = ''; this.photoItem = null; this.photoFile = null; }
  time(value: string): string { return new Date(value).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }); }
  ngOnDestroy(): void { this.clearPhoto(); }
}
