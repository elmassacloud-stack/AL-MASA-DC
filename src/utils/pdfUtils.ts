import { PDFDocument } from 'pdf-lib';
import * as XLSX from 'xlsx';
import {
  MAX_PDF_FILE_SIZE_BYTES,
  PDF_CHUNK_SIZE_CHARS,
  MAX_REPORT_ATTACHMENT_SIZE_BYTES
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
  return /\.(xlsx|xls|xlsm|xlsb|csv)$/i.test(fileName.trim());
}

export function isExcelFile(file: File): boolean {
  if (isExcelFileName(file.name)) return true;
  const excelMimes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.ms-excel.sheet.binary.spreadsheetml.sheet',
    'text/csv',
    'application/csv'
  ];
  return excelMimes.includes(file.type);
}

export function getExcelMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.xlsm')) return 'application/vnd.ms-excel.sheet.macroEnabled.12';
  if (lower.endsWith('.xlsb')) return 'application/vnd.ms-excel.sheet.binary.spreadsheetml.sheet';
  if (lower.endsWith('.csv')) return 'text/csv;charset=utf-8';
  return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

export async function parseExcelPreviewFromBlobUrl(blobUrl: string): Promise<ExcelPreviewSheet[]> {
  const response = await fetch(blobUrl);
  const buffer = await response.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const MAX_PREVIEW_ROWS = 250;

  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    const truncated = rawRows.length > MAX_PREVIEW_ROWS;
    const sliced = rawRows.slice(0, MAX_PREVIEW_ROWS);
    const maxCols = Math.min(
      30,
      sliced.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0)
    );
    const normalizedRows = sliced.map((row) => {
      const arr = Array.isArray(row) ? row : [];
      const out: string[] = [];
      for (let c = 0; c < maxCols; c++) {
        const val = arr[c];
        out.push(val === null || val === undefined ? '' : String(val));
      }
      return out;
    });
    return {
      name,
      rows: normalizedRows,
      totalRows: rawRows.length,
      truncated
    };
  });
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
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
    if (first.size > MAX_PDF_FILE_SIZE_BYTES) {
      throw new Error(
        `حجم ملف الـ PDF (${formatFileSize(first.size)}) يتجاوز الحد الأقصى المسموح (${formatFileSize(MAX_PDF_FILE_SIZE_BYTES)}).`
      );
    }
    onProgress?.(20, 'جاري قراءة ملف الـ PDF...');
    const buffer = await first.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    onProgress?.(55, 'جاري فحص صفحات المستند...');
    let pageCount = 1;
    try {
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
    if (first.size > MAX_PDF_FILE_SIZE_BYTES) {
      throw new Error(
        `حجم ملف الـ Excel (${formatFileSize(first.size)}) يتجاوز الحد الأقصى المسموح (${formatFileSize(MAX_PDF_FILE_SIZE_BYTES)}).`
      );
    }
    onProgress?.(20, 'جاري قراءة ملف الـ Excel...');
    const buffer = await first.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    onProgress?.(55, 'جاري فحص أوراق العمل في الملف...');
    let sheetCount = 1;
    try {
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
      mimeType: getExcelMimeType(first.name)
    };
  }

  // Validate that all selected files are images if not a single PDF or Excel file
  const imageFiles = files.filter((f) => f.type.startsWith('image/'));
  if (imageFiles.length !== files.length) {
    throw new Error('يرجى رفع ملف PDF أو Excel واحد فقط، أو اختيار صور (JPG / PNG) ليتم دمجها تلقائياً في ملف PDF.');
  }

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

  const lowerName = file.name.toLowerCase();
  const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
  const isExcel = isExcelFile(file);
  const isImage =
    file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(lowerName);

  if (!isPdf && !isExcel && !isImage) {
    throw new Error(
      `صيغة الملف «${file.name}» غير مدعومة في مرفقات التقرير. الصيغ المدعومة: PDF أو صور (JPG / PNG / WebP) أو Excel.`
    );
  }

  if (isImage) {
    const MAX_RAW_IMAGE_BYTES = 15 * 1024 * 1024;
    if (file.size > MAX_RAW_IMAGE_BYTES) {
      throw new Error(
        `حجم الصورة «${file.name}» (${formatFileSize(file.size)}) كبير جداً للمعالجة. يرجى اختيار صورة أصغر من 15 ميجابايت.`
      );
    }
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

  if (file.size <= 0) {
    throw new Error(`الملف «${file.name}» فارغ ولا يمكن إرفاقه.`);
  }

  if (file.size > MAX_REPORT_ATTACHMENT_SIZE_BYTES) {
    throw new Error(
      `حجم الملف «${file.name}» (${formatFileSize(file.size)}) يتجاوز الحد المسموح في التقرير اليومي (${formatFileSize(MAX_REPORT_ATTACHMENT_SIZE_BYTES)}). للملفات الكبيرة حتى 25 ميجابايت يرجى استخدام تبويب «تسليمات الموقع».`
    );
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
    type: isPdf ? 'application/pdf' : getExcelMimeType(file.name),
    base64,
    kind: isPdf ? 'pdf' : 'excel'
  };
}
