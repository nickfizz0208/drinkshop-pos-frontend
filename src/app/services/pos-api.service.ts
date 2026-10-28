import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, Observable, timeout, TimeoutError } from 'rxjs';
import { CancelRequest, CreateOrder, ItemStatus, Menu, Order, OrderSummary, Payment, Rule, Staff } from '../models/pos';

export const API_TIMEOUT_MS = 15000;

@Injectable({ providedIn: 'root' })
export class PosApiService {
  private readonly http = inject(HttpClient);
  private credentials = '';
  readonly staff = signal<Staff | null>(null);

  async login(username: string, password: string): Promise<void> {
    // Keep Basic credentials in memory only; never copy the old JWT/localStorage logic.
    const bytes = new TextEncoder().encode(`${username}:${password}`);
    const credentials = 'Basic ' + btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
    const staff = await this.wait(this.http.get<Staff>('/api/auth/me', { headers: new HttpHeaders({ Authorization: credentials }) }));
    this.credentials = credentials;
    this.staff.set(staff);
  }
  logout(): void { this.credentials = ''; this.staff.set(null); }
  private get headers(): HttpHeaders { return new HttpHeaders({ Authorization: this.credentials }); }
  private wait<T>(request: Observable<T>, milliseconds = API_TIMEOUT_MS): Promise<T> {
    return firstValueFrom(request.pipe(timeout({ first: milliseconds })));
  }
  menu(): Promise<Menu> { return this.wait(this.http.get<Menu>('/api/menu', { headers: this.headers })); }
  rules(): Promise<Rule[]> { return this.wait(this.http.get<Rule[]>('/api/rules', { headers: this.headers })); }
  orders(date: string): Promise<OrderSummary[]> { return this.wait(this.http.get<OrderSummary[]>('/api/orders', { headers: this.headers, params: { date } })); }
  order(id: number): Promise<Order> { return this.wait(this.http.get<Order>(`/api/orders/${id}`, { headers: this.headers })); }
  create(request: CreateOrder): Promise<Order> { return this.wait(this.http.post<Order>('/api/orders', request, { headers: this.headers })); }
  collect(id: number, payment: Payment, receivedCash?: number): Promise<Order> {
    return this.wait(this.http.post<Order>(`/api/orders/${id}/collect`, { payment, ...(receivedCash !== undefined ? { receivedCash } : {}) }, { headers: this.headers }));
  }
  status(id: number, itemId: number, status: ItemStatus): Promise<Order> {
    return this.wait(this.http.post<Order>(`/api/orders/${id}/items/${itemId}/status`, { status }, { headers: this.headers }));
  }
  statusAll(id: number, status: ItemStatus): Promise<Order> {
    return this.wait(this.http.post<Order>(`/api/orders/${id}/status`, { status }, { headers: this.headers }));
  }
  cancel(id: number, itemId: number | null, request: CancelRequest): Promise<Order> {
    const path = itemId === null ? `/api/orders/${id}/cancel` : `/api/orders/${id}/items/${itemId}/cancel`;
    return this.wait(this.http.post<Order>(path, request, { headers: this.headers }));
  }
  upload(id: number, itemId: number, file: File): Promise<{ photo_url: string }> {
    const data = new FormData(); data.append('file', file);
    return this.wait(this.http.post<{ photo_url: string }>(`/api/orders/${id}/items/${itemId}/photo`, data, { headers: this.headers }), 30000);
  }
  photo(id: number, itemId: number): Promise<Blob> {
    return this.wait(this.http.get(`/api/orders/${id}/items/${itemId}/photo`, { headers: this.headers, responseType: 'blob' }));
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof TimeoutError) return '等候回應逾時，請確認門市連線後重試。';
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return '門市連線暫時中斷，請稍後重試。';
    if (typeof error.error?.message === 'string') return error.error.message;
    if (error.status === 401) return '帳號或密碼不正確，或帳號已被停用。';
  }
  return error instanceof Error ? error.message : '操作未完成，請稍後再試。';
}
