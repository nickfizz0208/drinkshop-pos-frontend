import { byPack, formatDiff, formatQty, splitPack } from './pack-format';

describe('數量顯示（籃＋顆）', () => {
  const mango = { baseUnit: '顆', packUnit: '籃', perPack: 30, displayByPack: true };
  const cups = { baseUnit: '個', packUnit: '袋', perPack: 50, displayByPack: false };
  const milk = { baseUnit: '份' };

  it('只有勾選、而且有包裝單位的原料才用籃＋顆顯示', () => {
    expect(byPack(mango)).toBeTrue(); expect(byPack(cups)).toBeFalse(); expect(byPack(milk)).toBeFalse();
    expect(byPack({ baseUnit: '顆', packUnit: null, perPack: null, displayByPack: true })).toBeFalse();
  });
  it('拆成幾籃幾顆', () => {
    expect(splitPack(153, mango)).toEqual({ packs: 5, loose: 3 });
    expect(splitPack(150, mango)).toEqual({ packs: 5, loose: 0 });
    expect(splitPack(29.5, mango)).toEqual({ packs: 0, loose: 29.5 });
  });
  it('數量：5 籃 3 顆、5 籃、3 顆；一般原料照基本單位', () => {
    expect(formatQty(153, mango)).toBe('5 籃 3 顆');
    expect(formatQty(150, mango)).toBe('5 籃');
    expect(formatQty(3, mango)).toBe('3 顆');
    expect(formatQty(0, mango)).toBe('0 顆');
    expect(formatQty(1200, cups)).toBe('1,200 個');
    expect(formatQty(10.5, milk)).toBe('10.5 份');
  });
  it('差異：籃與顆分開算，不顯示成看不懂的總顆數', () => {
    expect(formatDiff(140, 153, mango)).toBe('−1 籃、+17 顆');
    expect(formatDiff(150, 153, mango)).toBe('−3 顆');
    expect(formatDiff(183, 153, mango)).toBe('+1 籃');
    expect(formatDiff(153, 153, mango)).toBe('');
    expect(formatDiff(115, 120, cups)).toBe('−5 個');
  });
});
