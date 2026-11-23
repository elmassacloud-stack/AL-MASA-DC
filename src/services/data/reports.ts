import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { DailyReport, ReportAttachment, ReportAttachmentChunk } from '../../types';
import {
  cachePdfBlobUrl,
  db,
  getCachedPdfBlobUrl,
  handleFirestoreError,
  OperationType,
  revokePdfBlobUrl
} from '../firebase';
import {
  base64ToBlob,
  getExcelMimeType,
  isExcelFileName,
  PreparedReportAttachment
} from '../../utils/pdfUtils';
import { ReportUploadProgress, safeStorage, STORAGE_KEYS } from './shared';

export function getReports(): DailyReport[] {
  try {
    const data = safeStorage.getItem(STORAGE_KEYS.REPORTS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function getReportById(id: string): DailyReport | undefined {
  return getReports().find((r) => r.id === id);
}

export function getReportForProjectDate(
  projectId: string,
  reportDate: string
): DailyReport | undefined {
  return getReports().find((r) => r.projectId === projectId && r.reportDate === reportDate);
}

export async function uploadReportAttachmentChunks(
  reportId: string,
  preparedFiles: { item: PreparedReportAttachment; chunks: string[] }[],
  onProgress?: (progress: ReportUploadProgress) => void
): Promise<string[]> {
  const writtenChunkIds: string[] = [];
  const totalFiles = preparedFiles.length;
  const totalChunks = preparedFiles.reduce((sum, entry) => sum + entry.chunks.length, 0);
  const totalBytes = Math.max(
    1,
    preparedFiles.reduce((sum, entry) => sum + entry.item.size, 0)
  );
  let uploadedChunks = 0;
  const BATCH_CONCURRENCY = 5;

  for (let fileIdx = 0; fileIdx < preparedFiles.length; fileIdx++) {
    const { item, chunks } = preparedFiles[fileIdx];
    for (let start = 0; start < chunks.length; start += BATCH_CONCURRENCY) {
      const end = Math.min(start + BATCH_CONCURRENCY, chunks.length);
      const batchPromises: Promise<void>[] = [];

      for (let chunkIdx = start; chunkIdx < end; chunkIdx++) {
        const chunkId = `${item.attachmentId}_${chunkIdx}`;
        const chunkDoc: ReportAttachmentChunk = {
          attachmentId: item.attachmentId,
          index: chunkIdx,
          data: chunks[chunkIdx]
        };

        batchPromises.push(
          setDoc(doc(db, 'reports', reportId, 'chunks', chunkId), chunkDoc).then(() => {
            writtenChunkIds.push(chunkId);
            uploadedChunks += 1;
            const isAllDone = uploadedChunks === totalChunks;
            const percent = isAllDone
              ? 96
              : Math.min(95, Math.round(12 + (uploadedChunks / Math.max(1, totalChunks)) * 83));
            const uploadedBytes = Math.min(
              totalBytes,
              Math.round((uploadedChunks / Math.max(1, totalChunks)) * totalBytes)
            );
            onProgress?.({
              percent,
              currentFileIndex: fileIdx + 1,
              totalFiles,
              currentFileName: item.name,
              uploadedChunks,
              totalChunks,
              uploadedBytes,
              totalBytes,
              stage: isAllDone ? 'finalizing' : 'uploading'
            });
          })
        );
      }

      await Promise.all(batchPromises);
    }
  }

  return writtenChunkIds;
}

export async function deleteReportChunksByIds(
  reportId: string,
  chunkIds: string[]
): Promise<void> {
  for (const chunkId of chunkIds) {
    await deleteDoc(doc(db, 'reports', reportId, 'chunks', chunkId)).catch(() => undefined);
  }
}

export async function deleteReportAttachmentChunks(
  reportId: string,
  attachmentId: string
): Promise<void> {
  if (!attachmentId) return;
  try {
    const snap = await getDocs(
      query(collection(db, 'reports', reportId, 'chunks'), where('attachmentId', '==', attachmentId))
    );
    await Promise.allSettled(
      snap.docs.map((d) => deleteDoc(doc(db, 'reports', reportId, 'chunks', d.id)))
    );
    revokePdfBlobUrl(`rep-${reportId}-${attachmentId}`);
  } catch {
    // Ignore background cleanup errors
  }
}

export async function fetchReportAttachmentUrl(
  reportId: string,
  attachment: ReportAttachment
): Promise<string> {
  if (
    attachment.storageMode === 'firestore_chunks' ||
    (attachment.id && attachment.chunkCount && attachment.chunkCount > 0)
  ) {
    const cacheKey = `rep-${reportId}-${attachment.id}`;
    const cached = getCachedPdfBlobUrl(cacheKey);
    if (cached) return cached;

    let chunkDocs: ReportAttachmentChunk[] = [];
    try {
      const snap = await getDocs(
        query(
          collection(db, 'reports', reportId, 'chunks'),
          where('attachmentId', '==', attachment.id)
        )
      );
      chunkDocs = snap.docs.map((d) => d.data() as ReportAttachmentChunk);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `reports/${reportId}/chunks`);
    }

    if (chunkDocs.length === 0) {
      throw new Error('تعذر العثور على بيانات المرفق في قاعدة البيانات.');
    }

    chunkDocs.sort((a, b) => a.index - b.index);
    const fullBase64 = chunkDocs.map((c) => c.data).join('');
    const resolvedMime =
      attachment.type ||
      (isExcelFileName(attachment.name)
        ? getExcelMimeType(attachment.name)
        : attachment.name.toLowerCase().endsWith('.pdf')
          ? 'application/pdf'
          : 'application/octet-stream');

    const blob = base64ToBlob(fullBase64, resolvedMime);
    const url = URL.createObjectURL(blob);
    cachePdfBlobUrl(cacheKey, url);
    return url;
  }

  if (
    attachment.url &&
    (attachment.url.startsWith('http://') ||
      attachment.url.startsWith('https://') ||
      attachment.url.startsWith('data:'))
  ) {
    return attachment.url;
  }

  throw new Error(
    'هذا المرفق محفوظ كرابط محلي قديم من متصفح المرسل قبل تفعيل الرفع السحابي.'
  );
}

export function saveReportDraft(projectId: string, draftData: Partial<DailyReport>): void {
  try {
    const key = STORAGE_KEYS.REPORT_DRAFT_PREFIX + projectId;
    safeStorage.setJson(key, {
      data: draftData,
      savedAt: new Date().toISOString()
    });
  } catch (e) {
    console.warn('Autosave draft failed:', e);
  }
}

export function getReportDraft(
  projectId: string
): { data: Partial<DailyReport>; savedAt: string } | null {
  try {
    const key = STORAGE_KEYS.REPORT_DRAFT_PREFIX + projectId;
    const item = safeStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch {
    return null;
  }
}

export function clearReportDraft(projectId: string): void {
  try {
    const key = STORAGE_KEYS.REPORT_DRAFT_PREFIX + projectId;
    safeStorage.removeItem(key);
  } catch (e) {
    console.warn('Clear draft failed:', e);
  }
}
