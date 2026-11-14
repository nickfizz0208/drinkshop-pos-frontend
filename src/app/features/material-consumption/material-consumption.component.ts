import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConsumptionRecord, MaterialItem } from '../../models/consumption';
import { ConsumptionApiService } from '../../services/consumption-api.service';
import { IconComponent } from '../../shared/icon.component';
import { UiStateService } from '../../shared/ui-state.service';

interface MaterialSeries {
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
  readonly ui = inject(UiStateService);

  // 預設今年、當月（或有資料的 2026 年 11 月）
  currentYear = 2026;
  currentMonth = 11;
  years: number[] = [2026, 2025, 2024];
  months: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  loading = false;
  records: ConsumptionRecord[] = [];
  materials: MaterialItem[] = [];

  // 品項選擇勾選狀態
  selectedIds = new Set<number>();

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

  ngOnInit(): void {
    void this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading = true;
    this.hoverPoint = null;
    try {
      const res = await this.api.getMonthlyConsumption(this.currentYear, this.currentMonth);
      this.records = res.records;
      this.materials = res.materials;

      // 找出這個月實際有消耗的品項 ID
      const consumedIds = new Set(this.records.map(r => r.inventory_id));

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
    } finally {
      this.loading = false;
    }
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

  get totalMonthlyConsumptionCount(): number {
    return this.seriesList.reduce((sum, s) => sum + s.total, 0);
  }

  get topMaterial(): MaterialSeries | null {
    if (this.seriesList.length === 0) return null;
    return [...this.seriesList].sort((a, b) => b.total - a.total)[0] || null;
  }
}
