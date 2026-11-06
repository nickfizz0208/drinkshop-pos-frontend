import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, Observable, timeout } from 'rxjs';
import { BoardRow, ChecklistItem, ChecklistRecord, ItemCreate, ItemUpdate, RecordCreate } from '../models/checklist';
import { ClockRecord, ClockToday } from '../models/time-clock';
import { API_TIMEOUT_MS, PosApiService } from './pos-api.service';

/** 檢查表 API：登入憑證沿用 PosApiService。 */
@Injectable({ providedIn: 'root' })
export class ChecklistApiService {
  private readonly http = inject(HttpClient);
  private readonly pos = inject(PosApiService);

  private wait<T>(request: Observable<T>): Promise<T> {
    return firstValueFrom(request.pipe(timeout({ first: API_TIMEOUT_MS })));
  }
  private get options() { return { headers: this.pos.authHeaders() }; }

  /** 今天（每週項目為本週）的完成狀況。 */
  board(): Promise<BoardRow[]> { return this.wait(this.http.get<BoardRow[]>('/api/checklist', this.options)); }
  check(body: RecordCreate): Promise<ChecklistRecord> {
    return this.wait(this.http.post<ChecklistRecord>('/api/checklist/records', body, this.options));
  }
  uncheck(recordId: number): Promise<unknown> {
    return this.wait(this.http.delete(`/api/checklist/records/${recordId}`, this.options));
  }

  items(includeInactive = true): Promise<ChecklistItem[]> {
    return this.wait(this.http.get<ChecklistItem[]>('/api/checklist/items', { ...this.options, params: { includeInactive } }));
  }
  createItem(body: ItemCreate): Promise<ChecklistItem> {
    return this.wait(this.http.post<ChecklistItem>('/api/checklist/items', body, this.options));
  }
  updateItem(id: number, body: ItemUpdate): Promise<ChecklistItem> {
    return this.wait(this.http.put<ChecklistItem>(`/api/checklist/items/${id}`, body, this.options));
  }

  /**
   * 目前在班的人（POS 帳號打勾時選人、個人帳號判斷自己在不在班）。
   * 用 /today 取：/on-duty 只限 POS 帳號，/today 所有登入帳號都能看到在班的人。
   */
  async onDuty(): Promise<ClockRecord[]> {
    const today = await this.wait(this.http.get<ClockToday>('/api/shift-staff/today', this.options));
    return today.records.filter(r => r.onDuty);
  }
}
