import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, Observable, timeout } from 'rxjs';
import { CountHistory, CountRow, CountSubmit, InventoryItem } from '../models/inventory-count';
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

  /** 全部原料與目前帳面數量。 */
  inventories(): Promise<InventoryItem[]> { return this.wait(this.http.get<InventoryItem[]>('/api/inventories', this.options)); }
  /** 盤點紀錄，from／to 為 YYYY-MM-DD，最多 31 天。 */
  history(from: string, to: string): Promise<CountHistory> {
    return this.wait(this.http.get<CountHistory>('/api/inventory-counts', { ...this.options, params: { from, to } }));
  }
  /** 送出一次盤點（多項原料），回傳這次記錄的每一列。 */
  submit(body: CountSubmit): Promise<CountRow[]> {
    return this.wait(this.http.post<CountRow[]>('/api/inventory-counts', body, this.options));
  }
}
