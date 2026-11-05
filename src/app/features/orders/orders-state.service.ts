import { Injectable, inject } from '@angular/core';
import { PosApiService, errorMessage } from '../../services/pos-api.service';
import { ICE_LABELS, ItemStatus, Order, OrderItem, OrderSummary, PAYMENT_LABELS, Payment, SIZE_LABELS, SOURCE_LABELS, STATUS_LABELS, SUGAR_LABELS, TEMP_LABELS, cents, money, taipeiDate } from '../../models/pos';
import { UiStateService } from '../../shared/ui-state.service';

/** 訂單查詢、製作與取消／收款；不依賴點餐元件或購物車。 */
@Injectable({ providedIn: 'root' })
export class OrdersStateService {
  readonly ui = inject(UiStateService);
  payment: Payment = 'CASH';
  received: number | null = null;

  readonly api = inject(PosApiService);
  // 把顯示工具與中文名稱提供給 HTML；送往後端仍使用 M、CASH 等固定代碼。
  readonly money = money;
  readonly sizes = SIZE_LABELS;
  readonly temperatures = TEMP_LABELS;
  readonly sugars = SUGAR_LABELS;
  readonly ices = ICE_LABELS;
  readonly sources = SOURCE_LABELS;
  readonly payments = PAYMENT_LABELS;
  readonly statuses = STATUS_LABELS;
  // Uber Eats 是訂單來源；舊資料仍可顯示名稱，但新付款選項不包含它。
  readonly paymentOptions: Payment[] = ['CASH', 'CREDIT_CARD', 'LINE_PAY'];
  collecting: Order | null = null;
  wantsRefund = true;
  refundInput: number | null = null;
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
    if (this.ui.busy) return;
    this.orderTab = tab; this.selectedOrder = null;
  }
  changeOrderDate(): void {
    this.orderTab = 'history'; this.selectedOrder = null; void this.loadOrders();
  }
  get emptyOrdersTitle(): string {
    return this.orderTab === 'active' ? '目前沒有待處理訂單。' : this.orderTab === 'ready' ? '目前沒有待取餐訂單。' : '這一天還沒有訂單。';
  }
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
  // 操作成功後重讀列表；訂單離開目前頁籤就收起詳情，避免完成／取消後仍佔工作區。
  async loadOrders(): Promise<void> {
    if (this.ui.preview) return;
    if (this.selectedOrder && !this.matchesOrderTab(this.selectedOrder)) {
      const order = this.selectedOrder;
      this.ui.notice = `訂單 #${order.order_id} 已移至「${order.status === 'DONE' ? '待取餐' : '當日紀錄'}」。`;
      this.selectedOrder = null;
    }
    const token = ++this.orderLoad; this.orderLoading = true; this.ui.error = '';
    try {
      const rows = await this.api.orders(this.orderDate);
      if (token === this.orderLoad) {
        this.orderList = rows;
        if (this.selectedOrder && !rows.some(row => row.order_id === this.selectedOrder?.order_id && this.matchesOrderTab(row))) this.selectedOrder = null;
      }
    }
    catch (error) { if (token === this.orderLoad) this.ui.error = errorMessage(error); }
    finally { if (token === this.orderLoad) this.orderLoading = false; }
  }
  async showOrder(id: number): Promise<void> {
    if (this.ui.busy || this.ui.preview) return;
    this.ui.busy = true; this.ui.error = '';
    try { this.selectedOrder = await this.api.order(id); }
    catch (error) { this.ui.error = errorMessage(error); }
    finally { this.ui.busy = false; }
    if (this.selectedOrder?.order_id === id && !this.ui.error) this.ui.navigate('orders');
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
    if (!this.selectedOrder || this.ui.busy) return;
    this.ui.busy = true; this.ui.error = '';
    try {
      this.selectedOrder = await this.api.statusAll(this.selectedOrder.order_id, status);
      this.ui.notice = status === 'PICKED_UP' ? '整張訂單已完成取餐。' : status === 'MAKING' ? '待製作品項已全部開始製作。' : '製作中的品項已全部完成。';
      await this.loadOrders();
    } catch (error) { this.ui.error = errorMessage(error); }
    finally { this.ui.busy = false; }
  }
  nextLabel(item: OrderItem): string { return item.status === 'PENDING' ? '開始製作' : item.status === 'MAKING' ? '製作完成' : '完成取餐'; }
  async advance(item: OrderItem): Promise<void> {
    const next = this.nextStatus(item);
    if (!next || !this.selectedOrder || this.ui.busy) return;
    this.ui.busy = true; this.ui.error = '';
    try { this.selectedOrder = await this.api.status(this.selectedOrder.order_id, item.item_id, next); await this.loadOrders(); }
    catch (error) { this.ui.error = errorMessage(error); }
    finally { this.ui.busy = false; }
  }
  canCancel(item: OrderItem): boolean { return ['PENDING', 'MAKING', 'DONE'].includes(item.status); }
  canCancelWhole(order: Order): boolean { return order.items.some(item => this.canCancel(item)) && !order.items.some(item => item.status === 'PICKED_UP'); }
  // null 表示取消整單；指定 item 則取消該列的全部杯數，先預填可退上限。
  openCancel(item: OrderItem | null): void {
    if (!this.selectedOrder || this.ui.busy) return;
    this.cancelTarget = { order: this.selectedOrder, item }; this.cancelReason = ''; this.cancelReasonChoice = ''; this.refundConfirmed = false; this.wantsRefund = true; this.refundInput = this.refundAmount; this.ui.modalError = '';
  }
  // 人工退款完成後才勾選確認；API 只記錄退款，不會真的操作信用卡／LINE Pay。
  // 回補或轉損耗由後端依製作狀態判定，前端不自行改庫存。
  async confirmCancel(): Promise<void> {
    if (!this.cancelTarget || !this.combinedCancelReason || (this.refundNeedsConfirmation && !this.refundConfirmed) || this.ui.busy) return;
    if (!Number.isFinite(this.actualRefund) || this.actualRefund < 0 || this.actualRefund > this.refundAmount || Math.abs(this.actualRefund * 100 - Math.round(this.actualRefund * 100)) > 0.00001 || (this.wantsRefund && this.refundAmount > 0 && this.actualRefund === 0)) { this.ui.modalError = '請輸入大於零且不超過退款上限的金額（最多兩位小數），或選擇不退款。'; return; }
    if (this.combinedCancelReason.length > 255) { this.ui.modalError = '原因與補充說明合計最多 255 字，請縮短內容。'; return; }
    this.ui.busy = true; this.ui.modalError = '';
    try {
      this.selectedOrder = await this.api.cancel(this.cancelTarget.order.order_id, this.cancelTarget.item?.item_id ?? null, {
        reason: this.combinedCancelReason, refundAmount: this.actualRefund
      });
      this.cancelTarget = null; this.ui.notice = '已記錄取消結果並更新庫存。'; await this.loadOrders();
    } catch (error) { this.ui.modalError = errorMessage(error); }
    finally { this.ui.busy = false; }
  }
  openCollect(order: Order): void {
    if (this.ui.busy) return;
    this.collecting = order; this.payment = 'CASH'; this.received = null; this.ui.modalError = '';
  }
  // 補收款更新原訂單，不重新建單，也不再次扣料。
  async confirmCollect(): Promise<void> {
    if (!this.collecting || this.ui.busy) return;
    this.ui.busy = true; this.ui.modalError = '';
    try {
      this.selectedOrder = await this.api.collect(this.collecting.order_id, this.payment, this.payment === 'CASH' ? this.received ?? undefined : undefined);
      this.collecting = null; this.ui.notice = '已記錄收款。'; await this.loadOrders();
    } catch (error) { this.ui.modalError = errorMessage(error); }
    finally { this.ui.busy = false; }
  }
  // 既有照片需帶登入憑證讀成 Blob，再轉成本機預覽網址，不能直接公開檔案路徑。
  async openPhoto(item: OrderItem): Promise<void> {
    if (!this.selectedOrder || this.ui.busy) return;
    this.clearPhoto(); this.photoItem = item; this.ui.modalError = '';
    if (!item.photo_url) return;
    this.ui.busy = true;
    try { this.photoUrl = URL.createObjectURL(await this.api.photo(this.selectedOrder.order_id, item.item_id)); }
    catch (error) { this.ui.modalError = errorMessage(error); }
    finally { this.ui.busy = false; }
  }
  // 選檔先驗證格式、大小與像素，再顯示預覽；確認上傳後才真正傳送檔案。
  async choosePhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
    if (!file) return;
    const target = this.photoItem;
    this.ui.modalError = '';
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) { this.ui.modalError = '請選擇 5 MB 以內的 JPEG 或 PNG 照片。'; return; }
    try {
      const image = await createImageBitmap(file); const pixels = image.width * image.height; image.close();
      if (pixels > 12000000) throw new Error('照片不可超過 1200 萬像素，請先縮小。');
      if (this.photoItem !== target) return;
      if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
      this.photoFile = file; this.photoUrl = URL.createObjectURL(file);
    } catch (error) { if (this.photoItem === target) this.ui.modalError = errorMessage(error); }
  }
  async uploadPhoto(): Promise<void> {
    if (!this.photoFile || !this.photoItem || !this.selectedOrder || this.ui.busy) return;
    this.ui.busy = true; this.ui.modalError = '';
    try {
      await this.api.upload(this.selectedOrder.order_id, this.photoItem.item_id, this.photoFile);
      this.selectedOrder = await this.api.order(this.selectedOrder.order_id); this.clearPhoto(); this.ui.notice = '損耗照片已儲存。';
    } catch (error) { this.ui.modalError = errorMessage(error); }
    finally { this.ui.busy = false; }
  }
  closePhoto(): void { if (!this.ui.busy) this.clearPhoto(); }
  // Object URL 會佔用瀏覽器資源，換照片、關窗或離開元件時要釋放。
  private clearPhoto(): void { if (this.photoUrl) URL.revokeObjectURL(this.photoUrl); this.photoUrl = ''; this.photoItem = null; this.photoFile = null; }
  time(value: string): string { return new Date(value).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }); }
  closeTransient(): void {
    this.cancelTarget = null; this.collecting = null; this.clearPhoto();
  }
  reset(): void {
    this.closeTransient(); this.orderLoad++; this.orderLoading = false;
    this.orderList = []; this.selectedOrder = null; this.orderTab = 'active'; this.orderDate = taipeiDate();
    this.payment = 'CASH'; this.received = null; this.refundInput = null;
    this.cancelReason = ''; this.cancelReasonChoice = ''; this.refundConfirmed = false; this.wantsRefund = true;
  }
}
