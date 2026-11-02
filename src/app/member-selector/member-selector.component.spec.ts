import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemberSelectorComponent } from './member-selector.component';

describe('MemberSelectorComponent', () => {
  let component: MemberSelectorComponent;
  let fixture: ComponentFixture<MemberSelectorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemberSelectorComponent]
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
