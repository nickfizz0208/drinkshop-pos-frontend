import { IconComponent } from './shared/icon.component';
import { Component, effect, inject, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from './shared/modal.component';
import { COUNTER_VIEWS, PERSONAL_VIEWS, UiStateService, WorkspaceView } from './shared/ui-state.service';
import { PosApiService, errorMessage } from './services/pos-api.service';
import { money } from './models/pos';
import { ShiftClosingSummary, ShiftStatus } from './models/time-clock';
import { StaffOption } from './models/schedule';
import { PosComponent } from './features/pos/pos.component';
import { PosStateService } from './features/pos/pos-state.service';
import { OrdersComponent } from './features/orders/orders.component';
import { OrdersStateService } from './features/orders/orders-state.service';
import { StoreOpsComponent } from './features/store-ops/store-ops.component';
import { StoreOpsStateService } from './features/store-ops/store-ops-state.service';
import { TimeTrackerComponent } from './time-tracker/time-tracker.component';
import { ScheduleShiftComponent } from './schedule-shift/schedule-shift.component';
import { CheckListComponent } from './check-list/check-list.component';
import { InventoryCountComponent } from './features/inventory-count/inventory-count.component';
import { RecipesComponent } from './features/recipes/recipes.component';

/**
 * 工作台外框：登入、登出、切頁，以及上方工具列的開班／關班。
 * 點餐、訂單、日結與報廢依 feature 分開維護；打卡、班表、檢核表是獨立元件。
 */
@Component({
  selector: 'app-root',
  imports: [IconComponent, FormsModule, ModalComponent, PosComponent, OrdersComponent, StoreOpsComponent,
    TimeTrackerComponent, ScheduleShiftComponent, CheckListComponent, InventoryCountComponent, RecipesComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  readonly api = inject(PosApiService);
  readonly ui = inject(UiStateService);
  private readonly pos = inject(PosStateService);
  private readonly orders = inject(OrdersStateService);
  private readonly store = inject(StoreOpsStateService);
  readonly money = money;

  get todayLabel(): string { return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()); }

  /** 門市 POS 機的共用帳號。點餐收銀、訂單管理、日結與報廢只限這個帳號（後端也會擋）。 */
  get isPos(): boolean { return this.api.staff()?.level === 'POS'; }
  get canViewRecipes(): boolean { return !this.ui.preview && !!this.api.staff(); }
  /** 點餐、訂單、日結頁可不可以用：未登入的介面預覽可以看；登入後只有 POS 帳號可以，個人帳號不行。 */
  get counterAllowed(): boolean { const staff = this.api.staff(); return this.ui.preview || !staff || staff.level === 'POS'; }

  // ---- 開班／關班：做在上方工具列，只有 POS 帳號看得到。只鎖點餐收銀與訂單管理，其他功能不受影響 ----
  shiftStatus: ShiftStatus | null = null;   // null＝還沒查到（載入中或查詢失敗）
  businessDate = '';                        // 今天的營業日（後端決定）
  shiftLoading = false;
  staffOptions: StaffOption[] = [];         // 開班、關班人員候選（在職員工，不含 POS 帳號）
  shiftModal: 'open' | 'close' | 'reopen' | null = null;
  shiftError = '';
  openerId: number | null = null;
  pettyCash: number | null = 2000;          // 零用金預設 2000，可修改
  closerId: number | null = null;
  countedCash: number | null = null;
  diffReason = '';
  closeSummary: ShiftClosingSummary | null = null;   // 關班後在彈窗顯示日結結果
  /** POS 帳號在開班前（或已關班）鎖住點餐收銀與訂單管理；日結與報廢、工時、排班、檢核表照常使用。 */
  get shiftLocked(): boolean { return this.isPos && this.shiftStatus !== 'OPEN' && (this.ui.view === 'pos' || this.ui.view === 'orders'); }
  staffNameOf(id: number | null | undefined): string { return this.staffOptions.find(s => s.staffId === id)?.name ?? ''; }
  /** 工具列顯示的班次狀態。 */
  get shiftLabel(): string {
    if (this.shiftStatus === 'OPEN') return '營業中';
    return this.shiftStatus === 'CLOSED' ? '已關班' : this.shiftStatus === 'NONE' ? '未開班' : this.shiftLoading ? '確認中…' : '狀態未知';
  }

  constructor() {
    // 重新整理頁面後，token 還有效就直接恢復登入，不用重新輸入密碼。
    if (this.api.staff()) void this.resumeSession();
    // token 過期或帳號被停用時，任何 API 回 401 都會清掉登入（auth.interceptor），這裡把畫面一起還原並請員工重新登入。
    // 只處理「原本登入中 → 變成登出」的情況；員工自己按登出時畫面已先還原成預覽，不會重複處理。
    let wasLoggedIn = this.api.staff() !== null;
    effect(() => {
      const loggedIn = this.api.staff() !== null;
      if (wasLoggedIn && !loggedIn) untracked(() => { if (!this.ui.preview) this.sessionExpired(); });
      wasLoggedIn = loggedIn;
    });
  }

  async loadShift(): Promise<void> {
    this.shiftLoading = true;
    try {
      const [today, staff] = await Promise.all([this.api.shiftToday(), this.api.staffOptions()]);
      this.shiftStatus = today.shiftStatus; this.businessDate = today.businessDate; this.staffOptions = staff;
    } catch (error) { this.shiftStatus = null; this.ui.error = errorMessage(error); }
    finally { this.shiftLoading = false; }
  }

  openShiftModal(kind: 'open' | 'close' | 'reopen'): void {
    if (this.ui.busy) return;
    this.shiftError = ''; this.closeSummary = null; this.shiftModal = kind;
    if (kind === 'open') { this.openerId = null; this.pettyCash = 2000; }
    else if (kind === 'close') { this.closerId = null; this.countedCash = null; this.diffReason = ''; }
  }
  closeShiftModal(): void { if (!this.ui.busy) { this.shiftModal = null; this.closeSummary = null; } }

  async openShift(): Promise<void> {
    if (this.ui.busy) return;
    if (this.openerId === null) { this.shiftError = '請選擇開班人員'; return; }
    if (this.pettyCash === null || this.pettyCash < 0) { this.shiftError = '請填寫零用金（0 以上）'; return; }
    const opener = this.staffNameOf(this.openerId);
    this.ui.busy = true; this.shiftError = '';
    try {
      await this.api.openShift({ businessDate: this.businessDate, staffId: this.openerId, pettyCash: this.pettyCash, rolesJson: '[]' });
      this.shiftModal = null;
      await this.loadShift();
      this.ui.notice = `已開班，開班人員：${opener}`;
    } catch (error) {
      this.shiftError = errorMessage(error);
      await this.loadShift();   // 例如別台機器剛開班（409），重新確認狀態
      if (this.shiftStatus !== 'NONE') this.shiftModal = null;
    } finally { this.ui.busy = false; }
    await this.refreshAfterShiftChange();
  }

  /** 重新開班：取消今天的關班，接續營業。 */
  async reopenShift(): Promise<void> {
    if (this.ui.busy) return;
    this.ui.busy = true; this.shiftError = '';
    try {
      await this.api.reopenShift(this.businessDate);
      this.shiftModal = null;
      await this.loadShift();
      this.ui.notice = '已重新開班，接續今天的營業。';
    } catch (error) {
      this.shiftError = errorMessage(error);
      await this.loadShift();
      if (this.shiftStatus !== 'CLOSED') this.shiftModal = null;
    } finally { this.ui.busy = false; }
    await this.refreshAfterShiftChange();
  }

  async closeShift(): Promise<void> {
    if (this.ui.busy) return;
    if (this.closerId === null) { this.shiftError = '請選擇關班人員'; return; }
    if (this.countedCash === null || this.countedCash < 0) { this.shiftError = '請填寫實際清點的現金（0 以上）'; return; }
    // 本機還有送出但結果不明的訂單時不能關班，否則那筆訂單可能落在已日結的營業日
    if (this.pos.pending) { this.shiftError = '本機還有送單結果待確認，請先回點餐確認，不能關班。'; return; }
    this.ui.busy = true; this.shiftError = '';
    try {
      this.closeSummary = await this.api.closeShift({ businessDate: this.businessDate, staffId: this.closerId,
        countedCash: this.countedCash, diffReason: this.diffReason.trim() || null });
      await this.loadShift();
      this.ui.notice = `已關班，關班人員：${this.staffNameOf(this.closerId)}`;
    } catch (error) {
      this.shiftError = errorMessage(error);
      await this.loadShift();
      if (this.shiftStatus !== 'OPEN') this.shiftModal = null;
    } finally { this.ui.busy = false; }
    await this.refreshAfterShiftChange();
  }

  /** 開班、關班後，正在看的頁面重新讀取，避免顯示舊的班次狀態。 */
  private async refreshAfterShiftChange(): Promise<void> {
    if (this.ui.view === 'orders' && !this.shiftLocked) await this.orders.loadOrders();
    if (this.ui.view === 'store') await this.store.load();
  }

  // 先驗證員工，再同時取菜單與規則；其中任一步失敗，就清除登入狀態。
  async login(): Promise<void> {
    if (this.ui.busy || !this.ui.username.trim() || !this.ui.password) return;
    this.ui.busy = true; this.ui.modalError = '';
    try {
      await this.api.login(this.ui.username.trim(), this.ui.password);
      await this.enterSession();
    } catch (error) {
      // 菜單已載入一半才失敗時，畫面也要一起還原，不能停在「已登入」的樣子
      if (this.ui.preview) this.api.logout(); else this.resetSession();
      this.ui.modalError = errorMessage(error);
    }
    finally { this.ui.busy = false; }
  }
  private async resumeSession(): Promise<void> {
    this.ui.busy = true;
    try {
      await this.api.refreshStaff();
      await this.enterSession();
    }
    catch (error) { this.resetSession(); this.ui.error = errorMessage(error); }
    finally { this.ui.busy = false; }
  }
  private sessionExpired(): void {
    this.resetSession();
    this.ui.openLogin(); this.ui.modalError = '登入已逾時或帳號已停用，請重新登入。';
  }
  // 登入成功（或重新整理後恢復登入）：載入菜單與規則，依帳號種類進入對應畫面。
  private async enterSession(): Promise<void> {
    const [menu, rules] = await Promise.all([this.api.menu(), this.api.rules()]);
    this.pos.menu = menu; this.pos.rules = rules; this.ui.preview = false; this.pos.category = '全部飲品';
    this.pos.cart = []; this.pos.pending = null; this.pos.lastOrder = null;
    this.pos.restorePending();
    this.ui.loginOpen = false; this.ui.password = ''; this.ui.error = '';
    if (this.isPos) {
      // POS 共用帳號不能盤點（要記在員工本人名下）
      if (PERSONAL_VIEWS.includes(this.ui.view)) this.ui.view = 'pos';
      await this.loadShift();
      if (this.shiftLocked) this.ui.notice = this.shiftStatus === 'NONE' ? '登入成功。點餐與訂單需要先開班。' : '';
      else this.ui.notice = this.pos.pending ? '找到前次待確認訂單，請繼續確認送單結果。' : '登入成功，已載入門市菜單。';
      if (this.ui.view === 'orders' && !this.shiftLocked) await this.orders.loadOrders();
      if (this.ui.view === 'store') await this.store.load();
    } else {
      // 個人帳號不能點餐、看訂單與日結，直接進工時管理
      if (COUNTER_VIEWS.includes(this.ui.view)) this.ui.view = 'time-tracker';
      this.ui.notice = '登入成功。點餐收銀、訂單管理與日結請使用門市 POS 帳號。';
    }
  }
  logout(): void {
    if (this.ui.busy) return;
    this.resetSession();
  }
  private resetSession(): void {
    this.api.logout(); this.pos.reset(); this.orders.reset(); this.store.reset();
    this.ui.preview = true; this.ui.loginOpen = false; this.ui.password = '';
    this.ui.error = ''; this.ui.notice = ''; this.ui.view = 'pos';
    this.shiftStatus = null; this.businessDate = ''; this.staffOptions = []; this.shiftModal = null; this.closeSummary = null;
  }
  async switchView(view: WorkspaceView): Promise<void> {
    if (view === 'recipes' && !this.canViewRecipes) return;
    if (COUNTER_VIEWS.includes(view) && !this.counterAllowed) return;
    if (PERSONAL_VIEWS.includes(view) && this.isPos) return;
    if (!this.ui.navigate(view)) return;
    if (view === 'orders' && !this.ui.preview && !this.shiftLocked) await this.orders.loadOrders();
  }
}
