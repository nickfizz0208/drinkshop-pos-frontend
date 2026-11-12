import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, Observable, timeout } from 'rxjs';
import { CategoryChange, SaleStatus, SaleUpdate } from '../models/sale-status';
import { API_TIMEOUT_MS, PosApiService } from './pos-api.service';

/** 停售管理 API：查看登入即可；修改限門市 POS、店長、總部（後端也會擋）。 */
@Injectable({ providedIn: 'root' })
export class SaleStatusApiService {
  private readonly http = inject(HttpClient);
  private readonly pos = inject(PosApiService);

  private wait<T>(request: Observable<T>): Promise<T> {
    return firstValueFrom(request.pipe(timeout({ first: API_TIMEOUT_MS })));
  }
  private get options() { return { headers: this.pos.authHeaders() }; }

  status(): Promise<SaleStatus> { return this.wait(this.http.get<SaleStatus>('/api/sale-status', this.options)); }
  /** 一次儲存多項停售／恢復，回傳更新後的完整狀態。 */
  update(body: SaleUpdate): Promise<SaleStatus> { return this.wait(this.http.put<SaleStatus>('/api/sale-status', body, this.options)); }
  /** 改原料或半成品的分類（只限店長、總部），回傳更新後的完整狀態。 */
  updateCategory(body: CategoryChange): Promise<SaleStatus> {
    return this.wait(this.http.put<SaleStatus>('/api/sale-status/categories', body, this.options));
  }
}
