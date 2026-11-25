import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../../shared/modal.component';
import { PosApiService, errorMessage } from '../../services/pos-api.service';
import { AUDIT_LABELS, AdminStore, AdminStoreDetail, CityOption, GeocodeResult, StoreForm } from '../../models/store-admin';

/** 區域順序（和後端 StoreRegion 一致）。 */
const REGIONS = ['北部', '中部', '南部', '東部', '離島', '未設定'];

/**
 * 總部分店管理（055，只限 HQ）：分店清單、新增、修改、停用／重新啟用、修改紀錄。
 * 分店不能刪除；代碼建立後不能改。停用的分店帳號不能登入，報表照樣看得到。
 * 地址可以用 HERE 查座標（外送起點），查到的結果只帶進表單，按儲存才會存檔。
 */
@Component({
  selector: 'app-store-admin',
  imports: [FormsModule, ModalComponent],
  templateUrl: './store-admin.component.html',
  styleUrl: './store-admin.component.scss'
})
export class StoreAdminComponent implements OnInit {
  private readonly api = inject(PosApiService);
  readonly auditLabels = AUDIT_LABELS;
  readonly regions = REGIONS;

  stores: AdminStore[] = [];
  cities: CityOption[] = [];
  loading = false;
  error = '';

  // 篩選
  keyword = '';
  regionFilter: string | null = null;
  showInactive = true;

  // 分店資料視窗
  detail: AdminStoreDetail | null = null;
  detailLoading = false;
  detailError = '';
  /** 停用確認：填原因 */
  deactivating = false;
  deactivateReason = '';
  toggling = false;

  // 新增／修改表單
  formMode: 'create' | 'edit' | null = null;
  form: StoreForm = this.emptyForm();
  formError = '';
  saving = false;
  geocoding = false;
  geocodeResult: GeocodeResult | null = null;
  geocodeError = '';

  ngOnInit(): void {
    void this.load();
    void this.loadCities();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try { this.stores = await this.api.adminStores(); }
    catch (err) { this.error = errorMessage(err); }
    finally { this.loading = false; }
  }

  private async loadCities(): Promise<void> {
    try { this.cities = await this.api.adminStoreCities(); }
    catch { this.cities = []; }
  }

  // ---- 清單 ----

  get filtered(): AdminStore[] {
    const kw = this.keyword.trim().toLowerCase();
    return this.stores.filter(s =>
      (this.showInactive || s.active)
      && (this.regionFilter === null || s.region === this.regionFilter)
      && (!kw || s.name.toLowerCase().includes(kw) || s.code.toLowerCase().includes(kw)
        || (s.city ?? '').includes(kw) || (s.address ?? '').toLowerCase().includes(kw)));
  }

  /** 依區域分組（清單已由後端照區域、縣市排好）。 */
  get groups(): { region: string; stores: AdminStore[] }[] {
    return REGIONS
      .map(region => ({ region, stores: this.filtered.filter(s => s.region === region) }))
      .filter(g => g.stores.length > 0);
  }

  get activeCount(): number { return this.stores.filter(s => s.active).length; }
  get openTodayCount(): number { return this.stores.filter(s => s.active && s.todayShift === 'OPEN').length; }
  get missingCoordsCount(): number { return this.stores.filter(s => s.active && s.lat === null).length; }

  shiftLabel(s: AdminStore): string {
    if (!s.active) return '停用';
    if (s.todayShift === 'OPEN') return '營業中';
    if (s.todayShift === 'CLOSED') return '已收班';
    return '未開班';
  }

  /** 縣市選單依區域分組。 */
  get cityGroups(): { region: string; cities: string[] }[] {
    return REGIONS.filter(r => r !== '未設定')
      .map(region => ({ region, cities: this.cities.filter(c => c.region === region).map(c => c.city) }))
      .filter(g => g.cities.length > 0);
  }

  // ---- 分店資料 ----

  async openDetail(store: AdminStore): Promise<void> {
    this.detail = { store, logs: [] };
    this.deactivating = false;
    this.deactivateReason = '';
    this.detailError = '';
    this.detailLoading = true;
    try { this.detail = await this.api.adminStore(store.storeId); }
    catch (err) { this.detailError = errorMessage(err); }
    finally { this.detailLoading = false; }
  }

  closeDetail(): void {
    if (this.toggling) return;
    this.detail = null;
  }

  mapUrl(s: { lat: number | null; lng: number | null }): string | null {
    return s.lat === null || s.lng === null ? null : `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`;
  }

  async confirmDeactivate(): Promise<void> {
    if (!this.detail) return;
    if (!this.deactivateReason.trim()) { this.detailError = '停用分店請寫原因'; return; }
    await this.setActive(false, this.deactivateReason.trim());
  }

  async reactivate(): Promise<void> { await this.setActive(true, ''); }

  private async setActive(active: boolean, reason: string): Promise<void> {
    if (!this.detail || this.toggling) return;
    this.toggling = true;
    this.detailError = '';
    try {
      this.detail = await this.api.setAdminStoreActive(this.detail.store.storeId, active, reason);
      this.deactivating = false;
      this.deactivateReason = '';
      this.replace(this.detail.store);
    } catch (err) {
      this.detailError = errorMessage(err);
    } finally {
      this.toggling = false;
    }
  }

  // ---- 新增／修改 ----

  private emptyForm(): StoreForm {
    return { code: '', name: '', city: '', address: '', phone: '', lat: null, lng: null };
  }

  openCreate(): void {
    this.form = this.emptyForm();
    this.formMode = 'create';
    this.resetFormState();
  }

  openEdit(): void {
    if (!this.detail) return;
    const s = this.detail.store;
    this.form = { name: s.name, city: s.city ?? '', address: s.address ?? '', phone: s.phone ?? '', lat: s.lat, lng: s.lng };
    this.formMode = 'edit';
    this.resetFormState();
  }

  private resetFormState(): void {
    this.formError = '';
    this.geocodeResult = null;
    this.geocodeError = '';
  }

  closeForm(): void {
    if (this.saving) return;
    this.formMode = null;
  }

  /** 用地址向 HERE 查座標，帶進表單（還沒存檔）。 */
  async geocode(): Promise<void> {
    const address = (this.form.address ?? '').trim();
    if (!address) { this.geocodeError = '請先填地址'; return; }
    this.geocoding = true;
    this.geocodeError = '';
    this.geocodeResult = null;
    try {
      const result = await this.api.geocodeStoreAddress(address);
      this.geocodeResult = result;
      this.form.lat = Number(result.lat);
      this.form.lng = Number(result.lng);
    } catch (err) {
      this.geocodeError = errorMessage(err);
    } finally {
      this.geocoding = false;
    }
  }

  clearCoords(): void {
    this.form.lat = null;
    this.form.lng = null;
    this.geocodeResult = null;
  }

  /** 前端先擋明顯的錯，其餘以後端為準。 */
  private validate(): string {
    if (this.formMode === 'create' && !/^[A-Za-z0-9]{2,10}$/.test((this.form.code ?? '').trim())) return '代碼是 2～10 碼英文或數字';
    if (!this.form.name.trim()) return '請填分店名稱';
    if (!this.form.city) return '請選縣市';
    const hasLat = this.form.lat !== null && this.form.lat !== undefined && String(this.form.lat) !== '';
    const hasLng = this.form.lng !== null && this.form.lng !== undefined && String(this.form.lng) !== '';
    if (hasLat !== hasLng) return '緯度、經度要一起填，或一起留空';
    return '';
  }

  private payload(): StoreForm {
    const num = (v: number | null) => (v === null || v === undefined || String(v) === '' ? null : Number(v));
    const text = (v: string | null) => (v ?? '').trim() || null;
    const body: StoreForm = {
      name: this.form.name.trim(), city: this.form.city, address: text(this.form.address), phone: text(this.form.phone),
      lat: num(this.form.lat), lng: num(this.form.lng)
    };
    if (this.formMode === 'create') body.code = (this.form.code ?? '').trim().toUpperCase();
    return body;
  }

  async save(): Promise<void> {
    if (this.saving) return;
    this.formError = this.validate();
    if (this.formError) return;
    this.saving = true;
    try {
      const result = this.formMode === 'create'
        ? await this.api.createAdminStore(this.payload())
        : await this.api.updateAdminStore(this.detail!.store.storeId, this.payload());
      this.formMode = null;
      // 縣市可能改了（排序會變），重新讀清單
      await this.load();
      this.detail = result;
    } catch (err) {
      this.formError = errorMessage(err);
    } finally {
      this.saving = false;
    }
  }

  private replace(store: AdminStore): void {
    this.stores = this.stores.map(s => (s.storeId === store.storeId ? store : s));
  }
}
