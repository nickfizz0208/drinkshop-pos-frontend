import { IconComponent } from '../../shared/icon.component';
import { Component, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../../shared/modal.component';
import { UiStateService } from '../../shared/ui-state.service';
import { OrdersStateService } from './orders-state.service';
import { ShiftCashComponent } from './shift-cash.component';

@Component({
  selector: 'app-orders',
  imports: [IconComponent, FormsModule, ModalComponent, ShiftCashComponent],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.scss'
})
export class OrdersComponent implements OnDestroy {
  readonly state = inject(OrdersStateService);
  readonly ui = inject(UiStateService);
  /** 「班次與現金」彈窗。 */
  shiftCashOpen = false;
  ngOnDestroy(): void { this.state.closeTransient(); }
}
