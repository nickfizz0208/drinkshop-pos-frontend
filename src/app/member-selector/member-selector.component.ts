import { Component, EventEmitter, OnDestroy, Output, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Delivery, DeliveryRoute, DeliverySelection, Member, distanceText } from '../models/pos';
import { ModalComponent } from '../shared/modal.component';
import { MemberService } from '../services/member.service';
import { PosApiService, errorMessage } from '../services/pos-api.service';
import { RoutePreviewComponent } from '../delivery-map/route-preview.component';
import { DestinationPickerComponent, PickedLocation } from '../delivery-map/destination-picker.component';

@Component({
  selector: 'app-member-selector',
  imports: [FormsModule, ModalComponent, RoutePreviewComponent, DestinationPickerComponent],
  templateUrl: './member-selector.component.html',
  styleUrl: './member-selector.component.scss'
})
export class MemberSelectorComponent implements OnDestroy {
  private readonly members = inject(MemberService);
  private readonly api = inject(PosApiService);
  @Output() selected = new EventEmitter<DeliverySelection>();
  @Output() dismissed = new EventEmitter<void>();

  readonly minDigits = 3;
  readonly distanceText = distanceText;
  phone = '';
  results: Member[] = [];
  loading = false;
  searched = false;
  error = '';
  private timer?: ReturnType<typeof setTimeout>;
  private searchToken = 0;

  // 新增會員（查無會員時直接建立，建好就進入路線預覽）
  /** 建立會員需要完整電話；與後端規則相同，但至少 8 碼才提示建立，避免拿部分號碼建會員。 */
  readonly minCreateDigits = 8;
  newMember = { phone: '', name: '', address: '', note: '' };
  creating = false;
  createError = '';
  createConflict = false;

  // 第二步：路線預覽
  step: 'search' | 'create' | 'route' = 'search';
  member: Member | null = null;
  route: DeliveryRoute | null = null;
  /** 有值代表使用「只用於這張單」的臨時位置。 */
  addressNote = '';
  routeLoading = false;
  routeError = '';
  pickerOpen = false;
  pickerHint = '';
  saving = false;
  private routeToken = 0;

  onPhoneInput(input: HTMLInputElement): void {
    const value = input.value.replace(/\D/g, '');
    input.value = value;          // 直接改畫面上的值，打 - 會馬上消失
    this.phone = value;
    clearTimeout(this.timer);
    const token = ++this.searchToken;
    this.error = '';
    if (this.phone.length < this.minDigits) {
      this.results = []; this.searched = false; this.loading = false;
      return;
    }
    this.loading = true;
    // 停止輸入 300ms 後才搜尋，避免每按一個鍵就打一次 API。
    this.timer = setTimeout(() => void this.search(this.phone, token), 300);
  }

  private async search(digits: string, token: number): Promise<void> {
    try {
      const rows = await this.members.search(digits);
      if (token === this.searchToken) { this.results = rows; this.searched = true; }
    } catch (error) {
      if (token === this.searchToken) { this.results = []; this.error = errorMessage(error); }
    } finally {
      if (token === this.searchToken) this.loading = false;
    }
  }

  /** 按 Enter 時，只有剛好一筆結果才直接選取，避免選錯人。 */
  pickOnlyResult(): void {
    if (!this.loading && this.results.length === 1) this.pick(this.results[0]);
  }

  /** 開啟新增會員表單，帶入剛剛輸入的電話。 */
  startCreate(): void {
    this.newMember = { phone: this.phone, name: '', address: '', note: '' };
    this.createError = ''; this.createConflict = false;
    this.step = 'create';
  }

  cancelCreate(): void {
    if (this.creating) return;
    this.step = 'search';
  }

  onNewPhoneInput(input: HTMLInputElement): void {
    const value = input.value.replace(/\D/g, '');
    input.value = value;
    this.newMember.phone = value;
    this.createError = ''; this.createConflict = false;
  }

  get canCreate(): boolean {
    return /^\d{8,20}$/.test(this.newMember.phone) && this.newMember.name.trim().length > 0 && !this.creating;
  }

  async create(): Promise<void> {
    if (!this.canCreate) return;
    this.creating = true; this.createError = ''; this.createConflict = false;
    try {
      const member = await this.api.createMember({
        phone: this.newMember.phone,
        name: this.newMember.name.trim(),
        address: this.newMember.address.trim() || null,
        note: this.newMember.note.trim() || null
      });
      this.pick(member); // 建好直接算路線
    } catch (error) {
      this.createError = errorMessage(error);
      this.createConflict = error instanceof HttpErrorResponse && error.status === 409;
    } finally {
      this.creating = false;
    }
  }

  /** 電話已是會員（409）時，回到搜尋並帶入這支電話。 */
  searchExisting(): void {
    this.step = 'search';
    this.phone = this.newMember.phone;
    this.error = '';
    this.loading = true;
    const token = ++this.searchToken;
    void this.search(this.phone, token);
  }

  /** 選了會員 → 進入路線預覽。 */
  pick(member: Member): void {
    this.member = member;
    this.step = 'route';
    void this.loadRoute();
  }

  back(): void {
    this.routeToken++;
    this.step = 'search'; this.member = null; this.route = null; this.addressNote = '';
    this.routeError = ''; this.routeLoading = false;
  }

  private async loadRoute(): Promise<void> {
    const member = this.member!;
    const token = ++this.routeToken;
    this.routeLoading = true; this.routeError = ''; this.route = null; this.addressNote = '';
    try {
      const route = await this.api.memberRoute(member.phone);
      if (token !== this.routeToken) return;
      this.route = route;
      if (route.needsReview) this.openPicker('地址只比對到大概位置，請移動地圖確認送達位置。');
    } catch (error) {
      if (token === this.routeToken) this.routeError = errorMessage(error);
    } finally {
      if (token === this.routeToken) this.routeLoading = false;
    }
  }

  openPicker(hint = ''): void { this.pickerHint = hint; this.pickerOpen = true; }

  /** 調整位置後：「更新會員位置」寫回會員（MANUAL）；「只用於這張單」只算這次的路線。 */
  async onPicked(picked: PickedLocation): Promise<void> {
    const member = this.member!;
    const token = ++this.routeToken;
    this.saving = true; this.routeError = '';
    try {
      if (picked.mode === 'MEMBER') {
        const updated = await this.api.updateMember(member.phone, {
          name: member.name, address: member.address ?? null, lat: picked.lat, lng: picked.lng, note: member.note ?? null
        });
        if (token !== this.routeToken) return;
        this.member = updated;
        const route = await this.api.memberRoute(member.phone);
        if (token !== this.routeToken) return;
        this.route = route; this.addressNote = '';
      } else {
        const route = await this.api.routeTo(picked.lat, picked.lng);
        if (token !== this.routeToken) return;
        this.route = { ...route, label: picked.label };
        this.addressNote = `送達位置：${picked.label}（${picked.lat.toFixed(6)}, ${picked.lng.toFixed(6)}）`.slice(0, 255);
      }
      this.pickerOpen = false;
    } catch (error) {
      if (token === this.routeToken) { this.routeError = errorMessage(error); this.pickerOpen = false; }
    } finally {
      if (token === this.routeToken) this.saving = false;
    }
  }

  /** 確認外送；地圖服務失敗時也可以不帶路線直接選取，不擋營業。 */
  confirm(): void {
    if (!this.member) return;
    const delivery: Delivery | null = this.route
      ? { lat: this.route.lat, lng: this.route.lng, distanceM: this.route.distanceM, ...(this.addressNote ? { addressNote: this.addressNote } : {}) }
      : null;
    this.selected.emit({ member: this.member, delivery });
  }

  get pickerDestination(): { lat: number; lng: number } | null {
    if (this.route) return { lat: this.route.lat, lng: this.route.lng };
    return this.member?.lat != null && this.member.lng != null ? { lat: this.member.lat, lng: this.member.lng } : null;
  }

  ngOnDestroy(): void { clearTimeout(this.timer); this.searchToken++; this.routeToken++; }
}
