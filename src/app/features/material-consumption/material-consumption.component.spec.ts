import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MaterialConsumptionComponent } from './material-consumption.component';
import { ConsumptionApiService } from '../../services/consumption-api.service';
import { UiStateService } from '../../shared/ui-state.service';

describe('物料消耗趨勢元件 (MaterialConsumptionComponent)', () => {
  let component: MaterialConsumptionComponent;
  let fixture: ComponentFixture<MaterialConsumptionComponent>;
  let api: jasmine.SpyObj<ConsumptionApiService>;

  const mockData = {
    year: 2026,
    month: 11,
    records: [
      { business_date: '2026-11-03', day_of_month: 3, inventory_id: 3, material_name: '紅茶包', unit: '包', total_consumed: 3 },
      { business_date: '2026-11-03', day_of_month: 3, inventory_id: 4, material_name: '綠茶包', unit: '包', total_consumed: 4 },
      { business_date: '2026-11-05', day_of_month: 5, inventory_id: 3, material_name: '紅茶包', unit: '包', total_consumed: 2 }
    ],
    materials: [
      { inventory_id: 3, name: '紅茶包', base_unit: '包' },
      { inventory_id: 4, name: '綠茶包', base_unit: '包' },
      { inventory_id: 5, name: '奶料', base_unit: '份' }
    ]
  };

  beforeEach(async () => {
    api = jasmine.createSpyObj<ConsumptionApiService>('ConsumptionApiService', ['getMonthlyConsumption']);
    api.getMonthlyConsumption.and.resolveTo(mockData);

    await TestBed.configureTestingModule({
      imports: [MaterialConsumptionComponent],
      providers: [
        { provide: ConsumptionApiService, useValue: api },
        UiStateService
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MaterialConsumptionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('應成功建立元件並自動載入月度消耗資料', async () => {
    expect(component).toBeTruthy();
    await component.loadData();
    expect(api.getMonthlyConsumption).toHaveBeenCalledWith(2026, 11);
    expect(component.materials.length).toBe(3);
    expect(component.records.length).toBe(3);
  });

  it('切換月份時應重新讀取該月份的數據', async () => {
    component.selectMonth(10);
    expect(component.currentMonth).toBe(10);
    expect(api.getMonthlyConsumption).toHaveBeenCalledWith(2026, 10);
  });

  it('可以點擊勾選或取消品項，並重新計算折線圖', async () => {
    await component.loadData();
    expect(component.selectedIds.has(3)).toBeTrue();

    // 取消勾選 3
    component.toggleMaterial(3);
    expect(component.selectedIds.has(3)).toBeFalse();

    // 再次勾選 3
    component.toggleMaterial(3);
    expect(component.selectedIds.has(3)).toBeTrue();
  });

  it('全選與全部清除按鈕應正常運作', async () => {
    await component.loadData();
    component.clearAll();
    expect(component.selectedIds.size).toBe(0);
    expect(component.seriesList.length).toBe(0);

    component.selectAll();
    expect(component.selectedIds.size).toBe(3);
    expect(component.seriesList.length).toBe(3);
  });
});
