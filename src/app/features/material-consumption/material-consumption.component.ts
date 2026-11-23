import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConsumptionRecord, MaterialItem, WastageDetail } from '../../models/consumption';
import { ConsumptionApiService } from '../../services/consumption-api.service';
import { PosApiService, errorMessage } from '../../services/pos-api.service';
import { IconComponent } from '../../shared/icon.component';
import { UiStateService } from '../../shared/ui-state.service';

export interface MaterialSeries {
  inventoryId: number;
  name: string;
  unit: string;
  color: string;
  total: number;
  points: { day: number; dateStr: string; value: number; x: number; y: number }[];
  pathD: string;
}

const PALETTE = [
  '#2e7d32', '#1976d2', '#d84315', '#8e24aa', '#00838f',
  '#c2185b', '#f57f17', '#4e342e', '#00695c', '#3949ab'
];

@Component({
  selector: 'app-material-consumption',
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './material-consumption.component.html',
  styleUrl: './material-consumption.component.scss'
})
export class MaterialConsumptionComponent implements OnInit {
  private readonly api = inject(ConsumptionApiService);
  private readonly posApi = inject(PosApiService);
  readonly ui = inject(UiStateService);

  // 預設今年、當月（或有資料的 2026 年 11 月）
  currentYear = 2026;
  currentMonth = 11;
  years: number[] = [2026, 2025, 2024];
  months: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  loading = false;
  records: ConsumptionRecord[] = [];
  materials: MaterialItem[] = [];

  // 分開保存「訂單物料消耗」與「原料報廢損耗」資料
  orderRecords: ConsumptionRecord[] = [];
  orderMaterials: MaterialItem[] = [];
  wastageRecords: ConsumptionRecord[] = [];
  wastageMaterials: MaterialItem[] = [];
  wastageDetails: WastageDetail[] = [];

  // 目前檢視模式：'order'（訂單物料消耗） | 'wastage'（報廢料損耗）
  consumptionMode: 'order' | 'wastage' = 'order';

  // 品項選擇勾選狀態
  selectedIds = new Set<number>();

  // 分類篩選與使用分類整理查看模式
  selectedCategory = 'ALL';
  isCategoryGrouped = false; // 是否使用分類整理查看

  // 是否展開顯示「月物料消耗統計」區塊（點擊按鈕切換）
  showMonthlySummary = false;
  // 是否展開顯示「報廢紀錄明細」區塊
  showWastageDetailsTable = true;

  // 店長扣庫確認彈窗狀態

  // 圖表設定
  readonly svgWidth = 920;
  readonly svgHeight = 360;
  readonly padding = { top: 35, right: 35, bottom: 45, left: 60 };

  seriesList: MaterialSeries[] = [];
  yTicks: { value: number; y: number }[] = [];
  xTicks: { day: number; label: string; x: number }[] = [];
  daysInMonth = 30;

  // 懸浮 Tooltip
  hoverPoint: {
    name: string;
    date: string;
    value: number;
    unit: string;
    x: number;
    y: number;
    color: string;
  } | null = null;

  get isManager(): boolean {
    const level = this.posApi.staff()?.level;
    return level === 'MANAGER' || level === 'HQ';
  }

  ngOnInit(): void {
    void this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading = true;
    this.hoverPoint = null;
    try {
      const res = await this.api.getMonthlyConsumption(this.currentYear, this.currentMonth);
      this.orderRecords = res.records || [];
      this.orderMaterials = res.materials || [];
      this.wastageRecords = res.wastage_records || [];
      this.wastageMaterials = res.wastage_materials || [];
      this.wastageDetails = res.wastage_details || [];

      this.applyActiveModeData(false);
    } finally {
      this.loading = false;
    }
  }

  switchConsumptionMode(mode: 'order' | 'wastage'): void {
    if (this.consumptionMode === mode) return;
    this.consumptionMode = mode;
    this.hoverPoint = null;
    this.applyActiveModeData(true);
  }

  private applyActiveModeData(resetSelection: boolean): void {
    this.records = this.consumptionMode === 'wastage' ? this.wastageRecords : this.orderRecords;
    this.materials = this.consumptionMode === 'wastage' ? this.wastageMaterials : this.orderMaterials;

    if (resetSelection) {
      this.selectedIds.clear();
    }

    // 找出這個月實際有消耗／報廢的品項 ID
    const consumedIds = new Set(this.records.filter(r => r.total_consumed > 0).map(r => r.inventory_id));

    // 若尚未選擇任何品項，預設選取本月有消耗的品項（最多預設前 6 個，避免過多線太雜）
    if (this.selectedIds.size === 0) {
      let count = 0;
      for (const id of consumedIds) {
        this.selectedIds.add(id);
        count++;
        if (count >= 6) break;
      }
      // 若完全沒資料，預設選前 3 個材料
      if (this.selectedIds.size === 0) {
        this.materials.slice(0, 3).forEach(m => this.selectedIds.add(m.inventory_id));
      }
    }

    this.computeChart();
  }

  onYearChange(): void {
    void this.loadData();
  }

  selectMonth(month: number): void {
    if (this.currentMonth === month) return;
    this.currentMonth = month;
    void this.loadData();
  }

  toggleMaterial(id: number): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.computeChart();
  }

  selectAll(): void {
    this.materials.forEach(m => this.selectedIds.add(m.inventory_id));
    this.computeChart();
  }

  clearAll(): void {
    this.selectedIds.clear();
    this.computeChart();
  }

  get categories(): string[] {
    const set = new Set<string>();
    for (const mat of this.materials) {
      if (mat.category) set.add(mat.category);
      else set.add('未分類');
    }
    return Array.from(set);
  }

  get filteredMaterials(): MaterialItem[] {
    if (this.selectedCategory === 'ALL') {
      return this.materials;
    }
    return this.materials.filter(m => (m.category || '未分類') === this.selectedCategory);
  }

  get categoryGroups(): { category: string; materials: MaterialItem[]; selectedCount: number }[] {
    const map = new Map<string, MaterialItem[]>();
    for (const mat of this.materials) {
      const cat = mat.category || '未分類';
      if (!map.has(cat)) {
        map.set(cat, []);
      }
      map.get(cat)!.push(mat);
    }
    return Array.from(map.entries()).map(([category, items]) => {
      const selectedCount = items.filter(m => this.selectedIds.has(m.inventory_id)).length;
      return { category, materials: items, selectedCount };
    });
  }

  toggleCategoryView(): void {
    this.isCategoryGrouped = !this.isCategoryGrouped;
  }

  selectCategory(cat: string): void {
    this.selectedCategory = cat;
  }

  selectCategoryItems(cat: string): void {
    const items = this.materials.filter(m => (m.category || '未分類') === cat);
    items.forEach(m => this.selectedIds.add(m.inventory_id));
    this.computeChart();
  }

  clearCategoryItems(cat: string): void {
    const items = this.materials.filter(m => (m.category || '未分類') === cat);
    items.forEach(m => this.selectedIds.delete(m.inventory_id));
    this.computeChart();
  }

  isConsumed(id: number): boolean {
    return this.records.some(r => r.inventory_id === id && r.total_consumed > 0);
  }

  colorOf(id: number): string {
    const idx = this.materials.findIndex(m => m.inventory_id === id);
    return PALETTE[(idx >= 0 ? idx : id) % PALETTE.length];
  }

  computeChart(): void {
    this.daysInMonth = new Date(this.currentYear, this.currentMonth, 0).getDate();
    const plotWidth = this.svgWidth - this.padding.left - this.padding.right;
    const plotHeight = this.svgHeight - this.padding.top - this.padding.bottom;

    // 計算 X 軸刻度（每隔 5 天放一個標記，最後一天也標）
    this.xTicks = [];
    for (let day = 1; day <= this.daysInMonth; day++) {
      if (day === 1 || day % 5 === 0 || day === this.daysInMonth) {
        const x = this.padding.left + ((day - 1) / (this.daysInMonth - 1)) * plotWidth;
        this.xTicks.push({ day, label: `${this.currentMonth}/${day}`, x });
      }
    }

    // 建立選中品項的折線資料
    const selectedList = this.materials.filter(m => this.selectedIds.has(m.inventory_id));

    // 計算 Y 軸最大值
    let maxVal = 0;
    for (const r of this.records) {
      if (this.selectedIds.has(r.inventory_id)) {
        if (r.total_consumed > maxVal) maxVal = r.total_consumed;
      }
    }
    // 讓圖表上方有 15% 留白，且刻度美化
    const maxY = maxVal > 0 ? Math.ceil(maxVal * 1.15) : 10;

    // 計算 Y 軸刻度（4 個區間，5 個刻度線）
    this.yTicks = [];
    const step = maxY / 4;
    for (let i = 0; i <= 4; i++) {
      const val = Math.round(step * i * 10) / 10;
      const y = this.padding.top + plotHeight - (val / maxY) * plotHeight;
      this.yTicks.push({ value: val, y });
    }

    // 構建每條折線的坐標點
    this.seriesList = selectedList.map(mat => {
      const color = this.colorOf(mat.inventory_id);
      let total = 0;
      const points: { day: number; dateStr: string; value: number; x: number; y: number }[] = [];

      for (let day = 1; day <= this.daysInMonth; day++) {
        const record = this.records.find(r => r.inventory_id === mat.inventory_id && r.day_of_month === day);
        const val = record ? record.total_consumed : 0;
        total += val;

        const x = this.padding.left + ((day - 1) / (this.daysInMonth - 1)) * plotWidth;
        const y = this.padding.top + plotHeight - (val / maxY) * plotHeight;
        const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        points.push({ day, dateStr, value: val, x, y });
      }

      // 生成 SVG path d 字串
      const pathD = points.map((p, idx) => (idx === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');

      return {
        inventoryId: mat.inventory_id,
        name: mat.name,
        unit: mat.base_unit || '單位',
        color,
        total: Math.round(total * 100) / 100,
        points,
        pathD
      };
    });
  }

  showTooltip(series: MaterialSeries, pt: { day: number; dateStr: string; value: number; x: number; y: number }): void {
    this.hoverPoint = {
      name: series.name,
      date: pt.dateStr,
      value: pt.value,
      unit: series.unit,
      x: pt.x,
      y: pt.y,
      color: series.color
    };
  }

  hideTooltip(): void {
    this.hoverPoint = null;
  }

  toggleMonthlySummary(): void {
    this.showMonthlySummary = !this.showMonthlySummary;
  }

  /** 本月所有品項（包含未勾選折線的品項）的月累計消耗統計，依消耗量由高至低排序。 */
  get monthlyMaterialRows(): { inventoryId: number; name: string; unit: string; color: string; total: number; activeDays: number; bookQty: number; category: string }[] {
    return this.materials.map(mat => {
      const matRecords = this.records.filter(r => r.inventory_id === mat.inventory_id && r.total_consumed > 0);
      const total = Math.round(matRecords.reduce((sum, r) => sum + r.total_consumed, 0) * 100) / 100;
      return {
        inventoryId: mat.inventory_id,
        name: mat.name,
        unit: mat.base_unit || '份',
        color: this.colorOf(mat.inventory_id),
        total,
        activeDays: matRecords.length,
        bookQty: mat.book_qty ?? 0,
        category: mat.category || '未分類'
      };
    }).sort((a, b) => b.total - a.total || a.inventoryId - b.inventoryId);
  }

  get totalMonthlyConsumptionCount(): number {
    return Math.round(this.seriesList.reduce((sum, s) => sum + s.total, 0) * 100) / 100;
  }

  get topMaterial(): MaterialSeries | null {
    if (this.seriesList.length === 0) return null;
    return [...this.seriesList].sort((a, b) => b.total - a.total)[0] || null;
  }
}
