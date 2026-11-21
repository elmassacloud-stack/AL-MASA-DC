import * as XLSX from 'xlsx';
import { SubmittalStatusCode } from '../types';

export type LogDocumentCategory = 'IR' | 'MIR' | 'SD' | 'MS' | 'MAT' | 'RFI' | 'OTHER';

export interface LogColumnMapping {
  submittalNumber: number;
  lastCode: number;
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

export interface SheetOverrideConfig {
  headerRowIndex: number;
  mapping: LogColumnMapping;
}

export interface ExtractedLogRow {
  rowIndex: number; // 1-based row number in Excel sheet
  submittalNumber: string;
  lastCode: string; // Raw value from mapped "Last Code" column (if present)
  baseCode: string; // Normalized code without REV suffix (used for revision grouping)
  revNumber: number; // Parsed numeric revision rank (0 for REV 00 / initial)
  isLatestRevision: boolean; // True only for the highest/latest revision of this code
  revisionHistoryCount: number; // Total revisions of this base code in the sheet
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

export interface SheetCodePrefixSummary {
  prefix: string;
  count: number;
  uniqueCount: number;
  lastCode: string;
  nextCode: string;
}

export interface SheetDisciplineSummary {
  name: string;
  count: number;
  approved: number;
  pending: number;
  rejected: number;
}

export interface SheetCustomStatusSummary {
  label: string;
  count: number;
}

export interface SheetAnalytics {
  sheetIndex: number;
  sheetName: string; // Exact internal Excel sheet name
  headerRowIndex: number;
  headers: string[];
  mapping: LogColumnMapping;
  rows: ExtractedLogRow[]; // Deduplicated: latest revision per code only
  latestRows: ExtractedLogRow[]; // Explicit alias for latest revision per code
  allRows: ExtractedLogRow[]; // All rows including superseded older revisions
  totalRows: number; // Count of active unique items (latest revision only)
  totalRawRows: number; // Raw rows count in Excel including older revisions
  supersededCount: number; // Older superseded revisions excluded from analysis
  uniqueCodesCount: number;
  revisionsCount: number; // Count of active items that reached REV > 0 or had multiple revisions
  lastCode: string;
  lastRowCode: string;
  nextSuggestedCode: string;
  prefixBreakdown: SheetCodePrefixSummary[];
  statusCounts: {
    A: number;
    B: number;
    C: number;
    D: number;
    W: number;
    OTHER: number;
  };
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  approvalRate: number;
  hasStatusColumn: boolean;
  customStatusBreakdown: SheetCustomStatusSummary[];
  disciplines: SheetDisciplineSummary[];
  latestSubmissionDate: string;
  latestReplyDate: string;
  detectedColumnsCount: number;
}

export interface WorkbookTotals {
  sheetsCount: number;
  nonEmptySheetsCount: number;
  totalRows: number; // Sum of latest-revision unique items across all sheets
  totalRawRows: number; // Sum of all Excel rows including older revisions
  totalSupersededRevisions: number; // Older revisions excluded from analysis
  totalUniqueCodes: number;
  totalRevisions: number;
  statusCounts: {
    A: number;
    B: number;
    C: number;
    D: number;
    W: number;
    OTHER: number;
  };
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  approvalRate: number;
}

export type DateFilterMode = 'all' | 'year' | 'month' | 'quarter' | 'range';
export type DateFilterField = 'submissionDate' | 'replyDate';

export interface DateFilterConfig {
  mode: DateFilterMode;
  field: DateFilterField;
  year: string;
  month: string; // '01'..'12' or ''
  quarter: '1' | '2' | '3' | '4';
  fromDate: string; // 'YYYY-MM-DD'
  toDate: string; // 'YYYY-MM-DD'
}

export interface DateTimelineBucket {
  key: string; // 'YYYY-MM' or 'YYYY'
  label: string;
  year: string;
  month?: string;
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  other: number;
  approvalRate: number;
  statusCounts: {
    A: number;
    B: number;
    C: number;
    D: number;
    W: number;
    OTHER: number;
  };
}

export interface WorkbookDateSummary {
  buckets: DateTimelineBucket[];
  availableYears: string[];
  earliestDate: string;
  latestDate: string;
  datedCount: number;
  undatedCount: number;
  hasReplyDates: boolean;
}

export const LOG_CATEGORY_META: Record<
  LogDocumentCategory,
  { labelAr: string; shortLabel: string; badgeClass: string }
> = {
  IR: {
    labelAr: 'طلب فحص أعمال (IR)',
    shortLabel: 'IR',
    badgeClass:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
  },
  MIR: {
    labelAr: 'طلب فحص مواد (MIR)',
    shortLabel: 'MIR',
    badgeClass:
      'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800'
  },
  SD: {
    labelAr: 'رسومات تنفيذية (SD)',
    shortLabel: 'SD',
    badgeClass:
      'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
  },
  MS: {
    labelAr: 'طريقة عمل (MS)',
    shortLabel: 'MS',
    badgeClass:
      'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800'
  },
  MAT: {
    labelAr: 'اعتماد مواد (MAT)',
    shortLabel: 'MAT',
    badgeClass:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
  },
  RFI: {
    labelAr: 'استفسار فني (RFI)',
    shortLabel: 'RFI',
    badgeClass:
      'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800'
  },
  OTHER: {
    labelAr: 'تقديمات أخرى',
    shortLabel: 'أخرى',
    badgeClass:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
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
  'wir no',
  'mir no',
  'rfi no',
  'sd no',
  'ms no',
  'mat no',
  'doc no',
  'dwg no',
  'drawing',
  'document',
  'transmittal',
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
  'serial',
  'sr',
  's.n',
  'no.',
  'رقم التقديم',
  'رقم الطلب',
  'رقم المستند',
  'رقم اللوحة',
  'رقم الفحص',
  'المرجع',
  'الكود',
  'كود',
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
  const maxScan = Math.min(rows.length, 25);
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

    // Prefer rows with more distinct column headers over single banner rows
    if (nonEmpty.length >= 4) {
      score += 1.5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

const MAX_SAFE_ROWS = 50000;
const MAX_SAFE_COLS = 80;

function formatWorksheetCell(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.t === 'z') return '';
  if (cell.t === 'd' && cell.v instanceof Date && !Number.isNaN(cell.v.getTime())) {
    const yyyy = cell.v.getFullYear();
    const mm = String(cell.v.getMonth() + 1).padStart(2, '0');
    const dd = String(cell.v.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  if (cell.t === 'e') {
    // Excel formula error (#N/A, #REF!, #VALUE!, etc.)
    return '';
  }
  if (typeof cell.w === 'string' && cell.w.trim().length > 0) {
    return cell.w.replace(/\s+/g, ' ').trim();
  }
  return formatCellValue(cell.v);
}

/**
 * Extracts a compact string[][] matrix directly from populated cells in a worksheet.
 * Immune to bloated !ref ranges (e.g. A1:XFD1048576) that cause SheetJS sheet_to_json to crash/OOM.
 */
function extractSafeSheetMatrix(sheet: XLSX.WorkSheet | undefined): string[][] {
  if (!sheet || typeof sheet !== 'object') return [];
  const metaSheet = sheet as Record<string, unknown>;
  if (metaSheet['!type'] === 'chart') return [];

  const rowMap = new Map<number, Map<number, string>>();
  const populatedColSet = new Set<number>();

  // Support dense mode (!data) if present
  if (Array.isArray(metaSheet['!data'])) {
    const denseRows = metaSheet['!data'] as (XLSX.CellObject | undefined)[][];
    const limitR = Math.min(denseRows.length, MAX_SAFE_ROWS);
    for (let r = 0; r < limitR; r++) {
      const rowArr = denseRows[r];
      if (!Array.isArray(rowArr)) continue;
      const limitC = Math.min(rowArr.length, MAX_SAFE_COLS);
      for (let c = 0; c < limitC; c++) {
        const text = formatWorksheetCell(rowArr[c]);
        if (!text) continue;
        let cols = rowMap.get(r);
        if (!cols) {
          cols = new Map<number, string>();
          rowMap.set(r, cols);
        }
        cols.set(c, text);
        populatedColSet.add(c);
      }
    }
  } else {
    const keys = Object.keys(sheet);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key.charCodeAt(0) === 33) continue; // Skip metadata keys starting with '!'
      const cell = sheet[key] as XLSX.CellObject | undefined;
      const text = formatWorksheetCell(cell);
      if (!text) continue;

      let pos: XLSX.CellAddress;
      try {
        pos = XLSX.utils.decode_cell(key);
      } catch {
        continue;
      }
      if (
        !pos ||
        !Number.isFinite(pos.r) ||
        !Number.isFinite(pos.c) ||
        pos.r < 0 ||
        pos.c < 0 ||
        pos.r >= MAX_SAFE_ROWS ||
        pos.c >= MAX_SAFE_COLS
      ) {
        continue;
      }

      let cols = rowMap.get(pos.r);
      if (!cols) {
        cols = new Map<number, string>();
        rowMap.set(pos.r, cols);
      }
      cols.set(pos.c, text);
      populatedColSet.add(pos.c);
    }
  }

  if (rowMap.size === 0 || populatedColSet.size === 0) return [];

  const sortedRowIndices = Array.from(rowMap.keys()).sort((a, b) => a - b);
  // Keep ONLY columns that actually contain at least one populated cell (pruning blank gap columns)
  const sortedColIndices = Array.from(populatedColSet).sort((a, b) => a - b);
  const colIndexToCompact = new Map<number, number>();
  sortedColIndices.forEach((origCol, compactIdx) => {
    colIndexToCompact.set(origCol, compactIdx);
  });

  const colCount = sortedColIndices.length;
  const rawRows: string[][] = new Array(sortedRowIndices.length);

  for (let i = 0; i < sortedRowIndices.length; i++) {
    const cols = rowMap.get(sortedRowIndices[i])!;
    const rowOut = new Array<string>(colCount).fill('');
    cols.forEach((val, origColIdx) => {
      const compactIdx = colIndexToCompact.get(origColIdx);
      if (compactIdx !== undefined) {
        rowOut[compactIdx] = val;
      }
    });
    rawRows[i] = rowOut;
  }

  return rawRows;
}

export function parseDriveExcelWorkbook(
  buffer: ArrayBuffer,
  fileName: string
): ParsedWorkbookData {
  const bytes = new Uint8Array(buffer);
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(bytes, {
      type: 'array',
      cellDates: true,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      cellNF: true,
      sheetStubs: false,
      bookVBA: false
    });
  } catch (firstErr) {
    try {
      workbook = XLSX.read(bytes, {
        type: 'array',
        cellDates: false,
        cellFormula: false,
        cellHTML: false,
        cellStyles: false,
        cellNF: true,
        sheetStubs: false,
        bookVBA: false
      });
    } catch {
      // Fallback for HTML-table / CSV / TSV files saved with .xls or .csv extension
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      const trimmed = decoded.trimStart();
      if (
        trimmed.startsWith('<') ||
        /\.(csv|tsv)$/i.test(fileName)
      ) {
        workbook = XLSX.read(decoded, { type: 'string' });
      } else {
        throw firstErr;
      }
    }
  }

  const sheets: ParsedSheetData[] = [];
  const sheetNames = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : [];

  for (const name of sheetNames) {
    try {
      const sheet = workbook.Sheets?.[name];
      if (!sheet) continue;
      if ((sheet as Record<string, unknown>)['!type'] === 'chart') continue;

      const rawRows = extractSafeSheetMatrix(sheet);
      const detectedHeaderRowIndex = detectHeaderRowIndex(rawRows);
      sheets.push({
        name,
        rawRows,
        detectedHeaderRowIndex
      });
    } catch {
      // Never let one corrupted/special sheet abort the rest of the workbook
      sheets.push({
        name,
        rawRows: [],
        detectedHeaderRowIndex: 0
      });
    }
  }

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

function looksLikeDateValue(val: string): boolean {
  if (!val) return false;
  return (
    /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(val) ||
    /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(val) ||
    /^\d{1,2}[-\s][A-Za-z]{3,9}[-\s]\d{2,4}$/.test(val)
  );
}

function looksLikeStructuredCode(val: string): boolean {
  if (!val || val.length < 3 || val.length > 48) return false;
  if (looksLikeDateValue(val)) return false;
  // Contains letters + digits with a separator (-, _, /, .) OR prefix + digits like IR001
  return (
    (/[A-Za-z\u0600-\u06FF]/.test(val) && /\d/.test(val) && /[-_/.]/.test(val)) ||
    /^[A-Za-z]{2,8}[-_/\s]?\d{2,6}([-_/\s]?R\d+)?$/i.test(val)
  );
}

function looksLikeStatusValue(val: string): boolean {
  if (!val) return false;
  const code = normalizeStatusCode(val, true);
  if (code !== 'OTHER') {
    // Reject overly long sentences that merely happen to mention a word
    return val.length <= 40;
  }
  return false;
}

export function autoDetectColumnMapping(
  headers: string[],
  sampleRows: string[][] = []
): LogColumnMapping {
  const used = new Set<number>();

  const pick = (patterns: RegExp[]): number => {
    const idx = findBestColumnIndex(headers, patterns, used);
    if (idx !== -1) used.add(idx);
    return idx;
  };

  const lastCode = pick([
    /\b(last\s*code|latest\s*code|final\s*code|last\s*action\s*code|last\s*status\s*code|last\s*reply\s*code)\b/i,
    /(آخر\s*كود|اخر\s*كود|الكود\s*الأخير|الكود\s*الاخير|آخر\s*موقف|اخر\s*موقف)/i
  ]);

  let submittalNumber = pick([
    /submittal\s*(no|num|#|ref|code)?/i,
    /\b(ir|wir|mir|rfi|sd|ms|mat|mar|mas|dwg|drawing|doc|document)\s*(no|num|#|ref|code|id)\b/i,
    /\b(ref\.?\s*(no|num|#)?|reference|transmittal(\s*no)?|log\s*(no|code)|doc\.?\s*id)\b/i,
    /(رقم\s*التقديم|رقم\s*الطلب|رقم\s*المستند|رقم\s*الفحص|رقم\s*اللوحة|كود\s*التقديم|كود\s*البند|المرجع|الكود)/i,
    /\bcode\b/i
  ]);

  let description = pick([
    /\b(description|work\s*description|item\s*description|subject|title|activity|scope|item\s*name|material\s*name|drawing\s*title)\b/i,
    /(الوصف|وصف\s*البند|بيان\s*الأعمال|الموضوع|البند|اسم\s*البند|اسم\s*المادة|عنوان\s*اللوحة)/i
  ]);

  let status = pick([
    /\b(status|action\s*code|consultant\s*action|approval\s*status|approval\s*code|reply\s*code|action|result|grade)\b/i,
    /(الموقف|الحالة|حالة\s*الاعتماد|كود\s*الاعتماد|الاعتماد|قرار\s*الاستشاري|النتيجة|كود\s*الرد)/i
  ]);

  const rev = pick([
    /\b(rev\.?|revision|ver\.?|issue)\b/i,
    /(المراجعة|الإصدار|تعديل|rev)/i
  ]);

  const docType = pick([
    /\b(type|doc\.?\s*type|category|submittal\s*type|log\s*type)\b/i,
    /(النوع|نوع\s*التقديم|التصنيف|نوع\s*الطلب)/i
  ]);

  const discipline = pick([
    /\b(discipline|trade|dept\.?|department|section|specialty|system)\b/i,
    /(التخصص|القسم|النظام)/i
  ]);

  let submissionDate = pick([
    /\b(submi(t|ssion)\s*date|issue\s*date|sent\s*date|date\s*submitted|in\s*date|request\s*date)\b/i,
    /(تاريخ\s*التقديم|تاريخ\s*الإرسال|تاريخ\s*الطلب)/i,
    /\bdate\b/i,
    /التاريخ/i
  ]);

  const replyDate = pick([
    /\b(reply\s*date|return\s*date|response\s*date|approval\s*date|received\s*date|out\s*date|action\s*date)\b/i,
    /(تاريخ\s*الرد|تاريخ\s*الاستلام|تاريخ\s*الاعتماد)/i
  ]);

  const location = pick([
    /\b(location|zone|area|building|floor|level|block|element|villa|grid)\b/i,
    /(الموقع|المنطقة|المبنى|الدور|النطاق|العنصر|الفيلا)/i
  ]);

  const remarks = pick([
    /\b(remarks|comments|notes|consultant\s*comments)\b/i,
    /(ملاحظات|تعليقات)/i
  ]);

  // Data-driven fallback inference from sample rows when headers are non-standard
  const samples = sampleRows.slice(0, 35);
  if (samples.length > 0 && headers.length > 0) {
    const colCount = headers.length;

    // 1. Infer submittal/code column if still unmapped
    if (submittalNumber === -1) {
      let bestCol = -1;
      let bestScore = 0;
      for (let c = 0; c < colCount; c++) {
        if (used.has(c)) continue;
        const vals = samples.map((r) => (r[c] || '').trim()).filter(Boolean);
        if (vals.length === 0) continue;
        const structuredMatches = vals.filter(looksLikeStructuredCode).length;
        const ratio = structuredMatches / vals.length;
        if (ratio >= 0.45 && structuredMatches > bestScore) {
          bestScore = structuredMatches;
          bestCol = c;
        }
      }
      if (bestCol !== -1) {
        submittalNumber = bestCol;
        used.add(bestCol);
      }
    }

    // 2. Infer status column if still unmapped
    if (status === -1) {
      let bestCol = -1;
      let bestRatio = 0;
      for (let c = 0; c < colCount; c++) {
        if (used.has(c)) continue;
        const vals = samples.map((r) => (r[c] || '').trim()).filter(Boolean);
        if (vals.length === 0) continue;
        const statusMatches = vals.filter(looksLikeStatusValue).length;
        const ratio = statusMatches / vals.length;
        if (ratio >= 0.4 && ratio > bestRatio) {
          bestRatio = ratio;
          bestCol = c;
        }
      }
      if (bestCol !== -1) {
        status = bestCol;
        used.add(bestCol);
      }
    }

    // 3. Infer submissionDate column if still unmapped
    if (submissionDate === -1) {
      let bestCol = -1;
      let bestRatio = 0;
      for (let c = 0; c < colCount; c++) {
        if (used.has(c)) continue;
        const vals = samples.map((r) => (r[c] || '').trim()).filter(Boolean);
        if (vals.length === 0) continue;
        const dateMatches = vals.filter(looksLikeDateValue).length;
        const ratio = dateMatches / vals.length;
        if (ratio >= 0.5 && ratio > bestRatio) {
          bestRatio = ratio;
          bestCol = c;
        }
      }
      if (bestCol !== -1) {
        submissionDate = bestCol;
        used.add(bestCol);
      }
    }

    // 4. Infer description column (longest average text) if still unmapped
    if (description === -1) {
      let bestCol = -1;
      let bestAvgLen = 12;
      for (let c = 0; c < colCount; c++) {
        if (used.has(c)) continue;
        const vals = samples.map((r) => (r[c] || '').trim()).filter(Boolean);
        if (vals.length === 0) continue;
        const avgLen = vals.reduce((sum, v) => sum + v.length, 0) / vals.length;
        if (avgLen > bestAvgLen) {
          bestAvgLen = avgLen;
          bestCol = c;
        }
      }
      if (bestCol !== -1) {
        description = bestCol;
        used.add(bestCol);
      }
    }
  }

  return {
    submittalNumber,
    lastCode,
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

export function normalizeStatusCode(
  raw: string,
  hasStatusColumn = true
): SubmittalStatusCode | 'OTHER' {
  const val = raw.trim().toUpperCase();
  if (!val) return hasStatusColumn ? 'W' : 'OTHER';

  // Exact single-letter codes or "Code A" / "A - Approved"
  if (/^(CODE\s*)?A(\b|[\s\-:./])/.test(val) || val === 'A') return 'A';
  if (/^(CODE\s*)?B(\b|[\s\-:./])/.test(val) || val === 'B' || val === 'AN') return 'B';
  if (/^(CODE\s*)?C(\b|[\s\-:./])/.test(val) || val === 'C' || val === 'R&R') return 'C';
  if (/^(CODE\s*)?D(\b|[\s\-:./])/.test(val) || val === 'D') return 'D';
  if (
    /^(CODE\s*)?W(\b|[\s\-:./])/.test(val) ||
    val === 'W' ||
    val === 'UR' ||
    val === 'U/R' ||
    val === 'U.R'
  ) {
    return 'W';
  }

  // Arabic / English text equivalents
  if (
    val.includes('APPROVED WITH') ||
    val.includes('COMMENT') ||
    val.includes('معتمد بملاحظات') ||
    val.includes('بملاحظات')
  ) {
    return 'B';
  }
  if (
    val.includes('APPROVED') ||
    val.includes('NO OBJECTION') ||
    val.includes('CLOSED') ||
    val.includes('معتمد') ||
    val.includes('تم الاعتماد')
  ) {
    return 'A';
  }
  if (
    val.includes('REVISE') ||
    val.includes('RESUBMIT') ||
    val.includes('يعاد') ||
    val.includes('إعادة') ||
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

function detectLastCodeColumnIsStatus(
  sheet: ParsedSheetData,
  headerRowIndex: number,
  lastCodeColIdx: number
): boolean {
  if (lastCodeColIdx < 0) return false;
  const samples: string[] = [];
  for (let i = headerRowIndex + 1; i < sheet.rawRows.length && samples.length < 40; i++) {
    const val = (sheet.rawRows[i]?.[lastCodeColIdx] || '').trim();
    if (val) samples.push(val);
  }
  if (samples.length === 0) return false;
  const statusHits = samples.filter(looksLikeStatusValue).length;
  return statusHits / samples.length >= 0.4;
}

function isPlaceholderValue(val: string): boolean {
  const v = val.trim().toLowerCase();
  if (!v) return true;
  return (
    v === '-' ||
    v === '--' ||
    v === '—' ||
    v === '–' ||
    v === 'n/a' ||
    v === 'na' ||
    v === 'nil' ||
    v === 'none' ||
    v === 'null' ||
    v === '0' ||
    v === '0.0' ||
    v === '0.00' ||
    v === '0%' ||
    v === 'false' ||
    v === '#n/a' ||
    v === '#ref!' ||
    v === '#value!' ||
    v === '#div/0!' ||
    v === '#name?' ||
    v === '1900-01-00' ||
    v === '1899-12-30' ||
    v === '1899-12-31'
  );
}

function isSummaryOrFooterLabel(val: string): boolean {
  const v = val.trim().toLowerCase();
  if (!v) return false;
  return (
    /^(total|grand\s*total|sub\s*-?\s*total|summary|count|percentage|avg|average|legend)\b/i.test(
      v
    ) ||
    /^(الإجمالي|الاجمالي|إجمالي|اجمالي|المجموع|مجموع|ملخص|النسبة|نسبة الاعتماد|ملاحظات عامة)/.test(
      v
    )
  );
}

function cleanDataCell(val: string): string {
  const trimmed = val.trim();
  return isPlaceholderValue(trimmed) ? '' : trimmed;
}

function cleanRevCell(val: string): string {
  const trimmed = val.trim();
  const lower = trimmed.toLowerCase();
  if (
    !trimmed ||
    lower === '-' ||
    lower === '--' ||
    lower === '—' ||
    lower === 'n/a' ||
    lower === 'na' ||
    lower.startsWith('#')
  ) {
    return '';
  }
  return trimmed;
}

export function extractLogRowsFromSheet(
  sheet: ParsedSheetData,
  headerRowIndex: number,
  mapping: LogColumnMapping
): ExtractedLogRow[] {
  const rawHeaderRow = sheet.rawRows[headerRowIndex] || [];
  const headers = rawHeaderRow.map((h, idx) => h.trim() || `عمود ${idx + 1}`);
  const headerSubmittalLower =
    mapping.submittalNumber >= 0 ? (rawHeaderRow[mapping.submittalNumber] || '').trim().toLowerCase() : '';
  const headerDescLower =
    mapping.description >= 0 ? (rawHeaderRow[mapping.description] || '').trim().toLowerCase() : '';

  const lastCodeIsStatus = detectLastCodeColumnIsStatus(sheet, headerRowIndex, mapping.lastCode);
  const hasStatusColumn = mapping.status >= 0 || lastCodeIsStatus;
  const results: ExtractedLogRow[] = [];

  for (let i = headerRowIndex + 1; i < sheet.rawRows.length; i++) {
    const row = sheet.rawRows[i] || [];
    const getCol = (colIdx: number): string => (colIdx >= 0 ? (row[colIdx] || '').trim() : '');

    const lastCodeRaw = cleanDataCell(getCol(mapping.lastCode));
    const rawSubmittalNumber = cleanDataCell(getCol(mapping.submittalNumber));
    const submittalNumber = rawSubmittalNumber || (!lastCodeIsStatus ? lastCodeRaw : '');
    const description = cleanDataCell(getCol(mapping.description));
    const docTypeRaw = cleanDataCell(getCol(mapping.docType));
    const discipline = cleanDataCell(getCol(mapping.discipline));
    const rev = cleanRevCell(getCol(mapping.rev));
    const rawStatusCell = cleanDataCell(getCol(mapping.status));
    const statusRaw = lastCodeIsStatus && lastCodeRaw ? lastCodeRaw : rawStatusCell;
    const submissionDate = cleanDataCell(getCol(mapping.submissionDate));
    const replyDate = cleanDataCell(getCol(mapping.replyDate));
    const location = cleanDataCell(getCol(mapping.location));
    const remarks = cleanDataCell(getCol(mapping.remarks));

    // Skip repeated header rows inside printed/paginated Excel logs
    const refLower = submittalNumber.toLowerCase();
    const descLower = description.toLowerCase();
    if (
      (headerSubmittalLower && refLower === headerSubmittalLower) ||
      (headerDescLower && descLower === headerDescLower && !submittalNumber)
    ) {
      continue;
    }

    // Skip total/summary/footer rows
    const firstMeaningfulCell = row.find((c) => !isPlaceholderValue(c)) || '';
    if (
      (isSummaryOrFooterLabel(submittalNumber) ||
        isSummaryOrFooterLabel(description) ||
        isSummaryOrFooterLabel(firstMeaningfulCell)) &&
      !looksLikeStructuredCode(submittalNumber)
    ) {
      continue;
    }

    // Strict code/data check: include ONLY rows that actually have a code or real data
    const hasRealCode = Boolean(submittalNumber);
    const hasRealDescription =
      Boolean(description) && description.length >= 2 && !/^\d+$/.test(description);
    const hasSupportingData = Boolean(
      lastCodeRaw || statusRaw || submissionDate || replyDate || discipline || location
    );

    if (mapping.submittalNumber >= 0) {
      // Sheet has a Code column: require a real code, OR a real description paired with real log data
      if (!hasRealCode && !(hasRealDescription && hasSupportingData)) {
        continue;
      }
    } else {
      // Sheet has no Code column: ignore blank/serial-only/formula-placeholder rows
      const meaningfulValues = row
        .map((c, colIdx) => ({ val: cleanDataCell(c), colIdx }))
        .filter(({ val, colIdx }) => {
          if (!val) return false;
          // Ignore standalone serial numbers in the first column (e.g. pre-filled 1..500)
          if (colIdx === 0 && /^\d{1,5}$/.test(val)) return false;
          return true;
        });

      const hasTextOrDate = meaningfulValues.some(
        ({ val }) => !/^\d+(\.\d+)?$/.test(val) || looksLikeDateValue(val)
      );
      if (
        !lastCodeRaw &&
        !hasRealDescription &&
        !(meaningfulValues.length >= 2 && hasTextOrDate)
      ) {
        continue;
      }
    }

    // Only keep columns that actually have real data for this row
    const rawCells: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const cellVal = c === mapping.rev ? cleanRevCell(row[c] || '') : cleanDataCell(row[c] || '');
      if (cellVal) {
        rawCells[headers[c]] = cellVal;
      }
    }

    if (Object.keys(rawCells).length === 0) continue;

    const parsedCode = submittalNumber ? parseCodeSequence(submittalNumber) : null;
    const revNumber = parseRevisionNumber(rev, parsedCode?.revNumber ?? null);

    results.push({
      rowIndex: i + 1,
      submittalNumber,
      lastCode: lastCodeRaw,
      baseCode: parsedCode ? parsedCode.baseCode : '',
      revNumber,
      isLatestRevision: true,
      revisionHistoryCount: 1,
      docType: detectDocumentCategory(docTypeRaw, submittalNumber, sheet.name),
      docTypeRaw,
      description,
      discipline,
      rev:
        rev ||
        (parsedCode?.revNumber !== null && parsedCode?.revNumber !== undefined
          ? String(parsedCode.revNumber).padStart(2, '0')
          : ''),
      statusCode: normalizeStatusCode(statusRaw, hasStatusColumn),
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

interface ParsedCodeParts {
  raw: string;
  baseCode: string;
  prefix: string;
  seqNumber: number | null;
  padLength: number;
  hasRevSuffix: boolean;
  revNumber: number | null;
}

/**
 * Parses a revision string (e.g. "00", "02", "R1", "Rev 03", "مراجعة 2") into a numeric rank.
 */
export function parseRevisionNumber(revRaw: string, codeRevNumber: number | null = null): number {
  const cleaned = revRaw.trim().toUpperCase();
  if (cleaned) {
    const direct = cleaned.match(/^(?:REV|REVISION|VER|V|R)?\.?\s*(\d+)$/i);
    if (direct) {
      const n = parseInt(direct[1], 10);
      if (Number.isFinite(n)) return n;
    }
    const embedded = cleaned.match(/(\d+)/);
    if (embedded) {
      const n = parseInt(embedded[1], 10);
      if (Number.isFinite(n)) return n;
    }
    if (/^[A-Z]$/.test(cleaned)) {
      return cleaned.charCodeAt(0) - 65;
    }
  }
  if (codeRevNumber !== null && Number.isFinite(codeRevNumber)) {
    return codeRevNumber;
  }
  return 0;
}

/**
 * Parses a submittal/document code into its base code, prefix, trailing sequence number,
 * and optional embedded revision number.
 * Examples:
 * - "MAS-RAV-IR-STR-0145" -> baseCode: "MAS-RAV-IR-STR-0145", seqNumber: 145
 * - "IR STR 01 REV 02"    -> baseCode: "IR STR 01", seqNumber: 1, revNumber: 2
 * - "IR-STR-01-R02"       -> baseCode: "IR-STR-01", seqNumber: 1, revNumber: 2
 * - "MAS-R-001"           -> baseCode: "MAS-R-001" (not treated as rev because "MAS" has no digits)
 */
export function parseCodeSequence(rawCode: string): ParsedCodeParts {
  const cleaned = rawCode.trim();
  let baseCode = cleaned;
  let hasRevSuffix = false;
  let revNumber: number | null = null;

  const revSuffixMatch = cleaned.match(
    /^(.+?)([-_/\s]+|\s*\(\s*)(REV|REVISION|VER|R)\.?\s*(\d+)\s*\)?$/i
  );
  if (revSuffixMatch) {
    const candidateBase = revSuffixMatch[1].trim();
    const keyword = revSuffixMatch[3].toUpperCase();
    const parsedRev = parseInt(revSuffixMatch[4], 10);
    // Treat short "R" suffix as revision only if the base code already contains a digit
    if (keyword !== 'R' || /\d/.test(candidateBase)) {
      baseCode = candidateBase;
      hasRevSuffix = true;
      revNumber = Number.isFinite(parsedRev) ? parsedRev : null;
    }
  }

  const numMatch = baseCode.match(/^(.*?)(\d+)$/);
  if (!numMatch) {
    return {
      raw: cleaned,
      baseCode,
      prefix: baseCode,
      seqNumber: null,
      padLength: 0,
      hasRevSuffix,
      revNumber
    };
  }

  const prefix = numMatch[1];
  const digits = numMatch[2];
  const seqNumber = parseInt(digits, 10);

  return {
    raw: cleaned,
    baseCode,
    prefix,
    seqNumber: Number.isFinite(seqNumber) ? seqNumber : null,
    padLength: digits.length,
    hasRevSuffix,
    revNumber
  };
}

function buildNextCode(parts: ParsedCodeParts): string {
  if (parts.seqNumber === null) return '';
  const nextNum = String(parts.seqNumber + 1).padStart(parts.padLength, '0');
  return `${parts.prefix}${nextNum}`;
}

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  يناير: 1,
  feb: 2,
  february: 2,
  فبراير: 2,
  mar: 3,
  march: 3,
  مارس: 3,
  apr: 4,
  april: 4,
  أبريل: 4,
  ابريل: 4,
  may: 5,
  مايو: 5,
  jun: 6,
  june: 6,
  يونيو: 6,
  jul: 7,
  july: 7,
  يوليو: 7,
  aug: 8,
  august: 8,
  أغسطس: 8,
  اغسطس: 8,
  sep: 9,
  sept: 9,
  september: 9,
  سبتمبر: 9,
  oct: 10,
  october: 10,
  أكتوبر: 10,
  اكتوبر: 10,
  nov: 11,
  november: 11,
  نوفمبر: 11,
  dec: 12,
  december: 12,
  ديسمبر: 12
};

export const ARABIC_MONTH_NAMES: Record<string, string> = {
  '01': 'يناير',
  '02': 'فبراير',
  '03': 'مارس',
  '04': 'أبريل',
  '05': 'مايو',
  '06': 'يونيو',
  '07': 'يوليو',
  '08': 'أغسطس',
  '09': 'سبتمبر',
  '10': 'أكتوبر',
  '11': 'نوفمبر',
  '12': 'ديسمبر'
};

function buildSafeISO(year: number, month: number, day: number): string {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return '';
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Parses virtually any Excel / DC log date string into canonical 'YYYY-MM-DD' (or '').
 */
export function parseLogDateToISO(dateStr: string): string {
  if (!dateStr) return '';
  const cleaned = dateStr.trim();
  if (!cleaned) return '';

  // 1. YYYY-MM-DD / YYYY/M/D / YYYY.M.D (optional trailing time)
  const isoMatch = cleaned.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\b|T|\s)/);
  if (isoMatch) {
    return buildSafeISO(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  // 2. DD/MM/YYYY or MM/DD/YYYY (defaults to DD/MM/YYYY common in Egypt/GCC, auto-swaps if middle > 12)
  const dmyMatch = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\b|\s|$)/);
  if (dmyMatch) {
    const p1 = Number(dmyMatch[1]);
    const p2 = Number(dmyMatch[2]);
    const yRaw = Number(dmyMatch[3]);
    const year = yRaw < 100 ? (yRaw >= 70 ? 1900 + yRaw : 2000 + yRaw) : yRaw;
    if (p2 > 12 && p1 <= 12) {
      return buildSafeISO(year, p1, p2);
    }
    return buildSafeISO(year, p2, p1);
  }

  // 3. Named month: "15-Nov-26", "15 Nov 2026"
  const dayMonYear = cleaned.match(/^(\d{1,2})[-\s.,/]+([A-Za-z\u0600-\u06FF]+)[-\s.,/]+(\d{2,4})$/);
  if (dayMonYear) {
    const day = Number(dayMonYear[1]);
    const month = MONTH_NAME_MAP[dayMonYear[2].toLowerCase()];
    const yRaw = Number(dayMonYear[3]);
    const year = yRaw < 100 ? (yRaw >= 70 ? 1900 + yRaw : 2000 + yRaw) : yRaw;
    if (month) return buildSafeISO(year, month, day);
  }

  // 4. Named month first: "Nov 15, 2026" or "Nov-2026"
  const monDayYear = cleaned.match(/^([A-Za-z\u0600-\u06FF]+)[-\s.,/]+(\d{1,2})[,\s-/]+(\d{2,4})$/);
  if (monDayYear) {
    const month = MONTH_NAME_MAP[monDayYear[1].toLowerCase()];
    const day = Number(monDayYear[2]);
    const yRaw = Number(monDayYear[3]);
    const year = yRaw < 100 ? (yRaw >= 70 ? 1900 + yRaw : 2000 + yRaw) : yRaw;
    if (month) return buildSafeISO(year, month, day);
  }

  // 5. Excel serial date number (e.g. 46000)
  if (/^\d{5}(\.\d+)?$/.test(cleaned)) {
    const serial = Number(cleaned);
    if (serial >= 32874 && serial <= 73050) {
      const utcMs = Math.round((serial - 25569) * 86400 * 1000);
      const d = new Date(utcMs);
      if (!Number.isNaN(d.getTime())) {
        return buildSafeISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      }
    }
  }

  // 6. Native Date.parse fallback
  const parsed = Date.parse(cleaned);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return buildSafeISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  return '';
}

function parseSortableDateMs(dateStr: string): number {
  const iso = parseLogDateToISO(dateStr);
  if (!iso) return 0;
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  return Number.isNaN(t) ? 0 : t;
}

export function isDateFilterActive(filter?: DateFilterConfig): boolean {
  if (!filter || filter.mode === 'all') return false;
  if (filter.mode === 'year') return Boolean(filter.year);
  if (filter.mode === 'month') return Boolean(filter.year || filter.month);
  if (filter.mode === 'quarter') return Boolean(filter.year || filter.quarter);
  if (filter.mode === 'range') return Boolean(filter.fromDate || filter.toDate);
  return false;
}

export function matchesDateFilter(isoDate: string, filter?: DateFilterConfig): boolean {
  if (!isDateFilterActive(filter)) return true;
  if (!isoDate || !filter) return false;

  if (filter.mode === 'year') {
    return !filter.year || isoDate.startsWith(`${filter.year}-`);
  }
  if (filter.mode === 'month') {
    const yOk = !filter.year || isoDate.startsWith(`${filter.year}-`);
    const mOk = !filter.month || isoDate.slice(5, 7) === filter.month;
    return yOk && mOk;
  }
  if (filter.mode === 'quarter') {
    const yOk = !filter.year || isoDate.startsWith(`${filter.year}-`);
    const monthNum = Number(isoDate.slice(5, 7));
    const q = Number(filter.quarter);
    const startM = (q - 1) * 3 + 1;
    const endM = q * 3;
    return yOk && monthNum >= startM && monthNum <= endM;
  }
  if (filter.mode === 'range') {
    if (filter.fromDate && isoDate < filter.fromDate) return false;
    if (filter.toDate && isoDate > filter.toDate) return false;
    return true;
  }
  return true;
}

export function getRowDateISO(
  row: ExtractedLogRow,
  field: DateFilterField = 'submissionDate',
  fallbackToReply = false
): string {
  if (field === 'replyDate') {
    return parseLogDateToISO(row.replyDate);
  }
  const subIso = parseLogDateToISO(row.submissionDate);
  if (subIso) return subIso;
  return fallbackToReply ? parseLogDateToISO(row.replyDate) : '';
}

function isLaterRevisionCandidate(candidate: ExtractedLogRow, current: ExtractedLogRow): boolean {
  if (candidate.revNumber !== current.revNumber) {
    return candidate.revNumber > current.revNumber;
  }
  const candDate = parseSortableDateMs(candidate.submissionDate);
  const currDate = parseSortableDateMs(current.submissionDate);
  if (candDate !== currDate) {
    return candDate > currDate;
  }
  return candidate.rowIndex > current.rowIndex;
}

function normalizeCodeGroupKey(baseCode: string): string {
  return baseCode.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Analyzes a single internal sheet from an uploaded Excel workbook strictly based on
 * the LATEST REVISION of each submittal code (excluding superseded older revisions from KPIs).
 */
export function analyzeSheet(
  sheet: ParsedSheetData,
  sheetIndex: number,
  override?: SheetOverrideConfig,
  dateFilter?: DateFilterConfig
): SheetAnalytics {
  const headerRowIndex = override ? override.headerRowIndex : sheet.detectedHeaderRowIndex;
  const rawHeaderRow = sheet.rawRows[headerRowIndex] || [];
  const headers = rawHeaderRow.map((h, idx) => h.trim() || `عمود ${idx + 1}`);
  const sampleRows = sheet.rawRows.slice(headerRowIndex + 1, headerRowIndex + 36);
  const mapping = override
    ? override.mapping
    : autoDetectColumnMapping(rawHeaderRow, sampleRows);

  const rawExtractedRows = extractLogRowsFromSheet(sheet, headerRowIndex, mapping);
  const lastCodeIsStatus = detectLastCodeColumnIsStatus(sheet, headerRowIndex, mapping.lastCode);
  const hasStatusColumn = mapping.status >= 0 || lastCodeIsStatus;

  // Step 1: Group rows by normalized baseCode and pick ONLY the latest revision winner per code.
  // Rows without a submittal code remain distinct (keyed by rowIndex).
  const codeGroupCounts = new Map<string, number>();
  const latestByGroupKey = new Map<string, ExtractedLogRow>();
  const groupKeysInOrder: string[] = [];

  for (const row of rawExtractedRows) {
    const groupKey = row.baseCode
      ? normalizeCodeGroupKey(row.baseCode)
      : `__row_${row.rowIndex}`;
    const prevCount = codeGroupCounts.get(groupKey) || 0;
    codeGroupCounts.set(groupKey, prevCount + 1);

    const existingWinner = latestByGroupKey.get(groupKey);
    if (!existingWinner) {
      latestByGroupKey.set(groupKey, row);
      groupKeysInOrder.push(groupKey);
    } else if (isLaterRevisionCandidate(row, existingWinner)) {
      latestByGroupKey.set(groupKey, row);
    }
  }

  const winningRowIndices = new Set<number>();
  latestByGroupKey.forEach((winner) => winningRowIndices.add(winner.rowIndex));

  // Annotate every row with isLatestRevision & revisionHistoryCount
  const allUnfilteredRows: ExtractedLogRow[] = rawExtractedRows.map((row) => {
    const groupKey = row.baseCode
      ? normalizeCodeGroupKey(row.baseCode)
      : `__row_${row.rowIndex}`;
    return {
      ...row,
      isLatestRevision: winningRowIndices.has(row.rowIndex),
      revisionHistoryCount: codeGroupCounts.get(groupKey) || 1
    };
  });

  // Apply optional Date Filter on the deduplicated latest revisions (zero double counting across periods)
  const filterActive = isDateFilterActive(dateFilter);
  const filterField: DateFilterField = dateFilter?.field || 'submissionDate';
  const fallbackToReply = mapping.submissionDate === -1 && mapping.replyDate >= 0;

  let latestRows: ExtractedLogRow[];
  let allRows: ExtractedLogRow[];

  if (filterActive && dateFilter) {
    latestRows = allUnfilteredRows.filter((r) => {
      if (!r.isLatestRevision) return false;
      const iso = getRowDateISO(r, filterField, fallbackToReply);
      return matchesDateFilter(iso, dateFilter);
    });
    const matchedGroupKeys = new Set<string>(
      latestRows.map((r) =>
        r.baseCode ? normalizeCodeGroupKey(r.baseCode) : `__row_${r.rowIndex}`
      )
    );
    allRows = allUnfilteredRows.filter((r) => {
      const gk = r.baseCode ? normalizeCodeGroupKey(r.baseCode) : `__row_${r.rowIndex}`;
      return matchedGroupKeys.has(gk);
    });
  } else {
    allRows = allUnfilteredRows;
    latestRows = allUnfilteredRows.filter((r) => r.isLatestRevision);
  }

  // Step 2: Compute ALL analytics strictly on latestRows (latest revision per code only!)
  const statusCounts = { A: 0, B: 0, C: 0, D: 0, W: 0, OTHER: 0 };
  const customStatusMap = new Map<string, number>();
  const disciplineMap = new Map<string, SheetDisciplineSummary>();

  const uniqueBaseCodes = new Set<string>();
  const prefixGroups = new Map<
    string,
    {
      prefix: string;
      count: number;
      uniqueCodes: Set<string>;
      bestParts: ParsedCodeParts;
      lastRowCode: string;
    }
  >();

  let lastRowCode = '';
  let highestSeqParts: ParsedCodeParts | null = null;
  let revisionsCount = 0;

  let latestSubmissionDate = '';
  let latestSubmissionMs = 0;
  let latestReplyDate = '';
  let latestReplyMs = 0;

  for (const row of latestRows) {
    // Status counts (latest revision ONLY)
    statusCounts[row.statusCode] += 1;
    if (hasStatusColumn && row.statusCode === 'OTHER' && row.statusRaw) {
      const key = row.statusRaw.trim();
      customStatusMap.set(key, (customStatusMap.get(key) || 0) + 1);
    }

    // Discipline aggregation (latest revision ONLY)
    if (row.discipline) {
      const discKey = row.discipline.trim();
      const existing = disciplineMap.get(discKey) || {
        name: discKey,
        count: 0,
        approved: 0,
        pending: 0,
        rejected: 0
      };
      existing.count += 1;
      if (row.statusCode === 'A' || row.statusCode === 'B') existing.approved += 1;
      else if (row.statusCode === 'W') existing.pending += 1;
      else if (row.statusCode === 'C' || row.statusCode === 'D') existing.rejected += 1;
      disciplineMap.set(discKey, existing);
    }

    // Dates tracking
    if (row.submissionDate) {
      const ms = parseSortableDateMs(row.submissionDate);
      if (ms >= latestSubmissionMs) {
        latestSubmissionMs = ms;
        latestSubmissionDate = row.submissionDate;
      }
    }
    if (row.replyDate) {
      const ms = parseSortableDateMs(row.replyDate);
      if (ms >= latestReplyMs) {
        latestReplyMs = ms;
        latestReplyDate = row.replyDate;
      }
    }

    if (row.revNumber > 0 || row.revisionHistoryCount > 1) {
      revisionsCount += 1;
    }

    // Submittal code & sequence analysis (latest revision ONLY)
    const codeStr = (row.baseCode || row.submittalNumber).trim();
    if (codeStr) {
      lastRowCode = codeStr;
      const parts = parseCodeSequence(codeStr);
      const baseKey = normalizeCodeGroupKey(parts.baseCode);
      uniqueBaseCodes.add(baseKey);

      if (parts.seqNumber !== null) {
        if (
          !highestSeqParts ||
          highestSeqParts.seqNumber === null ||
          parts.seqNumber > highestSeqParts.seqNumber
        ) {
          highestSeqParts = parts;
        }
      }

      const prefixDisplay = parts.prefix.trim() || 'تسلسل رقمي';
      const prefixKey = prefixDisplay.toUpperCase();
      const grp = prefixGroups.get(prefixKey);
      if (!grp) {
        prefixGroups.set(prefixKey, {
          prefix: prefixDisplay,
          count: 1,
          uniqueCodes: new Set([baseKey]),
          bestParts: parts,
          lastRowCode: codeStr
        });
      } else {
        grp.count += 1;
        grp.uniqueCodes.add(baseKey);
        grp.lastRowCode = codeStr;
        if (
          parts.seqNumber !== null &&
          (grp.bestParts.seqNumber === null || parts.seqNumber >= grp.bestParts.seqNumber)
        ) {
          grp.bestParts = parts;
        }
      }
    }
  }

  const prefixBreakdown: SheetCodePrefixSummary[] = Array.from(prefixGroups.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
    .map((g) => ({
      prefix: g.prefix,
      count: g.count,
      uniqueCount: g.uniqueCodes.size,
      lastCode: g.bestParts.seqNumber !== null ? g.bestParts.baseCode : g.lastRowCode,
      nextCode: buildNextCode(g.bestParts)
    }));

  // Determine the sheet's primary "Last Code" (آخر كود)
  let lastCode = lastRowCode;
  let nextSuggestedCode = '';
  if (highestSeqParts && highestSeqParts.seqNumber !== null) {
    if (prefixGroups.size <= 1) {
      lastCode = highestSeqParts.baseCode;
      nextSuggestedCode = buildNextCode(highestSeqParts);
    } else if (lastRowCode) {
      const lastRowParts = parseCodeSequence(lastRowCode);
      const lastRowGrp = prefixGroups.get(
        (lastRowParts.prefix.trim() || 'تسلسل رقمي').toUpperCase()
      );
      if (lastRowGrp && lastRowGrp.bestParts.seqNumber !== null) {
        lastCode = lastRowGrp.bestParts.baseCode;
        nextSuggestedCode = buildNextCode(lastRowGrp.bestParts);
      } else {
        lastCode = highestSeqParts.baseCode;
        nextSuggestedCode = buildNextCode(highestSeqParts);
      }
    }
  }

  const totalRows = latestRows.length;
  const totalRawRows = allRows.length;
  const supersededCount = Math.max(0, totalRawRows - totalRows);

  const approvedCount = statusCounts.A + statusCounts.B;
  const pendingCount = statusCounts.W;
  const rejectedCount = statusCounts.C + statusCounts.D;
  const statusBase = approvedCount + pendingCount + rejectedCount;
  const approvalRate =
    statusBase > 0 ? Math.round((approvedCount / statusBase) * 100) : 0;

  const customStatusBreakdown = Array.from(customStatusMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const disciplines = Array.from(disciplineMap.values()).sort((a, b) => b.count - a.count);
  const detectedColumnsCount = Object.values(mapping).filter((idx) => idx >= 0).length;

  return {
    sheetIndex,
    sheetName: sheet.name,
    headerRowIndex,
    headers,
    mapping,
    rows: latestRows,
    latestRows,
    allRows,
    totalRows,
    totalRawRows,
    supersededCount,
    uniqueCodesCount: uniqueBaseCodes.size > 0 ? uniqueBaseCodes.size : totalRows,
    revisionsCount,
    lastCode,
    lastRowCode,
    nextSuggestedCode,
    prefixBreakdown,
    statusCounts,
    approvedCount,
    pendingCount,
    rejectedCount,
    approvalRate,
    hasStatusColumn,
    customStatusBreakdown,
    disciplines,
    latestSubmissionDate,
    latestReplyDate,
    detectedColumnsCount
  };
}

/**
 * Analyzes ALL internal sheets inside an uploaded Excel workbook (latest revision per code only)
 * and aggregates workbook-wide KPIs.
 */
export function analyzeWorkbook(
  workbook: ParsedWorkbookData,
  sheetOverrides: Record<number, SheetOverrideConfig> = {},
  excludedSheetIndices: number[] = [],
  dateFilter?: DateFilterConfig
): { sheets: SheetAnalytics[]; totals: WorkbookTotals } {
  const excludedSet = new Set(excludedSheetIndices);
  const sheets = workbook.sheets
    .map((sheet, idx) =>
      excludedSet.has(idx) ? null : analyzeSheet(sheet, idx, sheetOverrides[idx], dateFilter)
    )
    .filter((s): s is SheetAnalytics => s !== null);

  const statusCounts = { A: 0, B: 0, C: 0, D: 0, W: 0, OTHER: 0 };
  let totalRows = 0;
  let totalRawRows = 0;
  let totalSupersededRevisions = 0;
  let totalUniqueCodes = 0;
  let totalRevisions = 0;
  let nonEmptySheetsCount = 0;

  for (const s of sheets) {
    if (s.totalRows > 0) nonEmptySheetsCount += 1;
    totalRows += s.totalRows;
    totalRawRows += s.totalRawRows;
    totalSupersededRevisions += s.supersededCount;
    totalUniqueCodes += s.uniqueCodesCount;
    totalRevisions += s.revisionsCount;
    statusCounts.A += s.statusCounts.A;
    statusCounts.B += s.statusCounts.B;
    statusCounts.C += s.statusCounts.C;
    statusCounts.D += s.statusCounts.D;
    statusCounts.W += s.statusCounts.W;
    statusCounts.OTHER += s.statusCounts.OTHER;
  }

  const approvedCount = statusCounts.A + statusCounts.B;
  const pendingCount = statusCounts.W;
  const rejectedCount = statusCounts.C + statusCounts.D;
  const statusBase = approvedCount + pendingCount + rejectedCount;
  const approvalRate = statusBase > 0 ? Math.round((approvedCount / statusBase) * 100) : 0;

  return {
    sheets,
    totals: {
      sheetsCount: sheets.length,
      nonEmptySheetsCount,
      totalRows,
      totalRawRows,
      totalSupersededRevisions,
      totalUniqueCodes,
      totalRevisions,
      statusCounts,
      approvedCount,
      pendingCount,
      rejectedCount,
      approvalRate
    }
  };
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
    'Last Code': r.lastCode,
    'الموقف / الاعتماد': r.statusRaw || statusLabels[r.statusCode] || '',
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
    { wch: 16 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 22 },
    { wch: 30 }
  ];

  const wb = XLSX.utils.book_new();
  const safeTab = sheetName.replace(/[\\/*?:[\]]/g, '').slice(0, 31) || 'Extracted Logs';
  XLSX.utils.book_append_sheet(wb, ws, safeTab);

  const safeBase = sourceFileName.replace(/\.[^.]+$/, '').slice(0, 40);
  const safeSheet = sheetName.replace(/[\\/:*?"<>|]/g, '').slice(0, 20);
  const dateTag = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `ALMASA_DC_Extract_${safeBase}_${safeSheet}_${dateTag}.xlsx`);
}

export function exportWorkbookSummaryToExcel(
  sourceFileName: string,
  sheets: SheetAnalytics[]
): void {
  const summaryRows = sheets.map((s, idx) => ({
    م: idx + 1,
    'اسم الورقة الداخلية': s.sheetName,
    'العدد (آخر REV فقط)': s.totalRows,
    'إجمالي الصفوف بالشيت': s.totalRawRows,
    'مراجعات سابقة مستبعدة': s.supersededCount,
    'آخر كود': s.lastCode || '—',
    'الكود المقترح التالي': s.nextSuggestedCode || '—',
    'معتمد (A)': s.statusCounts.A,
    'معتمد بملاحظات (B)': s.statusCounts.B,
    'تحت المراجعة (W)': s.statusCounts.W,
    'يُعاد التقديم (C)': s.statusCounts.C,
    'مرفوض (D)': s.statusCounts.D,
    'نسبة الاعتماد %': s.hasStatusColumn ? `${s.approvalRate}%` : '—',
    'آخر تاريخ تقديم': s.latestSubmissionDate || '—'
  }));

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = [
    { wch: 5 },
    { wch: 26 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 28 },
    { wch: 28 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 15 },
    { wch: 12 },
    { wch: 15 },
    { wch: 16 }
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'ملخص جميع الأوراق');

  const prefixRows: Record<string, string | number>[] = [];
  for (const s of sheets) {
    for (const p of s.prefixBreakdown) {
      prefixRows.push({
        'اسم الورقة الداخلية': s.sheetName,
        'سلسلة / بادئة الكود': p.prefix,
        'العدد الإجمالي': p.count,
        'الأكواد الفريدة': p.uniqueCount,
        'آخر كود': p.lastCode,
        'الكود التالي المقترح': p.nextCode || '—'
      });
    }
  }

  if (prefixRows.length > 0) {
    const wsPrefixes = XLSX.utils.json_to_sheet(prefixRows);
    wsPrefixes['!cols'] = [
      { wch: 24 },
      { wch: 26 },
      { wch: 14 },
      { wch: 14 },
      { wch: 28 },
      { wch: 28 }
    ];
    XLSX.utils.book_append_sheet(wb, wsPrefixes, 'آخر كود حسب السلسلة');
  }

  const safeBase = sourceFileName.replace(/\.[^.]+$/, '').slice(0, 40);
  const dateTag = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `ALMASA_DC_Full_Analysis_${safeBase}_${dateTag}.xlsx`);
}

export function describeDateFilter(filter: DateFilterConfig): string {
  if (!isDateFilterActive(filter)) return 'كل الفترات';
  if (filter.mode === 'year') {
    return `سنة ${filter.year}`;
  }
  if (filter.mode === 'month') {
    const mName = filter.month ? ARABIC_MONTH_NAMES[filter.month] || filter.month : 'كل الشهور';
    return filter.year ? `${mName} ${filter.year}` : mName;
  }
  if (filter.mode === 'quarter') {
    const qLabels: Record<string, string> = {
      '1': 'الربع الأول (Q1)',
      '2': 'الربع الثاني (Q2)',
      '3': 'الربع الثالث (Q3)',
      '4': 'الربع الرابع (Q4)'
    };
    return filter.year ? `${qLabels[filter.quarter]} — ${filter.year}` : qLabels[filter.quarter];
  }
  if (filter.mode === 'range') {
    if (filter.fromDate && filter.toDate) {
      return `من ${filter.fromDate} إلى ${filter.toDate}`;
    }
    if (filter.fromDate) return `من ${filter.fromDate} حتى الآن`;
    if (filter.toDate) return `حتى ${filter.toDate}`;
  }
  return 'كل الفترات';
}

/**
 * Builds a chronological month-by-month or year-by-year breakdown across all active sheets
 * (always computed strictly on latestRows).
 */
export function buildWorkbookDateSummary(
  sheets: SheetAnalytics[],
  granularity: 'month' | 'year' = 'month',
  field: DateFilterField = 'submissionDate'
): WorkbookDateSummary {
  const bucketMap = new Map<string, DateTimelineBucket>();
  const yearSet = new Set<string>();
  let earliestDate = '';
  let latestDate = '';
  let datedCount = 0;
  let undatedCount = 0;
  let hasReplyDates = false;

  for (const sheet of sheets) {
    const fallbackToReply = sheet.mapping.submissionDate === -1 && sheet.mapping.replyDate >= 0;
    for (const row of sheet.latestRows) {
      if (row.replyDate && parseLogDateToISO(row.replyDate)) {
        hasReplyDates = true;
      }
      const iso = getRowDateISO(row, field, fallbackToReply);
      if (!iso) {
        undatedCount += 1;
        continue;
      }
      datedCount += 1;
      if (!earliestDate || iso < earliestDate) earliestDate = iso;
      if (!latestDate || iso > latestDate) latestDate = iso;

      const year = iso.slice(0, 4);
      const month = iso.slice(5, 7);
      yearSet.add(year);

      const key = granularity === 'year' ? year : `${year}-${month}`;
      const label =
        granularity === 'year'
          ? year
          : `${ARABIC_MONTH_NAMES[month] || month} ${year}`;

      let bucket = bucketMap.get(key);
      if (!bucket) {
        bucket = {
          key,
          label,
          year,
          month: granularity === 'month' ? month : undefined,
          total: 0,
          approved: 0,
          pending: 0,
          rejected: 0,
          other: 0,
          approvalRate: 0,
          statusCounts: { A: 0, B: 0, C: 0, D: 0, W: 0, OTHER: 0 }
        };
        bucketMap.set(key, bucket);
      }

      bucket.total += 1;
      bucket.statusCounts[row.statusCode] += 1;
      if (row.statusCode === 'A' || row.statusCode === 'B') bucket.approved += 1;
      else if (row.statusCode === 'W') bucket.pending += 1;
      else if (row.statusCode === 'C' || row.statusCode === 'D') bucket.rejected += 1;
      else bucket.other += 1;
    }
  }

  const buckets = Array.from(bucketMap.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((b) => {
      const base = b.approved + b.pending + b.rejected;
      return {
        ...b,
        approvalRate: base > 0 ? Math.round((b.approved / base) * 100) : 0
      };
    });

  const availableYears = Array.from(yearSet).sort((a, b) => b.localeCompare(a));

  return {
    buckets,
    availableYears,
    earliestDate,
    latestDate,
    datedCount,
    undatedCount,
    hasReplyDates
  };
}

