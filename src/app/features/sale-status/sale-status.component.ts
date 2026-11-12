import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../../shared/modal.component';
import { SALE_KINDS, SaleKind } from '../../models/sale-status';
import { SaleState, SaleStatusStateService } from './sale-status-state.service';

/** 停售管理頁：勾選停售的飲品、加料、原料、半成品；原料停售時，用到它的飲品與加料一起停售。 */
@Component({
  selector: 'app-sale-status',
  imports: [FormsModule, ModalComponent],
  templateUrl: './sale-status.component.html',
  styleUrl: './sale-status.component.scss'
})
export class SaleStatusComponent implements OnInit, OnDestroy {
  readonly state = inject(SaleStatusStateService);
  readonly ui = this.state.ui;
  readonly kinds = SALE_KINDS;
  get kindLabel(): string { return SALE_KINDS.find(k => k.kind === this.state.kind)?.label ?? ''; }

  ngOnInit(): void { void this.state.load(); }
  ngOnDestroy(): void { this.state.closeTransient(); }

  toggle(kind: SaleKind, id: number, event: Event): void {
    this.state.toggle(kind, id, (event.target as HTMLInputElement).checked);
  }
  stateLabel(s: SaleState): string { return s === 'on' ? '販售中' : s === 'stopped' ? '停售' : '連動停售'; }
}
