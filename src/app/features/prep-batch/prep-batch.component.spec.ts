import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { PrepBatchComponent } from './prep-batch.component';
import { PrepBatchApiService } from '../../services/prep-batch-api.service';
import { PosApiService } from '../../services/pos-api.service';
import { UiStateService } from '../../shared/ui-state.service';
import { Staff } from '../../models/pos';
import { PrepBatchRow, PrepWasteRow } from '../../models/prep-batch';

describe('備料頁（隔離 API）', () => {
  let api: jasmine.SpyObj<PrepBatchApiService>;
  let posApi: jasmine.SpyObj<PosApiService>;
  let ui: UiStateService;
  const staff = signal<Staff | null>(null);
  const row = (over: Partial<PrepBatchRow> = {}): PrepBatchRow => ({ batchId: 1, businessDate: '2026-11-23', prepId: 1, prepName: '紅茶',
    qty: 4, madeBy: 31, madeByName: '小華', recordedBy: 30, recordedByName: '門市 POS', madeAt: '2026-11-23T11:20:05', note: null, ...over });
  const waste = (over: Partial<PrepWasteRow> = {}): PrepWasteRow => ({ wasteId: 1, businessDate: '2026-11-23', prepId: 1, prepName: '紅茶',
    qty: 1, wastedBy: 31, wastedByName: '小華', recordedBy: 31, recordedByName: '小華', wastedAt: '2026-11-23T15:00:00', note: '放太久', ...over });

  async function create(level: string): Promise<PrepBatchComponent> {
    staff.set({ staffId: level === 'POS' ? 30 : 32, username: 'u', name: level === 'POS' ? '門市 POS' : '店長', level });
    api = jasmine.createSpyObj<PrepBatchApiService>('api', ['preps', 'day', 'create', 'createWaste']);
    api.preps.and.resolveTo([{ prepId: 1, name: '紅茶', category: '茶湯' }, { prepId: 2, name: '熟波霸', category: '底料' }, { prepId: 3, name: '綠茶', category: '茶湯' }]);
    api.day.and.resolveTo({ businessDate: '2026-11-23', rows: [row({ batchId: 2, qty: 2, madeAt: '2026-11-23T13:00:00' }), row()], wastes: [waste()],
      summary: [{ prepId: 1, name: '紅茶', category: '茶湯', made: 6, used: 3.5, wasted: 1, remaining: 1.5 },
                { prepId: 2, name: '熟波霸', category: '底料', made: 0, used: 2, wasted: 0, remaining: -2 }] });
    posApi = jasmine.createSpyObj<PosApiService>('posApi', ['staffOptions', 'authHeaders'], { staff });
    posApi.staffOptions.and.resolveTo([{ staffId: 31, name: '小華', level: 'STAFF' }]);
    TestBed.configureTestingModule({ imports: [PrepBatchComponent], providers: [
      { provide: PrepBatchApiService, useValue: api }, { provide: PosApiService, useValue: posApi }] });
    ui = TestBed.inject(UiStateService); ui.preview = false;
    const component = TestBed.createComponent(PrepBatchComponent).componentInstance;
    component.date = component.today;
    await component.load(true);
    return component;
  }

  it('POS 機：要選誰做的；登記後重新讀取；備料和報廢合成一張紀錄表，新的在前', async () => {
    const c = await create('POS');
    expect(posApi.staffOptions).toHaveBeenCalled();
    expect(c.prepGroups.map(g => g.category + ':' + g.preps.map(p => p.name).join('、'))).toEqual(['茶湯:紅茶、綠茶', '底料:熟波霸']);
    expect(c.log.map(l => `${c.time(l.at)} ${l.kind}`)).toEqual(['15:00 waste', '13:00 made', '11:20 made']);
    expect(c.log[2].recordedBy).toBe('門市 POS'); expect(c.log[0].recordedBy).toBeNull();
    expect(c.hasShort).toBeTrue();
    c.prepId = 1; c.qty = 3;
    await c.submit();
    expect(c.error).toBe('請選擇是誰做的。'); expect(api.create).not.toHaveBeenCalled();
    api.create.and.resolveTo(row({ batchId: 3, qty: 3 }));
    c.who = 31; c.note = '  新茶葉 ';
    await c.submit();
    expect(api.create).toHaveBeenCalledWith({ prepId: 1, qty: 3, madeBy: 31, note: '新茶葉' });
    expect(api.day).toHaveBeenCalledTimes(2);
    expect(c.qty).toBeNull(); expect(c.note).toBe('');
    expect(ui.notice).toContain('小華 做了 紅茶 3 份');
  });

  it('報廢：原因必填；POS 選處理的人', async () => {
    const c = await create('POS');
    c.setMode('waste'); c.prepId = 1; c.qty = 0.29; c.who = 31;
    await c.submit();
    expect(c.error).toBe('請填寫報廢原因。'); expect(api.createWaste).not.toHaveBeenCalled();
    api.createWaste.and.resolveTo(waste({ wasteId: 2 }));
    c.note = '放太久';
    await c.submit();
    expect(api.createWaste).toHaveBeenCalledWith({ prepId: 1, qty: 0.29, wastedBy: 31, note: '放太久' });
    expect(ui.notice).toContain('已登記報廢');
  });

  it('個人帳號：不用選人，也不讀員工清單；份數最多兩位小數；看別天不能登記', async () => {
    const c = await create('MANAGER');
    expect(posApi.staffOptions).not.toHaveBeenCalled();
    c.prepId = 2;
    for (const qty of [0, -1, 1.234, 100000000]) {
      c.qty = qty;
      await c.submit();
      expect(c.error).withContext(String(qty)).toContain('最多兩位小數');
      expect(api.create).not.toHaveBeenCalled();
    }
    api.create.and.resolveTo(row({ batchId: 4, prepName: '熟波霸', madeBy: 32, madeByName: '店長', recordedBy: 32, recordedByName: '店長' }));
    for (const qty of [0.01, 1.15, 1.5, 99999999.99]) {
      c.qty = qty;
      await c.submit();
      expect(api.create).toHaveBeenCalledWith({ prepId: 2, qty });
    }
    c.date = '2026-01-01';
    expect(c.canCreate).toBeFalse();
    api.create.calls.reset(); c.qty = 1;
    await c.submit(); expect(api.create).not.toHaveBeenCalled();
    expect(c.num(1.5)).toBe('1.5'); expect(c.num(2)).toBe('2');
  });
});
