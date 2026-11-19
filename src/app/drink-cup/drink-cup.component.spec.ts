import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DrinkCupComponent, drinkTone, hasPearls, sortByTone } from './drink-cup.component';

describe('DrinkCupComponent', () => {
  it('沒設定色系時依分類、名稱判斷：冰沙 → 黃、奶茶 → 奶、綠茶 → 綠、其他 → 紅', () => {
    expect(drinkTone({ name: '芒果冰沙', category: '冰沙' })).toBe('yellow');
    expect(drinkTone({ name: '珍珠奶茶', category: '奶茶' })).toBe('cream');
    expect(drinkTone({ name: '綠茶奶茶', category: '奶茶' })).toBe('cream');
    expect(drinkTone({ name: '翡翠綠茶', category: '茶類' })).toBe('green');
    expect(drinkTone({ name: '紅茶拿鐵', category: '鮮奶' })).toBe('red');
  });

  it('資料庫有設定色系就用設定的，沒設定（null）才自動判斷', () => {
    expect(drinkTone({ name: '紅茶拿鐵', category: '鮮奶', color_tone: 'CREAM' })).toBe('cream');
    expect(drinkTone({ name: '芋頭鮮奶', category: '鮮奶', color_tone: 'PURPLE' })).toBe('purple');
    expect(drinkTone({ name: '芒果冰沙', category: '冰沙', color_tone: 'RED' })).toBe('red');
    expect(drinkTone({ name: '翡翠綠茶', category: '茶類', color_tone: null })).toBe('green');
    // 前端還不認得的值（資料庫先加了新色系）當作沒設定
    expect(drinkTone({ name: '翡翠綠茶', category: '茶類', color_tone: 'BLUE' as never })).toBe('green');
  });

  it('依色系排序：黃綠紅橙奶咖紫白，同色系維持原本順序，沒設定的用自動判斷的色系', () => {
    const drinks = [
      { name: '白・冬瓜檸檬', category: '茶類', color_tone: 'WHITE' as const },
      { name: '經典紅茶', category: '茶類' },                                // 自動判斷：紅
      { name: '紫・芋頭鮮奶', category: '鮮奶', color_tone: 'PURPLE' as const },
      { name: '珍珠奶茶', category: '奶茶' },                                // 自動判斷：奶
      { name: '高山金萱茶', category: '茶類', color_tone: 'YELLOW' as const },
      { name: '文山青茶', category: '茶類', color_tone: 'ORANGE' as const },
      { name: '錫蘭紅茶', category: '茶類', color_tone: 'RED' as const },
      { name: '翡翠綠茶', category: '茶類', color_tone: 'GREEN' as const },
      { name: '開心果可可', category: '芝芝', color_tone: 'BROWN' as const }
    ];
    expect(sortByTone(drinks).map(d => d.name)).toEqual(
      ['高山金萱茶', '翡翠綠茶', '經典紅茶', '錫蘭紅茶', '文山青茶', '珍珠奶茶', '開心果可可', '紫・芋頭鮮奶', '白・冬瓜檸檬']);
    expect(drinks[0].name).toBe('白・冬瓜檸檬'); // 不改原本的陣列
  });

  it('名稱有珍珠才畫珍珠', () => {
    expect(hasPearls({ name: '珍珠奶茶' })).toBeTrue();
    expect(hasPearls({ name: '波霸奶茶' })).toBeFalse();
  });

  it('畫面套用配色與珍珠', () => {
    const fixture: ComponentFixture<DrinkCupComponent> = TestBed.createComponent(DrinkCupComponent);
    fixture.componentRef.setInput('drink', { name: '珍珠奶茶', category: '奶茶' });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.cup-art.cream')).not.toBeNull();
    expect(el.querySelector('.tea-cup.pearls')).not.toBeNull();
    fixture.componentRef.setInput('drink', { name: '翡翠綠茶', category: '茶類' });
    fixture.detectChanges();
    expect(el.querySelector('.cup-art.green')).not.toBeNull();
    expect(el.querySelector('.cup-art.cream')).toBeNull();
    expect(el.querySelector('.tea-cup.pearls')).toBeNull();
  });
});
