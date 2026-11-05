import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, Observable, timeout } from 'rxjs';
import { ClockRecord, ClockToday, ClockUpdate } from '../models/time-clock';
import { API_TIMEOUT_MS, PosApiService } from './pos-api.service';

/** 打卡 API：登入憑證沿用 PosApiService。員工清單請用 ScheduleApiService.staff()。 */
@Injectable({ providedIn: 'root' })
export class TimeClockApiService {
  private readonly http = inject(HttpClient);
  private readonly pos = inject(PosApiService);

  private wait<T>(request: Observable<T>): Promise<T> {
    return firstValueFrom(request.pipe(timeout({ first: API_TIMEOUT_MS })));
  }
  private get options() { return { headers: this.pos.authHeaders() }; }

  today(): Promise<ClockToday> { return this.wait(this.http.get<ClockToday>('/api/shift-staff/today', this.options)); }
  /** 自己某個月的紀錄；month 格式 YYYY-MM。 */
  mine(month: string): Promise<ClockRecord[]> {
    return this.wait(this.http.get<ClockRecord[]>('/api/shift-staff/mine', { ...this.options, params: { month } }));
  }
  /** 某營業日的紀錄：店長全部，其他人只有自己的。 */
  list(date: string): Promise<ClockRecord[]> {
    return this.wait(this.http.get<ClockRecord[]>('/api/shift-staff', { ...this.options, params: { date } }));
  }
  clockIn(staffId: number): Promise<ClockRecord> {
    return this.wait(this.http.post<ClockRecord>('/api/shift-staff/clock-in', { staffId }, this.options));
  }
  clockOut(staffId: number): Promise<ClockRecord> {
    return this.wait(this.http.post<ClockRecord>('/api/shift-staff/clock-out', { staffId }, this.options));
  }
  update(id: number, body: ClockUpdate): Promise<ClockRecord> {
    return this.wait(this.http.put<ClockRecord>(`/api/shift-staff/${id}`, body, this.options));
  }
  remove(id: number): Promise<unknown> {
    return this.wait(this.http.delete(`/api/shift-staff/${id}`, this.options));
  }
}
