// 排班相關型別：對應後端 /api/schedule 與 /api/staff。時間格式：日期 YYYY-MM-DD，時間 HH:mm:ss。

export interface StaffOption { staffId: number; name: string; level: string; }

/** 排班標籤（取代班別）：開班、支援、收班、休息…不帶時間，一段班可以貼多個。description 是說明，例如休息半小時。 */
export interface ScheduleTag { tagId: number; name: string; description: string | null; active: boolean; }
export interface TagSave { name: string; description: string | null; }
export interface TagUpdate extends TagSave { active: boolean; }

/** 班別範本提供預設時間，排班仍可另外選擇標籤。 */
export interface ShiftTemplate { templateId: number; name: string; startTime: string; endTime: string; active: boolean; }
export interface TemplateSave { name: string; startTime: string; endTime: string; }
export interface TemplateUpdate extends TemplateSave { active: boolean; }

export interface ScheduleEntry {
  scheduleId: number; workDate: string; staffId: number; staffName: string | null;
  templateId: number | null; templateName: string | null;
  startTime: string; endTime: string; note: string | null; updatedAt: string;
  /** 標籤編號與名稱，順序相同。 */
  tagIds: number[]; tagNames: string[];
}
/** 時間必填；tagIds 可以是空陣列。 */
export interface EntrySave {
  workDate: string; staffId: number;
  templateId?: number;
  startTime: string; endTime: string; note: string | null; tagIds: number[];
}
export interface SaveResult { entry: ScheduleEntry; warnings: string[]; }

export interface ScheduleWeek {
  weekStart: string; weekEnd: string;
  published: boolean; publishedAt: string | null; publishedBy: number | null;
  modifiedAfterPublish: boolean;
  /** 店長、總部為 true，前端依此顯示編輯功能。 */
  canEdit: boolean;
  entries: ScheduleEntry[]; warnings: string[];
}
