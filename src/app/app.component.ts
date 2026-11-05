import { IconComponent } from './shared/icon.component';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from './shared/modal.component';
import { UiStateService, WorkspaceView } from './shared/ui-state.service';
import { PosApiService, errorMessage } from './services/pos-api.service';
import { PosComponent } from './features/pos/pos.component';
import { PosStateService } from './features/pos/pos-state.service';
import { OrdersComponent } from './features/orders/orders.component';
import { OrdersStateService } from './features/orders/orders-state.service';
import { StoreOpsComponent } from './features/store-ops/store-ops.component';
import { StoreOpsStateService } from './features/store-ops/store-ops-state.service';

/** 工作台外框：登入、登出與切頁；點餐及訂單功能依 feature 分開維護。 */
@Component({
  selector: 'app-root',
  imports: [IconComponent, FormsModule, ModalComponent, PosComponent, OrdersComponent, StoreOpsComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  readonly api = inject(PosApiService);
  readonly ui = inject(UiStateService);
  private readonly pos = inject(PosStateService);
  private readonly orders = inject(OrdersStateService);
  private readonly store = inject(StoreOpsStateService);

  get todayLabel(): string { return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()); }

  // 先驗證員工，再同時取菜單與規則；其中任一步失敗，就清除登入狀態。
  async login(): Promise<void> {
    if (this.ui.busy || !this.ui.username.trim() || !this.ui.password) return;
    this.ui.busy = true; this.ui.modalError = '';
    try {
      await this.api.login(this.ui.username.trim(), this.ui.password);
      const [menu, rules] = await Promise.all([this.api.menu(), this.api.rules()]);
      this.pos.menu = menu; this.pos.rules = rules; this.ui.preview = false; this.pos.category = '全部飲品';
      this.pos.cart = []; this.pos.pending = null; this.pos.lastOrder = null;
      this.pos.restorePending();
      this.ui.loginOpen = false; this.ui.password = ''; this.ui.error = '';
      this.ui.notice = this.pos.pending ? '找到前次待確認訂單，請繼續確認送單結果。' : '登入成功，已載入門市菜單。';
      if (this.ui.view === 'orders') await this.orders.loadOrders();
      if (this.ui.view === 'store') await this.store.load();
    } catch (error) { this.api.logout(); this.ui.modalError = errorMessage(error); }
    finally { this.ui.busy = false; }
  }
  logout(): void {
    if (this.ui.busy) return;
    this.api.logout(); this.pos.reset(); this.orders.reset(); this.store.reset();
    this.ui.preview = true; this.ui.loginOpen = false; this.ui.password = '';
    this.ui.notice = ''; this.ui.navigate('pos');
  }
  async switchView(view: WorkspaceView): Promise<void> {
    if (!this.ui.navigate(view)) return;
    if (view === 'orders' && !this.ui.preview) await this.orders.loadOrders();
  }
}
