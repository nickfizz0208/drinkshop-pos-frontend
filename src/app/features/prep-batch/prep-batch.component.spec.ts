import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { PrepBatchComponent } from './prep-batch.component';
import { PrepBatchApiService } from '../../services/prep-batch-api.service';
import { PosApiService } from '../../services/pos-api.service';
import { UiStateService } from '../../shared/ui-state.service';
import { Staff } from '../../models/pos';
import { PrepBatchRow } from '../../models/prep-batch';

describe('備料頁（隔離 API）', () => {
  let api: jasmine.SpyObj<PrepBatchApiService>;
  let posApi: jasmine.SpyObj<PosApiService>;
  let ui: UiStateService;
  const staff = signal<Staff | null>(null);
  const row = (over: Partial<PrepBatchRow> = {}): PrepBatchRow => ({ batchId: 1, businessDate: '2026-11-23', prepId: 1, prepName: '紅茶',
    qty: 4, madeBy: 31, madeByName: '小華', recordedBy: 30, recordedByName: '門市 POS', madeAt: '2026-11-23T11:20:05', note: null, ...over });

  async function create(level: string): Promise<PrepBatchComponent> {
    staff.set({ staffId: level === 'POS' ? 30 : 32, username: 'u', name: level === 'POS' ? '門市 POS' : '店長', level });
    api = jasmine.createSpyObj<PrepBatchApiService>('api', ['preps', 'day', 'create']);
    api.preps.and.resolveTo([{ prepId: 1, name: '紅茶', category: '茶湯' }, { prepId: 2, name: '熟波霸', category: '底料' }, { prepId: 3, name: '綠茶', category: '茶湯' }]);
    api.day.and.resolveTo({ businessDate: '2026-11-23', rows: [row({ batchId: 2, qty: 2 }), row()] });
    posApi = jasmine.createSpyObj<PosApiService>('posApi', ['staffOptions', 'authHeaders'], { staff });
    posApi.staffOptions.and.resolveTo([{ staffId: 31, name: '小華', level: 'STAFF' }]);
    TestBed.configureTestingModule({ imports: [PrepBatchComponent], providers: [
      { provide: PrepBatchApiService, useValue: api }, { provide: PosApiService, useValue: posApi }] });
    ui = TestBed.inject(UiStateService); ui.preview = false;
    const fixture = TestBed.createComponent(PrepBatchComponent);
    const component = fixture.componentInstance;
    component.date = component.today;
    await component.load(true);
    return component;
  }

  it('POS 機：要選誰煮的；登記後新的排最前面，合計照半成品加總', async () => {
    const c = await create('POS');
    expect(posApi.staffOptions).toHaveBeenCalled();
    expect(c.prepGroups.map(g => g.category + ':' + g.preps.map(p => p.name).join('、'))).toEqual(['茶湯:紅茶、綠茶', '底料:熟波霸']);
    expect(c.totals).toEqual([{ name: '紅茶', qty: 6 }]);
    c.prepId = 1; c.qty = 3;
    await c.submit();
    expect(c.error).toBe('請選擇是誰煮的。'); expect(api.create).not.toHaveBeenCalled();
    api.create.and.resolveTo(row({ batchId: 3, qty: 3 }));
    c.madeBy = 31; c.note = '  新茶葉 ';
    await c.submit();
    expect(api.create).toHaveBeenCalledWith({ prepId: 1, qty: 3, madeBy: 31, note: '新茶葉' });
    expect(c.rows[0].batchId).toBe(3); expect(c.qty).toBeNull(); expect(c.note).toBe('');
    expect(ui.notice).toContain('小華 煮了 紅茶 3 份');
  });

  it('個人帳號：不用選人，也不讀員工清單；份數要大於 0、最多兩位小數；看別天不能登記', async () => {
    const c = await create('MANAGER');
    expect(posApi.staffOptions).not.toHaveBeenCalled();
    c.prepId = 2; c.qty = 1.234;
    await c.submit(); expect(c.error).toContain('最多兩位小數');
    api.create.and.resolveTo(row({ batchId: 4, prepName: '熟波霸', madeBy: 32, madeByName: '店長', recordedBy: 32, recordedByName: '店長' }));
    c.qty = 1.5;
    await c.submit();
    expect(api.create).toHaveBeenCalledWith({ prepId: 2, qty: 1.5 });
    c.date = '2026-01-01';
    expect(c.canCreate).toBeFalse();
    api.create.calls.reset(); c.qty = 1;
    await c.submit(); expect(api.create).not.toHaveBeenCalled();
    expect(c.time(row())).toBe('11:20');
  });
});
