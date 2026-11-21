import * as XLSX from 'xlsx';
import { SubmittalStatusCode } from '../types';

export type LogDocumentCategory = 'IR' | 'MIR' | 'SD' | 'MS' | 'MAT' | 'RFI' | 'OTHER';

export interface LogColumnMapping {
  submittalNumber: number;
  docType: number;
  description: number;
  discipline: number;
  rev: number;
  status: number;
  submissionDate: number;
  replyDate: number;
  location: number;
  remarks: number;
}

export interface ExtractedLogRow {
  rowIndex: number; // 1-based row number in Excel sheet
  submittalNumber: string;
  docType: LogDocumentCategory;
  docTypeRaw: string;
  description: string;
  discipline: string;
  rev: string;
  statusCode: SubmittalStatusCode | 'OTHER';
  statusRaw: string;
  submissionDate: string;
  replyDate: string;
  location: string;
  remarks: string;
  rawCells: Record<string, string>;
}

export interface ParsedSheetData {
  name: string;
  rawRows: string[][];
  detectedHeaderRowIndex: number;
}

export interface ParsedWorkbookData {
  fileName: string;
  sheets: ParsedSheetData[];
}

export const LOG_CATEGORY_META: Record<
  LogDocumentCategory,
  { labelAr: string; shortLabel: string; badgeClass: string }
> = {
  IR: {
    labelAr: 'طلب فحص أعمال (IR)',
    shortLabel: 'IR',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
  },
  MIR: {
    labelAr: 'طلب فحص مواد (MIR)',
    shortLabel: 'MIR',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800'
  },
  SD: {
    labelAr: 'رسومات تنفيذية (SD)',
    shortLabel: 'SD',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
  },
  MS: {
    labelAr: 'طريقة عمل (MS)',
    shortLabel: 'MS',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800'
  },
  MAT: {
    labelAr: 'اعتماد مواد (MAT)',
    shortLabel: 'MAT',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
  },
  RFI: {
    labelAr: 'استفسار فني (RFI)',
    shortLabel: 'RFI',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800'
  },
  OTHER: {
    labelAr: 'تقديمات أخرى',
    shortLabel: 'أخرى',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
  }
};

function formatCellValue(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    const yyyy = cell.getFullYear();
    const mm = String(cell.getMonth() + 1).padStart(2, '0');
    const dd = String(cell.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return String(cell).replace(/\s+/g, ' ').trim();
}

const HEADER_KEYWORDS = [
  'submittal',
  'reference',
  'ref',
  'ir no',
  'mir no',
  'doc no',
  'document',
  'description',
  'title',
  'subject',
  'discipline',
  'rev',
  'revision',
  'status',
  'action',
  'code',
  'date',
  'remarks',
  'location',
  'رقم التقديم',
  'رقم الطلب',
  'المرجع',
  'الكود',
  'البند',
  'الوصف',
  'الموضوع',
  'التخصص',
  'الموقف',
  'الحالة',
  'الاعتماد',
  'التاريخ',
  'ملاحظات',
  'الدور',
  'الموقع'
];

export function detectHeaderRowIndex(rows: string[][]): number {
  const maxScan = Math.min(rows.length, 20);
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < maxScan; i++) {
    const row = rows[i] || [];
    const nonEmpty = row.filter((c) => c.trim().length > 0);
    if (nonEmpty.length < 2) continue;

    let score = 0;
    for (const cell of nonEmpty) {
      const lower = cell.toLowerCase();
      if (HEADER_KEYWORDS.some((kw) => lower.includes(kw))) {
        score += 3;
      }
      if (cell.length <= 45) {
        score += 0.5;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

export function parseDriveExcelWorkbook(
  buffer: ArrayBuffer,
  fileName: string
): ParsedWorkbookData {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheets: ParsedSheetData[] = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false
    });

    const maxCols = Math.min(
      40,
      matrix.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0)
    );

    const rawRows: string[][] = matrix.map((row) => {
      const arr = Array.isArray(row) ? row : [];
      const normalized: string[] = [];
      for (let c = 0; c < maxCols; c++) {
        normalized.push(formatCellValue(arr[c]));
      }
      return normalized;
    });

    const detectedHeaderRowIndex = detectHeaderRowIndex(rawRows);
    return {
      name,
      rawRows,
      detectedHeaderRowIndex
    };
  });

  return { fileName, sheets };
}

function findBestColumnIndex(
  headers: string[],
  patterns: RegExp[],
  excludeIndices: Set<number>
): number {
  for (const pattern of patterns) {
    for (let i = 0; i < headers.length; i++) {
      if (excludeIndices.has(i)) continue;
      if (pattern.test(headers[i])) {
        return i;
      }
    }
  }
  return -1;
}

export function autoDetectColumnMapping(headers: string[]): LogColumnMapping {
  const used = new Set<number>();

  const pick = (patterns: RegExp[]): number => {
    const idx = findBestColumnIndex(headers, patterns, used);
    if (idx !== -1) used.add(idx);
    return idx;
  };

  const submittalNumber = pick([
    /submittal\s*(no|num|#|ref|code)?/i,
    /\b(ir|mir|rfi|sd|doc|document)\s*(no|num|#|ref|code)\b/i,
    /\b(ref\.?|reference|code|transmittal)\b/i,
    /(رقم\s*التقديم|رقم\s*الطلب|رقم\s*المستند|رقم\s*الفحص|المرجع|الكود)/i
  ]);

  const description = pick([
    /\b(description|work\s*description|item\s*description|subject|title|activity|item)\b/i,
    /(الوصف|وصف\s*البند|بيان\s*الأعمال|الموضوع|البند|اسم\s*البند)/i
  ]);

  const status = pick([
    /\b(status|action\s*code|consultant\s*action|approval\s*status|action|code|result|reply\s*code)\b/i,
    /(الموقف|الحالة|حالة\s*الاعتماد|كود\s*الاعتماد|الاعتماد|قرار\s*الاستشاري)/i
  ]);

  const rev = pick([
    /\b(rev\.?|revision|ver\.?)\b/i,
    /(المراجعة|الإصدار|تعديل|rev)/i
  ]);

  const docType = pick([
    /\b(type|doc\.?\s*type|category|submittal\s*type|log\s*type)\b/i,
    /(النوع|نوع\s*التقديم|التصنيف|نوع\s*الطلب)/i
  ]);

  const discipline = pick([
    /\b(discipline|trade|dept\.?|department|section|specialty)\b/i,
    /(التخصص|القسم|النظام)/i
  ]);

  const submissionDate = pick([
    /\b(submi(t|ssion)\s*date|issue\s*date|sent\s*date|date\s*submitted|in\s*date)\b/i,
    /(تاريخ\s*التقديم|تاريخ\s*الإرسال|تاريخ\s*الطلب)/i,
    /\bdate\b/i,
    /التاريخ/i
  ]);

  const replyDate = pick([
    /\b(reply\s*date|return\s*date|response\s*date|approval\s*date|received\s*date|out\s*date)\b/i,
    /(تاريخ\s*الرد|تاريخ\s*الاستلام|تاريخ\s*الاعتماد)/i
  ]);

  const location = pick([
    /\b(location|zone|area|building|floor|level|block|element)\b/i,
    /(الموقع|المنطقة|المبنى|الدور|النطاق|العنصر)/i
  ]);

  const remarks = pick([
    /\b(remarks|comments|notes|consultant\s*comments)\b/i,
    /(ملاحظات|تعليقات)/i
  ]);

  return {
    submittalNumber,
    docType,
    description,
    discipline,
    rev,
    status,
    submissionDate,
    replyDate,
    location,
    remarks
  };
}

export function normalizeStatusCode(raw: string): SubmittalStatusCode | 'OTHER' {
  const val = raw.trim().toUpperCase();
  if (!val) return 'W';

  // Exact single-letter codes or "Code A" / "A - Approved"
  if (/^(CODE\s*)?A(\b|[\s\-:./])/.test(val) || val === 'A') return 'A';
  if (/^(CODE\s*)?B(\b|[\s\-:./])/.test(val) || val === 'B') return 'B';
  if (/^(CODE\s*)?C(\b|[\s\-:./])/.test(val) || val === 'C') return 'C';
  if (/^(CODE\s*)?D(\b|[\s\-:./])/.test(val) || val === 'D') return 'D';
  if (/^(CODE\s*)?W(\b|[\s\-:./])/.test(val) || val === 'W') return 'W';

  // Arabic / English text equivalents
  if (val.includes('APPROVED WITH') || val.includes('COMMENT') || val.includes('معتمد بملاحظات')) {
    return 'B';
  }
  if (val.includes('APPROVED') || val.includes('NO OBJECTION') || val.includes('معتمد')) {
    return 'A';
  }
  if (
    val.includes('REVISE') ||
    val.includes('RESUBMIT') ||
    val.includes('يعاد') ||
    val.includes('تعديل')
  ) {
    return 'C';
  }
  if (val.includes('REJECT') || val.includes('CANCEL') || val.includes('مرفوض')) {
    return 'D';
  }
  if (
    val.includes('UNDER REVIEW') ||
    val.includes('PENDING') ||
    val.includes('OPEN') ||
    val.includes('WAITING') ||
    val.includes('SUBMITTED') ||
    val.includes('تحت المراجعة') ||
    val.includes('قيد المراجعة') ||
    val.includes('منتظر')
  ) {
    return 'W';
  }

  return 'OTHER';
}

export function detectDocumentCategory(
  typeRaw: string,
  submittalNumber: string,
  sheetName: string
): LogDocumentCategory {
  const combined = `${typeRaw} ${submittalNumber}`.toUpperCase();

  // Check MIR before IR so "MIR" does not match "IR"
  if (
    /\bMIR\b/.test(combined) ||
    /[_\-/]MIR[_\-/0-9]/.test(combined) ||
    combined.includes('MATERIAL INSPECTION') ||
    combined.includes('فحص مواد')
  ) {
    return 'MIR';
  }
  if (
    /\b(WIR|IR)\b/.test(combined) ||
    /[_\-/](WIR|IR)[_\-/0-9]/.test(combined) ||
    combined.includes('INSPECTION REQUEST') ||
    combined.includes('فحص أعمال')
  ) {
    return 'IR';
  }
  if (
    /\b(SD|SHD|DWG)\b/.test(combined) ||
    /[_\-/](SD|SHD)[_\-/0-9]/.test(combined) ||
    combined.includes('SHOP DRAWING') ||
    combined.includes('رسومات')
  ) {
    return 'SD';
  }
  if (
    /\b(MS|MOS)\b/.test(combined) ||
    /[_\-/]MS[_\-/0-9]/.test(combined) ||
    combined.includes('METHOD STATEMENT')
  ) {
    return 'MS';
  }
  if (
    /\b(MAT|MAR|MAS|MT)\b/.test(combined) ||
    /[_\-/](MAT|MAR|MAS)[_\-/0-9]/.test(combined) ||
    combined.includes('MATERIAL SUBMITTAL') ||
    combined.includes('اعتماد مواد')
  ) {
    return 'MAT';
  }
  if (/\bRFI\b/.test(combined) || /[_\-/]RFI[_\-/0-9]/.test(combined)) {
    return 'RFI';
  }

  // Fallback to sheet name hint
  const sUpper = sheetName.toUpperCase();
  if (sUpper.includes('MIR')) return 'MIR';
  if (/\b(WIR|IR)\b/.test(sUpper) || sUpper.includes('INSPECTION')) return 'IR';
  if (sUpper.includes('SHOP') || /\bSD\b/.test(sUpper)) return 'SD';
  if (sUpper.includes('MAT') || sUpper.includes('MATERIAL')) return 'MAT';
  if (sUpper.includes('RFI')) return 'RFI';
  if (sUpper.includes('METHOD') || /\bMS\b/.test(sUpper)) return 'MS';

  return 'OTHER';
}

export function extractLogRowsFromSheet(
  sheet: ParsedSheetData,
  headerRowIndex: number,
  mapping: LogColumnMapping
): ExtractedLogRow[] {
  const headers = (sheet.rawRows[headerRowIndex] || []).map(
    (h, idx) => h.trim() || `عمود ${idx + 1}`
  );
  const results: ExtractedLogRow[] = [];

  for (let i = headerRowIndex + 1; i < sheet.rawRows.length; i++) {
    const row = sheet.rawRows[i] || [];
    const hasAnyValue = row.some((c) => c.trim().length > 0);
    if (!hasAnyValue) continue;

    const getCol = (colIdx: number): string => (colIdx >= 0 ? (row[colIdx] || '').trim() : '');

    const submittalNumber = getCol(mapping.submittalNumber);
    const description = getCol(mapping.description);
    const docTypeRaw = getCol(mapping.docType);
    const discipline = getCol(mapping.discipline);
    const rev = getCol(mapping.rev);
    const statusRaw = getCol(mapping.status);
    const submissionDate = getCol(mapping.submissionDate);
    const replyDate = getCol(mapping.replyDate);
    const location = getCol(mapping.location);
    const remarks = getCol(mapping.remarks);

    // Skip obvious total/footer summary rows
    const refLower = submittalNumber.toLowerCase();
    const descLower = description.toLowerCase();
    if (
      (refLower === 'total' || refLower === 'الإجمالي' || descLower === 'total' || descLower === 'الإجمالي') &&
      !submissionDate
    ) {
      continue;
    }

    // If neither ref nor description is present and row has only 1 non-empty cell, skip divider rows
    const filledCount = row.filter((c) => c.trim().length > 0).length;
    if (!submittalNumber && !description && filledCount <= 1) continue;

    const rawCells: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const val = (row[c] || '').trim();
      if (val) {
        rawCells[headers[c]] = val;
      }
    }

    results.push({
      rowIndex: i + 1,
      submittalNumber,
      docType: detectDocumentCategory(docTypeRaw, submittalNumber, sheet.name),
      docTypeRaw,
      description,
      discipline,
      rev,
      statusCode: normalizeStatusCode(statusRaw),
      statusRaw,
      submissionDate,
      replyDate,
      location,
      remarks,
      rawCells
    });
  }

  return results;
}

export function exportExtractedLogsToExcel(
  rows: ExtractedLogRow[],
  sourceFileName: string,
  sheetName: string
): void {
  const statusLabels: Record<string, string> = {
    A: 'A - معتمد',
    B: 'B - معتمد بملاحظات',
    C: 'C - يُعاد التقديم',
    D: 'D - مرفوض',
    W: 'W - تحت المراجعة',
    OTHER: 'أخرى'
  };

  const formatted = rows.map((r, idx) => ({
    م: idx + 1,
    'رقم التقديم / المرجع': r.submittalNumber,
    النوع: LOG_CATEGORY_META[r.docType].shortLabel,
    التخصص: r.discipline,
    'وصف البند': r.description,
    REV: r.rev,
    'الموقف / الاعتماد': statusLabels[r.statusCode] || r.statusRaw,
    'تاريخ التقديم': r.submissionDate,
    'تاريخ الرد': r.replyDate,
    'الموقع / النطاق': r.location,
    ملاحظات: r.remarks
  }));

  const ws = XLSX.utils.json_to_sheet(formatted);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 28 },
    { wch: 10 },
    { wch: 16 },
    { wch: 44 },
    { wch: 8 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 22 },
    { wch: 30 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Extracted Logs');

  const safeBase = sourceFileName.replace(/\.[^.]+$/, '').slice(0, 40);
  const safeSheet = sheetName.replace(/[\\/:*?"<>|]/g, '').slice(0, 20);
  const dateTag = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `ALMASA_DC_Extract_${safeBase}_${safeSheet}_${dateTag}.xlsx`);
}
