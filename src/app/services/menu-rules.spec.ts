import { PREVIEW_MENU, PREVIEW_RULES } from './preview-menu';
import { applyRules, initialSelection, toppingLimit, unitCents } from './menu-rules';
import { cents, sizesOf } from '../models/pos';

describe('點餐規則與金額', () => {
  it('冰沙固定冷飲、正常冰與正常糖', () => {
    const result = applyRules(PREVIEW_MENU.products[4], initialSelection(), PREVIEW_RULES);
    expect(result.selection.temperature).toBe('COLD'); expect(result.selection.ice).toBe('NORMAL');
    expect(result.selection.sugar).toBe('NORMAL'); expect(result.locked['ice']).toContain('固定');
  });
  it('熱飲移除茶凍但保留可用的珍珠', () => {
    const selection = { ...initialSelection(), temperature: 'HOT' as const, toppingIds: [1, 2] };
    const result = applyRules(PREVIEW_MENU.products[0], selection, PREVIEW_RULES);
    expect(result.selection.toppingIds).toEqual([1]); expect(selection.toppingIds).toEqual([1, 2]);
  });
  it('大杯加價及額外加料只計算一次', () => {
    const selection = { ...initialSelection(), size: 'L' as const, toppingIds: [1] };
    expect(unitCents(PREVIEW_MENU.products[0], selection, PREVIEW_MENU.toppings)).toBe(4000);
  });
  it('小數價格以分計算，40.30 三杯為 120.90', () => {
    const product = { ...PREVIEW_MENU.products[0], price_m: 25.15, price_l: 30.20 };
    const selection = { ...initialSelection(), size: 'L' as const, toppingIds: [1] };
    expect(unitCents(product, selection, [{ topping_id: 1, name: '珍珠', price: 10.10 }]) * 3).toBe(12090);
    expect(cents(200.25) - 12090).toBe(7935);
  });
  it('只賣大杯與瓶裝的飲品：預設選大杯，瓶裝用瓶裝價', () => {
    const milkTea = { ...PREVIEW_MENU.products[2], price_m: null, price_l: 50, price_bottle: 75 };
    expect(sizesOf(milkTea)).toEqual(['L', 'BOTTLE']);
    expect(initialSelection(milkTea).size).toBe('L');
    expect(unitCents(milkTea, { ...initialSelection(milkTea), size: 'BOTTLE', toppingIds: [1] }, PREVIEW_MENU.toppings)).toBe(8500);
    expect(initialSelection(PREVIEW_MENU.products[0]).size).toBe('M');
  });
  it('讀取資料庫規則的加料種類上限', () => {
    expect(toppingLimit(PREVIEW_MENU.products[0], initialSelection(), PREVIEW_RULES)).toBe(3);
  });
  it('互斥加料群組會限制其他選項', () => {
    const result = applyRules(PREVIEW_MENU.products[0], { ...initialSelection(), toppingIds: [1] }, [{ rule_id: 99, rule_type: 'MUTEX', condition_json: { always: true }, action_json: { toppingIds: [1, 2] }, message: '同組只能選一種' }]);
    expect(result.blocked[2]).toBe('同組只能選一種');
  });
});
