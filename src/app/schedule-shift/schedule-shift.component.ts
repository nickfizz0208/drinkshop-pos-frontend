import { Component, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../shared/modal.component';
import { PosApiService, errorMessage } from '../services/pos-api.service';
import { ScheduleApiService } from '../services/schedule-api.service';
import { EntrySave, ScheduleEntry, ScheduleTag, ScheduleWeek, ShiftTemplate, StaffOption } from '../models/schedule';
import { downloadScheduleExcel } from './schedule-excel';

/** 排班表單的編輯狀態；scheduleId 為 null 代表新增。 */
interface EntryForm {
  scheduleId: number | null; workDate: string; staffId: number | null;
  templateId: number | null; templateName: string | null;
  startTime: string; endTime: string; note: string; tagIds: number[];
}
interface TagForm { tagId: number | null; name: string; description: string; active: boolean; }
interface Day { date: string; label: string; weekday: string; isToday: boolean; entries: ScheduleEntry[]; mine: boolean; }
/** 日檢視的一列：一位員工，可能有多段班。 */
interface TimelineRow { staffId: number; name: string; bars: TimelineBar[]; mine: boolean; }
interface TimelineBar { entry: ScheduleEntry; left: number; width: number; overlap: boolean; }

type ViewMode = 'week' | 'day';
const DEFAULT_START_HOUR = 9;   // 沒有排班時，時間軸預設顯示 09:00–22:00
const DEFAULT_END_HOUR = 22;

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 排班管理（週檢視）。
 * 店長、總部：新增／修改／刪除排班、管理標籤、複製上週、發布。
 * 其他員工：只看已發布的週。必須登入才能使用。
 */
@Component({
  selector: 'app-schedule-shift',
  imports: [FormsModule, ModalComponent],
  templateUrl: './schedule-shift.component.html',
  styleUrl: './schedule-shift.component.scss'
})
export class ScheduleShiftComponent {
  readonly pos = inject(PosApiService);
  private readonly api = inject(ScheduleApiService);

  week: ScheduleWeek | null = null;
  days: Day[] = [];
  staff: StaffOption[] = [];
  tags: ScheduleTag[] = [];              // 含停用，排班表單只列啟用中的（已選的停用標籤仍顯示）
  anchor = today();                      // 目前查看的週內任一天
  mode: ViewMode = 'week';
  selectedDate = today();                // 日檢視顯示的日期（一定在目前這一週內）

  loading = false;
  busy = false;
  error = '';
  notice = '';

  entryForm: EntryForm | null = null;
  entryError = '';
  templates: ShiftTemplate[] = [];
  templatesLoading = false;
  templatesError = '';
  private templateRequest = 0;
  tagsOpen = false;
  tagForm: TagForm | null = null;
  tagError = '';
  confirmPublish = false;

  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  /** 成功訊息顯示 4 秒後自動消失。 */
  private flash(message: string): void {
    clearTimeout(this.noticeTimer);
    this.notice = message;
    if (message) this.noticeTimer = setTimeout(() => this.notice = '', 4000);
  }

  constructor() {
    // 登入／登出時重新載入（元件存在期間登入狀態可能改變）
    effect(() => { if (this.pos.staff()) void this.load(); else this.reset(); });
  }

  get loggedIn(): boolean { return this.pos.staff() !== null; }
  get canEdit(): boolean { return this.week?.canEdit ?? false; }
  get activeTags(): ScheduleTag[] { return this.tags.filter(t => t.active); }
  get statusLabel(): string {
    if (!this.week) return '';
    if (!this.week.published) return '草稿・尚未發布';
    return this.week.modifiedAfterPublish ? '已發布・有修改尚未發布' : '已發布';
  }
  get statusClass(): string {
    if (!this.week?.published) return 'draft';
    return this.week.modifiedAfterPublish ? 'modified' : 'published';
  }
  /** 這個班是不是目前登入者的。 */
  isMine(entry: ScheduleEntry): boolean { return entry.staffId === this.pos.staff()?.staffId; }
  /** 本週自己上班幾天（頁首提示用）。 */
  get myDays(): number { return this.days.filter(d => d.mine).length; }

  get hasEntries(): boolean { return (this.week?.entries.length ?? 0) > 0; }
  /** 本週所有時段重疊（店長才有）；有重疊不能發布。 */
  get overlaps(): string[] { return this.week?.warnings ?? []; }

  /** 不能發布的原因；空字串代表可以發布。 */
  get publishBlockedReason(): string {
    if (!this.week) return '讀取中';
    if (this.overlaps.length) return `本週有 ${this.overlaps.length} 個時段重疊，請先修正再發布`;
    if (this.week.published && !this.week.modifiedAfterPublish) return '員工看到的已經是最新版本';
    if (!this.week.published && !this.hasEntries) return '本週還沒有排班';
    return '';
  }
  get canPublish(): boolean { return this.publishBlockedReason === ''; }
  get publishLabel(): string { return this.week?.published ? '發布修改' : '發布本週'; }

  // ---------- 載入 ----------

  async load(): Promise<void> {
    this.loading = true; this.error = '';
    try {
      const [week, staff, tags] = await Promise.all([
        this.api.week(this.anchor), this.api.staff(), this.api.tags(true)]);
      this.staff = staff; this.tags = tags;
      this.setWeek(week);
    } catch (e) { this.error = errorMessage(e); }
    finally { this.loading = false; }
  }

  private async reloadWeek(): Promise<void> {
    this.setWeek(await this.api.week(this.anchor));
  }

  private setWeek(week: ScheduleWeek): void {
    this.week = week;
    const now = today();
    this.days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(week.weekStart, i);
      const d = parseDate(date);
      return {
        date, label: `${d.getMonth() + 1}/${d.getDate()}`, weekday: WEEKDAYS[d.getDay()],
        isToday: date === now, entries: week.entries.filter(e => e.workDate === date),
        mine: week.entries.some(e => e.workDate === date && this.isMine(e))
      };
    });
    if (!this.days.some(d => d.date === this.selectedDate)) {
      this.selectedDate = this.days.some(d => d.date === now) ? now : week.weekStart;
    }
  }

  private reset(): void {
    this.week = null; this.days = []; this.staff = []; this.tags = [];
    this.entryForm = null; this.tagsOpen = false; this.tagForm = null; this.confirmPublish = false;
    this.templateRequest++;
    this.templates = []; this.templatesLoading = false; this.templatesError = '';
    this.error = ''; this.flash('');
  }

  // ---------- 週切換 ----------

  async moveWeek(offset: number): Promise<void> {
    if (!this.week || this.loading) return;
    this.anchor = addDays(this.week.weekStart, offset * 7);
    this.flash('');
    await this.load();
  }
  async thisWeek(): Promise<void> {
    this.anchor = today(); this.selectedDate = today(); this.flash('');
    await this.load();
  }

  // ---------- 週／日切換 ----------

  setMode(mode: ViewMode): void { this.mode = mode; }

  /** 週檢視點日期標題 → 切到那一天的日檢視。 */
  openDay(date: string): void { this.selectedDate = date; this.mode = 'day'; }

  /** 日檢視前後一天；跨週時重新讀取那一週。 */
  async moveDay(offset: number): Promise<void> {
    if (this.loading) return;
    const target = addDays(this.selectedDate, offset);
    this.selectedDate = target;
    if (!this.days.some(d => d.date === target)) {
      this.anchor = target; this.flash('');
      await this.load();
    }
  }

  // ---------- 日檢視（時間軸） ----------

  get selectedDay(): Day | undefined { return this.days.find(d => d.date === this.selectedDate); }

  /** 時間軸範圍：涵蓋當天所有班，至少 09:00–22:00，以整點為單位。 */
  get timelineRange(): { start: number; end: number } {
    const entries = this.selectedDay?.entries ?? [];
    let start = DEFAULT_START_HOUR * 60, end = DEFAULT_END_HOUR * 60;
    for (const e of entries) { start = Math.min(start, minutes(e.startTime)); end = Math.max(end, minutes(e.endTime)); }
    return { start: Math.floor(start / 60) * 60, end: Math.ceil(end / 60) * 60 };
  }

  get hours(): number[] {
    const { start, end } = this.timelineRange;
    return Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start / 60 + i);
  }

  /** 刻度位置（百分比）。 */
  hourLeft(hour: number): number {
    const { start, end } = this.timelineRange;
    return (hour * 60 - start) / (end - start) * 100;
  }

  get timelineRows(): TimelineRow[] {
    const { start, end } = this.timelineRange;
    const span = end - start;
    const rows = new Map<number, TimelineRow>();
    for (const e of this.selectedDay?.entries ?? []) {
      const row = rows.get(e.staffId) ?? { staffId: e.staffId, name: e.staffName ?? '', bars: [], mine: this.isMine(e) };
      const s = minutes(e.startTime), t = minutes(e.endTime);
      row.bars.push({ entry: e, left: (s - start) / span * 100, width: (t - s) / span * 100, overlap: false });
      rows.set(e.staffId, row);
    }
    for (const row of rows.values()) {
      for (const a of row.bars) {
        a.overlap = row.bars.some(b => b !== a
          && minutes(a.entry.startTime) < minutes(b.entry.endTime) && minutes(b.entry.startTime) < minutes(a.entry.endTime));
      }
    }
    // 自己排第一列，其餘依當天最早上班時間排序
    return [...rows.values()].sort((a, b) => Number(b.mine) - Number(a.mine)
      || Math.min(...a.bars.map(x => x.left)) - Math.min(...b.bars.map(x => x.left)));
  }

  /** 「現在」線的位置；不是今天或超出範圍時為 null。 */
  get nowLeft(): number | null {
    if (this.selectedDate !== today()) return null;
    const { start, end } = this.timelineRange;
    const d = new Date(), m = d.getHours() * 60 + d.getMinutes();
    return m < start || m > end ? null : (m - start) / (end - start) * 100;
  }

  /** 當天排班人數。 */
  get dayHeadcount(): number { return new Set((this.selectedDay?.entries ?? []).map(e => e.staffId)).size; }

  durationLabel(entry: ScheduleEntry): string {
    const m = minutes(entry.endTime) - minutes(entry.startTime);
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} 小時 ${r} 分` : `${h} 小時`;
  }

  // ---------- 排班新增／修改／刪除 ----------

  async loadTemplates(): Promise<void> {
    if (!this.canEdit || this.templatesLoading) return;
    const request = ++this.templateRequest;
    this.templatesLoading = true;
    this.templatesError = '';
    try {
      const templates = await this.api.templates();
      if (request === this.templateRequest) this.templates = templates;
    } catch (error) {
      if (request === this.templateRequest) {
        this.templates = [];
        this.templatesError = errorMessage(error);
      }
    } finally {
      if (request === this.templateRequest) this.templatesLoading = false;
    }
  }

  applyTemplate(form: EntryForm, templateId: number | null): void {
    if (templateId === form.templateId) return;
    const template = this.templates.find(item => item.templateId === templateId);
    form.templateId = template?.templateId ?? null;
    form.templateName = template?.name ?? null;
    if (template) {
      form.startTime = hm(template.startTime);
      form.endTime = hm(template.endTime);
    }
  }

  hasTemplate(templateId: number): boolean {
    return this.templates.some(template => template.templateId === templateId);
  }

  openNew(date: string): void {
    if (!this.canEdit) return;
    this.entryError = '';
    this.entryForm = {
      scheduleId: null, workDate: date, staffId: null, templateId: null, templateName: null,
      startTime: '09:00', endTime: '15:00', note: '', tagIds: []
    };
    void this.loadTemplates();
  }

  openEdit(entry: ScheduleEntry): void {
    if (!this.canEdit) return;
    this.entryError = '';
    this.entryForm = {
      scheduleId: entry.scheduleId, workDate: entry.workDate, staffId: entry.staffId,
      templateId: entry.templateId, templateName: entry.templateName,
      startTime: hm(entry.startTime), endTime: hm(entry.endTime), note: entry.note ?? '', tagIds: [...entry.tagIds]
    };
    void this.loadTemplates();
  }

  /** 表單可選的標籤：啟用中的，加上這段班已經貼著但已停用的。 */
  entryTags(form: EntryForm): ScheduleTag[] {
    return this.tags.filter(t => t.active || form.tagIds.includes(t.tagId));
  }
  toggleTag(form: EntryForm, tagId: number): void {
    form.tagIds = form.tagIds.includes(tagId) ? form.tagIds.filter(id => id !== tagId) : [...form.tagIds, tagId];
  }
  /** 表單下方提示：已選標籤中有說明的，例如「休息：這段班可以中間休息半小時」。 */
  selectedTagHints(form: EntryForm): string[] {
    return this.tags.filter(t => form.tagIds.includes(t.tagId) && t.description).map(t => `${t.name}：${t.description}`);
  }
  /** 班表上標籤的提示文字（滑鼠移上去看說明）。 */
  tagTitle(tagId: number, name: string): string {
    const d = this.tags.find(t => t.tagId === tagId)?.description;
    return d ? `${name}：${d}` : name;
  }

  async saveEntry(): Promise<void> {
    const f = this.entryForm;
    if (!f || this.busy) return;
    if (f.staffId === null) { this.entryError = '請選擇員工'; return; }
    if (!f.startTime || !f.endTime) { this.entryError = '請填寫上班與下班時間'; return; }
    if (f.endTime <= f.startTime) { this.entryError = '下班時間必須晚於上班時間'; return; }
    const body: EntrySave = {
      workDate: f.workDate, staffId: f.staffId,
      ...(f.templateId === null ? {} : { templateId: f.templateId }),
      startTime: f.startTime, endTime: f.endTime, note: f.note.trim() || null, tagIds: f.tagIds
    };
    this.busy = true; this.entryError = '';
    try {
      const result = f.scheduleId === null
        ? await this.api.createEntry(body) : await this.api.updateEntry(f.scheduleId, body);
      const done = f.scheduleId === null ? '已新增排班' : '已更新排班';
      this.flash(result.warnings.length ? `${done}，但時段重疊（修正前不能發布）` : done);
      this.entryForm = null;
      await this.reloadWeek();
    } catch (e) { this.entryError = errorMessage(e); }
    finally { this.busy = false; }
  }

  async deleteEntry(): Promise<void> {
    const f = this.entryForm;
    if (!f || f.scheduleId === null || this.busy) return;
    this.busy = true; this.entryError = '';
    try {
      await this.api.deleteEntry(f.scheduleId);
      this.flash('已刪除排班'); this.entryForm = null;
      await this.reloadWeek();
    } catch (e) { this.entryError = errorMessage(e); }
    finally { this.busy = false; }
  }

  // ---------- 複製上週、發布 ----------

  async copyPrevious(): Promise<void> {
    if (!this.week || this.busy) return;
    this.busy = true; this.error = ''; this.flash('');
    try {
      this.setWeek(await this.api.copyPrevious(this.week.weekStart));
      this.flash('已複製上週排班，確認後請按「發布本週」');
    } catch (e) { this.error = errorMessage(e); }
    finally { this.busy = false; }
  }

  async publish(): Promise<void> {
    if (!this.week || this.busy) return;
    this.busy = true; this.error = '';
    try {
      this.setWeek(await this.api.publish(this.week.weekStart));
      this.confirmPublish = false;
      this.flash('已發布，員工現在看到的是最新班表');
    } catch (e) { this.error = errorMessage(e); this.confirmPublish = false; }
    finally { this.busy = false; }
  }

  // ---------- 匯出 Excel ----------

  exporting = false;

  /** 只有店長、總部可以匯出；尚未發布時匯出的是草稿（檔名會標示草稿）。 */
  async exportExcel(): Promise<void> {
    if (!this.week || !this.canEdit || this.exporting) return;
    this.exporting = true; this.error = '';
    try {
      await downloadScheduleExcel(this.week, this.staff);
      this.flash('已下載 Excel 班表');
    } catch (e) { this.error = '匯出失敗：' + errorMessage(e); }
    finally { this.exporting = false; }
  }

  // ---------- 標籤管理 ----------

  openTags(): void { this.tagsOpen = true; this.tagForm = null; this.tagError = ''; }
  closeTags(): void { if (!this.busy) { this.tagsOpen = false; this.tagForm = null; } }
  newTag(): void {
    this.tagError = '';
    this.tagForm = { tagId: null, name: '', description: '', active: true };
  }
  editTag(t: ScheduleTag): void {
    this.tagError = '';
    this.tagForm = { tagId: t.tagId, name: t.name, description: t.description ?? '', active: t.active };
  }

  async saveTag(): Promise<void> {
    const f = this.tagForm;
    if (!f || this.busy) return;
    if (!f.name.trim()) { this.tagError = '請填寫標籤名稱'; return; }
    this.busy = true; this.tagError = '';
    // 後端不接受多餘欄位：新增只送 name／description，修改才多送 active。
    const body = { name: f.name.trim(), description: f.description.trim() || null };
    try {
      if (f.tagId === null) await this.api.createTag(body);
      else await this.api.updateTag(f.tagId, { ...body, active: f.active });
      this.tags = await this.api.tags(true);
      this.tagForm = null;
      await this.reloadWeek();   // 改名後班表上的標籤名稱跟著更新
    } catch (e) { this.tagError = errorMessage(e); }
    finally { this.busy = false; }
  }

  // ---------- 顯示 ----------

  hm(time: string): string { return hm(time); }
  staffName(id: number | null): string { return this.staff.find(s => s.staffId === id)?.name ?? ''; }
  rangeLabel(): string {
    if (!this.week) return '';
    const s = parseDate(this.week.weekStart), e = parseDate(this.week.weekEnd);
    return `${s.getFullYear()}/${s.getMonth() + 1}/${s.getDate()} – ${e.getMonth() + 1}/${e.getDate()}`;
  }
  dayTitle(date: string): string {
    const d = parseDate(date);
    return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
  }
}

// ---------- 日期工具（一律用本地時間，避免 toISOString 的時區偏移） ----------

function pad(n: number): string { return String(n).padStart(2, '0'); }
function format(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseDate(s: string): Date { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function today(): string { return format(new Date()); }
function addDays(s: string, days: number): string { const d = parseDate(s); d.setDate(d.getDate() + days); return format(d); }
function minutes(time: string): number { const [h, m] = time.split(':').map(Number); return h * 60 + m; }
/** 後端時間 09:30:00 → 09:30（input type=time 用） */
function hm(time: string): string { return time.slice(0, 5); }
