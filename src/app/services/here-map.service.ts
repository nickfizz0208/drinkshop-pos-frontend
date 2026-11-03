import { Injectable, inject } from '@angular/core';
import { StoreLocation } from '../models/pos';
import { PosApiService } from './pos-api.service';

/** HERE Maps API for JavaScript 3.1 由官方 CDN 動態載入：不需 npm 套件，也不佔初始 bundle。 */
const HERE_CDN = 'https://js.api.here.com/v3/3.1/';
const HERE_SCRIPTS = ['mapsjs-core.js', 'mapsjs-service.js', 'mapsjs-mapevents.js', 'mapsjs-ui.js'];

/* eslint-disable @typescript-eslint/no-explicit-any -- HERE 由 CDN 載入，沒有型別定義 */
export interface HereContext {
  H: any;
  platform: any;
  layers: any;
  store: StoreLocation;
}

@Injectable({ providedIn: 'root' })
export class HereMapService {
  private readonly api = inject(PosApiService);
  private ready?: Promise<HereContext>;

  /** 第一次呼叫時載入 HERE 並用 /api/config 的地圖 key 建立 Platform；之後共用同一份。 */
  load(): Promise<HereContext> {
    this.ready ??= this.init().catch(error => { this.ready = undefined; throw error; });
    return this.ready;
  }

  /** 登出時呼叫，下次登入重新取得 key。 */
  reset(): void { this.ready = undefined; }

  private async init(): Promise<HereContext> {
    const config = await this.api.config();
    if (!config.hereMapKey) throw new Error('尚未設定 HERE 地圖 key，請在後端 .pos-local.properties 設定 HERE_MAP_KEY。');
    loadStyle(HERE_CDN + 'mapsjs-ui.css');
    for (const file of HERE_SCRIPTS) await loadScript(HERE_CDN + file); // 必須依序載入
    const H = (window as any).H;
    if (!H?.service) throw new Error('地圖程式載入失敗，請確認網路連線。');
    const platform = new H.service.Platform({ apikey: config.hereMapKey });
    // lg：地圖標籤語言（ISO 639-1），不指定時預設英文
    return { H, platform, layers: platform.createDefaultLayers({ lg: 'zh' }), store: config.store };
  }
}

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing?.dataset['loaded'] === 'true') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => { script.dataset['loaded'] = 'true'; resolve(); }, { once: true });
    script.addEventListener('error', () => { script.remove(); reject(new Error('地圖程式載入失敗，請確認網路連線。')); }, { once: true });
    if (!existing) { script.src = src; script.async = false; document.head.appendChild(script); }
  });
}

function loadStyle(href: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = href;
  document.head.appendChild(link);
}

/** 起點（門市）與終點的標記圖示。 */
export function markerIcon(H: any, kind: 'store' | 'destination'): any {
  const svg = kind === 'store'
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><circle cx="11" cy="11" r="8" fill="#28674e" stroke="white" stroke-width="3"/></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="38" viewBox="0 0 24 36"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#b34439"/><circle cx="12" cy="12" r="4.5" fill="white"/></svg>';
  return kind === 'store'
    ? new H.map.Icon(svg, { anchor: { x: 11, y: 11 } })
    : new H.map.Icon(svg, { anchor: { x: 13, y: 38 } });
}
