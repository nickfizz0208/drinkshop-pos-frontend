import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ModalComponent } from './shared/modal.component';
import { PosApiService, errorMessage } from './services/pos-api.service';
import { PREVIEW_MENU, PREVIEW_RULES } from './services/preview-menu';
import { applyRules, initialSelection, toppingLimit, unitCents } from './services/menu-rules';
import { CartLine, CreateOrder, ICE_LABELS, Ice, ItemStatus, Menu, Order, OrderItem, OrderSummary, PAYMENT_LABELS, Payment, Product, Rule, Selection, SIZE_LABELS, SOURCE_LABELS, STATUS_LABELS, SUGAR_LABELS, Sugar, TEMP_LABELS, Temperature, cents, money, taipeiDate } from './models/pos';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, ModalComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnDestroy {
  readonly api = inject(PosApiService);
  readonly title = '青日茶所';
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
  // Uber Eats is an order source and a historical label, not a new payment option.
  readonly paymentOptions: Payment[] = ['CASH', 'CREDIT_CARD', 'LINE_PAY'];
  preview = true;
  view: 'pos' | 'orders' = 'pos';
  menu: Menu = PREVIEW_MENU;
  rules: Rule[] = PREVIEW_RULES;
  category = '全部飲品';
  search = '';
  cart: CartLine[] = [];
  source: CreateOrder['source'] = 'TAKE_OUT';
  orderNote = '';
  busy = false;
  error = '';
  notice = '';
  modalError = '';
  loginOpen = false;
  username = '';
  password = '';
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
  private orderLoad = 0;

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
  get refundAmount(): number {
    if (!this.cancelTarget || !this.isPaid(this.cancelTarget.order)) return 0;
    const items = this.cancelTarget.item ? [this.cancelTarget.item] : this.cancelTarget.order.items.filter(i => this.canCancel(i));
    const value = items.reduce((sum, i) => sum + cents(i.unit_price) * i.qty, 0) / 100;
    return Math.min(value, this.netReceived(this.cancelTarget.order));
  }
  get actualRefund(): number { return this.wantsRefund && this.cancelTarget && this.isPaid(this.cancelTarget.order) ? this.refundInput ?? 0 : 0; }
  get refundNeedsConfirmation(): boolean { return this.actualRefund > 0; }
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
  private pendingKey(): string { return 'qingri.pending.' + this.api.staff()?.staffId; }
  private storePending(): void {
    try { sessionStorage.setItem(this.pendingKey(), JSON.stringify({ request: this.pending, cart: this.cart })); }
    catch { /* In-memory retry remains available if browser storage is blocked. */ }
  }
  private clearPending(): void { try { sessionStorage.removeItem(this.pendingKey()); } catch { /* Storage is optional. */ } this.pending = null; }
  private restorePending(): void {
    try {
      const raw = sessionStorage.getItem(this.pendingKey());
      if (!raw) return;
      const saved = JSON.parse(raw) as { request: CreateOrder; cart: CartLine[] };
      if (!saved.request?.requestId || !Array.isArray(saved.request.items) || !Array.isArray(saved.cart)) return;
      this.pending = saved.request; this.cart = saved.cart; this.source = saved.request.source; this.orderNote = saved.request.note;
    } catch { /* Invalid browser data never becomes authentication state. */ }
  }
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
      if (error instanceof HttpErrorResponse && [400, 403, 404, 409].includes(error.status)) this.clearPending();
      this.modalError = (this.pending ? '送單結果尚待確認，請用相同內容重試。' : '') + errorMessage(error);
    } finally { this.busy = false; }
  }
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
  nextStatus(item: OrderItem): ItemStatus | null {
    return item.status === 'PENDING' ? 'MAKING' : item.status === 'MAKING' ? 'DONE' : item.status === 'DONE' ? 'PICKED_UP' : null;
  }
  hasStatus(order: Order, status: ItemStatus): boolean { return order.items.some(item => item.status === status); }
  canPickUpAll(order: Order): boolean {
    return this.isPaid(order) && this.hasStatus(order, 'DONE') && !this.hasStatus(order, 'PENDING') && !this.hasStatus(order, 'MAKING');
  }
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
  openCancel(item: OrderItem | null): void {
    if (!this.selectedOrder || this.busy) return;
    this.cancelTarget = { order: this.selectedOrder, item }; this.cancelReason = ''; this.cancelReasonChoice = ''; this.refundConfirmed = false; this.wantsRefund = true; this.refundInput = this.refundAmount; this.modalError = '';
  }
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
  async confirmCollect(): Promise<void> {
    if (!this.collecting || this.busy) return;
    this.busy = true; this.modalError = '';
    try {
      this.selectedOrder = await this.api.collect(this.collecting.order_id, this.payment, this.payment === 'CASH' ? this.received ?? undefined : undefined);
      this.collecting = null; this.notice = '已記錄收款。'; await this.loadOrders();
    } catch (error) { this.modalError = errorMessage(error); }
    finally { this.busy = false; }
  }
  async openPhoto(item: OrderItem): Promise<void> {
    if (!this.selectedOrder || this.busy) return;
    this.clearPhoto(); this.photoItem = item; this.modalError = '';
    if (!item.photo_url) return;
    this.busy = true;
    try { this.photoUrl = URL.createObjectURL(await this.api.photo(this.selectedOrder.order_id, item.item_id)); }
    catch (error) { this.modalError = errorMessage(error); }
    finally { this.busy = false; }
  }
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
  private clearPhoto(): void { if (this.photoUrl) URL.revokeObjectURL(this.photoUrl); this.photoUrl = ''; this.photoItem = null; this.photoFile = null; }
  time(value: string): string { return new Date(value).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }); }
  ngOnDestroy(): void { this.clearPhoto(); }
}
