import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, Observable, timeout } from 'rxjs';
import { PrepBatchCreate, PrepBatchDay, PrepBatchRow, PrepOption } from '../models/prep-batch';
import { API_TIMEOUT_MS, PosApiService } from './pos-api.service';

/** 備料 API：門市 POS 與店員、店長等個人帳號可以用，總部不行（後端也會擋）。 */
@Injectable({ providedIn: 'root' })
export class PrepBatchApiService {
  private readonly http = inject(HttpClient);
  private readonly pos = inject(PosApiService);

  private wait<T>(request: Observable<T>): Promise<T> {
    return firstValueFrom(request.pipe(timeout({ first: API_TIMEOUT_MS })));
  }
  private get options() { return { headers: this.pos.authHeaders() }; }

  preps(): Promise<PrepOption[]> { return this.wait(this.http.get<PrepOption[]>('/api/prep-batches/preps', this.options)); }
  /** 某一天的備料紀錄（新的在前）。 */
  day(date: string): Promise<PrepBatchDay> {
    return this.wait(this.http.get<PrepBatchDay>('/api/prep-batches', { ...this.options, params: { date } }));
  }
  create(body: PrepBatchCreate): Promise<PrepBatchRow> {
    return this.wait(this.http.post<PrepBatchRow>('/api/prep-batches', body, this.options));
  }
}
