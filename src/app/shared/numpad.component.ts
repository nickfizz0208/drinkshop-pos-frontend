import { Component, ElementRef, ViewChild, effect, inject, untracked } from '@angular/core';
import { NumpadRequest, NumpadService } from './numpad.service';

/** 小鍵盤裡的一顆鍵。 */
type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | '.';

/**
 * 數字小鍵盤（全畫面）：上方預覽輸入的值，下方按鍵。按「確定」才寫回欄位，「取消」不改。
 * 用 <dialog> 的 showModal()，所以就算欄位在其他彈窗裡（例如結帳），小鍵盤也會蓋在最上面。
 * 有實體鍵盤時也可以直接打字：數字、小數點、Backspace、Delete（清除）、Enter（確定）、Esc（取消）。
 */
@Component({
  selector: 'app-numpad',
  templateUrl: './numpad.component.html',
  styleUrl: './numpad.component.scss'
})
export class NumpadComponent {
  readonly numpad = inject(NumpadService);
  @ViewChild('dialog', { static: true }) dialog!: ElementRef<HTMLDialogElement>;
  value = '';
  error = '';
  readonly digits: Key[] = ['7', '8', '9', '4', '5', '6', '1', '2', '3'];

  constructor() {
    effect(() => {
      const request = this.numpad.request();
      untracked(() => {
        const dialog = this.dialog.nativeElement;
        if (request) {
          this.value = this.clean(request.value, request); this.error = '';
          if (!dialog.open) dialog.showModal();
        } else if (dialog.open) dialog.close();
      });
    });
  }

  get request(): NumpadRequest | null { return this.numpad.request(); }

  press(key: Key): void {
    const r = this.request; if (!r) return;
    this.error = '';
    if (key === '.') {
      if (r.decimals === 0 || this.value.includes('.')) return;
      this.value = (this.value || '0') + '.'; return;
    }
    for (const digit of key) this.value = this.appendDigit(this.value, digit, r);
  }
  backspace(): void { this.error = ''; this.value = this.value.slice(0, -1); }
  clear(): void { this.error = ''; this.value = ''; }

  /** ＋1／－1：從目前的值加減，不超過最小、最大值。 */
  step(delta: number): void {
    const r = this.request; if (!r) return;
    let n = (Number(this.value) || 0) + delta;
    if (r.min !== null) n = Math.max(r.min, n);
    if (r.max !== null) n = Math.min(r.max, n);
    this.error = ''; this.value = this.format(n, r);
  }
  /** 現金快捷：100／500／1000 累加到目前金額（客人給 500＋100 就按兩下）。 */
  addCash(amount: number): void {
    const r = this.request; if (!r) return;
    this.error = ''; this.value = this.format((Number(this.value) || 0) + amount, r);
  }
  /** 剛好：填入應收金額。 */
  exact(): void {
    const r = this.request; if (!r || r.exact === null) return;
    this.error = ''; this.value = this.format(r.exact, r);
  }

  confirm(): void {
    const r = this.request; if (!r) return;
    let value = this.value.endsWith('.') ? this.value.slice(0, -1) : this.value;
    if (r.mode !== 'phone' && value !== '') {
      const n = Number(value);
      if (!Number.isFinite(n)) { this.error = '請輸入數字'; return; }
      if (r.min !== null && n < r.min) { this.error = `最少 ${r.min}`; return; }
      if (r.max !== null && n > r.max) { this.error = `最多 ${r.max}`; return; }
    }
    this.numpad.close(value);
  }
  cancel(): void { this.numpad.close(null); }

  /** 實體鍵盤。 */
  onKeydown(event: KeyboardEvent): void {
    if (!this.request) return;
    if (/^[0-9]$/.test(event.key)) this.press(event.key as Key);
    else if (event.key === '.') this.press('.');
    else if (event.key === 'Backspace') this.backspace();
    else if (event.key === 'Delete') this.clear();
    else if (event.key === 'Enter') this.confirm();
    else return;
    event.preventDefault();
  }
  /** Esc：取消（瀏覽器預設會直接關掉 dialog，改由這裡統一處理）。 */
  onCancel(event: Event): void { event.preventDefault(); this.cancel(); }

  get rangeHint(): string {
    const r = this.request; if (!r) return '';
    if (r.mode === 'phone') return r.maxLength ? `只輸入數字，最多 ${r.maxLength} 碼` : '只輸入數字';
    const parts: string[] = [];
    if (r.min !== null && r.max !== null) parts.push(`範圍 ${r.min}～${r.max}`);
    else if (r.min !== null) parts.push(`最少 ${r.min}`);
    else if (r.max !== null) parts.push(`最多 ${r.max}`);
    parts.push(r.decimals > 0 ? `可到小數 ${r.decimals} 位` : '只能輸入整數');
    return parts.join('，');
  }
  /** 實收現金：應收與找零。 */
  get change(): number | null {
    const r = this.request;
    if (!r?.quickCash || r.exact === null || this.value === '') return null;
    return Number(this.value) - r.exact;
  }
  money(n: number): string { return '$' + n.toLocaleString('zh-TW', { maximumFractionDigits: 2 }); }

  private appendDigit(value: string, digit: string, r: NumpadRequest): string {
    if (r.mode === 'phone') return r.maxLength !== null && value.length >= r.maxLength ? value : value + digit;
    const dot = value.indexOf('.');
    if (dot >= 0 && value.length - dot - 1 >= r.decimals) return value;   // 小數位數已滿
    if (value === '0') return digit;                                        // 開頭不留多餘的 0
    if (value.replace('.', '').length >= 12) return value;                  // 太長
    return value + digit;
  }
  /** 數字轉成欄位要的文字：依小數位數四捨五入，去掉多餘的 0。 */
  private format(n: number, r: NumpadRequest): string {
    const factor = 10 ** r.decimals;
    return String(Math.round(n * factor) / factor);
  }
  /** 帶進來的舊值整理一下：電話只留數字，數字去掉不合法的字。 */
  private clean(value: string, r: NumpadRequest): string {
    if (r.mode === 'phone') return value.replace(/\D/g, '');
    return value === '' || !Number.isFinite(Number(value)) ? '' : value;
  }
}
