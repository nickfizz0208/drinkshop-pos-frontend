import { AfterViewInit, OnDestroy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';

@Component({
  selector: 'app-modal',
  standalone: true,
  template: `
    <dialog #dialog (cancel)="cancel($event)" (click)="backdrop($event)" [attr.aria-label]="title">
      <div class="modal-head"><div><p class="eyebrow">{{ subtitle }}</p><h2>{{ title }}</h2></div>
        <button type="button" class="icon-button" aria-label="關閉視窗" [disabled]="busy" (click)="dismissed.emit()">×</button>
      </div>
      <ng-content />
    </dialog>
  `,
  styles: [`
    dialog { border: 1px solid var(--border-color); border-radius: 22px; padding: 0; color: var(--text-main); background: white; width: min(590px, calc(100vw - 32px)); max-height: calc(100dvh - 40px); box-shadow: 0 24px 80px #253b3326; margin: auto; }
    dialog::backdrop { background: #243c3459; backdrop-filter: blur(3px); }
    .modal-head { position: sticky; top: 0; z-index: 2; background: white; display: flex; justify-content: space-between; align-items: center; padding: 25px 28px 20px; border-bottom: 1px solid var(--border-color); }
    .eyebrow { margin: 0 0 5px; font-size: 11px; letter-spacing: 2px; color: var(--text-muted); }
    h2 { margin: 0; font-size: 23px; }
  `]
})
export class ModalComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) title = '';
  @Input() subtitle = 'QINGRI · 門市工作台';
  @Input() busy = false;
  @Output() dismissed = new EventEmitter<void>();
  @ViewChild('dialog', { static: true }) dialog!: ElementRef<HTMLDialogElement>;
  private previousOverflow = '';
  ngAfterViewInit(): void {
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.dialog.nativeElement.showModal();
  }
  ngOnDestroy(): void {
    this.dialog.nativeElement.close();
    document.body.style.overflow = this.previousOverflow;
  }
  cancel(event: Event): void { event.preventDefault(); if (!this.busy) this.dismissed.emit(); }
  backdrop(event: MouseEvent): void { if (event.target === this.dialog.nativeElement && !this.busy) this.dismissed.emit(); }
}
