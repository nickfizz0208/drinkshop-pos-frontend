// 打卡相關型別：對應後端 /api/shift-staff。時間格式：YYYY-MM-DDTHH:mm:ss（台北時間）。

export type ShiftStatus = 'NONE' | 'OPEN' | 'CLOSED';

export interface ClockRecord {
  shiftStaffId: number; businessDate: string; staffId: number; staffName: string | null;
  clockInAt: string; clockOutAt: string | null; onDuty: boolean;
  updatedBy: number | null; updatedAt: string | null;
}

/** canViewAll = 店長、總部：records 為全部；其他人只有「在班中的人」和自己的紀錄。 */
export interface ClockToday { businessDate: string; shiftStatus: ShiftStatus; records: ClockRecord[]; canViewAll: boolean; }

/** 店長修改；clockOutAt 為 null 代表改回「還在班」。後端不接受多餘欄位。 */
export interface ClockUpdate { clockInAt: string; clockOutAt: string | null; }
