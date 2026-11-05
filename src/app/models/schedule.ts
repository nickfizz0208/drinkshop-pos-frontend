// 排班相關型別：對應後端 /api/schedule 與 /api/staff。時間格式：日期 YYYY-MM-DD，時間 HH:mm:ss。

export interface StaffOption { staffId: number; name: string; level: string; }

export interface ShiftTemplate { templateId: number; name: string; startTime: string; endTime: string; active: boolean; }
export interface TemplateSave { name: string; startTime: string; endTime: string; }
export interface TemplateUpdate extends TemplateSave { active: boolean; }

export interface ScheduleEntry {
  scheduleId: number; workDate: string; staffId: number; staffName: string | null;
  templateId: number | null; templateName: string | null;
  startTime: string; endTime: string; note: string | null; updatedAt: string;
}
/** 有 templateId 時，startTime／endTime 可省略（取班別時間）。 */
export interface EntrySave {
  workDate: string; staffId: number; templateId: number | null;
  startTime: string | null; endTime: string | null; note: string | null;
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
