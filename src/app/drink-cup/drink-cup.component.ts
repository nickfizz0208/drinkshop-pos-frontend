import { Component, Input } from '@angular/core';
import { ColorTone, Product } from '../models/pos';

/**
 * 飲品的配色：red 紅、orange 橙、yellow 黃、green 綠、purple 紫、white 白、cream 奶、brown 咖。
 * 就是資料庫色系（ColorTone）的小寫，同時也是 scss 的 class 名稱。
 * 杯子的顏色在 drink-cup.component.scss；飲品卡背景的顏色在 drink-card.component.scss（兩邊都用這個判斷）。
 */
export type DrinkTone = Lowercase<ColorTone>;
/** 色系的排列順序：黃 → 綠 → 紅 → 橙 → 奶 → 咖 → 紫 → 白。點餐頁的飲品照這個順序排。 */
export const TONE_ORDER: readonly DrinkTone[] = ['yellow', 'green', 'red', 'orange', 'cream', 'brown', 'purple', 'white'];

/**
 * 依飲品決定配色（杯子、飲品卡背景都用）。
 * 資料庫有設定色系（product.color_tone，032）就用設定的；沒設定才自動判斷：
 * 冰沙 → 黃、奶茶 → 奶、名稱有「綠茶」→ 綠、其他 → 紅（紅茶色）。
 */
export function drinkTone(drink: Pick<Product, 'name' | 'category' | 'color_tone'>): DrinkTone {
  // 不認得的值（例如資料庫先加了新色系、前端還沒加顏色）當作沒設定
  const saved = drink.color_tone?.toLowerCase() as DrinkTone | undefined;
  if (saved && TONE_ORDER.includes(saved)) return saved;
  if (drink.category === '冰沙') return 'yellow';
  if (drink.category === '奶茶') return 'cream';
  if (drink.name.includes('綠茶')) return 'green';
  return 'red';
}

/**
 * 飲品依色系排序（TONE_ORDER）；同一個色系維持原本的順序（後端給的建檔順序）。
 * 沒設定色系的飲品，用自動判斷出來的色系排。回傳新的陣列，不改原本的。
 */
export function sortByTone<T extends Pick<Product, 'name' | 'category' | 'color_tone'>>(drinks: readonly T[]): T[] {
  return drinks
    .map((drink, index) => ({ drink, index, rank: TONE_ORDER.indexOf(drinkTone(drink)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(item => item.drink);
}

/** 名稱有「珍珠」的飲品，杯底畫珍珠。 */
export function hasPearls(drink: Pick<Product, 'name'>): boolean {
  return drink.name.includes('珍珠');
}

/**
 * 飲料杯插圖（64×72px，不含背景），杯子顏色依飲品自動決定。
 *
 * 用法：<app-drink-cup [drink]="drink" />
 * 想讓杯子動：在外層設定 CSS 變數 --cup-tilt（例如 6deg）、--cup-lift（例如 0 -4px）。
 */
@Component({
  selector: 'app-drink-cup',
  imports: [],
  templateUrl: './drink-cup.component.html',
  styleUrl: './drink-cup.component.scss'
})
export class DrinkCupComponent {
  /** 要畫的飲品（只用到名稱、分類、色系）。 */
  @Input({ required: true }) drink!: Pick<Product, 'name' | 'category' | 'color_tone'>;

  get tone(): DrinkTone { return drinkTone(this.drink); }
  get pearls(): boolean { return hasPearls(this.drink); }
}
