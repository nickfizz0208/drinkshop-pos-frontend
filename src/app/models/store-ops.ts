/** 班次／損耗 API 使用 camelCase，與 POS 訂單的 snake_case 分開。 */
export interface DailyShift {
  businessDate: string; status: 'OPEN' | 'CLOSED'; pettyCash: number;
  openedBy: number; openedAt: string; closedBy: number | null; closedAt: string | null;
  expectedCash: number | null; countedCash: number | null; diffReason: string | null;
  revenueByPayment: string | null; cups: number | null; rolesJson: string;
}
export interface ClosingSummary {
  businessDate: string; status: 'CLOSED'; pettyCash: number; totalRevenue: number;
  totalWastageCost: number | null; expectedCash: number; countedCash: number;
  diffAmount: number; totalCups: number; diffReason: string | null;
  costComplete: boolean; rawWastageEnabled: boolean;
}
export interface Inventory {
  inventoryId: number; name: string; baseUnit: string; bookQty: number; unitCost: number | null;
}
export interface RawWastageRequest { inventoryId: number; wastageQty: number; reason: string; }
export interface RawWastage extends Omit<RawWastageRequest, 'wastageQty'> {
  wastageId: number; businessDate: string; quantity: number; unitCost: number | null;
  materialCost: number | null; reportedBy: number; reportedAt: string;
}
export interface WastageSummary {
  date: string; totalWastedCount: number; totalWastageCost: number | null;
  costComplete: boolean; rawWastageEnabled: boolean;
  wastedItems: { itemId: number; orderId: number; productName: string; qty: number; status: string }[];
  rawMaterialWastages: RawWastage[];
}
export interface RawReview {
  staffId: number; date: string; sentAt: string; materialName: string; unit: string; request: RawWastageRequest;
}
