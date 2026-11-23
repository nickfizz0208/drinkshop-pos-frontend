/** 備料（後端 050）：誰煮了什麼半成品、幾份。只做紀錄，不扣原料、不改半成品數量。 */
export interface PrepOption { prepId: number; name: string; category: string | null; }
/** 一筆備料。madeAt：登記時間（台北時間 yyyy-MM-ddTHH:mm[:ss]）；recordedBy：登記的帳號（POS 機登記時是 POS 帳號）。 */
export interface PrepBatchRow {
  batchId: number; businessDate: string; prepId: number; prepName: string; qty: number;
  madeBy: number; madeByName: string; recordedBy: number; recordedByName: string; madeAt: string; note: string | null;
}
export interface PrepBatchDay { businessDate: string; rows: PrepBatchRow[]; }
/** 登記一筆備料。madeBy：POS 共用帳號必填（煮的人）；個人帳號不用給，後端記成自己。 */
export interface PrepBatchCreate { prepId: number; qty: number; madeBy?: number; note?: string; }
