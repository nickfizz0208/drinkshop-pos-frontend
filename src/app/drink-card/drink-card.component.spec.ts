import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DrinkCardComponent } from './drink-card.component';
import { Product } from '../models/pos';

describe('DrinkCardComponent', () => {
  const tea: Product = { product_id: 4, name: '珍珠奶茶', category: '奶茶', price_m: 50, price_l: 60, price_bottle: null, hot_allowed: true };
  let fixture: ComponentFixture<DrinkCardComponent>;
  let card: DrinkCardComponent;
  let button: HTMLButtonElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(DrinkCardComponent);
    card = fixture.componentInstance;
    fixture.componentRef.setInput('drink', tea);
    fixture.detectChanges();
    button = fixture.nativeElement.querySelector('.product-card');
  });

  it('顯示飲品名稱，卡片背景依色系換顏色（飲料杯暫時拿掉）', () => {
    expect(button.textContent).toContain('珍珠奶茶');
    expect(button.getAttribute('aria-label')).toBe('客製 珍珠奶茶');
    expect(button.classList).toContain('cream');
    expect(fixture.nativeElement.querySelector('app-drink-cup')).toBeNull();
  });

  it('點一下送出這杯飲品', () => {
    const chosen: Product[] = [];
    card.choose.subscribe(drink => chosen.push(drink));
    button.click();
    expect(chosen).toEqual([tea]);
  });

  it('鎖住時不能點', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(button.disabled).toBeTrue();
  });
});
