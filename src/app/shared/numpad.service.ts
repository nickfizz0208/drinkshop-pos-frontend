import { Injectable, signal } from '@angular/core';

/** 小鍵盤要輸入哪一種內容：小數（金額、份數）、整數（杯數、次數）、電話（保留開頭的 0）。 */
export type NumpadMode = 'decimal' | 'integer' | 'phone';

/** 打開小鍵盤時帶的設定；由 NumpadButtonComponent 依欄位的 type、min、max、step、maxlength 自動判斷。 */
export interface NumpadRequest {
  /** 小鍵盤上方顯示的欄位名稱，例如「實收現金」。 */
  label: string;
  /** 欄位目前的值（文字）。 */
  value: string;
  mode: NumpadMode;
  /** 小數最多幾位；整數與電話是 0。 */
  decimals: number;
  min: number | null;
  max: number | null;
  /** 最多幾個字（電話用）。 */
  maxLength: number | null;
  /** 現金快捷鍵（100、500、1000、剛好）；exact 是「剛好」要填入的應收金額。 */
  quickCash: boolean;
  exact: number | null;
  /** 顯示 ＋1／－1。 */
  steppers: boolean;
}

/**
 * 數字小鍵盤：全畫面一個（NumpadComponent 放在 AppComponent），由欄位旁的按鈕呼叫 open()。
 * 按「確定」回傳輸入的文字，按「取消」回傳 null。
 */
@Injectable({ providedIn: 'root' })
export class NumpadService {
  readonly request = signal<NumpadRequest | null>(null);
  private resolve: ((value: string | null) => void) | null = null;

  open(request: NumpadRequest): Promise<string | null> {
    this.resolve?.(null);   // 前一個還開著就當作取消
    this.request.set(request);
    return new Promise(resolve => this.resolve = resolve);
  }
  /** 小鍵盤按確定（value）或取消（null）時呼叫。 */
  close(value: string | null): void {
    const resolve = this.resolve;
    this.resolve = null; this.request.set(null);
    resolve?.(value);
  }
}
