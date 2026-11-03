import { Component, EventEmitter, OnDestroy, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Member } from '../models/pos';
import { ModalComponent } from '../shared/modal.component';
import { MemberService } from '../services/member.service';
import { errorMessage} from '../services/pos-api.service';

@Component({
  selector: 'app-member-selector',
  imports: [FormsModule, ModalComponent],
  templateUrl: './member-selector.component.html',
  styleUrl: './member-selector.component.scss'
})
export class MemberSelectorComponent implements OnDestroy {
  private readonly members = inject(MemberService);
  @Output() selected = new EventEmitter<Member>();
  @Output() dismissed = new EventEmitter<void>();

  readonly minDigits = 3;
  phone = '';
  results: Member[] = [];
  loading = false;
  searched = false;
  error = '';
  private timer?: ReturnType<typeof setTimeout>;
  private searchToken = 0;

  onPhoneInput(input: HTMLInputElement): void {
    const value = input.value.replace(/\D/g, '');
    input.value = value;          // 直接改畫面上的值，打 - 會馬上消失
    this.phone = value;
    clearTimeout(this.timer);
    const token = ++this.searchToken;
    this.error = '';
    if (this.phone.length < this.minDigits) {
      this.results = []; this.searched = false; this.loading = false;
      return;
    }
    this.loading = true;
    // 停止輸入 300ms 後才搜尋，避免每按一個鍵就打一次 API。
    this.timer = setTimeout(() => void this.search(this.phone, token), 300);
  }

  private async search(digits: string, token: number): Promise<void> {
    try {
      const rows = await this.members.search(digits);
      if (token === this.searchToken) { this.results = rows; this.searched = true; }
    } catch (error) {
      if (token === this.searchToken) { this.results = []; this.error = errorMessage(error); }
    } finally {
      if (token === this.searchToken) this.loading = false;
    }
  }

  /** 按 Enter 時，只有剛好一筆結果才直接選取，避免選錯人。 */
  pickOnlyResult(): void {
    if (!this.loading && this.results.length === 1) this.selected.emit(this.results[0]);
  }

  ngOnDestroy(): void { clearTimeout(this.timer); this.searchToken++; }
}
