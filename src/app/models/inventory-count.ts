/** 原料盤點：對應後端 /api/inventories 與 /api/inventory-counts。數量都是原料的基本單位。 */

/**
 * 盤點用的原料（GET /api/inventory-counts/items）。packUnit／perPack 有值時，可以輸入「幾包＋零散」。
 * 盤點一律整數（包數與零散都是），開封、用到一半的不算。
 * displayByPack = true 時用「幾籃幾顆」顯示。
 */
export interface InventoryItem {
  inventoryId: number; name: string; baseUnit: string;
  packUnit: string | null; perPack: number | null;
  bookQty: number; safetyStock: number; unitCost: number | null;
  /** true：畫面用「幾籃幾顆」顯示（資料庫照樣存基本單位）；盤點時零散要少於 perPack。 */
  displayByPack: boolean;
}

/**
 * 一次盤點中的一項原料；countId 是那一次盤點的編號（同一次的每一項相同）。
 * diffQty = countedQty - bookQty（正數盤盈、負數盤虧）。沒有單位成本時 diffCost 為 null。
 */
export interface CountRow {
  countId: number; requestId: string; typeId: number; typeName: string; inputMode: InputMode; inventoryId: number; inventoryName: string; baseUnit: string;
  countedQty: number; bookQty: number; diffQty: number; unitCost: number | null; diffCost: number | null;
  countedBy: number; countedByName: string | null; countedAt: string; note: string | null;
}

/** POST /api/inventory-counts。requestId 重送時沿用，後端不會重複記錄；經手人由後端以登入帳號記錄。 */
export interface CountSubmit {
  requestId: string; typeId: number; note: string | null;
  lines: { inventoryId: number; countedQty: number }[];
}

/** 輸入方式：箱數＋零散，或只填箱數（有包裝單位的原料記成 箱數 × 每箱數量，零頭不計）。 */
export type InputMode = 'PACK_AND_LOOSE' | 'PACK_ONLY';
export const INPUT_MODE_LABELS: Record<InputMode, string> = { PACK_AND_LOOSE: '箱數＋零散', PACK_ONLY: '只填箱數' };

/**
 * 盤點類型（GET /api/inventory-counts/types）：例如大盤、小盤。
 * allItems = true 包含全部原料（之後新增的也包含），itemIds 為空；否則只盤 itemIds 列出的原料。
 */
export interface CountType {
  typeId: number; name: string; inputMode: InputMode; allItems: boolean; active: boolean;
  itemIds: number[]; updatedAt: string; updatedByName: string | null;
}
/** 新增／修改盤點類型（只限店長、總部）。active = false 即停用。 */
export interface SaveType { name: string; inputMode: InputMode; allItems: boolean; itemIds: number[]; active?: boolean; }

/** GET /api/inventory-counts。enabled = false 表示資料庫還沒升級 016，盤點功能未開放。 */
export interface CountHistory { enabled: boolean; rows: CountRow[]; }
