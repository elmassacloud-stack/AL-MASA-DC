import type * as XLSXTypes from 'xlsx';
import {
  MAX_PDF_FILE_SIZE_BYTES,
  PDF_CHUNK_SIZE_CHARS,
  MAX_REPORT_ATTACHMENT_SIZE_BYTES,
  MAX_TASK_ATTACHMENT_SIZE_BYTES
} from '../config';
import { ReportAttachment } from '../types';

export interface PreparedPdfPayload {
  base64: string;
  fileName: string;
  fileSizeBytes: number;
  pageCount: number;
  fileFormat: 'pdf' | 'excel';
  mimeType: string;
}

export interface ExcelPreviewSheet {
  name: string;
  rows: string[][];
  totalRows: number;
  truncated: boolean;
}

export function isExcelFileName(fileName?: string): boolean {
  if (!fileName) return false;
  return /\.(xlsx|xls|xlsm|xlsb|xltx|xltm|ods|csv|tsv)$/i.test(fileName.trim());
}

export function isExcelFile(file: File): boolean {
  if (isExcelFileName(file.name)) return true;
  const excelMimes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.ms-excel.template.macroEnabled.12',
    'application/vnd.ms-excel.sheet.binary.spreadsheetml.sheet',
    'application/vnd.oasis.opendocument.spreadsheet',
    'text/csv',
    'text/tab-separated-values',
    'application/csv'
  ];
  return excelMimes.includes(file.type);
}

export function getExcelMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

export type ValidatedFileFormat = 'pdf' | 'xlsx' | 'xls' | 'jpeg' | 'png' | 'webp' | 'csv';

export interface FileValidationOptions {
  allowedFormats: ValidatedFileFormat[];
  maxSizeBytes: number;
  contextLabel?: string;
}

const FORMAT_MIME_ALLOWLIST: Record<ValidatedFileFormat, string[]> = {
  pdf: ['application/pdf'],
  xlsx: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroenabled.12',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
    'application/zip',
    'application/octet-stream'
  ],
  xls: ['application/vnd.ms-excel', 'application/octet-stream'],
  jpeg: ['image/jpeg', 'image/jpg'],
  png: ['image/png'],
  webp: ['image/webp'],
  csv: ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel']
};

function detectFormatFromExtension(fileName: string): ValidatedFileFormat | null {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (/\.(xlsx|xlsm|xltx|xltm)$/i.test(lower)) return 'xlsx';
  if (lower.endsWith('.xls')) return 'xls';
  if (/\.(jpg|jpeg)$/i.test(lower)) return 'jpeg';
  if (lower.endsWith('.png')) return 'png';
  if (lower.endsWith('.webp')) return 'webp';
  if (/\.(csv|tsv)$/i.test(lower)) return 'csv';
  return null;
}

function hasValidMagicBytes(bytes: Uint8Array, format: ValidatedFileFormat): boolean {
  if (format === 'pdf') {
    // %PDF-
    return (
      bytes.length >= 5 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2d
    );
  }
  if (format === 'xlsx') {
    // PK (ZIP container signature)
    return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  }
  if (format === 'xls') {
    // Legacy OLE2 Compound Document (D0 CF 11 E0 A1 B1 1A E1) or XML/HTML spreadsheet exported as .xls
    const isOle2 =
      bytes.length >= 8 &&
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0 &&
      bytes[4] === 0xa1 &&
      bytes[5] === 0xb1 &&
      bytes[6] === 0x1a &&
      bytes[7] === 0xe1;
    const isZip = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    return isOle2 || isZip;
  }
  if (format === 'jpeg') {
    // FF D8 FF
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (format === 'png') {
    // 89 50 4E 47
    return (
      bytes.length >= 4 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }
  if (format === 'webp') {
    // RIFF....WEBP
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  if (format === 'csv') {
    // Reject obvious binary/executable headers (MZ, ELF, PDF, PK, NUL bytes)
    if (bytes.length === 0) return false;
    if (bytes[0] === 0x4d && bytes[1] === 0x5a) return false; // MZ
    if (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) return false; // ELF
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return false; // PK
    for (let i = 0; i < Math.min(bytes.length, 16); i++) {
      if (bytes[i] === 0x00) return false;
    }
    return true;
  }
  return false;
}

/**
 * Validates file extension, MIME type, size limit, and binary file signature (magic bytes).
 * Throws a clear Arabic Error message on any mismatch.
 */
export async function validateUploadedFile(
  file: File,
  options: FileValidationOptions
): Promise<{ format: ValidatedFileFormat; canonicalMimeType: string }> {
  const ctx = options.contextLabel ? ` في ${options.contextLabel}` : '';
  if (!file || file.size <= 0) {
    throw new Error(`الملف «${file?.name || ''}» فارغ ولا يمكن رفعه${ctx}.`);
  }

  if (file.size > options.maxSizeBytes) {
    throw new Error(
      `حجم الملف «${file.name}» (${formatFileSize(file.size)}) يتجاوز الحد الأقصى المسموح (${formatFileSize(options.maxSizeBytes)})${ctx}.`
    );
  }

  const extFormat = detectFormatFromExtension(file.name);
  if (!extFormat || !options.allowedFormats.includes(extFormat)) {
    throw new Error(
      `امتداد الملف «${file.name}» غير مسموح به${ctx}. يرجى اختيار ملف بصيغة معتمدة.`
    );
  }

  const normalizedMime = (file.type || '').trim().toLowerCase();
  if (normalizedMime) {
    const allowedMimes = FORMAT_MIME_ALLOWLIST[extFormat];
    if (!allowedMimes.includes(normalizedMime)) {
      throw new Error(
        `نوع الملف «${file.name}» (${file.type}) لا يطابق الامتداد المسموح به${ctx}.`
      );
    }
  }

  const headerSlice = await file.slice(0, 16).arrayBuffer();
  const headerBytes = new Uint8Array(headerSlice);
  if (!hasValidMagicBytes(headerBytes, extFormat)) {
    throw new Error(
      `محتوى الملف «${file.name}» تالف أو لا يطابق صيغة الملف الحقيقية (${extFormat.toUpperCase()})، تم رفض الرفع لأسباب أمنية.`
    );
  }

  const canonicalMimeType: Record<ValidatedFileFormat, string> = {
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    csv: 'application/vnd.ms-excel'
  };

  return { format: extFormat, canonicalMimeType: canonicalMimeType[extFormat] };
}

export async function parseExcelPreviewFromBlobUrl(blobUrl: string): Promise<ExcelPreviewSheet[]> {
  const XLSX = await import('xlsx');
  const response = await fetch(blobUrl);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const workbook = XLSX.read(bytes, {
    type: 'array',
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    cellNF: true,
    sheetStubs: false,
    bookVBA: false
  });
  const MAX_PREVIEW_ROWS = 250;
  const MAX_PREVIEW_COLS = 30;
  const sheets: ExcelPreviewSheet[] = [];

  for (const name of workbook.SheetNames) {
    try {
      const sheet = workbook.Sheets?.[name];
      if (!sheet || (sheet as Record<string, unknown>)['!type'] === 'chart') continue;

      const rowMap = new Map<number, Map<number, string>>();
      let maxCol = -1;
      for (const key of Object.keys(sheet)) {
        if (key.charCodeAt(0) === 33) continue;
        const cell = sheet[key] as XLSXTypes.CellObject | undefined;
        if (!cell || cell.t === 'z' || cell.t === 'e') continue;
        const val =
          typeof cell.w === 'string' && cell.w.trim()
            ? cell.w.trim()
            : cell.v === null || cell.v === undefined
              ? ''
              : String(cell.v);
        if (!val) continue;
        let pos: XLSXTypes.CellAddress;
        try {
          pos = XLSX.utils.decode_cell(key);
        } catch {
          continue;
        }
        if (pos.r < 0 || pos.c < 0 || pos.c >= MAX_PREVIEW_COLS) continue;
        let cols = rowMap.get(pos.r);
        if (!cols) {
          cols = new Map<number, string>();
          rowMap.set(pos.r, cols);
        }
        cols.set(pos.c, val);
        if (pos.c > maxCol) maxCol = pos.c;
      }

      const sortedRows = Array.from(rowMap.keys()).sort((a, b) => a - b);
      const totalRows = sortedRows.length;
      const truncated = totalRows > MAX_PREVIEW_ROWS;
      const slicedKeys = sortedRows.slice(0, MAX_PREVIEW_ROWS);
      const colCount = Math.max(0, maxCol + 1);
      const normalizedRows = slicedKeys.map((rIdx) => {
        const cols = rowMap.get(rIdx)!;
        const out = new Array<string>(colCount).fill('');
        cols.forEach((v, cIdx) => {
          out[cIdx] = v;
        });
        return out;
      });

      sheets.push({
        name,
        rows: normalizedRows,
        totalRows,
        truncated
      });
    } catch {
      sheets.push({ name, rows: [], totalRows: 0, truncated: false });
    }
  }

  return sheets;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function base64ToBlob(base64: string, mimeType = 'application/pdf'): Blob {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export function splitBase64IntoChunks(base64: string, chunkSize = PDF_CHUNK_SIZE_CHARS): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += chunkSize) {
    chunks.push(base64.slice(i, i + chunkSize));
  }
  return chunks;
}

async function imageFileToJpegBytes(file: File): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('تعذر قراءة ملف الصورة المحدد.'));
      image.src = objectUrl;
    });

    const maxDim = 1800;
    let targetW = img.naturalWidth || img.width || 1200;
    let targetH = img.naturalHeight || img.height || 1600;
    if (targetW > maxDim || targetH > maxDim) {
      const ratio = Math.min(maxDim / targetW, maxDim / targetH);
      targetW = Math.round(targetW * ratio);
      targetH = Math.round(targetH * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('تعذر معالجة الصورة لتحويلها إلى PDF.');
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('تعذر ضغط الصورة لتحويلها إلى PDF.'))),
        'image/jpeg',
        0.84
      );
    });
    const buffer = await blob.arrayBuffer();
    return {
      bytes: new Uint8Array(buffer),
      width: targetW,
      height: targetH
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Prepares a single PDF, a single Excel workbook (.xlsx/.xls/.xlsm/.xlsb/.csv),
 * OR 1+ image files (converted into a single PDF) ready for chunked Firestore storage within 25MB.
 */
export async function preparePdfFromFiles(
  files: File[],
  customTitle?: string,
  onProgress?: (percent: number, stageLabel?: string) => void
): Promise<PreparedPdfPayload> {
  if (!files || files.length === 0) {
    throw new Error('يرجى اختيار ملف PDF أو Excel أو صورة مستند واحدة على الأقل.');
  }

  const first = files[0];
  const isPdf =
    files.length === 1 &&
    (first.type === 'application/pdf' || first.name.toLowerCase().endsWith('.pdf'));

  if (isPdf) {
    await validateUploadedFile(first, {
      allowedFormats: ['pdf'],
      maxSizeBytes: MAX_PDF_FILE_SIZE_BYTES,
      contextLabel: 'تسليمات الموقع'
    });
    onProgress?.(20, 'جاري قراءة ملف الـ PDF...');
    const buffer = await first.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    onProgress?.(55, 'جاري فحص صفحات المستند...');
    let pageCount = 1;
    try {
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      pageCount = doc.getPageCount() || 1;
    } catch {
      pageCount = 1;
    }
    onProgress?.(80, 'جاري ترميز الملف تمهيداً للرفع...');
    const base64 = uint8ArrayToBase64(bytes);
    onProgress?.(100, 'تم تجهيز الملف بنجاح');
    return {
      base64,
      fileName: first.name.toLowerCase().endsWith('.pdf') ? first.name : `${first.name}.pdf`,
      fileSizeBytes: bytes.byteLength,
      pageCount,
      fileFormat: 'pdf',
      mimeType: 'application/pdf'
    };
  }

  const isSingleExcel = files.length === 1 && isExcelFile(first);
  if (isSingleExcel) {
    const validatedExcel = await validateUploadedFile(first, {
      allowedFormats: ['xlsx', 'xls'],
      maxSizeBytes: MAX_PDF_FILE_SIZE_BYTES,
      contextLabel: 'تسليمات الموقع'
    });
    onProgress?.(20, 'جاري قراءة ملف الـ Excel...');
    const buffer = await first.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    onProgress?.(55, 'جاري فحص أوراق العمل في الملف...');
    let sheetCount = 1;
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(bytes, { type: 'array', bookSheets: true });
      sheetCount = Math.max(1, workbook.SheetNames.length || 1);
    } catch {
      sheetCount = 1;
    }
    onProgress?.(80, 'جاري ترميز ملف الـ Excel تمهيداً للرفع...');
    const base64 = uint8ArrayToBase64(bytes);
    onProgress?.(100, 'تم تجهيز ملف الـ Excel بنجاح');
    return {
      base64,
      fileName: first.name,
      fileSizeBytes: bytes.byteLength,
      pageCount: sheetCount,
      fileFormat: 'excel',
      mimeType: validatedExcel.canonicalMimeType
    };
  }

  // Validate that all selected files are valid JPEG/PNG/WebP images (magic bytes + MIME + size)
  const imageFiles: File[] = [];
  for (const f of files) {
    await validateUploadedFile(f, {
      allowedFormats: ['jpeg', 'png', 'webp'],
      maxSizeBytes: MAX_PDF_FILE_SIZE_BYTES,
      contextLabel: 'تسليمات الموقع'
    });
    imageFiles.push(f);
  }

  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  for (let i = 0; i < imageFiles.length; i++) {
    const imgFile = imageFiles[i];
    const stepPct = Math.max(10, Math.round(((i + 0.4) / imageFiles.length) * 80));
    onProgress?.(stepPct, `جاري معالجة ودمج الصورة ${i + 1} من ${imageFiles.length}...`);

    const { bytes, width, height } = await imageFileToJpegBytes(imgFile);
    const embedded = await pdfDoc.embedJpg(bytes);

    // Fit cleanly inside standard A4 portrait or landscape based on image orientation
    const isLandscape = width > height;
    const pageWidth = isLandscape ? 841.89 : 595.28;
    const pageHeight = isLandscape ? 595.28 : 841.89;
    const margin = 20;

    const maxDrawW = pageWidth - margin * 2;
    const maxDrawH = pageHeight - margin * 2;
    const scale = Math.min(maxDrawW / width, maxDrawH / height);
    const drawW = width * scale;
    const drawH = height * scale;

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawImage(embedded, {
      x: (pageWidth - drawW) / 2,
      y: (pageHeight - drawH) / 2,
      width: drawW,
      height: drawH
    });
  }

  onProgress?.(88, 'جاري إنشاء وضغط ملف الـ PDF...');
  const pdfBytes = await pdfDoc.save();
  if (pdfBytes.byteLength > MAX_PDF_FILE_SIZE_BYTES) {
    throw new Error(
      `حجم ملف الـ PDF الناتج (${formatFileSize(pdfBytes.byteLength)}) يتجاوز الحد الأقصى (${formatFileSize(MAX_PDF_FILE_SIZE_BYTES)}). يرجى تقليل عدد الصور.`
    );
  }

  onProgress?.(95, 'جاري ترميز الملف تمهيداً للرفع...');
  const sanitizedBase = (customTitle || first.name.replace(/\.[^.]+$/, '') || 'site-deliverable')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim()
    .slice(0, 80);

  const base64 = uint8ArrayToBase64(pdfBytes);
  onProgress?.(100, 'تم تجهيز الملف بنجاح');

  return {
    base64,
    fileName: `${sanitizedBase || 'site-deliverable'}.pdf`,
    fileSizeBytes: pdfBytes.byteLength,
    pageCount: pdfDoc.getPageCount(),
    fileFormat: 'pdf',
    mimeType: 'application/pdf'
  };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function getRemainingRetentionInfo(expiresAtMs: number, nowMs = Date.now()): {
  isExpired: boolean;
  label: string;
  isUrgent: boolean;
} {
  const diff = expiresAtMs - nowMs;
  if (diff <= 0) {
    return { isExpired: true, label: 'منتهي الصلاحية (جاري الحذف)', isUrgent: true };
  }
  const totalMinutes = Math.floor(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const isUrgent = hours < 6;

  if (hours >= 1) {
    return {
      isExpired: false,
      label: `متبقي ${hours} ساعة${minutes > 0 ? ` و ${minutes} د` : ''}`,
      isUrgent
    };
  }
  return {
    isExpired: false,
    label: `متبقي ${Math.max(1, minutes)} دقيقة فقط`,
    isUrgent: true
  };
}

export interface PreparedReportAttachment {
  attachmentId: string;
  name: string;
  size: number;
  type: string;
  base64: string;
  kind: 'pdf' | 'image' | 'excel';
}

export function getReportAttachmentKind(
  att: Pick<ReportAttachment, 'name' | 'type'>
): 'pdf' | 'image' | 'excel' | 'other' {
  const mime = (att.type || '').toLowerCase();
  const name = (att.name || '').toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (mime.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(name)) return 'image';
  if (isExcelFileName(name) || mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) {
    return 'excel';
  }
  return 'other';
}

export async function prepareReportAttachmentFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<PreparedReportAttachment> {
  const attachmentId =
    'att-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);

  const MAX_RAW_IMAGE_BYTES = 15 * 1024 * 1024;
  const extFormat = detectFormatFromExtension(file.name);
  const isImageExt = extFormat === 'jpeg' || extFormat === 'png' || extFormat === 'webp';

  const validated = await validateUploadedFile(file, {
    allowedFormats: ['pdf', 'xlsx', 'xls', 'jpeg', 'png', 'webp'],
    maxSizeBytes: isImageExt ? MAX_RAW_IMAGE_BYTES : MAX_REPORT_ATTACHMENT_SIZE_BYTES,
    contextLabel: 'المرفقات'
  });

  if (validated.format === 'jpeg' || validated.format === 'png' || validated.format === 'webp') {
    onProgress?.(25);
    const { bytes } = await imageFileToJpegBytes(file);
    if (bytes.byteLength > MAX_REPORT_ATTACHMENT_SIZE_BYTES) {
      throw new Error(
        `حجم الصورة «${file.name}» بعد الضغط (${formatFileSize(bytes.byteLength)}) يتجاوز الحد الأقصى المسموح (${formatFileSize(MAX_REPORT_ATTACHMENT_SIZE_BYTES)}).`
      );
    }
    onProgress?.(70);
    const base64 = uint8ArrayToBase64(bytes);
    onProgress?.(100);
    const safeName = /\.(jpg|jpeg|png|webp)$/i.test(file.name)
      ? file.name.replace(/\.[^.]+$/, '.jpg')
      : `${file.name}.jpg`;
    return {
      attachmentId,
      name: safeName.slice(0, 200),
      size: bytes.byteLength,
      type: 'image/jpeg',
      base64,
      kind: 'image'
    };
  }

  onProgress?.(30);
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  onProgress?.(75);
  const base64 = uint8ArrayToBase64(bytes);
  onProgress?.(100);

  return {
    attachmentId,
    name: file.name.slice(0, 200),
    size: bytes.byteLength,
    type: validated.canonicalMimeType,
    base64,
    kind: validated.format === 'pdf' ? 'pdf' : 'excel'
  };
}

export interface PreparedTaskAttachment {
  attachmentId: string;
  name: string;
  fileSizeBytes: number;
  mimeType: string;
  fileFormat: 'pdf' | 'excel' | 'image' | 'other';
  pageCount?: number;
  base64: string;
}

export async function prepareTaskAttachmentFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<PreparedTaskAttachment> {
  const validated = await validateUploadedFile(file, {
    allowedFormats: ['pdf', 'xlsx', 'xls', 'jpeg', 'png', 'webp'],
    maxSizeBytes: MAX_TASK_ATTACHMENT_SIZE_BYTES,
    contextLabel: 'مرفقات المهمة'
  });

  const attachmentId =
    'tatt-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);
  const isPdf = validated.format === 'pdf';
  const isExcel = validated.format === 'xlsx' || validated.format === 'xls';
  const isImage =
    validated.format === 'jpeg' || validated.format === 'png' || validated.format === 'webp';

  onProgress?.(25);
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  let pageCount: number | undefined;
  if (isPdf) {
    try {
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      pageCount = doc.getPageCount() || 1;
    } catch {
      pageCount = 1;
    }
  } else if (isExcel) {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(bytes, { type: 'array', bookSheets: true });
      pageCount = Math.max(1, workbook.SheetNames.length || 1);
    } catch {
      pageCount = 1;
    }
  }

  onProgress?.(70);
  const base64 = uint8ArrayToBase64(bytes);
  onProgress?.(100);

  const fileFormat: 'pdf' | 'excel' | 'image' | 'other' = isPdf
    ? 'pdf'
    : isExcel
      ? 'excel'
      : isImage
        ? 'image'
        : 'other';

  return {
    attachmentId,
    name: file.name.slice(0, 260),
    fileSizeBytes: bytes.byteLength,
    mimeType: validated.canonicalMimeType.slice(0, 150),
    fileFormat,
    pageCount,
    base64
  };
}
