/**
 * 備料（後端 050、051）：誰做了什麼半成品、幾份，以及剩下的半成品倒掉幾份。
 * 只做紀錄：沒有半成品庫存，也不扣原料。做半成品用掉的原料由物料消耗報表照材料用量計算。
 */
export interface PrepOption { prepId: number; name: string; category: string | null; }
/** 一筆備料。madeAt：登記時間（台北時間 yyyy-MM-ddTHH:mm[:ss]）；recordedBy：登記的帳號（POS 機登記時是 POS 帳號）。 */
export interface PrepBatchRow {
  batchId: number; businessDate: string; prepId: number; prepName: string; qty: number;
  madeBy: number; madeByName: string; recordedBy: number; recordedByName: string; madeAt: string; note: string | null;
}
/** 一筆半成品報廢（051）。note 是原因。 */
export interface PrepWasteRow {
  wasteId: number; businessDate: string; prepId: number; prepName: string; qty: number;
  wastedBy: number; wastedByName: string; recordedBy: number; recordedByName: string; wastedAt: string; note: string;
}
/** 一種半成品這一天的總覽：做了、訂單用了、倒掉幾份；remaining＝made − used − wasted（只是參考，不是庫存）。 */
export interface PrepSummary {
  prepId: number; name: string; category: string | null; made: number; used: number; wasted: number; remaining: number;
}
export interface PrepBatchDay { businessDate: string; rows: PrepBatchRow[]; wastes?: PrepWasteRow[]; summary?: PrepSummary[]; }
/** 登記一筆備料。madeBy：POS 共用帳號必填（做的人）；個人帳號不用給，後端記成自己。 */
export interface PrepBatchCreate { prepId: number; qty: number; madeBy?: number; note?: string; }
/** 登記一筆半成品報廢。wastedBy 規則和 madeBy 一樣；note 是原因，必填。 */
export interface PrepWasteCreate { prepId: number; qty: number; wastedBy?: number; note: string; }
/** 紀錄列表的一列：備料或報廢。 */
export interface PrepLogLine {
  key: string; kind: 'made' | 'waste'; at: string; prepName: string; qty: number; who: string; recordedBy: string | null; note: string | null;
}
