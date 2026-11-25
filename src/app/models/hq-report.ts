export interface HqReportSummary {
  revenue: number;
  orderCount: number;
  totalCups: number;
  wastedCups: number;
  rawWastageCost: number;
}

export interface HqTrendPoint {
  label: string;
  revenue: number;
  cups: number;
}

export interface HqTopProduct {
  productName: string;
  cups: number;
  revenue: number;
}

export interface HqOrderRecord {
  orderId: number;
  storeName?: string;
  businessDate: string;
  createdAt: string;
  status: string;
  payment: string;
  totalCups: number;
  revenue: number;
  itemsSummary: string | null;
}

/** 分店清單（/api/hq-reports/stores）。 */
export interface HqStore {
  storeId: number;
  code: string;
  name: string;
  /** 縣市（用「臺」）；沒設定是 null。 */
  city: string | null;
  /** 區域：北部、中部、南部、東部、離島、未設定。 */
  region: string;
  active: boolean;
}

/** 各分店在同一期間的營運數字。 */
export interface HqStoreRow {
  storeId: number;
  code: string;
  storeName: string;
  city?: string | null;
  region?: string;
  active: boolean;
  revenue: number;
  orderCount: number;
  totalCups: number;
  wastedCups: number;
  rawWastageCost: number;
}

export interface HqReportResponse {
  mode: 'day' | 'month' | 'range';
  /** 實際查詢期間（三種模式都有）。 */
  from?: string;
  to?: string;
  date: string;
  year: number;
  month: number;
  summary: HqReportSummary;
  trend: HqTrendPoint[];
  topProducts: HqTopProduct[];
  orders: HqOrderRecord[];
  storeId?: number | null;
  storeIds?: number[] | null;
  byStore?: HqStoreRow[];
}
