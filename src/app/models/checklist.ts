// 檢查表型別：對應後端 /api/checklist。後端不接受多餘欄位，送出的物件要跟這裡一致。

export type Frequency = 'DAILY' | 'WEEKLY';
export const FREQUENCY_LABELS: Record<Frequency, string> = { DAILY: '每日', WEEKLY: '每週' };

export interface ChecklistItem {
  itemId: number; name: string; frequency: Frequency; targetCount: number; active: boolean;
  createdAt: string; updatedAt: string;
}
export interface ItemCreate { name: string; frequency: Frequency; targetCount: number; }
export interface ItemUpdate extends ItemCreate { active: boolean; }

export interface ChecklistRecord {
  recordId: number; itemId: number; staffId: number; staffName: string | null; period: string; doneAt: string;
}
/** 檢查表畫面的一列：這一期（今天／本週）完成幾次、目標幾次、誰做的。 */
export interface BoardRow {
  itemId: number; name: string; frequency: Frequency; period: string;
  targetCount: number; doneCount: number; completed: boolean; records: ChecklistRecord[];
}
/** 打勾：POS 帳號要帶 staffId（選在班的人）；個人帳號不帶，一律記成自己。 */
export interface RecordCreate { itemId: number; staffId?: number; }
