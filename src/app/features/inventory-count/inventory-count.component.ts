import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../../shared/modal.component';
import { money } from '../../models/pos';
import { INPUT_MODE_LABELS, InputMode, InventoryItem } from '../../models/inventory-count';
import { InventoryCountStateService } from './inventory-count-state.service';
import { PackInfo, formatDiff, formatQty } from '../../shared/pack-format';

/** 原料盤點頁：填實點數量（幾包＋零散），確認後送出；下方可查歷次盤點。 */
@Component({
  selector: 'app-inventory-count',
  imports: [FormsModule, ModalComponent],
  templateUrl: './inventory-count.component.html',
  styleUrl: './inventory-count.component.scss'
})
export class InventoryCountComponent implements OnInit, OnDestroy {
  readonly state = inject(InventoryCountStateService);
  readonly ui = this.state.ui;
  readonly money = money;

  ngOnInit(): void { void this.state.load(); }
  ngOnDestroy(): void { this.state.closeTransient(); }

  /** 數量顯示：最多兩位小數，去掉多餘的 0。 */
  qty(n: number): string { return Number(n.toFixed(2)).toLocaleString('zh-TW', { maximumFractionDigits: 2 }); }
  signed(n: number): string { return (n > 0 ? '+' : '') + this.qty(n); }
  signedMoney(n: number): string { return n > 0 ? '+' + money(n) : n < 0 ? '−' + money(-n) : money(0); }
  modeLabel(mode: InputMode): string { return INPUT_MODE_LABELS[mode]; }
  /** 數量與差異：芒果這類原料顯示成「5 籃 3 顆」「−1 籃、+17 顆」。 */
  q(qty: number, item: PackInfo): string { return formatQty(qty, item); }
  d(counted: number, book: number, item: PackInfo): string { return formatDiff(counted, book, item); }
  low(item: InventoryItem): boolean { return item.bookQty < item.safetyStock; }
  time(value: string): string { return value.replace('T', ' ').slice(0, 16); }
  trackItem(_: number, item: InventoryItem): number { return item.inventoryId; }
}
