import { Component, Input, inject } from '@angular/core';
import { IconComponent } from './icon.component';
import { NumpadMode, NumpadService } from './numpad.service';

/**
 * 數字欄位旁的小鍵盤按鈕。用法（欄位外面包一層 .numpad-field，讓按鈕排在欄位右邊）：
 *   <span class="numpad-field"><input #cash type="number" ...><app-numpad-button [for]="cash" label="實收現金" quickCash [exact]="總額" /></span>
 * 最小值、最大值、小數位數直接讀欄位的 min、max、step；type="tel" 當作電話（保留開頭的 0）。
 * 按確定後把值寫回欄位並送出 input、change 事件，所以 ngModel 和 (input) 都會照常更新。
 */
@Component({
  selector: 'app-numpad-button',
  imports: [IconComponent],
  template: `<button type="button" class="numpad-trigger" [disabled]="for.disabled || for.readOnly"
    [attr.aria-label]="'用數字小鍵盤輸入' + label" [title]="'數字小鍵盤：' + label" (click)="open()"><app-icon name="calculator" /></button>`,
  styles: [`
    :host { display: contents; }
    .numpad-trigger { flex: 0 0 auto; display: inline-grid; place-items: center; width: 44px; height: 44px; border: 1px solid var(--field-border);
      border-radius: 10px; background: var(--bg-input); color: var(--primary-accent); }
    .numpad-trigger:hover:not(:disabled) { background: var(--bg-card-sub); }
  `]
})
export class NumpadButtonComponent {
  private readonly numpad = inject(NumpadService);
  /** 要輸入的欄位。 */
  @Input({ required: true }) for!: HTMLInputElement;
  /** 小鍵盤上顯示的欄位名稱。 */
  @Input({ required: true }) label = '';
  /** 實收現金：顯示 100／500／1000／剛好。 */
  @Input({ transform: (v: unknown) => v !== false }) quickCash = false;
  /** 「剛好」要填入的應收金額。 */
  @Input() exact: number | null = null;
  /** 顯示 ＋1／－1（杯數、數量）。 */
  @Input({ transform: (v: unknown) => v !== false }) steppers = false;

  async open(): Promise<void> {
    const input = this.for;
    const mode: NumpadMode = input.type === 'tel' ? 'phone' : this.decimalsOf(input.step) > 0 || input.inputMode === 'decimal' ? 'decimal' : 'integer';
    const num = (v: string) => v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
    const value = await this.numpad.open({
      label: this.label, value: input.value, mode,
      decimals: mode === 'decimal' ? (this.decimalsOf(input.step) || 2) : 0,
      min: mode === 'phone' ? null : num(input.min), max: mode === 'phone' ? null : num(input.max),
      maxLength: input.maxLength > 0 ? input.maxLength : null,
      quickCash: this.quickCash, exact: this.exact, steppers: this.steppers
    });
    if (value === null) { input.focus(); return; }
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
  }

  /** step="0.01" → 2；step="1" 或沒寫 → 0。 */
  private decimalsOf(step: string): number {
    if (!step || step === 'any') return 0;
    const dot = step.indexOf('.');
    return dot < 0 ? 0 : step.length - dot - 1;
  }
}
