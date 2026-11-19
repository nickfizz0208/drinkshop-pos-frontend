/**
 * 前後端共用的資料約定：查詢結果多沿用資料庫 snake_case；送單 DTO 使用 camelCase。
 * interface 只協助 TypeScript 檢查欄位，不會自行建立資料表，也不會驗證網路回應內容。
 */
export type Size = 'M' | 'L' | 'BOTTLE';
/** 溫度冰量（038，溫度、冰量合成一個）：熱、溫、常溫、完全去冰、去冰、微冰、少冰、正常冰、多冰。 */
export type TempIce = 'HOT' | 'WARM' | 'ROOM' | 'ICE_FREE' | 'NO_ICE' | 'LIGHT' | 'LESS' | 'NORMAL' | 'EXTRA';
/** 甜度（038）：無糖、0.5、1、3、5、7、10 分、多糖。 */
export type Sugar = 'NONE' | 'S0_5' | 'S1' | 'S3' | 'S5' | 'S7' | 'S10' | 'EXTRA';
/** 資料庫舊規則用的溫度、冰量、甜度值（conflict_rule 沒改，比對時換算，見 menu-rules.ts）。 */
export type LegacyTemperature = 'COLD' | 'WARM' | 'HOT';
export type Source = 'DINE_IN' | 'TAKE_OUT' | 'PHONE_DELIVERY' | 'UBER_EATS';
// UBER_EATS 僅保留舊資料標籤，新付款按鈕只提供現金、信用卡、LINE Pay。
export type Payment = 'CASH' | 'CREDIT_CARD' | 'LINE_PAY' | 'UBER_EATS';
export type ItemStatus = 'PENDING' | 'MAKING' | 'DONE' | 'PICKED_UP' | 'CANCELLED' | 'WASTED';
export interface Staff { staffId: number; username: string; name: string; level: string; }
/** 飲品。容量價格（024）：price_m 中杯、price_l 大杯、price_bottle 瓶，null＝這杯不賣這個容量。 */
export interface Product {
  product_id: number; name: string; category: string;
  price_m: number | null; price_l: number | null; price_bottle: number | null; hot_allowed: boolean;
  /** 色系（032）：飲品卡背景、杯子插圖的配色。null 或沒有＝依名稱、分類自動判斷（見 drink-cup 的 drinkTone）。 */
  color_tone?: ColorTone | null;
}
/** 資料庫 product.color_tone 的值：紅、橙、黃、綠、紫、白、奶、咖（BROWN，資料庫 036）。只存色系，色碼在前端 scss（drink-card、drink-cup）。 */
export type ColorTone = 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'PURPLE' | 'WHITE' | 'CREAM' | 'BROWN';
/** 加料。max_qty：這種加料一杯最多幾份（資料庫 topping.max_qty，040；舊資料沒有就當 2）。 */
export interface Topping { topping_id: number; name: string; price: number; max_qty?: number; }
/** 這種加料一杯最多幾份。 */
export function toppingMax(topping: Topping | undefined): number { return topping?.max_qty ?? 2; }
/** 一杯飲料的加料最多幾份（全部加料加起來，040；後端 OrderRequests.MAX_TOPPINGS_PER_CUP 也是 5）。 */
export const MAX_TOPPINGS_PER_CUP = 5;
/** 加料照加入順序合成「哪一種、幾份」：[1,1,3] → [{ id: 1, qty: 2 }, { id: 3, qty: 1 }]。 */
export function groupToppings(ids: readonly number[]): { id: number; qty: number }[] {
  const groups: { id: number; qty: number }[] = [];
  for (const id of ids) { const g = groups.find(x => x.id === id); if (g) g.qty++; else groups.push({ id, qty: 1 }); }
  return groups;
}
/** 客製選項（041）：不用錢、沒有衝突規則的選項，例如加酸、少料、加梅子。max_qty＝一杯最多幾份（預設 1）。 */
export interface CustomOption { option_id: number; name: string; max_qty?: number; }
/** options 是 041 起才有，舊後端沒有就當空的。 */
export interface Menu { products: Product[]; toppings: Topping[]; options?: CustomOption[]; }
export interface Rule {
  rule_id: number;
  rule_type: 'FORBID' | 'AUTO_ADJUST' | 'MAX_COUNT' | 'MUTEX';
  /** temperatureIn 是舊寫法（COLD/WARM/HOT），tempIceIn 是 038 的新寫法。 */
  condition_json: { always?: boolean; category?: string; temperatureIn?: LegacyTemperature[]; tempIceIn?: TempIce[] };
  /** set：新寫法 tempIce、sugar；舊寫法 temperature、ice、舊甜度（NORMAL/LESS/HALF/LIGHT），比對時換算。 */
  action_json: { forbidToppingIds?: number[]; set?: { tempIce?: string; sugar?: string; temperature?: string; ice?: string }; lockFields?: string[]; field?: string; maxDistinct?: number; toppingIds?: number[] };
  message: string;
}
/** optionIds：客製選項（041），用法跟 toppingIds 一樣，同一個 ID 出現兩次＝兩份。 */
export interface Selection { size: Size; tempIce: TempIce; sugar: Sugar; qty: number; toppingIds: number[]; optionIds: number[]; note: string; }
// CartLine 是前端暫存；CreateItem 才是送單格式，不傳商品物件與前端算出的售價。
export interface CartLine extends Selection { key: string; product: Product; unitCents: number; }
export interface CreateItem { productId: number; size: Size; tempIce: TempIce; sugar: Sugar; qty: number; toppingIds: number[]; optionIds: number[]; note: string; }
export interface CreateOrder { requestId: string; source: Source; payment: Payment | null; unpaid?: boolean; receivedCash?: number; note: string; items: CreateItem[]; memberPhone?: string; addressNote?: string; /** 路線距離（公尺） */ distance?: number; }
// total 是保留品項金額；淨收款為 paid_amount 減 refunded_amount。
export interface OrderSummary { order_id: number; order_no: string; business_date: string; source: Source; payment: Payment | null; payment_status?: 'UNPAID' | 'PAID'; paid_amount?: number; refunded_amount?: number; total: number; status: string; created_at: string; }
// 一筆明細可有 qty 杯；unit_price 是含加料單杯售價。material_cost 只有舊訂單有值（021 起飲品不計原料成本）。
export interface OrderItem {
  product_id?: number | null;
  item_id: number; product_name: string; size: Size; temp_ice: TempIce; sugar: Sugar; qty: number; unit_price: number;
  material_cost?: number | null; refund_amount?: number; status: ItemStatus; note: string | null; reason: string | null; approved_by: number | null; photo_url: string | null;
  /** qty：同一種加料的份數（039，舊資料沒有這欄就是 1）；price_at_order 是一份的價格。 */
  toppings: { order_topping_id: number; topping_id: number; topping_name: string; qty?: number; price_at_order: number }[];
  /** 客製選項（041，舊訂單沒有）。 */
  options?: { order_option_id: number; option_id: number; option_name: string; qty: number }[];
}
export interface Order extends OrderSummary { received_cash: number | null; change_cash: number | null; note: string | null; items: OrderItem[]; }
// manager 欄位是舊版相容資料，目前畫面與取消流程不要求 PIN。
export interface CancelRequest { reason: string; managerUsername?: string; managerPin?: string; refundAmount?: number; }
export const SIZE_LABELS: Record<Size, string> = { M: '中杯', L: '大杯', BOTTLE: '瓶' };
/** 容量由小到大的順序（按鈕順序、預設選最前面有賣的）。 */
export const SIZE_ORDER: readonly Size[] = ['M', 'L', 'BOTTLE'];
/** 這杯飲品這個容量的價格；不賣回傳 null。 */
export function sizePrice(product: Product, size: Size): number | null {
  return size === 'M' ? product.price_m : size === 'L' ? product.price_l : product.price_bottle;
}
/** 這杯飲品有賣的容量，由小到大。 */
export function sizesOf(product: Product): Size[] { return SIZE_ORDER.filter(size => sizePrice(product, size) !== null); }
/** 溫度冰量，照按鈕順序（熱→多冰）。 */
export const TEMP_ICE_LABELS: Record<TempIce, string> = {
  HOT: '熱', WARM: '溫', ROOM: '常溫', ICE_FREE: '完全去冰', NO_ICE: '去冰', LIGHT: '微冰', LESS: '少冰', NORMAL: '正常冰', EXTRA: '多冰'
};
/** 甜度，照按鈕順序（無糖→多糖）。 */
export const SUGAR_LABELS: Record<Sugar, string> = {
  NONE: '無糖', S0_5: '0.5分糖', S1: '1分糖', S3: '3分糖', S5: '5分糖', S7: '7分糖', S10: '10分糖', EXTRA: '多糖'
};
/** 熱、溫：飲品不能做熱飲（hot_allowed = false）時不能選。 */
export function isHotOrWarm(value: TempIce): boolean { return value === 'HOT' || value === 'WARM'; }
export const SOURCE_LABELS: Record<Source, string> = { DINE_IN: '內用', TAKE_OUT: '外帶', PHONE_DELIVERY: '電話外送', UBER_EATS: 'Uber Eats' };
export const PAYMENT_LABELS: Record<Payment, string> = { CASH: '現金', CREDIT_CARD: '信用卡', LINE_PAY: 'LINE Pay', UBER_EATS: 'Uber Eats' };
export const STATUS_LABELS: Record<string, string> = { PENDING: '待製作', MAKING: '製作中', DONE: '待取餐', PICKED_UP: '已取餐', CANCELLED: '已取消', WASTED: '已損耗' };

// 計算轉整數分，顯示用 money 格式化元；兩者用途不同。
export function cents(value: number): number { return Math.round(value * 100); }
export function money(value: number): string {
  return '$' + new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(value);
}
// 依台北日期產生 YYYY-MM-DD，避免電腦時區或 UTC 造成營業日差一天。
export function taipeiDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export interface Member {
  phone: string; name: string; address?: string | null;
  lat?: number | null; lng?: number | null; geoSource?: 'GEOCODE' | 'MANUAL' | null; note?: string | null;
  createdAt?: string; updatedAt?: string;
}
export interface StoreLocation { lat: number; lng: number; }
export interface PosConfig { hereMapKey: string; store: StoreLocation; }
/** 後端回傳的外送路線；polylines 為 HERE flexible polyline。 */
export interface DeliveryRoute {
  lat: number; lng: number; geoSource: 'GEOCODE' | 'MANUAL' | null; needsReview: boolean;
  label: string | null; distanceM: number; polylines: string[];
}
/** 這張外送單使用的送達位置；addressNote 有值代表「只用於這張單」的臨時位置。 */
export interface Delivery { lat: number; lng: number; distanceM: number; addressNote?: string; }
export interface DeliverySelection { member: Member; delivery: Delivery | null; }
export type MemberUpdate = Pick<Member, 'name' | 'address' | 'lat' | 'lng' | 'note'>;
export function distanceText(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} 公里` : `${Math.round(meters)} 公尺`;
}
