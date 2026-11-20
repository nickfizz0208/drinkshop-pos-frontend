import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { PosApiService } from '../../services/pos-api.service';
import { SaleStatusApiService } from '../../services/sale-status-api.service';
import { UiStateService } from '../../shared/ui-state.service';
import { SaleStatusStateService } from './sale-status-state.service';
import { SaleStatus } from '../../models/sale-status';
import { Staff } from '../../models/pos';
import { PREVIEW_MENU } from '../../services/preview-menu';

// 和後端測試資料一致：紅茶包(3) → 經典紅茶、經典奶茶、珍珠奶茶、半成品茶凍；珍珠(6) → 珍珠奶茶、加料珍珠
function sample(): SaleStatus {
  return {
    inventories: [
      { inventoryId: 3, name: '紅茶包', category: '茶葉', onSale: true, usedByProducts: [1, 3, 4], usedByToppings: [2] },
      { inventoryId: 6, name: '珍珠', category: '底料', onSale: true, usedByProducts: [4], usedByToppings: [1] },
      { inventoryId: 1, name: '中杯紙杯', category: null, onSale: true, usedByProducts: [], usedByToppings: [] }
    ],
    preps: [{ prepId: 1, name: '茶凍', category: '底料', onSale: true, available: true, inventoryIds: [3], usedByProducts: [], usedByToppings: [2] }],
    products: [
      { productId: 1, name: '經典紅茶', category: '茶類', onSale: true, sellable: true, inventoryIds: [3], prepIds: [], stoppedBy: [] },
      { productId: 2, name: '茉香綠茶', category: '茶類', onSale: true, sellable: true, inventoryIds: [], prepIds: [], stoppedBy: [] },
      { productId: 3, name: '經典奶茶', category: '奶茶', onSale: true, sellable: true, inventoryIds: [3], prepIds: [], stoppedBy: [] },
      { productId: 4, name: '珍珠奶茶', category: '奶茶', onSale: true, sellable: true, inventoryIds: [3, 6], prepIds: [], stoppedBy: [] }
    ],
    toppings: [
      { toppingId: 1, name: '珍珠', onSale: true, sellable: true, inventoryId: 6, prepId: null, stoppedBy: [] },
      { toppingId: 2, name: '茶凍', onSale: true, sellable: true, inventoryId: null, prepId: 1, stoppedBy: [] }
    ]
  };
}

describe('停售管理：勾選原物料連動停售（隔離 API）', () => {
  let api: jasmine.SpyObj<SaleStatusApiService>;
  let posApi: jasmine.SpyObj<PosApiService>;
  let state: SaleStatusStateService;
  let ui: UiStateService;
  const staff = signal<Staff | null>({ staffId: 9, username: 'pos', name: '門市 POS', level: 'POS' });

  beforeEach(async () => {
    staff.set({ staffId: 9, username: 'pos', name: '門市 POS', level: 'POS' });
    api = jasmine.createSpyObj<SaleStatusApiService>('api', ['status', 'update', 'updateCategory']);
    api.status.and.callFake(async () => sample());
    posApi = jasmine.createSpyObj<PosApiService>('posApi', ['menu', 'authHeaders'], { staff });
    posApi.menu.and.resolveTo(PREVIEW_MENU);
    TestBed.configureTestingModule({ providers: [
      { provide: SaleStatusApiService, useValue: api }, { provide: PosApiService, useValue: posApi }] });
    state = TestBed.inject(SaleStatusStateService); ui = TestBed.inject(UiStateService); ui.preview = false;
    await state.load();
  });

  it('勾選原料「珍珠」：珍珠奶茶與加料珍珠連動停售，其他不受影響', () => {
    state.toggle('inventory', 6, true);
    const d = state.data!;
    expect(state.productState(d.products[3])).toBe('linked');
    expect(state.productBlockers(d.products[3])).toEqual(['珍珠']);
    expect(state.toppingState(d.toppings[0])).toBe('linked');
    expect(state.productState(d.products[2])).toBe('on');
    expect(state.counts).toEqual({ products: 1, toppings: 1, materials: 1 });
    expect(state.preview.stop).toEqual(['原料「珍珠」']);
    expect(state.preview.linkedStop).toEqual(['飲品「珍珠奶茶」', '加料「珍珠」']);
  });

  it('半成品的原料停售：半成品與它的加料一起停售', () => {
    state.toggle('inventory', 3, true);
    const d = state.data!;
    expect(state.prepState(d.preps[0])).toBe('linked');
    expect(state.toppingBlockers(d.toppings[1])).toEqual(['紅茶包']);
    expect(state.preview.linkedStop.length).toBe(4);
  });

  async function loadNested(subLink: boolean): Promise<SaleStatus> {
    const nested = sample();
    nested.preps.push({ prepId: 2, name: '雙Q果', category: '底料', onSale: true, available: true, inventoryIds: [6], subPrepIds: [1],
      ingredients: [{ inventoryId: 6, subPrepId: null, link: true }, { inventoryId: null, subPrepId: 1, link: subLink }],
      usedByProducts: [], usedByToppings: [3] });
    nested.toppings.push({ toppingId: 3, name: '雙Q果', onSale: true, sellable: true, inventoryId: null, prepId: 2, stoppedBy: [] });
    api.status.and.callFake(async () => nested);
    await state.load();
    return state.data!;
  }

  it('半成品用別的半成品做（043）：連動的下層半成品或它的原料停售，上層半成品與加料一起停售', async () => {
    const d = await loadNested(true);
    expect(state.madeFrom(d.preps[1])).toBe('珍珠、茶凍');
    state.toggle('prep', 1, true);
    expect(state.prepState(d.preps[1])).toBe('linked');
    expect(state.toppingBlockers(d.toppings[2])).toEqual(['茶凍']);
    state.toggle('prep', 1, false);
    state.toggle('inventory', 3, true);
    expect(state.toppingBlockers(d.toppings[2])).toEqual(['紅茶包']);
    expect(state.preview.linkedStop).toContain('加料「雙Q果」');
  });

  it('不連動的材料（044 link＝false）停售：上層半成品照賣', async () => {
    const d = await loadNested(false);
    expect(state.madeFrom(d.preps[1])).toBe('珍珠、茶凍（不連動）');
    state.toggle('prep', 1, true);
    state.toggle('inventory', 3, true);
    expect(state.prepState(d.preps[1])).toBe('on');
    expect(state.toppingState(d.toppings[2])).toBe('on');
    expect(state.preview.linkedStop).not.toContain('加料「雙Q果」');
    state.toggle('inventory', 6, true);
    expect(state.toppingBlockers(d.toppings[2])).toEqual(['珍珠']);
  });

  it('show＝false（045）的項目不出現在停售管理頁，但連動照算', async () => {
    const data = sample();
    data.inventories[2].show = false;               // 中杯紙杯
    data.products[1].show = false;                  // 茉香綠茶
    data.inventories[1].show = false;               // 珍珠：隱藏但會連動
    api.status.and.callFake(async () => data);
    await state.load();
    state.selectKind('inventory');
    expect(state.groups.flatMap(g => g.rows.map(r => r.name))).toEqual(['紅茶包']);
    state.selectKind('product');
    expect(state.groups.flatMap(g => g.rows.map(r => r.name))).not.toContain('茉香綠茶');
    state.toggle('inventory', 6, true);
    expect(state.productState(state.data!.products[3])).toBe('linked');
    expect(state.productBlockers(state.data!.products[3])).toEqual(['珍珠']);
  });

  it('取消勾選回到原狀就不算變更；只有改過的送出', async () => {
    state.toggle('inventory', 6, true); state.toggle('inventory', 6, false);
    expect(state.changeCount).toBe(0);
    state.toggle('prep', 1, true); state.toggle('product', 2, true);
    api.update.and.callFake(async () => sample());
    await state.save();
    expect(api.update).toHaveBeenCalledWith({ inventories: [], preps: [{ id: 1, onSale: false }], products: [{ id: 2, onSale: false }], toppings: [] });
    expect(state.changeCount).toBe(0);
    expect(ui.notice).toBe('已儲存停售設定。');
  });

  it('種類 → 分類 → 品項：常用分類一定列出，沒分類的放「未分類」，分類上有停售數量', () => {
    state.selectKind('inventory');
    expect(state.categoriesOf('inventory')).toEqual(['包材', '茶葉', '底料', '水果', '未分類']);
    expect(state.categoriesOf('prep')).toEqual(['茶湯', '底料', '鮮果']);
    expect(state.categoriesOf('topping')).toEqual([]);
    expect(state.groups.map(g => g.category)).toEqual(['茶葉', '底料', '未分類']);
    state.selectCategory('底料');
    expect(state.groups.length).toBe(1); expect(state.groups[0].rows.map(r => r.name)).toEqual(['珍珠']);
    expect(state.groups[0].rows[0].affects).toEqual(['珍珠奶茶', '加料珍珠']);
    state.toggle('inventory', 6, true);
    expect(state.stoppedCount('inventory', '底料')).toBe(1); expect(state.stoppedCount('product')).toBe(1);
    expect(state.groups[0].rows[0].checked).toBeTrue();
    // 搜尋時不受分類限制；換種類會回到「全部」
    state.search = '紅茶'; expect(state.groups.flatMap(g => g.rows).map(r => r.name)).toEqual(['紅茶包']);
    state.search = ''; state.selectKind('product');
    expect(state.category).toBeNull(); expect(state.groups.map(g => g.category)).toEqual(['茶類', '奶茶']);
    expect(state.groups[1].rows.find(r => r.id === 4)!.reason).toBe('珍珠 停售');
  });

  it('只有店長、總部能改分類；改分類不會清掉還沒儲存的停售勾選', async () => {
    api.updateCategory.and.callFake(async () => { const d = sample(); d.inventories[2].category = '包材'; return d; });
    await state.setCategory('inventory', 1, '包材');
    expect(api.updateCategory).not.toHaveBeenCalled();
    staff.set({ staffId: 2, username: 'm', name: '店長', level: 'MANAGER' });
    state.toggle('inventory', 6, true);
    await state.setCategory('inventory', 1, ' 包材 ');
    expect(api.updateCategory).toHaveBeenCalledWith({ kind: 'INVENTORY', id: 1, category: '包材' });
    expect(state.categoriesOf('inventory')).not.toContain('未分類');
    expect(state.changeCount).toBe(1);
    await state.setCategory('prep', 1, '未分類');
    expect(api.updateCategory).toHaveBeenCalledWith({ kind: 'PREP', id: 1, category: null });
  });

  it('沒有修改權限的帳號不能勾選', () => {
    staff.set({ staffId: 1, username: 'a', name: '店員', level: 'STAFF' });
    state.toggle('inventory', 6, true);
    expect(state.changeCount).toBe(0);
  });
});
