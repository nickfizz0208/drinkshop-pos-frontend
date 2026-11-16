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
}

export interface MonthlyConsumptionResponse {
  year: number;
  month: number;
  records: ConsumptionRecord[];
  materials: MaterialItem[];
}
