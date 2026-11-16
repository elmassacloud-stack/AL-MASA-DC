import { PDFDocument } from 'pdf-lib';
import { MAX_PDF_FILE_SIZE_BYTES, PDF_CHUNK_SIZE_CHARS } from '../config';

export interface PreparedPdfPayload {
  base64: string;
  fileName: string;
  fileSizeBytes: number;
  pageCount: number;
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
 * Prepares either a single PDF file OR 1+ image files (converted into a single PDF)
 * ready for chunked Firestore storage within the 4MB limit.
 */
export async function preparePdfFromFiles(files: File[], customTitle?: string): Promise<PreparedPdfPayload> {
  if (!files || files.length === 0) {
    throw new Error('يرجى اختيار ملف PDF أو صورة مستند واحد على الأقل.');
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
    const buffer = await first.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let pageCount = 1;
    try {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      pageCount = doc.getPageCount() || 1;
    } catch {
      pageCount = 1;
    }
    const base64 = uint8ArrayToBase64(bytes);
    return {
      base64,
      fileName: first.name.toLowerCase().endsWith('.pdf') ? first.name : `${first.name}.pdf`,
      fileSizeBytes: bytes.byteLength,
      pageCount
    };
  }

  // Validate that all selected files are images if not a single PDF
  const imageFiles = files.filter((f) => f.type.startsWith('image/'));
  if (imageFiles.length !== files.length) {
    throw new Error('يرجى رفع ملف PDF واحد فقط، أو اختيار صور (JPG / PNG) ليتم دمجها تلقائياً في ملف PDF.');
  }

  const pdfDoc = await PDFDocument.create();
  for (const imgFile of imageFiles) {
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

  const pdfBytes = await pdfDoc.save();
  if (pdfBytes.byteLength > MAX_PDF_FILE_SIZE_BYTES) {
    throw new Error(
      `حجم ملف الـ PDF الناتج (${formatFileSize(pdfBytes.byteLength)}) يتجاوز الحد الأقصى (${formatFileSize(MAX_PDF_FILE_SIZE_BYTES)}). يرجى تقليل عدد الصور.`
    );
  }

  const sanitizedBase = (customTitle || first.name.replace(/\.[^.]+$/, '') || 'site-deliverable')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim()
    .slice(0, 80);

  return {
    base64: uint8ArrayToBase64(pdfBytes),
    fileName: `${sanitizedBase || 'site-deliverable'}.pdf`,
    fileSizeBytes: pdfBytes.byteLength,
    pageCount: pdfDoc.getPageCount()
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
