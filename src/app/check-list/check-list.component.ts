import { Component, OnDestroy, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../shared/modal.component';
import { PosApiService, errorMessage } from '../services/pos-api.service';
import { ChecklistApiService } from '../services/checklist-api.service';
import { BoardRow, ChecklistItem, ChecklistRecord, FREQUENCY_LABELS, Frequency } from '../models/checklist';
import { ClockRecord } from '../models/time-clock';

type Tab = 'today' | 'manage';
interface ItemForm { itemId: number | null; name: string; frequency: Frequency; targetCount: number; active: boolean; }
/** POS 帳號打勾時選人。 */
interface PickForm { row: BoardRow; staffId: number | null; }

const MANAGER_LEVELS = ['MANAGER', 'HQ'];

/**
 * 每日檢查表。
 * 今日待辦：在班的人把做完的事打勾。個人帳號（手機）一律記成自己；POS 共用帳號要選是誰做的。
 * 項目管理：店長、總部新增、修改、停用工作項目。
 */
@Component({
  selector: 'app-check-list',
  imports: [FormsModule, ModalComponent],
  templateUrl: './check-list.component.html',
  styleUrl: './check-list.component.scss'
})
export class CheckListComponent implements OnDestroy {
  readonly pos = inject(PosApiService);
  private readonly api = inject(ChecklistApiService);
  readonly frequencyLabels = FREQUENCY_LABELS;
  readonly frequencies: Frequency[] = ['DAILY', 'WEEKLY'];

  tab: Tab = 'today';
  board: BoardRow[] = [];
  onDuty: ClockRecord[] = [];
  items: ChecklistItem[] = [];

  loading = false;
  busy = false;
  error = '';
  notice = '';

  pickForm: PickForm | null = null;
  itemForm: ItemForm | null = null;
  itemError = '';

  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => { if (this.pos.staff()) void this.load(); else this.reset(); });
  }
  ngOnDestroy(): void { clearTimeout(this.noticeTimer); }

  // ---------- 身分 ----------

  get loggedIn(): boolean { return this.pos.staff() !== null; }
  get me() { return this.pos.staff(); }
  /** 門市 POS 機的共用帳號：打勾要選人。 */
  get isPosAccount(): boolean { return this.me?.level === 'POS'; }
  get isManager(): boolean { return MANAGER_LEVELS.includes(this.me?.level ?? ''); }
  /** 個人帳號：自己是否在班（不在班不能打勾）。 */
  get meOnDuty(): boolean { return this.onDuty.some(r => r.staffId === this.me?.staffId); }
  get canCheck(): boolean { return this.isPosAccount ? this.onDuty.length > 0 : this.meOnDuty; }
  get blockedReason(): string {
    if (this.isPosAccount) return this.onDuty.length ? '' : '目前沒有人在班，請先打卡上班';
    return this.meOnDuty ? '' : '你目前不在班，請先在 POS 機打卡上班';
  }

  /** 個人帳號只能取消自己的；POS、店長可以取消任何紀錄。 */
  canUndo(r: ChecklistRecord): boolean { return this.isPosAccount || this.isManager || r.staffId === this.me?.staffId; }

  // ---------- 今日待辦 ----------

  /** 依頻率分組，未完成的排前面。 */
  section(frequency: Frequency): BoardRow[] {
    return this.board.filter(r => r.frequency === frequency)
      .sort((a, b) => Number(a.completed) - Number(b.completed));
  }
  get pendingCount(): number { return this.board.filter(r => !r.completed).length; }
  get progressPercent(): number {
    return this.board.length ? Math.round(this.board.filter(r => r.completed).length / this.board.length * 100) : 0;
  }

  async load(): Promise<void> {
    this.loading = true; this.error = '';
    try {
      const [board, onDuty] = await Promise.all([this.api.board(), this.api.onDuty()]);
      this.board = board; this.onDuty = onDuty;
      if (this.isManager) this.items = await this.api.items(true);
    } catch (e) { this.error = errorMessage(e); }
    finally { this.loading = false; }
  }

  private reset(): void {
    this.tab = 'today'; this.board = []; this.onDuty = []; this.items = [];
    this.pickForm = null; this.itemForm = null; this.error = ''; this.notice = '';
  }

  /** 按「完成」：個人帳號直接記自己；POS 帳號先選人。 */
  async done(row: BoardRow): Promise<void> {
    if (!this.canCheck || this.busy) return;
    if (this.isPosAccount) {
      this.pickForm = { row, staffId: this.onDuty.length === 1 ? this.onDuty[0].staffId : null };
      return;
    }
    await this.submit(row);
  }

  async confirmPick(): Promise<void> {
    const f = this.pickForm;
    if (!f || f.staffId === null) return;
    await this.submit(f.row, f.staffId);
    this.pickForm = null;
  }

  private async submit(row: BoardRow, staffId?: number): Promise<void> {
    this.busy = true; this.error = '';
    try {
      // 個人帳號不帶 staffId（後端記成自己）；POS 才帶
      const r = await this.api.check(staffId === undefined ? { itemId: row.itemId } : { itemId: row.itemId, staffId });
      this.flash(`已記錄：${r.staffName ?? ''} 完成「${row.name}」`);
      this.board = await this.api.board();
    } catch (e) { this.error = errorMessage(e); }
    finally { this.busy = false; }
  }

  async undo(row: BoardRow, r: ChecklistRecord): Promise<void> {
    if (!this.canUndo(r) || this.busy) return;
    this.busy = true; this.error = '';
    try {
      await this.api.uncheck(r.recordId);
      this.flash(`已取消：${r.staffName ?? ''} 的「${row.name}」`);
      this.board = await this.api.board();
    } catch (e) { this.error = errorMessage(e); }
    finally { this.busy = false; }
  }

  // ---------- 項目管理（店長） ----------

  setTab(tab: Tab): void { this.tab = tab; }

  newItem(): void {
    this.itemError = '';
    this.itemForm = { itemId: null, name: '', frequency: 'DAILY', targetCount: 1, active: true };
  }
  editItem(i: ChecklistItem): void {
    this.itemError = '';
    this.itemForm = { itemId: i.itemId, name: i.name, frequency: i.frequency, targetCount: i.targetCount, active: i.active };
  }

  async saveItem(): Promise<void> {
    const f = this.itemForm;
    if (!f || this.busy) return;
    const name = f.name.trim();
    if (!name) { this.itemError = '請填寫項目名稱'; return; }
    const target = Math.floor(Number(f.targetCount));
    if (!(target >= 1 && target <= 99)) { this.itemError = '次數請填 1～99'; return; }
    this.busy = true; this.itemError = '';
    // 後端不接受多餘欄位：新增不送 active
    const body = { name, frequency: f.frequency, targetCount: target };
    try {
      if (f.itemId === null) await this.api.createItem(body);
      else await this.api.updateItem(f.itemId, { ...body, active: f.active });
      this.itemForm = null;
      this.flash(f.itemId === null ? `已新增「${name}」` : `已更新「${name}」`);
      await this.load();
    } catch (e) { this.itemError = errorMessage(e); }
    finally { this.busy = false; }
  }

  /** 列表上直接切換啟用／停用。 */
  async toggleActive(i: ChecklistItem): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.error = '';
    try {
      await this.api.updateItem(i.itemId, { name: i.name, frequency: i.frequency, targetCount: i.targetCount, active: !i.active });
      this.flash(i.active ? `已停用「${i.name}」` : `已啟用「${i.name}」`);
      await this.load();
    } catch (e) { this.error = errorMessage(e); }
    finally { this.busy = false; }
  }

  // ---------- 顯示 ----------

  time(value: string): string { return value.slice(11, 16); }
  /** 每週項目顯示星期，例如「週二 14:05」；每日項目只顯示時間。 */
  doneLabel(row: BoardRow, r: ChecklistRecord): string {
    if (row.frequency === 'DAILY') return this.time(r.doneAt);
    const [y, m, d] = r.doneAt.slice(0, 10).split('-').map(Number);
    return `週${'日一二三四五六'[new Date(y, m - 1, d).getDay()]} ${this.time(r.doneAt)}`;
  }

  private flash(message: string): void {
    clearTimeout(this.noticeTimer);
    this.notice = message;
    this.noticeTimer = setTimeout(() => this.notice = '', 4000);
  }
}
