import { Injectable, NgZone, inject } from '@angular/core';

export type WorkspaceView = 'pos' | 'orders' | 'store' | 'time-tracker' | 'schedule' | 'checklist' | 'inventory-count' | 'sale-status' | 'material-consumption' | 'recipes';
/** 各頁標題：顯示在最上面的橫幅（AppComponent），頁面內不再放大標題。 */
export const VIEW_TITLES: Record<WorkspaceView, string> = {
  'pos': '點餐收銀', 'orders': '訂單管理', 'store': '原料報廢回報', 'time-tracker': '打卡', 'schedule': '班表',
  'checklist': '檢核表', 'inventory-count': '原料盤點', 'sale-status': '停售管理', 'material-consumption': '物料消耗', 'recipes': '飲品配方'
};
/** 只有門市 POS 共用帳號能用的頁面（後端 /api/orders、/api/daily-shifts 也只限 POS）。 */
export const COUNTER_VIEWS: readonly WorkspaceView[] = ['pos', 'orders'];
/** 原料報廢回報（view 代號沿用 store）只限店員、店長的個人帳號；POS 共用帳號與其他等級看不到。 */
export const STORE_LEVELS: readonly string[] = ['STAFF', 'MANAGER'];
/** 只有個人帳號能用的頁面（盤點要記在員工本人名下，POS 共用帳號不行）。 */
export const PERSONAL_VIEWS: readonly WorkspaceView[] = ['inventory-count'];

/** 跨頁共用的操作鎖、訊息與登入表單。登入身分仍由 PosApiService 管理。 */
@Injectable({ providedIn: 'root' })
export class UiStateService {
  private readonly zone = inject(NgZone);
  view: WorkspaceView = 'pos';
  preview = true;
  busy = false;
  error = '';
  private noticeText = '';
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  /** 操作成功的提示：顯示在橫幅（手機在畫面下方），幾秒後自動消失；字越多停越久。錯誤訊息 error 不會自動消失。 */
  get notice(): string { return this.noticeText; }
  set notice(text: string) {
    this.noticeText = text;
    clearTimeout(this.noticeTimer);
    // 計時放在 Angular 之外，等待中的提示不會讓頁面一直算「還沒穩定」；時間到再回到 Angular 更新畫面
    if (text) this.noticeTimer = this.zone.runOutsideAngular(() => setTimeout(() => this.zone.run(() => this.noticeText = ''),
      Math.min(9000, Math.max(4000, 2500 + text.length * 120))));
  }
  modalError = '';
  loginOpen = false;
  username = '';
  password = '';

  openLogin(): void { this.modalError = ''; this.password = ''; this.loginOpen = true; }
  navigate(view: WorkspaceView): boolean {
    if (this.busy) return false;
    this.error = ''; this.modalError = ''; this.view = view;
    return true;
  }
}
