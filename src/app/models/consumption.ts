export interface ConsumptionRecord {
  business_date: string;
  day_of_month: number;
  inventory_id: number;
  material_name: string;
  unit: string;
  total_consumed: number;
}

export interface MaterialItem {
  inventory_id: number;
  name: string;
  base_unit: string;
  book_qty?: number;
  safety_stock?: number;
  category?: string;
}

export interface WastageDetail {
  wastage_id: number;
  business_date: string;
  inventory_id: number;
  material_name: string;
  unit: string;
  quantity: number;
  unit_cost: number | null;
  material_cost: number | null;
  reason: string;
  reported_by: number;
  reported_by_name: string | null;
  reported_at: string;
}

export interface MonthlyConsumptionResponse {
  year: number;
  month: number;
  records: ConsumptionRecord[];
  materials: MaterialItem[];
  wastage_records?: ConsumptionRecord[];
  wastage_materials?: MaterialItem[];
  wastage_details?: WastageDetail[];
}
