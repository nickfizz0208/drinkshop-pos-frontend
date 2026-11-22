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
  businessDate: string;
  createdAt: string;
  status: string;
  payment: string;
  totalCups: number;
  revenue: number;
  itemsSummary: string | null;
}

export interface HqReportResponse {
  mode: 'day' | 'month';
  date: string;
  year: number;
  month: number;
  summary: HqReportSummary;
  trend: HqTrendPoint[];
  topProducts: HqTopProduct[];
  orders: HqOrderRecord[];
}
