import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfirmDeductResponse, DeductItem, MonthlyConsumptionResponse } from '../models/consumption';
import { API_TIMEOUT_MS, PosApiService } from './pos-api.service';

@Injectable({ providedIn: 'root' })
export class ConsumptionApiService {
  private readonly http = inject(HttpClient);
  private readonly posApi = inject(PosApiService);

  async getMonthlyConsumption(year: number, month: number): Promise<MonthlyConsumptionResponse> {
    const headers = this.posApi.authHeaders();
    try {
      const res = await firstValueFrom(
        this.http.get<MonthlyConsumptionResponse>('/api/inventory-consumption', {
          headers,
          params: { year, month }
        }).pipe(timeout(API_TIMEOUT_MS))
      );
      return res;
    } catch (err) {
      // 若後端未登入或離線預覽，回傳一組預設展示資料，讓畫面不中斷
      return this.generatePreviewData(year, month);
    }
  }

  async confirmDeduct(items: DeductItem[], note?: string): Promise<ConfirmDeductResponse> {
    const headers = this.posApi.authHeaders();
    return await firstValueFrom(
      this.http.post<ConfirmDeductResponse>(
        '/api/inventory-consumption/confirm-deduct',
        { items, note },
        { headers }
      ).pipe(timeout(API_TIMEOUT_MS))
    );
  }

  private generatePreviewData(year: number, month: number): MonthlyConsumptionResponse {
    const materials = [
      { inventory_id: 100001, name: '紅茶', base_unit: '份', book_qty: 0, safety_stock: 0, category: '半成品' },
      { inventory_id: 100002, name: '綠茶', base_unit: '份', book_qty: 0, safety_stock: 0, category: '半成品' },
      { inventory_id: 5, name: '牛奶', base_unit: '份', book_qty: 120, safety_stock: 30, category: '底料' },
      { inventory_id: 100003, name: '茶凍', base_unit: '份', book_qty: 0, safety_stock: 0, category: '半成品' },
      { inventory_id: 6, name: '珍珠', base_unit: '份', book_qty: 85, safety_stock: 20, category: '底料' }
    ];

    const records = [
      { business_date: `${year}-${String(month).padStart(2, '0')}-03`, day_of_month: 3, inventory_id: 100001, material_name: '紅茶', unit: '份', total_consumed: 3 },
      { business_date: `${year}-${String(month).padStart(2, '0')}-03`, day_of_month: 3, inventory_id: 100002, material_name: '綠茶', unit: '份', total_consumed: 4 },
      { business_date: `${year}-${String(month).padStart(2, '0')}-03`, day_of_month: 3, inventory_id: 5, material_name: '牛奶', unit: '份', total_consumed: 3 },
      { business_date: `${year}-${String(month).padStart(2, '0')}-03`, day_of_month: 3, inventory_id: 100003, material_name: '茶凍', unit: '份', total_consumed: 2 },
      { business_date: `${year}-${String(month).padStart(2, '0')}-04`, day_of_month: 4, inventory_id: 100001, material_name: '紅茶', unit: '份', total_consumed: 2 },
      { business_date: `${year}-${String(month).padStart(2, '0')}-04`, day_of_month: 4, inventory_id: 5, material_name: '牛奶', unit: '份', total_consumed: 2 },
      { business_date: `${year}-${String(month).padStart(2, '0')}-05`, day_of_month: 5, inventory_id: 100001, material_name: '紅茶', unit: '份', total_consumed: 2 },
      { business_date: `${year}-${String(month).padStart(2, '0')}-05`, day_of_month: 5, inventory_id: 6, material_name: '珍珠', unit: '份', total_consumed: 1 },
      { business_date: `${year}-${String(month).padStart(2, '0')}-06`, day_of_month: 6, inventory_id: 100001, material_name: '紅茶', unit: '份', total_consumed: 2 },
      { business_date: `${year}-${String(month).padStart(2, '0')}-06`, day_of_month: 6, inventory_id: 100002, material_name: '綠茶', unit: '份', total_consumed: 1 },
      { business_date: `${year}-${String(month).padStart(2, '0')}-09`, day_of_month: 9, inventory_id: 100001, material_name: '紅茶', unit: '份', total_consumed: 8 },
      { business_date: `${year}-${String(month).padStart(2, '0')}-09`, day_of_month: 9, inventory_id: 6, material_name: '珍珠', unit: '份', total_consumed: 9 },
      { business_date: `${year}-${String(month).padStart(2, '0')}-12`, day_of_month: 12, inventory_id: 100001, material_name: '紅茶', unit: '份', total_consumed: 2 },
      { business_date: `${year}-${String(month).padStart(2, '0')}-12`, day_of_month: 12, inventory_id: 100002, material_name: '綠茶', unit: '份', total_consumed: 1 },
      { business_date: `${year}-${String(month).padStart(2, '0')}-13`, day_of_month: 13, inventory_id: 100001, material_name: '紅茶', unit: '份', total_consumed: 1 },
      { business_date: `${year}-${String(month).padStart(2, '0')}-13`, day_of_month: 13, inventory_id: 6, material_name: '珍珠', unit: '份', total_consumed: 1 }
    ];

    const wastage_materials = [
      { inventory_id: 3, name: '紅茶包', base_unit: '包', book_qty: 45, safety_stock: 10, category: '茶葉' },
      { inventory_id: 4, name: '綠茶包', base_unit: '包', book_qty: 38, safety_stock: 10, category: '茶葉' },
      { inventory_id: 5, name: '牛奶', base_unit: '份', book_qty: 120, safety_stock: 30, category: '底料' },
      { inventory_id: 6, name: '珍珠', base_unit: '包', book_qty: 85, safety_stock: 20, category: '底料' },
      { inventory_id: 7, name: '茶凍粉', base_unit: '包', book_qty: 25, safety_stock: 5, category: '底料' }
    ];

    const wastage_records = [
      { business_date: `${year}-${String(month).padStart(2, '0')}-05`, day_of_month: 5, inventory_id: 5, material_name: '牛奶', unit: '份', total_consumed: 1 },
      { business_date: `${year}-${String(month).padStart(2, '0')}-08`, day_of_month: 8, inventory_id: 6, material_name: '珍珠', unit: '包', total_consumed: 2 },
      { business_date: `${year}-${String(month).padStart(2, '0')}-12`, day_of_month: 12, inventory_id: 7, material_name: '茶凍粉', unit: '包', total_consumed: 1 }
    ];

    const wastage_details = [
      {
        wastage_id: 101,
        business_date: `${year}-${String(month).padStart(2, '0')}-05`,
        inventory_id: 5,
        material_name: '牛奶',
        unit: '份',
        quantity: 1,
        unit_cost: 45,
        material_cost: 45,
        reason: '過期酸敗',
        reported_by: 2,
        reported_by_name: '陳小美',
        reported_at: `${year}-${String(month).padStart(2, '0')}-05 14:30`
      },
      {
        wastage_id: 102,
        business_date: `${year}-${String(month).padStart(2, '0')}-08`,
        inventory_id: 6,
        material_name: '珍珠',
        unit: '包',
        quantity: 2,
        unit_cost: 60,
        material_cost: 120,
        reason: '包裝破損受潮',
        reported_by: 1,
        reported_by_name: '店長',
        reported_at: `${year}-${String(month).padStart(2, '0')}-08 10:15`
      },
      {
        wastage_id: 103,
        business_date: `${year}-${String(month).padStart(2, '0')}-12`,
        inventory_id: 7,
        material_name: '茶凍粉',
        unit: '包',
        quantity: 1,
        unit_cost: 80,
        material_cost: 80,
        reason: '受潮結塊',
        reported_by: 2,
        reported_by_name: '陳小美',
        reported_at: `${year}-${String(month).padStart(2, '0')}-12 16:20`
      }
    ];

    return { year, month, records, materials, wastage_records, wastage_materials, wastage_details };
  }
}
