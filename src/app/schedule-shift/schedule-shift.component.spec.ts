import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ScheduleShiftComponent } from './schedule-shift.component';

describe('ScheduleShiftComponent', () => {
  let component: ScheduleShiftComponent;
  let fixture: ComponentFixture<ScheduleShiftComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScheduleShiftComponent]
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
