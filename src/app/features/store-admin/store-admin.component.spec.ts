import { TestBed } from '@angular/core/testing';
import { StoreAdminComponent } from './store-admin.component';
import { PosApiService } from '../../services/pos-api.service';
import { AdminStore } from '../../models/store-admin';

function store(id: number, code: string, name: string, city: string | null, region: string, active = true): AdminStore {
  return { storeId: id, code, name, city, region, address: null, phone: null, lat: id === 1 ? 22.6 : null, lng: id === 1 ? 120.3 : null,
    active, staffCount: 2, todayShift: id === 1 ? 'OPEN' : null, createdAt: null, updatedAt: null };
}

describe('StoreAdminComponent', () => {
  let api: jasmine.SpyObj<PosApiService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<PosApiService>('api',
      ['adminStores', 'adminStoreCities', 'adminStore', 'createAdminStore', 'updateAdminStore', 'setAdminStoreActive', 'geocodeStoreAddress']);
    api.adminStores.and.resolveTo([
      store(2, 'KL', '基隆店', '基隆市', '北部'),
      store(1, 'QZ', '前鎮店', '高雄市', '南部'),
      store(3, 'MG', '馬公店', '澎湖縣', '離島', false)]);
    api.adminStoreCities.and.resolveTo([{ city: '高雄市', region: '南部' }, { city: '基隆市', region: '北部' }]);
    await TestBed.configureTestingModule({ imports: [StoreAdminComponent], providers: [{ provide: PosApiService, useValue: api }] }).compileComponents();
  });

  it('groups stores by region and filters', async () => {
    const fixture = TestBed.createComponent(StoreAdminComponent);
    const c = fixture.componentInstance;
    await c.load();
    expect(c.groups.map(g => g.region)).toEqual(['北部', '南部', '離島']);
    expect(c.activeCount).toBe(2);
    expect(c.openTodayCount).toBe(1);
    expect(c.missingCoordsCount).toBe(1);
    c.showInactive = false;
    expect(c.groups.map(g => g.region)).toEqual(['北部', '南部']);
    c.keyword = 'qz';
    expect(c.filtered.map(s => s.code)).toEqual(['QZ']);
  });

  it('validates the form before calling the API and uppercases the code', async () => {
    const fixture = TestBed.createComponent(StoreAdminComponent);
    const c = fixture.componentInstance;
    c.openCreate();
    c.form = { code: 'f', name: '鳳山店', city: '高雄市', address: '', phone: '', lat: null, lng: null };
    await c.save();
    expect(c.formError).toContain('代碼');
    expect(api.createAdminStore).not.toHaveBeenCalled();

    c.form = { code: 'fs', name: '鳳山店', city: '高雄市', address: '', phone: '', lat: 22.6, lng: null };
    await c.save();
    expect(c.formError).toContain('一起');

    api.createAdminStore.and.resolveTo({ store: store(4, 'FS', '鳳山店', '高雄市', '南部'), logs: [] });
    c.form = { code: 'fs', name: ' 鳳山店 ', city: '高雄市', address: '', phone: '', lat: null, lng: null };
    await c.save();
    expect(api.createAdminStore).toHaveBeenCalledWith({ code: 'FS', name: '鳳山店', city: '高雄市', address: null, phone: null, lat: null, lng: null });
    expect(c.formMode).toBeNull();
  });

  it('requires a reason to deactivate', async () => {
    const fixture = TestBed.createComponent(StoreAdminComponent);
    const c = fixture.componentInstance;
    api.adminStore.and.resolveTo({ store: store(1, 'QZ', '前鎮店', '高雄市', '南部'), logs: [] });
    await c.openDetail(store(1, 'QZ', '前鎮店', '高雄市', '南部'));
    c.deactivating = true;
    await c.confirmDeactivate();
    expect(c.detailError).toContain('原因');
    expect(api.setAdminStoreActive).not.toHaveBeenCalled();
  });
});
