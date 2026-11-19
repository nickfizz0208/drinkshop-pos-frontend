import { NumpadButtonComponent } from '../../shared/numpad-button.component';
import { IconComponent } from '../../shared/icon.component';
import { Component, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../../shared/modal.component';
import { UiStateService } from '../../shared/ui-state.service';
import { PosStateService } from './pos-state.service';
import { MemberSelectorComponent } from '../../member-selector/member-selector.component';
import { DrinkCardComponent } from '../../drink-card/drink-card.component';

@Component({
  selector: 'app-pos',
  imports: [NumpadButtonComponent, IconComponent, FormsModule, ModalComponent, MemberSelectorComponent, DrinkCardComponent],
  templateUrl: './pos.component.html',
  styleUrl: './pos.component.scss'
})
export class PosComponent implements OnDestroy {
  readonly state = inject(PosStateService);
  readonly ui = inject(UiStateService);

  get customizerQuantity(): number | null {
    const { qty } = this.state.selection;
    return Number.isNaN(qty) ? null : qty;
  }

  setCustomizerQuantity(qty: number | null): void {
    this.state.selection.qty = qty ?? Number.NaN;
    this.ui.modalError = '';
  }

  stepCustomizerQuantity(delta: -1 | 1): void {
    const { qty } = this.state.selection;
    const next = this.state.validCustomizerQuantity ? qty + delta : 1;
    this.setCustomizerQuantity(next);
  }

  ngOnDestroy(): void { this.state.closeTransient(); }
}
