import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Product } from '../models/pos';
import { DrinkTone, drinkTone } from '../drink-cup/drink-cup.component';

/**
 * 飲品卡片：點餐頁飲品列表裡的一張卡（背景是飲品配色，左邊杯子、右邊名稱）。
 * 只負責顯示與回報點擊；點了要做什麼（打開客製視窗）由點餐頁決定。
 *
 * 用法：<app-drink-card [drink]="drink" [name]="卡片名稱（可省略）" [disabled]="鎖住時為 true" (choose)="打開客製($event)" />
 */
@Component({
  selector: 'app-drink-card',
  imports: [],
  templateUrl: './drink-card.component.html',
  styleUrl: './drink-card.component.scss'
})
export class DrinkCardComponent {
  /** 要顯示的飲品。 */
  @Input({ required: true }) drink!: Product;
  /** 卡片上的名稱；組合卡（046）是「{加料}{飲料}」，沒給就用飲品名稱。 */
  @Input() name = '';
  /** 送單確認中或忙碌時鎖住，不能點。 */
  @Input() disabled = false;
  /** 點了這張卡，送出這杯飲品。 */
  @Output() readonly choose = new EventEmitter<Product>();

  /** 卡片背景的配色，跟杯子用同一個判斷。 */
  get tone(): DrinkTone { return drinkTone(this.drink); }

  /** 滑鼠在卡片上移動時，讓光點跟著游標（觸控不處理）。 */
  moveSpotlight(event: PointerEvent): void {
    if (event.pointerType === 'touch') return;
    const card = event.currentTarget as HTMLButtonElement;
    const bounds = card.getBoundingClientRect();
    card.style.setProperty('--spotlight-x', `${event.clientX - bounds.left}px`);
    card.style.setProperty('--spotlight-y', `${event.clientY - bounds.top}px`);
  }
}
