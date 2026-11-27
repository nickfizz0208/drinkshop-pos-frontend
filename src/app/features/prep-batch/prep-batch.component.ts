import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NumpadButtonComponent } from '../../shared/numpad-button.component';
import { UiStateService } from '../../shared/ui-state.service';
import { PosApiService, errorMessage } from '../../services/pos-api.service';
import { PrepBatchApiService } from '../../services/prep-batch-api.service';
import { PrepBatchRow, PrepLogLine, PrepOption, PrepSummary, PrepWasteRow } from '../../models/prep-batch';
import { StaffOption } from '../../models/schedule';
import { taipeiDate } from '../../models/pos';

/**
 * 備料（後端 050、051）：登記誰做了什麼半成品、幾份，以及剩下的半成品倒掉幾份；看每天做了、用了、倒掉幾份。
 * 門市 POS 機登記時要選是誰；店員、店長用自己的帳號登記時記成自己。
 * 只做紀錄：沒有半成品庫存、不扣原料。做半成品用掉的原料由物料消耗報表照材料用量計算。
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
  wastes: PrepWasteRow[] = [];
  summary: PrepSummary[] = [];
  date = taipeiDate();
  loading = false;
  error = '';

  /** 表單要登記的是做了（made）還是倒掉（waste）。 */
  mode: 'made' | 'waste' = 'made';
  prepId: number | null = null;
  qty: number | null = null;
  who: number | null = null;
  note = '';

  /** POS 共用帳號登記要選人；個人帳號記成自己。 */
  get isPos(): boolean { return this.pos.staff()?.level === 'POS'; }
  get me(): string { return this.pos.staff()?.name ?? ''; }
  get today(): string { return taipeiDate(); }
  /** 只能登記今天的；看別天時表單鎖住。 */
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
  /** 備料、報廢合成一張紀錄表，新的在前。 */
  get log(): PrepLogLine[] {
    const lines: PrepLogLine[] = [
      ...this.rows.map(r => ({ key: 'b' + r.batchId, kind: 'made' as const, at: r.madeAt, prepName: r.prepName, qty: r.qty,
        who: r.madeByName, recordedBy: r.recordedBy !== r.madeBy ? r.recordedByName : null, note: r.note })),
      ...this.wastes.map(w => ({ key: 'w' + w.wasteId, kind: 'waste' as const, at: w.wastedAt, prepName: w.prepName, qty: w.qty,
        who: w.wastedByName, recordedBy: w.recordedBy !== w.wastedBy ? w.recordedByName : null, note: w.note }))
    ];
    return lines.sort((a, b) => b.at.localeCompare(a.at));
  }

  /** 有半成品剩下是負數（可能有做了沒登記）。 */
  get hasShort(): boolean { return this.summary.some(s => s.remaining < 0); }

  ngOnInit(): void { if (!this.ui.preview) void this.load(true); }

  setMode(mode: 'made' | 'waste'): void { if (!this.ui.busy) { this.mode = mode; this.error = ''; } }

  async load(withOptions = false): Promise<void> {
    if (!this.date) this.date = this.today;
    this.loading = true; this.error = '';
    try {
      if (withOptions) {
        const [preps, staff] = await Promise.all([this.api.preps(), this.isPos ? this.pos.staffOptions() : Promise.resolve([])]);
        this.preps = preps; this.staff = staff;
      }
      const day = await this.api.day(this.date);
      this.rows = day.rows; this.wastes = day.wastes ?? []; this.summary = day.summary ?? [];
    } catch (error) { this.error = errorMessage(error); }
    finally { this.loading = false; }
  }

  async submit(): Promise<void> {
    if (this.ui.busy || !this.canCreate) return;
    if (this.prepId === null) { this.error = '請選擇半成品。'; return; }
    if (this.qty === null || this.qty <= 0 || this.qty > 99999999.99 || Number(this.qty.toFixed(2)) !== this.qty) {
      this.error = '份數須介於 0.01 到 99999999.99 之間，最多兩位小數。';
      return;
    }
    if (this.isPos && this.who === null) { this.error = this.mode === 'made' ? '請選擇是誰做的。' : '請選擇是誰處理的。'; return; }
    const note = this.note.trim();
    if (this.mode === 'waste' && !note) { this.error = '請填寫報廢原因。'; return; }
    this.ui.busy = true; this.error = '';
    try {
      if (this.mode === 'made') {
        const row = await this.api.create({ prepId: this.prepId, qty: this.qty, ...(this.isPos ? { madeBy: this.who! } : {}), ...(note ? { note } : {}) });
        this.ui.notice = `已登記：${row.madeByName} 做了 ${row.prepName} ${row.qty} 份。`;
      } else {
        const row = await this.api.createWaste({ prepId: this.prepId, qty: this.qty, ...(this.isPos ? { wastedBy: this.who! } : {}), note });
        this.ui.notice = `已登記報廢：${row.prepName} ${row.qty} 份（${row.note}）。`;
      }
      this.qty = null; this.note = '';
      await this.load();
    } catch (error) { this.error = errorMessage(error); }
    finally { this.ui.busy = false; }
  }

  /** 「11:20」 */
  time(at: string): string { return at.slice(11, 16); }
  /** 份數顯示：最多兩位小數，去掉多餘的 0。 */
  num(value: number): string { return String(Math.round(value * 100) / 100); }
}
