import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, Observable, timeout } from 'rxjs';
import { CountHistory, CountRow, CountSubmit, CountType, InventoryItem, PrepCountItem, PrepCountSubmit, SaveType } from '../models/inventory-count';
import { API_TIMEOUT_MS, PosApiService } from './pos-api.service';

/** 原料盤點 API：登入憑證沿用 PosApiService。只限個人帳號（POS 共用帳號後端回 403）。 */
@Injectable({ providedIn: 'root' })
export class InventoryCountApiService {
  private readonly http = inject(HttpClient);
  private readonly pos = inject(PosApiService);

  private wait<T>(request: Observable<T>): Promise<T> {
    return firstValueFrom(request.pipe(timeout({ first: API_TIMEOUT_MS })));
  }
  private get options() { return { headers: this.pos.authHeaders() }; }

  /** 全部原料、目前帳面數量，以及小單位能不能填小數。 */
  items(): Promise<InventoryItem[]> { return this.wait(this.http.get<InventoryItem[]>('/api/inventory-counts/items', this.options)); }
  /** 盤點紀錄，from／to 為 YYYY-MM-DD，最多 31 天。 */
  history(from: string, to: string): Promise<CountHistory> {
    return this.wait(this.http.get<CountHistory>('/api/inventory-counts', { ...this.options, params: { from, to } }));
  }
  /** 盤點類型；includeInactive = true 連停用的一起列（店長管理用）。 */
  types(includeInactive = false): Promise<CountType[]> {
    return this.wait(this.http.get<CountType[]>('/api/inventory-counts/types', { ...this.options, params: { includeInactive } }));
  }
  /** 新增盤點類型（只限店長、總部）。 */
  createType(body: SaveType): Promise<CountType> { return this.wait(this.http.post<CountType>('/api/inventory-counts/types', body, this.options)); }
  /** 修改盤點類型（只限店長、總部）；active = false 即停用。 */
  updateType(id: number, body: SaveType): Promise<CountType> {
    return this.wait(this.http.put<CountType>(`/api/inventory-counts/types/${id}`, body, this.options));
  }
  /** 送出一次盤點（多項原料），回傳這次記錄的每一列。 */
  submit(body: CountSubmit): Promise<CountRow[]> {
    return this.wait(this.http.post<CountRow[]>('/api/inventory-counts', body, this.options));
  }
  /** 店長審核確認盤點紀錄，並正式更新原料帳面庫存。 */
  approveCount(countId: number): Promise<{ success: boolean; message: string }> {
    return this.wait(this.http.post<{ success: boolean; message: string }>(`/api/inventory-counts/${countId}/approve`, {}, this.options));
  }
  /** 半成品盤點清單（計算目前數量、今日訂單消耗、今日報廢、理論量）。 */
  prepItems(date?: string): Promise<PrepCountItem[]> {
    return this.wait(this.http.get<PrepCountItem[]>('/api/inventory-counts/prep-items', { ...this.options, params: date ? { date } : {} }));
  }
  /** 送出半成品盤點（員工送出待審核，店長送出確認並扣除原料）。 */
  submitPrepCount(body: PrepCountSubmit): Promise<{ countId: number; requestId: string; isManager: boolean; results: any[]; message: string }> {
    return this.wait(this.http.post<any>('/api/inventory-counts/prep-submit', body, this.options));
  }
}
