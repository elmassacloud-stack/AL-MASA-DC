import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { ProjectTask, TaskAttachment, TaskAttachmentChunk } from '../../types';
import {
  cachePdfBlobUrl,
  db,
  getCachedPdfBlobUrl,
  handleFirestoreError,
  isTaskAttachmentExpired,
  OperationType
} from '../firebase';
import {
  base64ToBlob,
  getExcelMimeType,
  isExcelFileName,
  PreparedTaskAttachment
} from '../../utils/pdfUtils';
import { safeStorage, STORAGE_KEYS, TaskUploadProgress } from './shared';

export function getTasksRaw(): ProjectTask[] {
  try {
    const data = safeStorage.getItem(STORAGE_KEYS.TASKS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function getTasks(): ProjectTask[] {
  const nowMs = Date.now();
  return getTasksRaw().map((t) => {
    if (!t.attachments || t.attachments.length === 0) return t;
    const activeAttachments = t.attachments.filter((att) => !isTaskAttachmentExpired(att, nowMs));
    return activeAttachments.length === t.attachments.length
      ? t
      : { ...t, attachments: activeAttachments };
  });
}

export async function uploadTaskAttachmentChunks(
  taskId: string,
  preparedFiles: { item: PreparedTaskAttachment; chunks: string[]; expiresAtMs: number }[],
  onProgress?: (progress: TaskUploadProgress) => void
): Promise<string[]> {
  const writtenChunkIds: string[] = [];
  const totalFiles = preparedFiles.length;
  const totalChunks = preparedFiles.reduce((sum, entry) => sum + entry.chunks.length, 0);
  const totalBytes = Math.max(
    1,
    preparedFiles.reduce((sum, entry) => sum + entry.item.fileSizeBytes, 0)
  );
  let uploadedChunks = 0;
  const BATCH_CONCURRENCY = 5;

  for (let fileIdx = 0; fileIdx < preparedFiles.length; fileIdx++) {
    const { item, chunks, expiresAtMs } = preparedFiles[fileIdx];
    for (let start = 0; start < chunks.length; start += BATCH_CONCURRENCY) {
      const end = Math.min(start + BATCH_CONCURRENCY, chunks.length);
      const batchPromises: Promise<void>[] = [];

      for (let chunkIdx = start; chunkIdx < end; chunkIdx++) {
        const chunkId = `${item.attachmentId}_${chunkIdx}`;
        const chunkDoc: TaskAttachmentChunk = {
          attachmentId: item.attachmentId,
          index: chunkIdx,
          data: chunks[chunkIdx],
          expiresAtMs
        };

        batchPromises.push(
          setDoc(doc(db, 'tasks', taskId, 'chunks', chunkId), chunkDoc).then(() => {
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

export async function deleteTaskChunksByIds(taskId: string, chunkIds: string[]): Promise<void> {
  for (const chunkId of chunkIds) {
    await deleteDoc(doc(db, 'tasks', taskId, 'chunks', chunkId)).catch(() => undefined);
  }
}

export async function fetchTaskAttachmentUrl(
  taskId: string,
  attachment: TaskAttachment,
  onTriggerCleanup: () => Promise<void>
): Promise<string> {
  if (isTaskAttachmentExpired(attachment)) {
    void onTriggerCleanup();
    throw new Error('انتهت مدة صلاحية هذا المرفق (48 ساعة) وتم حذفه تلقائياً من قاعدة البيانات.');
  }

  const cacheKey = `task-${taskId}-${attachment.id}`;
  const cached = getCachedPdfBlobUrl(cacheKey);
  if (cached) return cached;

  let chunkDocs: TaskAttachmentChunk[] = [];
  try {
    const snap = await getDocs(
      query(collection(db, 'tasks', taskId, 'chunks'), where('attachmentId', '==', attachment.id))
    );
    chunkDocs = snap.docs.map((d) => d.data() as TaskAttachmentChunk);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `tasks/${taskId}/chunks`);
  }

  if (chunkDocs.length === 0) {
    throw new Error('تعذر العثور على بيانات المرفق في قاعدة البيانات (ربما انتهت صلاحيته).');
  }

  chunkDocs.sort((a, b) => a.index - b.index);
  const fullBase64 = chunkDocs.map((c) => c.data).join('');
  const resolvedMime =
    attachment.mimeType ||
    (attachment.fileFormat === 'excel' || isExcelFileName(attachment.name)
      ? getExcelMimeType(attachment.name)
      : attachment.fileFormat === 'pdf' || attachment.name.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : 'application/octet-stream');

  const blob = base64ToBlob(fullBase64, resolvedMime);
  const url = URL.createObjectURL(blob);
  cachePdfBlobUrl(cacheKey, url);
  return url;
}
