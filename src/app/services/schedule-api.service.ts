import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, Observable, timeout } from 'rxjs';
import { EntrySave, SaveResult, ScheduleTag, ScheduleWeek, ShiftTemplate, StaffOption, TagSave, TagUpdate, TemplateSave, TemplateUpdate } from '../models/schedule';
import { API_TIMEOUT_MS, PosApiService } from './pos-api.service';

/** 排班 API：登入憑證沿用 PosApiService，元件不直接寫網址。 */
@Injectable({ providedIn: 'root' })
export class ScheduleApiService {
  private readonly http = inject(HttpClient);
  private readonly pos = inject(PosApiService);

  private wait<T>(request: Observable<T>): Promise<T> {
    return firstValueFrom(request.pipe(timeout({ first: API_TIMEOUT_MS })));
  }
  private get options() { return { headers: this.pos.authHeaders() }; }

  staff(): Promise<StaffOption[]> { return this.wait(this.http.get<StaffOption[]>('/api/staff', this.options)); }

  /** 排班標籤；includeInactive 為 true 時含停用的（舊班表顯示用）。 */
  tags(includeInactive = false): Promise<ScheduleTag[]> {
    return this.wait(this.http.get<ScheduleTag[]>('/api/schedule/tags', { ...this.options, params: { includeInactive } }));
  }
  createTag(body: TagSave): Promise<ScheduleTag> {
    return this.wait(this.http.post<ScheduleTag>('/api/schedule/tags', body, this.options));
  }
  updateTag(id: number, body: TagUpdate): Promise<ScheduleTag> {
    return this.wait(this.http.put<ScheduleTag>(`/api/schedule/tags/${id}`, body, this.options));
  }

  templates(includeInactive = false): Promise<ShiftTemplate[]> {
    return this.wait(this.http.get<ShiftTemplate[]>('/api/schedule/templates',
      { ...this.options, params: { includeInactive } }));
  }
  createTemplate(body: TemplateSave): Promise<ShiftTemplate> {
    return this.wait(this.http.post<ShiftTemplate>('/api/schedule/templates', body, this.options));
  }
  updateTemplate(id: number, body: TemplateUpdate): Promise<ShiftTemplate> {
    return this.wait(this.http.put<ShiftTemplate>(`/api/schedule/templates/${id}`, body, this.options));
  }

  /** date 可以是該週任一天。 */
  week(date: string): Promise<ScheduleWeek> {
    return this.wait(this.http.get<ScheduleWeek>('/api/schedule/week', { ...this.options, params: { date } }));
  }
  createEntry(body: EntrySave): Promise<SaveResult> {
    return this.wait(this.http.post<SaveResult>('/api/schedule/entries', body, this.options));
  }
  updateEntry(id: number, body: EntrySave): Promise<SaveResult> {
    return this.wait(this.http.put<SaveResult>(`/api/schedule/entries/${id}`, body, this.options));
  }
  deleteEntry(id: number): Promise<unknown> {
    return this.wait(this.http.delete(`/api/schedule/entries/${id}`, this.options));
  }
  publish(date: string): Promise<ScheduleWeek> {
    return this.wait(this.http.post<ScheduleWeek>('/api/schedule/week/publish', null, { ...this.options, params: { date } }));
  }
  copyPrevious(date: string): Promise<ScheduleWeek> {
    return this.wait(this.http.post<ScheduleWeek>('/api/schedule/week/copy-previous', null, { ...this.options, params: { date } }));
  }
}
