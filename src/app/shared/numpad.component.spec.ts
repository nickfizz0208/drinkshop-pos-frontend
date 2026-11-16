import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NumpadComponent } from './numpad.component';
import { NumpadButtonComponent } from './numpad-button.component';
import { NumpadRequest, NumpadService } from './numpad.service';

@Component({
  imports: [FormsModule, NumpadButtonComponent, NumpadComponent],
  template: `
    <input #cash type="number" min="0" max="99999999.99" step="0.01" [(ngModel)]="received"><app-numpad-button [for]="cash" label="實收現金" quickCash [exact]="85" />
    <input #qty type="number" min="1" max="100" step="1" [(ngModel)]="qty"><app-numpad-button [for]="qty" label="杯數" steppers />
    <input #phone type="tel" maxlength="10" [value]="tel" (input)="tel = $any($event.target).value"><app-numpad-button [for]="phone" label="會員電話" />
    <app-numpad />`
})
class HostComponent { received: number | null = null; qty = 1; tel = ''; }

describe('數字小鍵盤', () => {
  let numpad: NumpadService;
  const base: NumpadRequest = { label: 'x', value: '', mode: 'decimal', decimals: 2, min: 0, max: 100, maxLength: null, quickCash: false, exact: null, steppers: false };
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    numpad = TestBed.inject(NumpadService);
    // 測試瀏覽器裡 showModal 會真的開 dialog；保持即可，結束時關掉
  });
  afterEach(() => numpad.close(null));

  function keypad(): NumpadComponent {
    const fixture = TestBed.createComponent(HostComponent); fixture.detectChanges();
    return fixture.debugElement.children.find(c => c.componentInstance instanceof NumpadComponent)!.componentInstance;
  }

  it('按鍵輸入：開頭的 0 不重複、小數最多兩位、00、退格與清除', () => {
    const fixture = TestBed.createComponent(NumpadComponent); fixture.detectChanges(); const pad = fixture.componentInstance;
    numpad.open({ ...base, max: 99999 }); fixture.detectChanges();
    pad.press('0'); pad.press('0'); pad.press('5'); expect(pad.value).toBe('5');
    pad.press('00'); expect(pad.value).toBe('500');
    pad.press('.'); pad.press('1'); pad.press('2'); pad.press('9'); expect(pad.value).toBe('500.12');
    pad.backspace(); expect(pad.value).toBe('500.1');
    pad.clear(); pad.press('.'); expect(pad.value).toBe('0.');
  });
  it('超過範圍不寫回，顯示原因；整數欄位不能按小數點', async () => {
    const fixture = TestBed.createComponent(NumpadComponent); fixture.detectChanges(); const pad = fixture.componentInstance;
    const result = numpad.open({ ...base, mode: 'integer', decimals: 0, min: 1, max: 100 }); fixture.detectChanges();
    pad.press('.'); expect(pad.value).toBe('');
    pad.press('5'); pad.press('0'); pad.press('0'); pad.confirm();
    expect(pad.error).toBe('最多 100'); expect(numpad.request()).not.toBeNull();
    pad.backspace(); pad.confirm(); expect(await result).toBe('50');
  });
  it('電話保留開頭的 0、限制長度', async () => {
    const fixture = TestBed.createComponent(NumpadComponent); fixture.detectChanges(); const pad = fixture.componentInstance;
    const result = numpad.open({ ...base, mode: 'phone', decimals: 0, min: null, max: null, maxLength: 4 }); fixture.detectChanges();
    for (const k of ['0', '9', '1', '2', '3'] as const) pad.press(k);
    pad.confirm(); expect(await result).toBe('0912');
  });
  it('現金快捷累加、剛好填入應收、算出找零；＋1／－1 不超過範圍', () => {
    const fixture = TestBed.createComponent(NumpadComponent); fixture.detectChanges(); const pad = fixture.componentInstance;
    numpad.open({ ...base, max: 99999, quickCash: true, exact: 85 }); fixture.detectChanges();
    pad.addCash(500); pad.addCash(100); expect(pad.value).toBe('600'); expect(pad.change).toBe(515);
    pad.exact(); expect(pad.value).toBe('85'); expect(pad.change).toBe(0);
    numpad.open({ ...base, mode: 'integer', decimals: 0, min: 1, max: 3, value: '3', steppers: true }); fixture.detectChanges();
    pad.step(1); expect(pad.value).toBe('3'); pad.step(-1); pad.step(-1); pad.step(-1); expect(pad.value).toBe('1');
  });
  it('欄位旁的按鈕：確定後寫回 ngModel 與 (input)，取消不改；設定從欄位的 min／max／step／type 讀', async () => {
    const fixture = TestBed.createComponent(HostComponent); fixture.detectChanges(); await fixture.whenStable();
    const host = fixture.componentInstance; const el = fixture.nativeElement as HTMLElement;
    const buttons = el.querySelectorAll('.numpad-trigger') as NodeListOf<HTMLButtonElement>;
    buttons[0].click(); fixture.detectChanges();
    expect(numpad.request()).toEqual(jasmine.objectContaining({ label: '實收現金', mode: 'decimal', decimals: 2, min: 0, quickCash: true, exact: 85 }));
    numpad.close('120'); await fixture.whenStable(); fixture.detectChanges();
    expect(host.received).toBe(120);
    buttons[1].click(); expect(numpad.request()).toEqual(jasmine.objectContaining({ mode: 'integer', decimals: 0, min: 1, max: 100, steppers: true }));
    numpad.close(null); await fixture.whenStable(); expect(host.qty).toBe(1);
    buttons[2].click(); expect(numpad.request()).toEqual(jasmine.objectContaining({ mode: 'phone', maxLength: 10 }));
    numpad.close('0912345678'); await fixture.whenStable(); expect(host.tel).toBe('0912345678');
  });
});
