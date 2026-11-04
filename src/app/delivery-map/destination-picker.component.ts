import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, inject } from '@angular/core';
import { ModalComponent } from '../shared/modal.component';
import { HereMapService, markerIcon } from '../services/here-map.service';
import { PosApiService, errorMessage } from '../services/pos-api.service';

export type PickMode = 'MEMBER' | 'NOTE';
export interface PickedLocation { lat: number; lng: number; label: string; mode: PickMode; }

/**
 * 需求 3：可縮放、拖曳的地圖，以目前終點為中心開啟（沒有終點時以門市為中心）。
 * 畫面中央固定大頭針，「移動地圖 = 移動送達位置」，點地圖也會移過去；停下來時由後端反查地址。
 */
@Component({
  selector: 'app-destination-picker',
  standalone: true,
  imports: [ModalComponent],
  template: `
    <app-modal title="調整送達位置" subtitle="DELIVERY LOCATION" [busy]="busy" (dismissed)="dismissed.emit()">
      <div class="modal-body picker-body">
        @if (hint) { <p class="alert warning picker-hint">{{ hint }}</p> }
        <div class="picker-map">
          <div class="picker-canvas" #mapEl></div>
          <svg class="picker-pin" viewBox="0 0 24 36" aria-hidden="true">
            <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#b34439"/>
            <circle cx="12" cy="12" r="4.5" fill="white"/>
          </svg>
          @if (error) { <p class="picker-message" role="alert">{{ error }}</p> }
          @else if (!ready) { <p class="picker-message">地圖載入中…</p> }
        </div>
        <p class="picker-address" aria-live="polite">{{ resolving ? '取得地址中…' : (label || '移動地圖，讓大頭針對準送達位置') }}</p>
      </div>
      <div class="modal-footer picker-footer">
        <button type="button" class="button secondary" [disabled]="busy" (click)="dismissed.emit()">取消</button>
        <button type="button" class="button secondary" [disabled]="!ready || busy" (click)="confirm('NOTE')">只用於這張單</button>
        @if (canUpdateMember) {
          <button type="button" class="button primary" [disabled]="!ready || busy" (click)="confirm('MEMBER')">更新會員位置</button>
        }
      </div>
    </app-modal>
  `,
  styles: [`
    .picker-body { display: grid; gap: 10px; }
    .picker-hint { margin: 0; }
    .picker-map { position: relative; height: min(420px, 55dvh); border-radius: var(--radius-md); overflow: hidden;
                  border: 1px solid var(--border-color); background: var(--bg-card-sub); }
    .picker-canvas { position: absolute; inset: 0; }
    .picker-pin { position: absolute; left: 50%; top: 50%; width: 28px; height: 42px; transform: translate(-50%, -100%);
                  pointer-events: none; filter: drop-shadow(0 2px 3px #0003); }
    .picker-message { position: absolute; inset: 0; margin: 0; display: grid; place-items: center; padding: 16px;
                      background: var(--bg-card-sub); font-size: 12px; color: var(--text-muted); text-align: center; }
    .picker-address { margin: 0; font-size: 13px; color: var(--text-main); min-height: 1.6em; overflow: hidden;
                      text-overflow: ellipsis; white-space: nowrap; }
    .picker-footer { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
  `]
})
export class DestinationPickerComponent implements AfterViewInit, OnDestroy {
  /** 目前的送達位置；null 時以門市為中心。 */
  @Input() destination: { lat: number; lng: number } | null = null;
  @Input() label = '';
  @Input() hint = '';
  /** 沒有會員資料可更新時（理論上不會）隱藏「更新會員位置」。 */
  @Input() canUpdateMember = true;
  @Input() busy = false;
  @Output() confirmed = new EventEmitter<PickedLocation>();
  @Output() dismissed = new EventEmitter<void>();
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  private readonly here = inject(HereMapService);
  private readonly api = inject(PosApiService);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private map?: any;
  private resize?: ResizeObserver;
  private center = { lat: 0, lng: 0 };
  private reverseToken = 0;
  private destroyed = false;
  ready = false;
  resolving = false;
  error = '';

  async ngAfterViewInit(): Promise<void> {
    try {
      const ctx = await this.here.load();
      if (this.destroyed) return;
      const H = ctx.H;
      this.center = this.destination ?? ctx.store;
      this.map = new H.Map(this.mapEl.nativeElement, ctx.layers.vector.normal.map, {
        center: this.center, zoom: 17, pixelRatio: window.devicePixelRatio || 1
      });
      new H.mapevents.Behavior(new H.mapevents.MapEvents(this.map)); // 可拖曳、縮放
      H.ui.UI.createDefault(this.map, ctx.layers, 'zh-CN'); // 縮放按鈕等控制項的語言
      this.map.addObject(new H.map.Marker(ctx.store, { icon: markerIcon(H, 'store') })); // 門市當參考
      this.map.addEventListener('mapviewchangeend', () => this.onMoved());
      this.map.addEventListener('tap', (event: { currentPointer: { viewportX: number; viewportY: number } }) => {
        const geo = this.map.screenToGeo(event.currentPointer.viewportX, event.currentPointer.viewportY);
        if (geo) this.map.setCenter(geo, true);
      });
      this.resize = new ResizeObserver(() => this.map?.getViewPort().resize());
      this.resize.observe(this.mapEl.nativeElement);
      this.ready = true;
      if (!this.destination || !this.label) void this.resolve(this.center);
    } catch (error) {
      this.error = errorMessage(error);
    }
  }

  private onMoved(): void {
    const c = this.map.getCenter();
    if (Math.abs(c.lat - this.center.lat) < 1e-6 && Math.abs(c.lng - this.center.lng) < 1e-6) return; // 只縮放
    this.center = { lat: c.lat, lng: c.lng };
    void this.resolve(this.center);
  }

  private async resolve(point: { lat: number; lng: number }): Promise<void> {
    const token = ++this.reverseToken;
    this.resolving = true;
    try {
      const { lat, lng } = rounded(point);
      const result = await this.api.reverseGeocode(lat, lng);
      if (token === this.reverseToken) this.label = result.label ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } catch {
      if (token === this.reverseToken) this.label = `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
    } finally {
      if (token === this.reverseToken) this.resolving = false;
    }
  }

  confirm(mode: PickMode): void {
    this.confirmed.emit({ ...rounded(this.center), label: this.label, mode });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.reverseToken++;
    this.resize?.disconnect();
    this.map?.dispose();
  }
}

/** 後端座標最多 7 位小數。 */
function rounded(point: { lat: number; lng: number }): { lat: number; lng: number } {
  return { lat: Number(point.lat.toFixed(7)), lng: Number(point.lng.toFixed(7)) };
}
