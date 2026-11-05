import { Component, Input } from '@angular/core';

/** 本機 Lucide SVG sprite；裝飾圖示的操作名稱由所在按鈕提供。 */
@Component({
  selector: 'app-icon',
  template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use [attr.href]="'/icons/lucide.svg#' + name" /></svg>`,
  styles: [`:host { display: inline-flex; width: 20px; height: 20px; flex: 0 0 auto; vertical-align: middle; } svg { width: 100%; height: 100%; }`]
})
export class IconComponent {
  @Input({ required: true }) name!: 'leaf' | 'layout-grid' | 'receipt-text' | 'search' | 'plus' | 'shopping-bag' | 'log-in' | 'check' | 'arrow-right' | 'clipboard-list';
}
