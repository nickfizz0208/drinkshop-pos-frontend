import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../../shared/modal.component';
import { StoreOpsStateService } from './store-ops-state.service';

@Component({
  selector: 'app-store-ops',
  imports: [FormsModule, ModalComponent],
  templateUrl: './store-ops.component.html',
  styleUrl: './store-ops.component.scss'
})
export class StoreOpsComponent implements OnInit, OnDestroy {
  readonly state = inject(StoreOpsStateService);
  readonly ui = this.state.ui;
  ngOnInit(): void { void this.state.load(); }
  ngOnDestroy(): void { this.state.closeTransient(); }
  changeDate(): void {
    this.state.countedCash = null; this.state.diffReason = ''; this.state.closing = null;
    void this.state.load();
  }
}
