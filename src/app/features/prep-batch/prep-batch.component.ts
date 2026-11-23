import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NumpadButtonComponent } from '../../shared/numpad-button.component';
import { UiStateService } from '../../shared/ui-state.service';
import { PosApiService, errorMessage } from '../../services/pos-api.service';
import { PrepBatchApiService } from '../../services/prep-batch-api.service';
import { PrepBatchRow, PrepOption } from '../../models/prep-batch';
import { StaffOption } from '../../models/schedule';
import { taipeiDate } from '../../models/pos';

/**
 * 備料：登記誰煮了什麼半成品、幾份（後端 050）。
 * 門市 POS 機登記時要選是誰煮的；店員、店長用自己的帳號登記時記成自己。只做紀錄，不扣原料、不改半成品數量。
 */
@Component({
  selector: 'app-prep-batch',
  imports: [FormsModule, NumpadButtonComponent],
  templateUrl: './prep-batch.component.html',
  styleUrl: './prep-batch.component.scss'
})
export class PrepBatchComponent implements OnInit {
  readonly ui = inject(UiStateService);
  private readonly api = inject(PrepBatchApiService);
  private readonly pos = inject(PosApiService);

  preps: PrepOption[] = [];
  staff: StaffOption[] = [];
  rows: PrepBatchRow[] = [];
  date = taipeiDate();
  loading = false;
  error = '';

  prepId: number | null = null;
  qty: number | null = null;
  madeBy: number | null = null;
  note = '';

  /** POS 共用帳號登記要選煮的人；個人帳號記成自己。 */
  get isPos(): boolean { return this.pos.staff()?.level === 'POS'; }
  get me(): string { return this.pos.staff()?.name ?? ''; }
  get today(): string { return taipeiDate(); }
  /** 只能登記今天的備料；看別天時表單鎖住。 */
  get canCreate(): boolean { return this.date === this.today; }
  /** 半成品依分類排成下拉選單的群組。 */
  get prepGroups(): { category: string; preps: PrepOption[] }[] {
    const groups: { category: string; preps: PrepOption[] }[] = [];
    for (const p of this.preps) {
      const category = p.category ?? '未分類';
      const group = groups.find(g => g.category === category);
      if (group) group.preps.push(p); else groups.push({ category, preps: [p] });
    }
    return groups;
  }
  /** 這一天每種半成品共煮了幾份（照第一次出現的順序）。 */
  get totals(): { name: string; qty: number }[] {
    const totals: { name: string; qty: number }[] = [];
    for (const r of [...this.rows].reverse()) {
      const t = totals.find(x => x.name === r.prepName);
      if (t) t.qty = Math.round((t.qty + r.qty) * 100) / 100; else totals.push({ name: r.prepName, qty: r.qty });
    }
    return totals;
  }

  ngOnInit(): void { if (!this.ui.preview) void this.load(true); }

  async load(withOptions = false): Promise<void> {
    if (!this.date) this.date = this.today;
    this.loading = true; this.error = '';
    try {
      if (withOptions) {
        const [preps, staff] = await Promise.all([this.api.preps(), this.isPos ? this.pos.staffOptions() : Promise.resolve([])]);
        this.preps = preps; this.staff = staff;
      }
      this.rows = (await this.api.day(this.date)).rows;
    } catch (error) { this.error = errorMessage(error); }
    finally { this.loading = false; }
  }

  async submit(): Promise<void> {
    if (this.ui.busy || !this.canCreate) return;
    if (this.prepId === null) { this.error = '請選擇半成品。'; return; }
    if (this.qty === null || !(this.qty > 0) || Math.round(this.qty * 100) !== this.qty * 100) { this.error = '份數要大於 0，最多兩位小數。'; return; }
    if (this.isPos && this.madeBy === null) { this.error = '請選擇是誰煮的。'; return; }
    this.ui.busy = true; this.error = '';
    try {
      const row = await this.api.create({ prepId: this.prepId, qty: this.qty, ...(this.isPos ? { madeBy: this.madeBy! } : {}),
        ...(this.note.trim() ? { note: this.note.trim() } : {}) });
      this.rows = [row, ...this.rows];
      this.ui.notice = `已登記：${row.madeByName} 煮了 ${row.prepName} ${row.qty} 份。`;
      this.qty = null; this.note = '';
    } catch (error) { this.error = errorMessage(error); }
    finally { this.ui.busy = false; }
  }

  /** 「11:20」 */
  time(row: PrepBatchRow): string { return row.madeAt.slice(11, 16); }
}
