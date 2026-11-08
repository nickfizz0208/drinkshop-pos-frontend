import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { ScheduleShiftComponent } from './schedule-shift.component';

describe('ScheduleShiftComponent', () => {
  let component: ScheduleShiftComponent;
  let fixture: ComponentFixture<ScheduleShiftComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScheduleShiftComponent],
      // 元件透過 PosApiService 呼叫後端，測試用假的 HttpClient，不會真的連線
      providers: [provideHttpClient(), provideHttpClientTesting()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ScheduleShiftComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
