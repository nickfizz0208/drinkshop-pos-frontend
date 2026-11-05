import { IconComponent } from '../../shared/icon.component';
import { Component, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../../shared/modal.component';
import { UiStateService } from '../../shared/ui-state.service';
import { OrdersStateService } from './orders-state.service';

@Component({
  selector: 'app-orders',
  imports: [IconComponent, FormsModule, ModalComponent],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.scss'
})
export class OrdersComponent implements OnDestroy {
  readonly state = inject(OrdersStateService);
  readonly ui = inject(UiStateService);
  ngOnDestroy(): void { this.state.closeTransient(); }
}
