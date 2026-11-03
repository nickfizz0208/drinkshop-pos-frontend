  import { Injectable, inject } from '@angular/core';
  import { Member } from '../models/pos';
  import { PosApiService } from './pos-api.service';


  @Injectable({ providedIn: 'root' })
  export class MemberService {
    private readonly api = inject(PosApiService);
    search(phone: string): Promise<Member[]> { return this.api.searchMembers(phone.replace(/\D/g, '')); }
  }
