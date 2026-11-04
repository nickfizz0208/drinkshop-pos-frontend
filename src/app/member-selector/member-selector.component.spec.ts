import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemberSelectorComponent } from './member-selector.component';
import { MemberService } from '../services/member.service';
import { PosApiService } from '../services/pos-api.service';

describe('MemberSelectorComponent', () => {
  let component: MemberSelectorComponent;
  let fixture: ComponentFixture<MemberSelectorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemberSelectorComponent],
      providers: [
        // 測試不打後端：會員搜尋與路線都用假資料
        { provide: MemberService, useValue: { search: () => Promise.resolve([{ phone: '0900000001', name: '測試會員甲' }]) } },
        { provide: PosApiService, useValue: { memberRoute: () => new Promise(() => {}) } }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MemberSelectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
