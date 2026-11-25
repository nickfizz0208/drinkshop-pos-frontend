/** 總部分店管理（後端 /api/hq-stores，055）。 */
export interface AdminStore {
  storeId: number;
  code: string;
  name: string;
  city: string | null;
  /** 北部、中部、南部、東部、離島、未設定 */
  region: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  active: boolean;
  /** 啟用中的員工帳號數 */
  staffCount: number;
  /** 今天的日結：OPEN 營業中、CLOSED 已收班；null＝還沒開班 */
  todayShift: 'OPEN' | 'CLOSED' | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export type StoreAuditAction = 'CREATE' | 'UPDATE' | 'DEACTIVATE' | 'ACTIVATE';

export interface StoreAuditLog {
  logId: number;
  action: StoreAuditAction;
  detail: string | null;
  staffName: string | null;
  createdAt: string;
}

export interface AdminStoreDetail {
  store: AdminStore;
  logs: StoreAuditLog[];
}

/** 新增時要給 code；修改時不送 code（代碼不能改）。 */
export interface StoreForm {
  code?: string;
  name: string;
  city: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
}

export interface CityOption { city: string; region: string; }

export interface GeocodeResult { lat: number; lng: number; label: string; needsReview: boolean; }

export const AUDIT_LABELS: Record<StoreAuditAction, string> = {
  CREATE: '新增', UPDATE: '修改', DEACTIVATE: '停用', ACTIVATE: '重新啟用'
};
