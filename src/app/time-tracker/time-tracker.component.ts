import { Component, OnDestroy, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../shared/modal.component';
import { PosApiService, errorMessage } from '../services/pos-api.service';
import { ScheduleApiService } from '../services/schedule-api.service';
import { TimeClockApiService } from '../services/time-clock-api.service';
import { ClockRecord, ShiftStatus } from '../models/time-clock';
import { StaffOption } from '../models/schedule';

interface EditForm { record: ClockRecord; clockInAt: string; clockOutAt: string; onDuty: boolean; }
/** 打卡前的確認：大字顯示是誰、上班或下班、現在時間。 */
interface PunchConfirm { staffId: number; name: string; out: boolean; at: Date; }

const MANAGER_LEVELS = ['MANAGER', 'HQ'];

/**
 * 工時管理（打卡）。必須登入。
 * 左邊：選人 → 打卡上班／下班（只顯示一顆按鈕），送出前跳出確認視窗。
 * 右邊：店長、總部看所有人的紀錄（可切換日期、修改、刪除）；
 *       其他人只看「目前在班」和「我的紀錄」（工時與薪資相關，不公開別人的）。
 */
@Component({
  selector: 'app-time-tracker',
  imports: [FormsModule, ModalComponent],
  templateUrl: './time-tracker.component.html',
  styleUrl: './time-tracker.component.scss'
})
export class TimeTrackerComponent implements OnDestroy {
  readonly pos = inject(PosApiService);
  private readonly api = inject(TimeClockApiService);
  private readonly scheduleApi = inject(ScheduleApiService);

  staff: StaffOption[] = [];
  businessDate = '';                 // 今天的營業日（後端決定）
  shiftStatus: ShiftStatus = 'NONE';
  todayRecords: ClockRecord[] = [];

  canViewAll = false;                // 店長、總部（後端決定）

  // 店長：所有人的紀錄
  viewDate = '';                     // 右側列表正在看的日期
  viewRecords: ClockRecord[] = [];

  // 一般員工：我的紀錄
  myMonth = '';                      // YYYY-MM
  myRecords: ClockRecord[] = [];

  confirmPunch: PunchConfirm | null = null;

  selectedStaffId: number | null = null;
  loading = false;
  busy = false;
  error = '';
  notice = '';
  now = Date.now();                  // 每分鐘更新，讓在班時數跟著跑

  editForm: EditForm | null = null;
  editError = '';

  private ticker = setInterval(() => this.now = Date.now(), 60_000);
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => { if (this.pos.staff()) void this.load(true); else this.reset(); });
  }

  ngOnDestroy(): void { clearInterval(this.ticker); clearTimeout(this.noticeTimer); }

  // ---------- 狀態 ----------

  get loggedIn(): boolean { return this.pos.staff() !== null; }
  get isManager(): boolean { return this.canViewAll || MANAGER_LEVELS.includes(this.pos.staff()?.level ?? ''); }
  get myStaffId(): number | undefined { return this.pos.staff()?.staffId; }
  /** 目前在班的人（今天、還沒下班），依上班時間排序。 */
  get onDutyRecords(): ClockRecord[] {
    return this.todayRecords.filter(r => r.onDuty).sort((a, b) => a.clockInAt.localeCompare(b.clockInAt));
  }
  get myTotalMinutes(): number { return this.myRecords.reduce((sum, r) => sum + this.minutesOf(r), 0); }
  get myWorkDays(): number { return new Set(this.myRecords.map(r => r.businessDate)).size; }
  get viewingToday(): boolean { return this.viewDate === this.businessDate; }

  /** 選到的人目前在班的那筆紀錄（沒在班為 undefined）。 */
  get selectedOnDuty(): ClockRecord | undefined {
    return this.todayRecords.find(r => r.staffId === this.selectedStaffId && r.onDuty);
  }
  /** 選到的人今天最後一次下班（顯示「今天已打卡下班 15:00」用）。 */
  get selectedLastOut(): ClockRecord | undefined {
    return [...this.todayRecords].reverse().find(r => r.staffId === this.selectedStaffId && !r.onDuty);
  }
  get canPunch(): boolean { return this.shiftStatus === 'OPEN' && this.selectedStaffId !== null && !this.busy; }
  get shiftMessage(): string {
    return this.shiftStatus === 'NONE' ? '今天還沒開班，開班後才能打卡'
      : this.shiftStatus === 'CLOSED' ? '今天已經關班，不能再打卡上班' : '';
  }

  /** 在班的排前面，各自依上班時間排序。 */
  get sortedRecords(): ClockRecord[] {
    return [...this.viewRecords].sort((a, b) =>
      Number(b.onDuty) - Number(a.onDuty) || a.clockInAt.localeCompare(b.clockInAt));
  }
  get onDutyCount(): number { return new Set(this.viewRecords.filter(r => r.onDuty).map(r => r.staffId)).size; }
  get totalMinutes(): number { return this.viewRecords.reduce((sum, r) => sum + this.minutesOf(r), 0); }

  // ---------- 載入 ----------

  /** first = 第一次載入：預設選登入者自己、右側顯示今天。 */
  async load(first = false): Promise<void> {
    this.loading = true; this.error = '';
    try {
      const [today, staff] = await Promise.all([this.api.today(), this.scheduleApi.staff()]);
      this.staff = staff;
      this.applyToday(today.businessDate, today.shiftStatus, today.records);
      this.canViewAll = today.canViewAll;
      if (first) {
        this.viewDate = today.businessDate;
        this.myMonth = today.businessDate.slice(0, 7);
        const me = this.myStaffId;
        this.selectedStaffId = staff.some(s => s.staffId === me) ? me! : null;
      }
      if (this.canViewAll) this.viewRecords = this.viewingToday ? today.records : await this.api.list(this.viewDate);
      else this.myRecords = await this.api.mine(this.myMonth);
    } catch (e) { this.error = errorMessage(e); }
    finally { this.loading = false; }
  }

  private applyToday(date: string, status: ShiftStatus, records: ClockRecord[]): void {
    this.businessDate = date; this.shiftStatus = status; this.todayRecords = records;
  }

  async changeViewDate(): Promise<void> {
    if (!this.viewDate) { this.viewDate = this.businessDate; }
    this.loading = true; this.error = '';
    try { this.viewRecords = this.viewingToday ? this.todayRecords : await this.api.list(this.viewDate); }
    catch (e) { this.error = errorMessage(e); }
    finally { this.loading = false; }
  }

  async changeMyMonth(): Promise<void> {
    if (!this.myMonth) this.myMonth = this.businessDate.slice(0, 7);
    this.loading = true; this.error = '';
    try { this.myRecords = await this.api.mine(this.myMonth); }
    catch (e) { this.error = errorMessage(e); }
    finally { this.loading = false; }
  }

  async backToToday(): Promise<void> { this.viewDate = this.businessDate; await this.load(); }

  private reset(): void {
    this.staff = []; this.todayRecords = []; this.viewRecords = []; this.selectedStaffId = null;
    this.businessDate = ''; this.viewDate = ''; this.shiftStatus = 'NONE';
    this.editForm = null; this.confirmPunch = null; this.error = ''; this.notice = '';
    this.myRecords = []; this.myMonth = ''; this.canViewAll = false;
  }

  // ---------- 打卡 ----------

  /** 按下打卡：先跳出確認視窗。 */
  askPunch(): void {
    const id = this.selectedStaffId;
    if (id === null || !this.canPunch) return;
    this.confirmPunch = { staffId: id, name: this.staffName(id), out: !!this.selectedOnDuty, at: new Date() };
  }

  /** 確認後才真正送出；以確認視窗上顯示的人與動作為準。 */
  async punch(): Promise<void> {
    const c = this.confirmPunch;
    if (!c || this.busy) return;
    const id = c.staffId, goingOut = c.out;
    this.busy = true; this.error = '';
    try {
      const r = goingOut ? await this.api.clockOut(id) : await this.api.clockIn(id);
      const name = r.staffName ?? this.staffName(id);
      this.flash(goingOut
        ? `${name} 已打卡下班 ${this.time(r.clockOutAt)}，本次 ${this.durationLabel(r)}`
        : `${name} 已打卡上班 ${this.time(r.clockInAt)}`);
      // 清空選擇，避免下一位沒注意就用別人的名字打卡
      this.selectedStaffId = null;
      this.confirmPunch = null;
      await this.load();
    } catch (e) { this.error = errorMessage(e); this.confirmPunch = null; }
    finally { this.busy = false; }
  }

  // ---------- 店長修改 ----------

  openEdit(r: ClockRecord): void {
    if (!this.isManager) return;
    this.editError = '';
    this.editForm = {
      record: r, clockInAt: r.clockInAt.slice(0, 16),
      clockOutAt: (r.clockOutAt ?? '').slice(0, 16), onDuty: r.onDuty
    };
  }

  async saveEdit(): Promise<void> {
    const f = this.editForm;
    if (!f || this.busy) return;
    if (!f.clockInAt) { this.editError = '請填寫上班時間'; return; }
    if (!f.onDuty && !f.clockOutAt) { this.editError = '請填寫下班時間，或勾選「還在班」'; return; }
    if (!f.onDuty && f.clockOutAt < f.clockInAt) { this.editError = '下班時間不能早於上班時間'; return; }
    this.busy = true; this.editError = '';
    try {
      await this.api.update(f.record.shiftStaffId,
        { clockInAt: f.clockInAt, clockOutAt: f.onDuty ? null : f.clockOutAt });
      this.editForm = null;
      this.flash('已修改打卡紀錄');
      await this.load();
    } catch (e) { this.editError = errorMessage(e); }
    finally { this.busy = false; }
  }

  async removeRecord(): Promise<void> {
    const f = this.editForm;
    if (!f || this.busy) return;
    this.busy = true; this.editError = '';
    try {
      await this.api.remove(f.record.shiftStaffId);
      this.editForm = null;
      this.flash('已刪除打卡紀錄');
      await this.load();
    } catch (e) { this.editError = errorMessage(e); }
    finally { this.busy = false; }
  }

  // ---------- 顯示 ----------

  staffName(id: number | null): string { return this.staff.find(s => s.staffId === id)?.name ?? ''; }
  /** 2026-11-06T09:58:12.123 → 09:58 */
  time(value: string | null): string { return value ? value.slice(11, 16) : ''; }

  minutesOf(r: ClockRecord): number {
    // 只取到秒：後端時間有 6 位小數，部分瀏覽器無法解析
    const start = new Date(r.clockInAt.slice(0, 19)).getTime();
    const end = r.clockOutAt ? new Date(r.clockOutAt.slice(0, 19)).getTime() : this.now;
    return Math.max(0, Math.floor((end - start) / 60_000));
  }
  durationLabel(r: ClockRecord): string { return this.formatMinutes(this.minutesOf(r)); }
  formatMinutes(m: number): string {
    const h = Math.floor(m / 60), r = m % 60;
    return h ? (r ? `${h} 小時 ${r} 分` : `${h} 小時`) : `${r} 分`;
  }
  clockText(d: Date): string { return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
  /** 2026-11-06 → 11/6（五） */
  shortDate(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    return `${m}/${d}（${'日一二三四五六'[new Date(y, m - 1, d).getDay()]}）`;
  }
  dateLabel(date: string): string {
    if (!date) return '';
    const [y, m, d] = date.split('-').map(Number);
    const w = '日一二三四五六'[new Date(y, m - 1, d).getDay()];
    return `${m}月${d}日（${w}）`;
  }

  private flash(message: string): void {
    clearTimeout(this.noticeTimer);
    this.notice = message;
    this.noticeTimer = setTimeout(() => this.notice = '', 5000);
  }
}
