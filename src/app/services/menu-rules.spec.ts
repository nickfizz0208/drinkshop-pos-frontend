import { PREVIEW_MENU, PREVIEW_RULES } from './preview-menu';
import { applyRules, initialSelection, toppingLimit, unitCents } from './menu-rules';
import { cents, sizesOf } from '../models/pos';

describe('點餐規則與金額', () => {
  it('奶茶、鮮奶的第一份 free 加料不用錢（046）；其他分類、非 free 加料照原價', () => {
    const toppings = [{ topping_id: 1, name: '珍珠', price: 10, free: true }, { topping_id: 2, name: '茶凍', price: 10 }];
    const milkTea = PREVIEW_MENU.products[2];                     // 經典奶茶 40
    const sel = (ids: number[]) => ({ ...initialSelection(), toppingIds: ids });
    expect(unitCents(milkTea, sel([1]), toppings)).toBe(4000);
    expect(unitCents(milkTea, sel([2, 1, 1]), toppings)).toBe(6000);   // 茶凍 10、珍珠第二份 10
    expect(unitCents(milkTea, sel([2]), toppings)).toBe(5000);
    expect(unitCents({ ...milkTea, category: '鮮奶' }, sel([1]), toppings)).toBe(4000);
    expect(unitCents(PREVIEW_MENU.products[0], sel([1]), toppings)).toBe(3500); // 茶類照原價
  });
  it('預設 5 分糖、少冰', () => {
    expect(initialSelection().sugar).toBe('S5'); expect(initialSelection().tempIce).toBe('LESS');
  });
  it('冰沙固定正常冰與 10 分糖（舊規則 temperature、ice、NORMAL 換算）', () => {
    const result = applyRules(PREVIEW_MENU.products[4], initialSelection(), PREVIEW_RULES);
    expect(result.selection.tempIce).toBe('NORMAL'); expect(result.selection.sugar).toBe('S10');
    expect(result.locked['tempIce']).toContain('固定'); expect(result.locked['sugar']).toContain('固定');
  });
  it('熱飲不會被舊的「溫熱飲不加冰塊」鎖住，可以再改回冰飲', () => {
    const result = applyRules(PREVIEW_MENU.products[0], { ...initialSelection(), tempIce: 'HOT' }, PREVIEW_RULES);
    expect(result.selection.tempIce).toBe('HOT'); expect(result.locked['tempIce']).toBeUndefined();
  });
  it('常溫不算溫熱飲，可以加茶凍', () => {
    const result = applyRules(PREVIEW_MENU.products[0], { ...initialSelection(), tempIce: 'ROOM', toppingIds: [2] }, PREVIEW_RULES);
    expect(result.selection.toppingIds).toEqual([2]); expect(result.blocked[2]).toBeUndefined();
  });
  it('新寫法的規則：tempIceIn、set.tempIce', () => {
    const rule = { rule_id: 9, rule_type: 'AUTO_ADJUST' as const, condition_json: { tempIceIn: ['EXTRA' as const] }, action_json: { set: { sugar: 'S7' } }, message: '多冰固定 7 分糖' };
    expect(applyRules(PREVIEW_MENU.products[0], { ...initialSelection(), tempIce: 'EXTRA' }, [rule]).selection.sugar).toBe('S7');
    expect(applyRules(PREVIEW_MENU.products[0], initialSelection(), [rule]).selection.sugar).toBe('S5');
  });
  it('熱飲移除茶凍但保留可用的珍珠', () => {
    const selection = { ...initialSelection(), tempIce: 'HOT' as const, toppingIds: [1, 2] };
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
