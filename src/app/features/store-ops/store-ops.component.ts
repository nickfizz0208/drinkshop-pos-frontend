import { NumpadButtonComponent } from '../../shared/numpad-button.component';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../../shared/modal.component';
import { StoreOpsStateService } from './store-ops-state.service';
import { formatQty } from '../../shared/pack-format';
import { taipeiDate } from '../../models/pos';

@Component({
  selector: 'app-store-ops',
  imports: [NumpadButtonComponent, FormsModule, ModalComponent],
  templateUrl: './store-ops.component.html',
  styleUrl: './store-ops.component.scss'
})
export class StoreOpsComponent implements OnInit, OnDestroy {
  readonly state = inject(StoreOpsStateService);
  readonly ui = this.state.ui;
  ngOnInit(): void { void this.state.load(); }
  ngOnDestroy(): void { this.state.closeTransient(); }
  changeDate(): void { void this.state.load(); }
  changeMonth(): void {
    if (!this.state.month) this.state.month = taipeiDate().slice(0, 7);
    void this.state.load();
  }
  get today(): string { return taipeiDate(); }
  /** 原料名稱；找不到時顯示編號。 */
  nameOf(inventoryId: number): string { return this.state.inventory.find(i => i.inventoryId === inventoryId)?.name ?? '#' + inventoryId; }
  /** 原料數量：芒果這類原料顯示成「5 籃 3 顆」；找不到原料時照數字顯示。 */
  qtyOf(inventoryId: number, qty: number, unit = ''): string {
    const item = this.state.inventory.find(i => i.inventoryId === inventoryId);
    return formatQty(qty, item ?? { baseUnit: unit }).trim();
  }
}
