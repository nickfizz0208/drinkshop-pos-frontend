export type Size = 'M' | 'L';
export type Temperature = 'COLD' | 'WARM' | 'HOT';
export type Sugar = 'NORMAL' | 'LESS' | 'HALF' | 'LIGHT' | 'NONE';
export type Ice = 'NORMAL' | 'LESS' | 'LIGHT' | 'NONE';
export type Source = 'DINE_IN' | 'TAKE_OUT' | 'PHONE_DELIVERY' | 'UBER_EATS';
export type Payment = 'CASH' | 'CREDIT_CARD' | 'LINE_PAY' | 'UBER_EATS';
export type ItemStatus = 'PENDING' | 'MAKING' | 'DONE' | 'PICKED_UP' | 'CANCELLED' | 'WASTED';
export interface Staff { staffId: number; username: string; name: string; level: string; }
export interface Product { product_id: number; name: string; category: string; base_price: number; large_extra: number; hot_allowed: boolean; }
export interface Topping { topping_id: number; name: string; price: number; }
export interface Menu { products: Product[]; toppings: Topping[]; }
export interface Rule {
  rule_id: number;
  rule_type: 'FORBID' | 'AUTO_ADJUST' | 'MAX_COUNT' | 'MUTEX';
  condition_json: { always?: boolean; category?: string; temperatureIn?: Temperature[] };
  action_json: { forbidToppingIds?: number[]; set?: Partial<Pick<Selection, 'temperature' | 'sugar' | 'ice'>>; lockFields?: string[]; field?: string; maxDistinct?: number; toppingIds?: number[] };
  message: string;
}
export interface Selection { size: Size; temperature: Temperature; sugar: Sugar; ice: Ice; qty: number; toppingIds: number[]; note: string; }
export interface CartLine extends Selection { key: string; product: Product; unitCents: number; }
export interface CreateItem { productId: number; size: Size; temperature: Temperature; sugar: Sugar; ice: Ice; qty: number; toppingIds: number[]; note: string; }
export interface CreateOrder { requestId: string; source: Source; payment: Payment | null; unpaid?: boolean; receivedCash?: number; note: string; items: CreateItem[]; }
export interface OrderSummary { order_id: number; order_no: string; business_date: string; source: Source; payment: Payment | null; payment_status?: 'UNPAID' | 'PAID'; paid_amount?: number; refunded_amount?: number; total: number; status: string; created_at: string; }
export interface OrderItem {
  item_id: number; product_name: string; size: Size; temperature: Temperature; sugar: Sugar; ice: Ice; qty: number; unit_price: number;
  material_cost?: number | null; refund_amount?: number; status: ItemStatus; note: string | null; reason: string | null; approved_by: number | null; photo_url: string | null;
  toppings: { order_topping_id: number; topping_id: number; topping_name: string; price_at_order: number }[];
}
export interface Order extends OrderSummary { received_cash: number | null; change_cash: number | null; note: string | null; items: OrderItem[]; }
export interface CancelRequest { reason: string; managerUsername?: string; managerPin?: string; refundAmount?: number; }
export const SIZE_LABELS: Record<Size, string> = { M: '中杯', L: '大杯' };
export const TEMP_LABELS: Record<Temperature, string> = { COLD: '冰飲', WARM: '溫飲', HOT: '熱飲' };
export const SUGAR_LABELS: Record<Sugar, string> = { NORMAL: '正常糖', LESS: '少糖', HALF: '半糖', LIGHT: '微糖', NONE: '無糖' };
export const ICE_LABELS: Record<Ice, string> = { NORMAL: '正常冰', LESS: '少冰', LIGHT: '微冰', NONE: '去冰' };
export const SOURCE_LABELS: Record<Source, string> = { DINE_IN: '內用', TAKE_OUT: '外帶', PHONE_DELIVERY: '電話外送', UBER_EATS: 'Uber Eats' };
export const PAYMENT_LABELS: Record<Payment, string> = { CASH: '現金', CREDIT_CARD: '信用卡', LINE_PAY: 'LINE Pay', UBER_EATS: 'Uber Eats' };
export const STATUS_LABELS: Record<string, string> = { PENDING: '待製作', MAKING: '製作中', DONE: '待取餐', PICKED_UP: '已取餐', CANCELLED: '已取消', WASTED: '已損耗' };

export function cents(value: number): number { return Math.round(value * 100); }
export function money(value: number): string {
  return '$' + new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(value);
}
export function taipeiDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts();
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
