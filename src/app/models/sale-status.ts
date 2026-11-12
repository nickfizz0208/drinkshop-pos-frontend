/**
 * 停售管理：對應後端 /api/sale-status（022）。
 * onSale 是「這一項自己有沒有停售」；sellable／available 是「現在實際能不能賣」：
 * 原料或半成品停售時，用到它的飲品與加料一起停售；原料恢復後，它們會自動恢復。
 */
export interface SaleInventory {
  /** category：分類（023），null＝未分類。 */
  inventoryId: number; name: string; category: string | null; onSale: boolean;
  /** 直接或透過半成品用到這項原料的飲品、加料編號。 */
  usedByProducts: number[]; usedByToppings: number[];
}
export interface SalePrep {
  prepId: number; name: string; category: string | null; onSale: boolean; available: boolean;
  /** 半成品由哪些原料做成；其中一項停售，這個半成品也算停售。 */
  inventoryIds: number[];
  usedByProducts: number[]; usedByToppings: number[];
}
export interface SaleProduct {
  productId: number; name: string; category: string; onSale: boolean; sellable: boolean;
  inventoryIds: number[]; prepIds: number[]; stoppedBy: string[];
}
export interface SaleTopping {
  toppingId: number; name: string; onSale: boolean; sellable: boolean;
  inventoryId: number | null; prepId: number | null; stoppedBy: string[];
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
