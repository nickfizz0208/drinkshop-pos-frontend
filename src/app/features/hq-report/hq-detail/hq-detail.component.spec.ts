import { TestBed } from '@angular/core/testing';
import { HqDetailComponent } from './hq-detail.component';
import { PosApiService } from '../../../services/pos-api.service';
import { HqDetails } from '../../../models/hq-detail';
import { Sugar, TempIce } from '../../../models/pos';

const temps: TempIce[] = ['HOT', 'WARM', 'ROOM', 'ICE_FREE', 'NO_ICE', 'LIGHT', 'LESS', 'NORMAL', 'EXTRA'];
const sugars: Sugar[] = ['NONE', 'S0_5', 'S1', 'S3', 'S5', 'S7', 'S10', 'EXTRA'];
const tempOf = (v: Partial<Record<TempIce, number>>) => temps.map(key => ({ key, cups: v[key] ?? 0 }));
const sugarOf = (v: Partial<Record<Sugar, number>>) => sugars.map(key => ({ key, cups: v[key] ?? 0 }));

function sample(): HqDetails {
  return {
    from: '2026-11-01', to: '2026-11-30', prevFrom: '2026-10-02', prevTo: '2026-10-31',
    totalCups: 10, totalRevenue: 500, prevTotalCups: 8,
    products: [
      { productId: 4, productName: '珍珠奶茶', category: '奶茶', cups: 6, revenue: 360, prevCups: 4,
        sizes: [{ key: 'M', cups: 2 }, { key: 'L', cups: 4 }, { key: 'BOTTLE', cups: 0 }], tempIce: tempOf({ LESS: 3, HOT: 3 }), sugar: sugarOf({ S5: 4, NONE: 2 }),
        options: [{ key: '換綠茶', cups: 2 }] },
      { productId: 1, productName: '經典紅茶', category: '茶類', cups: 4, revenue: 140, prevCups: 0,
        sizes: [{ key: 'M', cups: 4 }, { key: 'L', cups: 0 }, { key: 'BOTTLE', cups: 0 }], tempIce: tempOf({ NORMAL: 4 }), sugar: sugarOf({ S10: 4 }) }
    ],
    sizes: [{ key: 'M', cups: 6 }, { key: 'L', cups: 4 }, { key: 'BOTTLE', cups: 0 }],
    tempIce: tempOf({ LESS: 3, HOT: 3, NORMAL: 4 }), sugar: sugarOf({ S5: 4, NONE: 2, S10: 4 }),
    cross: [{ tempIce: 'HOT', sugar: 'S5', cups: 3 }, { tempIce: 'LESS', sugar: 'NONE', cups: 2 }, { tempIce: 'NORMAL', sugar: 'S10', cups: 4 }, { tempIce: 'LESS', sugar: 'S5', cups: 1 }],
    trendBy: 'date', trend: [{ label: '2026-11-01', cups: 10, tempIce: tempOf({ LESS: 3, HOT: 3, NORMAL: 4 }), sugar: sugarOf({ S5: 4, NONE: 2, S10: 4 }) }],
    categories: ['奶茶', '茶類'],
    toppings: { toppedCups: 5, totalPortions: 7, revenue: 50, freePortions: 2, freeValue: 20, prevPortions: 5, items: [
      { toppingId: 1, name: '波霸', portions: 5, cups: 4, revenue: 30, freePortions: 2, freeValue: 20, prevPortions: 5, topProducts: [{ productName: '紅茶拿鐵', portions: 3 }, { productName: '奶茶', portions: 2 }] },
      { toppingId: 2, name: '椰果', portions: 2, cups: 1, revenue: 20, freePortions: 0, freeValue: 0, prevPortions: 0, topProducts: [{ productName: '綠茶', portions: 2 }] }] },
    options: { optionCups: 3, items: [
      { optionId: 5, name: '換綠茶', cups: 3, prevCups: 1, trend: [{ key: '2026-11-01', cups: 1 }, { key: '2026-11-02', cups: 2 }],
        products: [{ productId: 4, productName: '珍珠奶茶', cups: 2, productCups: 6 }, { productId: 1, productName: '經典紅茶', cups: 1, productCups: 4 }] }] }
  };
}

describe('總部報表細項：飲品、冷熱甜度（隔離 API）', () => {
  let api: jasmine.SpyObj<PosApiService>;
  async function create(view: 'products' | 'tempSugar' | 'toppings' | 'options') {
    api = jasmine.createSpyObj<PosApiService>('api', ['hqDetails']);
    api.hqDetails.and.callFake(async () => sample());
    TestBed.configureTestingModule({ imports: [HqDetailComponent], providers: [{ provide: PosApiService, useValue: api }] });
    const fixture = TestBed.createComponent(HqDetailComponent);
    fixture.componentRef.setInput('view', view);
    fixture.componentRef.setInput('from', '2026-11-01');
    fixture.componentRef.setInput('to', '2026-11-30');
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return fixture;
  }

  it('飲品：依期間讀資料；篩選會帶給後端；比上一期的變化；點一杯展開分布', async () => {
    const fixture = await create('products');
    const c = fixture.componentInstance;
    expect(api.hqDetails).toHaveBeenCalledWith({ from: '2026-11-01', to: '2026-11-30', category: '', source: '', size: '' });
    expect(c.change(6, 4)).toBe('＋50%'); expect(c.change(4, 0)).toBe('新'); expect(c.change(3, 4)).toBe('−25%'); expect(c.change(0, 0)).toBe('');
    expect(c.changeClass(853, 855)).toBe(''); expect(c.changeClass(6, 4)).toBe('up'); expect(c.changeClass(3, 0)).toBe('new');
    const rows = fixture.nativeElement.querySelectorAll('.product-row');
    expect(rows.length).toBe(2);
    rows[0].click(); fixture.detectChanges();
    expect(c.expanded).toBe(4);
    expect(fixture.nativeElement.querySelector('.breakdown').textContent).toContain('大杯 66.7%');
    expect(c.groupTemp(sample().products[0].tempIce).map(g => g.pct)).toEqual([50, 0, 0, 50]);
    c.category = '奶茶'; await c.load();
    expect(api.hqDetails.calls.mostRecent().args[0].category).toBe('奶茶');
  });

  it('冷熱甜度：重點數字、交叉表只列有賣的選項、趨勢可切換冷熱或甜度', async () => {
    const fixture = await create('tempSugar');
    const c = fixture.componentInstance;
    expect(c.groupTemp(c.data!.tempIce)[0].pct).toBe(30);
    expect(c.top(c.data!.sugar)!.cups).toBe(4);
    expect(c.topCombo).toEqual({ tempIce: 'NORMAL', sugar: 'S10', cups: 4 });
    expect(c.crossTemps).toEqual(['HOT', 'LESS', 'NORMAL']);
    expect(c.crossSugars).toEqual(['NONE', 'S5', 'S10']);
    expect(c.crossCups('HOT', 'S5')).toBe(3); expect(c.crossCups('HOT', 'NONE')).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.cross tbody tr').length).toBe(3);
    expect(c.segments(c.data!.trend[0]).map(s => s.cups)).toEqual([3, 0, 0, 7]);
    c.trendOf = 'sugar';
    expect(c.segments(c.data!.trend[0]).map(s => s.cups)).toEqual([2, 0, 4, 4]);
    expect(c.trendLabel('2026-11-01')).toBe('11/01');
  });

  it('加料：加料率、首份免費、排行與最常加在哪杯', async () => {
    const fixture = await create('toppings');
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('50%');                  // 加料率 5 / 10 杯
    expect(text).toContain('少收 $20');
    const rows = fixture.nativeElement.querySelectorAll('.product-table tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('紅茶拿鐵');
    expect(rows[1].textContent).toContain('新');
    expect(fixture.componentInstance.maxToppingPortions).toBe(5);
  });

  it('客製：每個選項的杯數，展開看是哪些飲品用的、佔那杯飲品幾 %', async () => {
    const fixture = await create('options');
    const c = fixture.componentInstance;
    const row = fixture.nativeElement.querySelector('.product-row');
    expect(row.textContent).toContain('換綠茶'); expect(row.textContent).toContain('＋200%');
    row.click(); fixture.detectChanges();
    expect(c.expandedOption).toBe(5);
    const inner = fixture.nativeElement.querySelector('.inner tbody').textContent;
    expect(inner).toContain('珍珠奶茶'); expect(inner).toContain('33.3%');   // 珍奶 6 杯裡有 2 杯換綠茶
    expect(fixture.nativeElement.querySelectorAll('.spark-col').length).toBe(2);
  });
});
