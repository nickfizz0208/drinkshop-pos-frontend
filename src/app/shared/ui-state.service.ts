import { Injectable } from '@angular/core';

export type WorkspaceView = 'pos' | 'orders' | 'store';

/** 跨頁共用的操作鎖、訊息與登入表單。登入身分仍由 PosApiService 管理。 */
@Injectable({ providedIn: 'root' })
export class UiStateService {
  view: WorkspaceView = 'pos';
  preview = true;
  busy = false;
  error = '';
  notice = '';
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
