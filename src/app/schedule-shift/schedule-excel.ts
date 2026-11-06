import type { Borders, Cell, Fill } from 'exceljs';
import { ScheduleEntry, ScheduleWeek, StaffOption } from '../models/schedule';
import { HOLIDAYS, isOffDay } from './holidays';

/**
 * 班表匯出成 Excel（.xlsx），仿紙本班表風格：
 * - 左邊藍灰色姓名欄；表頭兩列（星期、日期），第三列標節日名稱
 * - 每位在職員工一列，沒排班顯示紅色「休」；隔列灰底
 * - 時間簡寫：8:30 → 8.5、整點不寫分、其他寫 9:15；有備註的班加「#」，備註列在表格下方
 * - 週末與國定假日整欄斜線
 * exceljs 體積大，按下匯出才載入（dynamic import）。
 */
export async function downloadScheduleExcel(week: ScheduleWeek, staff: StaffOption[], shopName = '青日茶所'): Promise<void> {
  const { Workbook } = await import('exceljs');
  const wb = new Workbook();
  wb.creator = shopName;
  const ws = wb.addWorksheet('班表', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4, showGridLines: false }] });

  const days = Array.from({ length: 7 }, (_, i) => addDays(week.weekStart, i));
  const lastCol = days.length + 2;               // 姓名 + 7 天 + 時數
  const dayCol = (i: number) => i + 2;

  // ---------- 第 1 列：標題 ----------
  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell(1, 1);
  title.value = `${shopName} 班表　${slash(week.weekStart)} – ${slash(week.weekEnd)}${week.published ? '' : '（草稿・尚未發布）'}`;
  title.font = { size: 14, bold: true };
  title.alignment = { vertical: 'middle' };
  ws.getRow(1).height = 26;

  // ---------- 第 2～4 列：星期／日期／節日 ----------
  const headerRows = [
    ['', ...days.map(d => `週${weekday(d)}`), ''],
    ['', ...days.map(d => parse(d).getDate()), '時數'],
    ['', ...days.map(d => HOLIDAYS[d] ?? ''), ''],
  ];
  headerRows.forEach((values, r) => {
    const row = ws.getRow(r + 2);
    row.values = values;
    row.height = r === 2 ? 16 : 20;
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { size: r === 2 ? 9 : 11, color: { argb: r === 0 ? 'FF595959' : r === 2 ? 'FFC00000' : 'FF000000' } };
      if (c === 1) cell.fill = solid(NAME_BG);
      else if (r === 2) { cell.fill = solid(BAND); if (c - 2 < 7 && isOffDay(days[c - 2])) cell.fill = hatch(BAND); }
      if (r === 1) cell.border = { bottom: LINE };
    }
  });

  // ---------- 員工列 ----------
  const byStaff = new Map<number, ScheduleEntry[]>();
  for (const e of week.entries) byStaff.set(e.staffId, [...(byStaff.get(e.staffId) ?? []), e]);
  // 所有在職員工都列（沒班顯示休）；本週有班但已不在清單上的人接在最後
  const people = [
    ...staff.map(s => ({ id: s.staffId, name: s.name })),
    ...[...byStaff.keys()].filter(id => !staff.some(s => s.staffId === id))
      .map(id => ({ id, name: byStaff.get(id)![0].staffName ?? `#${id}` })),
  ];
  const notes: string[] = [];

  people.forEach((p, i) => {
    const entries = byStaff.get(p.id) ?? [];
    const banded = i % 2 === 0;                  // 跟截圖一樣：第一列就是灰底
    const cells = days.map(d => entries.filter(e => e.workDate === d)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map(e => {
        if (e.note) notes.push(`${p.name} ${monthDay(d)}（${weekday(d)}）${short(e.startTime)}-${short(e.endTime)}：${e.note}`);
        // 第一行時間，有標籤時第二行列標籤，例如「開班・休息」
        const tags = e.tagNames?.length ? `\n${e.tagNames.join('・')}` : '';
        return `${short(e.startTime)}-${short(e.endTime)}${e.note ? '#' : ''}${tags}`;
      }).join('\n') || '休');
    const total = entries.reduce((sum, e) => sum + minutes(e.endTime) - minutes(e.startTime), 0) / 60;
    const row = ws.addRow([p.name, ...cells, total || '']);
    const lines = Math.max(1, ...cells.map(c => c.split('\n').length));
    row.height = Math.max(22, lines * 16 + 6);

    row.eachCell({ includeEmpty: true }, (cell: Cell, col: number) => {
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      if (col === 1) {
        cell.fill = solid(NAME_BG);
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        return;
      }
      const bg = banded ? BAND : 'FFFFFFFF';
      const dayIndex = col - 2;
      cell.fill = dayIndex < 7 && isOffDay(days[dayIndex]) ? hatch(bg) : solid(bg);
      cell.border = GRID;
      cell.font = cell.value === '休' ? { color: { argb: 'FFFF0000' } } : { color: { argb: 'FF000000' } };
    });
    const totalCell = row.getCell(lastCol);
    totalCell.numFmt = '0.##';   // 12.75 小時不要被四捨五入成 12.8
    totalCell.font = { color: { argb: 'FF595959' } };
  });

  // ---------- 上班人數 ----------
  const counts = days.map(d => new Set(week.entries.filter(e => e.workDate === d).map(e => e.staffId)).size);
  const sumRow = ws.addRow(['上班人數', ...counts, '']);
  sumRow.height = 20;
  sumRow.eachCell({ includeEmpty: true }, (cell: Cell, col: number) => {
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.font = col === 1 ? { color: { argb: 'FFFFFFFF' }, bold: true } : { bold: true };
    cell.fill = col === 1 ? solid(NAME_BG) : solid('FFF2F2F2');
    cell.border = { top: LINE, bottom: LINE };
  });

  // ---------- 備註（# 的說明）與圖例 ----------
  ws.addRow([]);
  const legend = ws.addRow(['說明：時間 8.5 = 8:30；斜線 = 週末、國定假日；# = 有備註']);
  ws.mergeCells(legend.number, 1, legend.number, lastCol);
  legend.getCell(1).font = { size: 9, color: { argb: 'FF7F7F7F' } };
  for (const n of notes) {
    const r = ws.addRow([`# ${n}`]);
    ws.mergeCells(r.number, 1, r.number, lastCol);
    r.getCell(1).font = { size: 10 };
  }
  const stamp = ws.addRow([`匯出時間 ${new Date().toLocaleString('zh-TW', { hour12: false })}`]);
  ws.mergeCells(stamp.number, 1, stamp.number, lastCol);
  stamp.getCell(1).font = { size: 9, color: { argb: 'FF7F7F7F' } };

  // ---------- 欄寬與列印 ----------
  ws.getColumn(1).width = 12;
  days.forEach((_, i) => ws.getColumn(dayCol(i)).width = 13);
  ws.getColumn(lastCol).width = 7;
  ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `班表_${week.weekStart}${week.published ? '' : '_草稿'}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- 樣式 ----------
const NAME_BG = 'FF8497B0';   // 姓名欄藍灰
const BAND = 'FFD9D9D9';      // 隔列灰
const LINE = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
const GRID: Partial<Borders> = { top: LINE, left: LINE, bottom: LINE, right: LINE };
function solid(argb: string): Fill { return { type: 'pattern', pattern: 'solid', fgColor: { argb } }; }
/** 斜線底：灰色斜線疊在原本底色上。 */
function hatch(bg: string): Fill {
  return { type: 'pattern', pattern: 'lightUp', fgColor: { argb: 'FFA6A6A6' }, bgColor: { argb: bg } };
}

// ---------- 工具 ----------
function parse(s: string): Date { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function pad(n: number): string { return String(n).padStart(2, '0'); }
function addDays(s: string, n: number): string {
  const d = parse(s); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function weekday(s: string): string { return '日一二三四五六'[parse(s).getDay()]; }
function monthDay(s: string): string { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}`; }
function slash(s: string): string { const d = parse(s); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; }
function minutes(t: string): number { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
/** 時間簡寫：08:00 → 8、08:30 → 8.5、09:15 → 9:15 */
function short(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return m === 0 ? `${h}` : m === 30 ? `${h}.5` : `${h}:${pad(m)}`;
}
