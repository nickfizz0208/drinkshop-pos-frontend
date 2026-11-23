import { Size, Sugar, TempIce } from './pos';

/** 總部報表細項（後端 GET /api/hq-reports/details）。只算有效的杯：訂單沒取消、品項不是取消或報廢。 */
export interface HqCount<K extends string = string> { key: K; cups: number; }
export interface HqProductStat {
  productId: number; productName: string; category: string | null; cups: number; revenue: number; prevCups: number;
  sizes: HqCount<Size>[]; tempIce: HqCount<TempIce>[]; sugar: HqCount<Sugar>[];
  /** 這杯用了哪些客製選項、各幾杯（key 是選項名稱）。 */
  options?: HqCount[];
}
/** 一個客製選項是哪杯飲品用的：cups 用了幾杯、productCups 這杯飲品總共幾杯。 */
export interface HqOptionProduct { productId: number; productName: string; cups: number; productCups: number; }
/** 一個客製選項（例如換綠茶）：杯數、上一期、哪些飲品用的、趨勢（key 對應 HqDetails.trend 的 label）。 */
export interface HqOptionStat { optionId: number; name: string; cups: number; prevCups: number; products: HqOptionProduct[]; trend: HqCount[]; }
export interface HqOptions { optionCups: number; items: HqOptionStat[]; }
export interface HqCross { tempIce: TempIce; sugar: Sugar; cups: number; }
export interface HqDetailTrendPoint { label: string; cups: number; tempIce: HqCount<TempIce>[]; sugar: HqCount<Sugar>[]; }
/** 一種加料：份數、有加它的杯數、實收（不含首份免費）、首份免費份數與少收金額、上一期份數、最常加在哪幾杯。 */
export interface HqToppingStat {
  toppingId: number; name: string; portions: number; cups: number; revenue: number; freePortions: number; freeValue: number;
  prevPortions: number; topProducts: { productName: string; portions: number }[];
}
/** 加料統計：有加料的杯數（加料率＝toppedCups ÷ totalCups）、全部份數、實收、首份免費合計、上一期份數。 */
export interface HqToppings {
  toppedCups: number; totalPortions: number; revenue: number; freePortions: number; freeValue: number; prevPortions: number;
  items: HqToppingStat[];
}
export interface HqDetails {
  from: string; to: string; prevFrom: string; prevTo: string;
  totalCups: number; totalRevenue: number; prevTotalCups: number;
  products: HqProductStat[]; sizes: HqCount<Size>[]; tempIce: HqCount<TempIce>[]; sugar: HqCount<Sugar>[];
  cross: HqCross[]; trendBy: 'hour' | 'date'; trend: HqDetailTrendPoint[]; categories: string[];
  toppings?: HqToppings;
  options?: HqOptions;
}
export interface HqDetailQuery { from: string; to: string; category?: string; source?: string; size?: string; }

/** 冷熱分成四組（趨勢圖、重點數字用）：熱飲、常溫、去冰、有冰。 */
export const TEMP_GROUPS: { key: string; label: string; members: TempIce[] }[] = [
  { key: 'hot', label: '熱飲（熱、溫）', members: ['HOT', 'WARM'] },
  { key: 'room', label: '常溫', members: ['ROOM'] },
  { key: 'iceFree', label: '去冰（完全去冰、去冰）', members: ['ICE_FREE', 'NO_ICE'] },
  { key: 'iced', label: '有冰（微冰～多冰）', members: ['LIGHT', 'LESS', 'NORMAL', 'EXTRA'] }
];
/** 甜度分成四組：無糖、低糖（0.5～3 分）、半糖（5 分）、正常以上（7 分、10 分、多糖）。 */
export const SUGAR_GROUPS: { key: string; label: string; members: Sugar[] }[] = [
  { key: 'none', label: '無糖', members: ['NONE'] },
  { key: 'low', label: '低糖（0.5～3 分）', members: ['S0_5', 'S1', 'S3'] },
  { key: 'half', label: '半糖（5 分）', members: ['S5'] },
  { key: 'full', label: '7 分以上', members: ['S7', 'S10', 'EXTRA'] }
];
