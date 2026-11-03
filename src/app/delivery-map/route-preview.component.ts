import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild, inject } from '@angular/core';
import { DeliveryRoute } from '../models/pos';
import { HereContext, HereMapService, markerIcon } from '../services/here-map.service';
import { errorMessage } from '../services/pos-api.service';

/** 需求 2：靜態路線圖。不建立 Behavior、不加 UI 控制項，並關閉滑鼠事件，所以不能縮放或拖曳。 */
@Component({
  selector: 'app-route-preview',
  standalone: true,
  template: `
    <div class="route-map" #mapEl aria-label="外送路線地圖"></div>
    @if (error) { <p class="map-message" role="alert">{{ error }}</p> }
    @else if (!ready) { <p class="map-message">地圖載入中…</p> }
  `,
  styles: [`
    :host { position: relative; display: block; height: 240px; border-radius: var(--radius-md); overflow: hidden;
            border: 1px solid var(--border-color); background: var(--bg-card-sub); }
    .route-map { position: absolute; inset: 0; pointer-events: none; }
    .map-message { position: absolute; inset: 0; margin: 0; display: grid; place-items: center; padding: 16px;
                   font-size: 12px; color: var(--text-muted); text-align: center; }
  `]
})
export class RoutePreviewComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) route!: DeliveryRoute;
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;
  private readonly here = inject(HereMapService);

  private ctx?: HereContext;
  private map?: any;
  private group?: any;
  private resize?: ResizeObserver;
  private destroyed = false;
  ready = false;
  error = '';

  async ngAfterViewInit(): Promise<void> {
    try {
      const ctx = await this.here.load();
      if (this.destroyed) return;
      this.ctx = ctx;
      this.map = new ctx.H.Map(this.mapEl.nativeElement, ctx.layers.vector.normal.map, { pixelRatio: window.devicePixelRatio || 1 });
      this.map.getViewPort().setPadding(36, 36, 36, 36);
      this.resize = new ResizeObserver(() => this.map?.getViewPort().resize());
      this.resize.observe(this.mapEl.nativeElement);
      this.draw();
      this.ready = true;
    } catch (error) {
      this.error = errorMessage(error);
    }
  }

  ngOnChanges(): void { if (this.map) this.draw(); }

  private draw(): void {
    const ctx = this.ctx!; const H = ctx.H;
    if (this.group) this.map.removeObject(this.group);
    this.group = new H.map.Group();
    for (const polyline of this.route.polylines) {
      this.group.addObject(new H.map.Polyline(H.geo.LineString.fromFlexiblePolyline(polyline),
        { style: { lineWidth: 6, strokeColor: '#28674e' } }));
    }
    this.group.addObject(new H.map.Marker(ctx.store, { icon: markerIcon(H, 'store') }));
    this.group.addObject(new H.map.Marker({ lat: this.route.lat, lng: this.route.lng }, { icon: markerIcon(H, 'destination') }));
    this.map.addObject(this.group);
    this.map.getViewModel().setLookAtData({ bounds: this.group.getBoundingBox() }, false);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resize?.disconnect();
    this.map?.dispose();
  }
}
