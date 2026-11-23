import { Component, Input, OnChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PosApiService, errorMessage } from '../../../services/pos-api.service';
import { HqCount, HqDetailTrendPoint, HqDetails, HqProductStat, SUGAR_GROUPS, TEMP_GROUPS } from '../../../models/hq-detail';
import { SIZE_LABELS, SOURCE_LABELS, SUGAR_LABELS, Size, Source, Sugar, TEMP_ICE_LABELS, TempIce, money } from '../../../models/pos';

/** 一段堆疊長條：哪一組、幾杯、占這一格的百分比。 */
interface Segment { key: string; label: string; cups: number; pct: number; }

/**
 * 總部報表的細項分頁（後端 /api/hq-reports/details）：
 * view = products：飲品杯數、營收、和上一期比較，點一杯看它的杯型、冷熱、甜度分布。
 * view = tempSugar：冷熱、甜度的分布、冷熱 × 甜度交叉、每小時或每天的趨勢。
 * view = toppings：加料份數、實收、加料率、最常搭配的飲品、首份免費（046）。
 * view = options：客製選項（例如換茶底）的杯數、比上一期、是哪些飲品用的、趨勢。
 * 期間（from、to）由總部報表上方的日／月決定；分類、來源、杯型在這裡篩選。
 */
@Component({
  selector: 'app-hq-detail',
  imports: [FormsModule],
  templateUrl: './hq-detail.component.html',
  styleUrl: './hq-detail.component.scss'
})
export class HqDetailComponent implements OnChanges {
  private readonly api = inject(PosApiService);
  readonly money = money;
  readonly tempLabels = TEMP_ICE_LABELS;
  readonly sugarLabels = SUGAR_LABELS;
  readonly sizeLabels = SIZE_LABELS;
  readonly sources = Object.entries(SOURCE_LABELS) as [Source, string][];
  readonly sizes = Object.entries(SIZE_LABELS) as [Size, string][];
  readonly tempGroups = TEMP_GROUPS;
  readonly sugarGroups = SUGAR_GROUPS;
  readonly tempKeys = Object.keys(TEMP_ICE_LABELS) as TempIce[];
  readonly sugarKeys = Object.keys(SUGAR_LABELS) as Sugar[];

  @Input({ required: true }) view!: 'products' | 'tempSugar' | 'toppings' | 'options';
  @Input({ required: true }) from!: string;
  @Input({ required: true }) to!: string;

  category = '';
  source = '';
  size = '';
  data: HqDetails | null = null;
  loading = false;
  error = '';
  /** 飲品分頁：展開看分布的那一杯。 */
  expanded: number | null = null;
  /** 冷熱甜度分頁：趨勢圖看冷熱還是甜度。 */
  trendOf: 'temp' | 'sugar' = 'temp';
  /** 趨勢圖滑過的那一格。 */
  hovered: HqDetailTrendPoint | null = null;
  private version = 0;

  ngOnChanges(): void { void this.load(); }

  async load(): Promise<void> {
    const version = ++this.version;
    this.loading = true; this.error = '';
    try {
      const data = await this.api.hqDetails({ from: this.from, to: this.to, category: this.category, source: this.source, size: this.size });
      if (version === this.version) { this.data = data; this.expanded = null; this.expandedOption = null; this.hovered = null; }
    } catch (err) { if (version === this.version) this.error = errorMessage(err); }
    finally { if (version === this.version) this.loading = false; }
  }

  toggle(productId: number): void { this.expanded = this.expanded === productId ? null : productId; }
  /** 客製分頁：展開看是哪些飲品用的那個選項。 */
  expandedOption: number | null = null;
  toggleOption(optionId: number): void { this.expandedOption = this.expandedOption === optionId ? null : optionId; }
  get maxOptionCups(): number { return Math.max(1, ...(this.data?.options?.items ?? []).map(o => o.cups)); }
  /** 選項趨勢的小長條：每格占最多那格的高度百分比。 */
  sparkMax(trend: { cups: number }[]): number { return Math.max(1, ...trend.map(t => t.cups)); }

  // ---- 數字 ----
  pct(part: number, whole: number): number { return whole > 0 ? Math.round(part / whole * 1000) / 10 : 0; }
  /** 和上一期比：「＋25%」「−10%」「新」；上一期和這一期都沒有就空字串。 */
  change(now: number, prev: number): string {
    if (prev === 0) return now > 0 ? '新' : '';
    const diff = Math.round((now - prev) / prev * 100);
    return diff === 0 ? '持平' : (diff > 0 ? '＋' : '−') + Math.abs(diff) + '%';
  }
  changeClass(now: number, prev: number): string {
    if (prev === 0) return now > 0 ? 'new' : '';
    const diff = Math.round((now - prev) / prev * 100);
    return diff > 0 ? 'up' : diff < 0 ? 'down' : '';
  }
  get maxToppingPortions(): number { return Math.max(1, ...(this.data?.toppings?.items ?? []).map(t => t.portions)); }
  get maxProductCups(): number { return Math.max(1, ...(this.data?.products ?? []).map(p => p.cups)); }

  /** 一組分布合成冷熱四組或甜度四組。 */
  groupTemp(counts: HqCount<TempIce>[]): Segment[] { return this.group(counts, TEMP_GROUPS); }
  groupSugar(counts: HqCount<Sugar>[]): Segment[] { return this.group(counts, SUGAR_GROUPS); }
  private group<K extends string>(counts: HqCount<K>[], groups: { key: string; label: string; members: string[] }[]): Segment[] {
    const total = counts.reduce((s, c) => s + c.cups, 0);
    return groups.map(g => {
      const cups = counts.filter(c => g.members.includes(c.key)).reduce((s, c) => s + c.cups, 0);
      return { key: g.key, label: g.label, cups, pct: this.pct(cups, total) };
    });
  }
  /** 分布裡杯數最多的選項；沒有資料就是 null。 */
  top<K extends string>(counts: HqCount<K>[]): HqCount<K> | null {
    const best = [...counts].sort((a, b) => b.cups - a.cups)[0];
    return best && best.cups > 0 ? best : null;
  }
  max(counts: HqCount[]): number { return Math.max(1, ...counts.map(c => c.cups)); }
  sizeOf(p: HqProductStat): HqCount<Size>[] { return p.sizes.filter(s => s.cups > 0); }

  // ---- 冷熱 × 甜度交叉 ----
  get crossMax(): number { return Math.max(1, ...(this.data?.cross ?? []).map(c => c.cups)); }
  crossCups(t: TempIce, s: Sugar): number { return this.data?.cross.find(c => c.tempIce === t && c.sugar === s)?.cups ?? 0; }
  /** 有賣過的冷熱、甜度才列進交叉表，表才不會太大。 */
  get crossTemps(): TempIce[] { return this.tempKeys.filter(t => (this.data?.tempIce.find(c => c.key === t)?.cups ?? 0) > 0); }
  get crossSugars(): Sugar[] { return this.sugarKeys.filter(s => (this.data?.sugar.find(c => c.key === s)?.cups ?? 0) > 0); }
  /** 格子深淺：0 杯透明，最多的最深。 */
  heat(cups: number): number { return cups === 0 ? 0 : 0.12 + 0.88 * cups / this.crossMax; }
  get topCombo(): { tempIce: TempIce; sugar: Sugar; cups: number } | null {
    return [...(this.data?.cross ?? [])].sort((a, b) => b.cups - a.cups)[0] ?? null;
  }

  // ---- 趨勢 ----
  get trendMax(): number { return Math.max(1, ...(this.data?.trend ?? []).map(p => p.cups)); }
  segments(point: HqDetailTrendPoint): Segment[] { return this.trendOf === 'temp' ? this.groupTemp(point.tempIce) : this.groupSugar(point.sugar); }
  trendLabel(label: string): string { return this.data?.trendBy === 'date' ? label.slice(5).replace('-', '/') : label; }
  get legend(): { key: string; label: string }[] { return this.trendOf === 'temp' ? TEMP_GROUPS : SUGAR_GROUPS; }
}
