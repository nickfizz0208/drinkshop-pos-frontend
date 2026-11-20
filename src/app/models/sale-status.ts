/**
 * 停售管理：對應後端 /api/sale-status（022）。
 * onSale 是「這一項自己有沒有停售」；sellable／available 是「現在實際能不能賣」：
 * 原料或半成品停售時，用到它的飲品與加料一起停售；原料恢復後，它們會自動恢復。
 * show（045）：false＝停售管理頁不顯示這一項；連動照算，所以資料裡還是有它。舊資料沒有 show＝顯示。
 */
export interface SaleInventory {
  /** category：分類（023），null＝未分類。 */
  inventoryId: number; name: string; category: string | null; onSale: boolean;
  /** 直接或透過半成品用到這項原料的飲品、加料編號。 */
  usedByProducts: number[]; usedByToppings: number[];
  show?: boolean;
}
export interface SalePrep {
  prepId: number; name: string; category: string | null; onSale: boolean; available: boolean;
  /** 用到的全部原料、半成品（043）。 */
  inventoryIds: number[];
  subPrepIds?: number[];
  /** 每一項材料與停售連不連動（044）；link＝true 的材料停售（半成品材料會再往下看），這個半成品也算停售。 */
  ingredients?: SalePrepIngredient[];
  /** 直接或透過 link＝true 的上層半成品用到它的飲品、加料編號。 */
  usedByProducts: number[]; usedByToppings: number[];
  show?: boolean;
}
export interface SalePrepIngredient { inventoryId: number | null; subPrepId: number | null; link: boolean; }
/** 半成品裡的半成品最多往下追幾層，和後端 SaleStatusRepository.MAX_SUB_PREP_LEVELS 相同。 */
export const MAX_SUB_PREP_LEVELS = 3;
export interface SaleProduct {
  productId: number; name: string; category: string; onSale: boolean; sellable: boolean;
  inventoryIds: number[]; prepIds: number[]; stoppedBy: string[];
  show?: boolean;
}
export interface SaleTopping {
  toppingId: number; name: string; onSale: boolean; sellable: boolean;
  inventoryId: number | null; prepId: number | null; stoppedBy: string[];
  show?: boolean;
}
export interface SaleStatus {
  inventories: SaleInventory[]; preps: SalePrep[]; products: SaleProduct[]; toppings: SaleTopping[];
}
export interface SaleChange { id: number; onSale: boolean; }
export interface SaleUpdate {
  inventories?: SaleChange[]; preps?: SaleChange[]; products?: SaleChange[]; toppings?: SaleChange[];
}
export type SaleKind = 'inventory' | 'prep' | 'product' | 'topping';
/** 改原料或半成品的分類（只限店長、總部）；category 空白＝未分類。 */
export interface CategoryChange { kind: 'INVENTORY' | 'PREP'; id: number; category: string | null; }
/** 頁面上的種類順序與名稱。 */
export const SALE_KINDS: { kind: SaleKind; label: string }[] = [
  { kind: 'product', label: '飲品' }, { kind: 'inventory', label: '原料' }, { kind: 'prep', label: '半成品' }, { kind: 'topping', label: '加料' }
];
/** 常用分類：就算目前沒有品項也列出來，方便店長把品項歸進去。 */
export const DEFAULT_CATEGORIES: Partial<Record<SaleKind, string[]>> = {
  inventory: ['包材', '茶葉', '底料', '水果'],
  prep: ['茶湯', '底料', '鮮果']
};
export const UNCATEGORIZED = '未分類';
