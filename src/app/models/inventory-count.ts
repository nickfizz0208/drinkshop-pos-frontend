/** 原料盤點：對應後端 /api/inventories 與 /api/inventory-counts。數量都是原料的基本單位。 */

/** 原料主檔（GET /api/inventories）。packUnit／perPack 有值時，盤點可以輸入「幾包＋零散」。 */
export interface InventoryItem {
  inventoryId: number; name: string; baseUnit: string;
  packUnit: string | null; perPack: number | null;
  bookQty: number; safetyStock: number; unitCost: number | null;
  reportedQty: number | null; reportedBy: number | null; reportedAt: string | null;
}

/** 一筆盤點紀錄；diffQty = countedQty - bookQty（正數盤盈、負數盤虧）。沒有單位成本時 diffCost 為 null。 */
export interface CountRow {
  countId: number; requestId: string; inventoryId: number; inventoryName: string; baseUnit: string;
  countedQty: number; bookQty: number; diffQty: number; unitCost: number | null; diffCost: number | null;
  countedBy: number; countedByName: string | null; countedAt: string; note: string | null;
}

/** POST /api/inventory-counts。requestId 重送時沿用，後端不會重複記錄；經手人由後端以登入帳號記錄。 */
export interface CountSubmit {
  requestId: string; note: string | null;
  lines: { inventoryId: number; countedQty: number }[];
}

/** GET /api/inventory-counts。enabled = false 表示資料庫還沒升級 016，盤點功能未開放。 */
export interface CountHistory { enabled: boolean; rows: CountRow[]; }
