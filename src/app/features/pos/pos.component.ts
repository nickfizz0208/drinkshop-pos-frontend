import { IconComponent } from '../../shared/icon.component';
import { Component, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../../shared/modal.component';
import { UiStateService } from '../../shared/ui-state.service';
import { PosStateService } from './pos-state.service';
import { MemberSelectorComponent } from '../../member-selector/member-selector.component';

@Component({
  selector: 'app-pos',
  imports: [IconComponent, FormsModule, ModalComponent, MemberSelectorComponent],
  templateUrl: './pos.component.html',
  styleUrl: './pos.component.scss'
})
export class PosComponent implements OnDestroy {
  readonly state = inject(PosStateService);
  readonly ui = inject(UiStateService);
  ngOnDestroy(): void { this.state.closeTransient(); }
}
