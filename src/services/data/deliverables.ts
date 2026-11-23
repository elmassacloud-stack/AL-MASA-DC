import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import {
  AppNotification,
  SiteDeliverable,
  SiteDeliverableChunk,
  SiteDeliverableStatus,
  UserProfile
} from '../../types';
import {
  isSuperAdminEmail,
  MAX_PDF_FILE_SIZE_BYTES,
  PDF_CHUNK_SIZE_CHARS,
  SITE_DELIVERABLE_RETENTION_MS
} from '../../config';
import {
  assertFirestoreWriteAvailable,
  auth,
  cachePdfBlobUrl,
  db,
  deleteDeliverableFromFirebase,
  getCachedPdfBlobUrl,
  handleFirestoreError,
  isDeliverableExpired,
  isFirestoreQuotaExhausted,
  OperationType,
  purgeExpiredSiteDeliverablesFromFirebase
} from '../firebase';
import {
  canAccessSiteDeliverablesTab,
  hasAllProjectsAccess
} from '../../utils/accessControl';
import {
  base64ToBlob,
  getExcelMimeType,
  isExcelFileName,
  splitBase64IntoChunks
} from '../../utils/pdfUtils';
import {
  CreateSiteDeliverablePayload,
  DeliverableUploadProgress,
  normalizeEmail,
  safeStorage,
  STORAGE_KEYS,
  stripUndefined
} from './shared';

export interface DeliverablesDomainContext {
  getCurrentUser: () => UserProfile | null;
  resolveRecipientUserId: (userId?: string, email?: string) => string | undefined;
  addNotification: (notif: Omit<AppNotification, 'id' | 'isRead' | 'createdAt' | 'readBy'>) => void;
  notify: () => void;
}

export function getSiteDeliverables(): SiteDeliverable[] {
  try {
    const data = safeStorage.getItem(STORAGE_KEYS.SITE_DELIVERABLES);
    if (!data) return [];
    const parsed: SiteDeliverable[] = JSON.parse(data);
    const nowMs = Date.now();
    return parsed.filter((item) => !isDeliverableExpired(item, nowMs));
  } catch {
    return [];
  }
}

export function removeDeliverablesFromLocalState(deletedIds: string[], notify: () => void): void {
  if (deletedIds.length === 0) return;
  try {
    const stored = safeStorage.getItem(STORAGE_KEYS.SITE_DELIVERABLES);
    if (!stored) return;
    const list: SiteDeliverable[] = JSON.parse(stored);
    const idSet = new Set(deletedIds);
    const filtered = list.filter((d) => !idSet.has(d.id));
    if (filtered.length !== list.length) {
      safeStorage.setJson(STORAGE_KEYS.SITE_DELIVERABLES, filtered);
      notify();
    }
  } catch {
    // ignore parse errors
  }
}

export async function createSiteDeliverable(
  payload: CreateSiteDeliverablePayload,
  base64Pdf: string,
  ctx: DeliverablesDomainContext,
  onProgress?: (percent: number, info?: DeliverableUploadProgress) => void
): Promise<SiteDeliverable> {
  assertFirestoreWriteAvailable();
  const chunks = splitBase64IntoChunks(base64Pdf, PDF_CHUNK_SIZE_CHARS);
  if (
    payload.fileSizeBytes <= 0 ||
    payload.fileSizeBytes > MAX_PDF_FILE_SIZE_BYTES ||
    chunks.length === 0 ||
    chunks.length > 60
  ) {
    throw new Error('حجم ملف الـ PDF غير صالح أو يتجاوز الحد المسموح (25 ميجابايت).');
  }

  const nowMs = Date.now();
  const expiresAtMs = nowMs + SITE_DELIVERABLE_RETENTION_MS;
  const nowIso = new Date(nowMs).toISOString();
  const expiresIso = new Date(expiresAtMs).toISOString();
  const id = 'deliv-' + nowMs.toString(36) + '-' + Math.random().toString(36).substring(2, 6);
  const totalBytes = Math.max(1, Math.round(payload.fileSizeBytes));

  const deliverable: SiteDeliverable = stripUndefined({
    id,
    projectId: payload.projectId,
    projectName: payload.projectName.trim().slice(0, 200),
    title: payload.title.trim().slice(0, 300),
    deliverableType: payload.deliverableType,
    submittalNumber: payload.submittalNumber?.trim().slice(0, 120) || undefined,
    rev: typeof payload.rev === 'number' && Number.isFinite(payload.rev) ? payload.rev : undefined,
    notes: payload.notes?.trim().slice(0, 2000) || undefined,
    fileName: payload.fileName.trim().slice(0, 260),
    fileFormat: payload.fileFormat || (isExcelFileName(payload.fileName) ? 'excel' : 'pdf'),
    mimeType:
      payload.mimeType?.trim().slice(0, 150) ||
      (isExcelFileName(payload.fileName) ? getExcelMimeType(payload.fileName) : 'application/pdf'),
    fileSizeBytes: totalBytes,
    chunkCount: chunks.length,
    pageCount: payload.pageCount,
    senderId: auth.currentUser?.uid || payload.senderId,
    senderName: (
      payload.senderName ||
      auth.currentUser?.displayName ||
      normalizeEmail(auth.currentUser?.email || payload.senderEmail) ||
      'مستخدم'
    )
      .trim()
      .slice(0, 150),
    senderEmail: normalizeEmail(payload.senderEmail || auth.currentUser?.email).slice(0, 200),
    status: 'pending_receipt',
    createdAt: nowIso,
    updatedAt: nowIso,
    expiresAt: expiresIso,
    expiresAtMs
  });

  onProgress?.(8, {
    percent: 8,
    uploadedChunks: 0,
    totalChunks: chunks.length,
    uploadedBytes: 0,
    totalBytes,
    stage: 'metadata'
  });

  try {
    await setDoc(doc(db, 'siteDeliverables', id), stripUndefined(deliverable));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `siteDeliverables/${id}`);
  }

  onProgress?.(15, {
    percent: 15,
    uploadedChunks: 0,
    totalChunks: chunks.length,
    uploadedBytes: 0,
    totalBytes,
    stage: 'uploading'
  });

  try {
    const BATCH_CONCURRENCY = 5;
    let uploadedChunks = 0;
    for (let start = 0; start < chunks.length; start += BATCH_CONCURRENCY) {
      const end = Math.min(start + BATCH_CONCURRENCY, chunks.length);
      const batchPromises: Promise<void>[] = [];
      for (let idx = start; idx < end; idx++) {
        const chunkDoc: SiteDeliverableChunk = {
          index: idx,
          data: chunks[idx],
          expiresAtMs
        };
        batchPromises.push(
          setDoc(doc(db, 'siteDeliverables', id, 'chunks', `chunk-${idx}`), chunkDoc).then(() => {
            uploadedChunks += 1;
            const isAllChunksDone = uploadedChunks === chunks.length;
            const pct = isAllChunksDone
              ? 98
              : Math.min(97, Math.round(15 + (uploadedChunks / chunks.length) * 82));
            const uploadedBytes = Math.min(
              totalBytes,
              Math.round((uploadedChunks / chunks.length) * totalBytes)
            );
            onProgress?.(pct, {
              percent: pct,
              uploadedChunks,
              totalChunks: chunks.length,
              uploadedBytes,
              totalBytes,
              stage: isAllChunksDone ? 'finalizing' : 'uploading'
            });
          })
        );
      }
      await Promise.all(batchPromises);
    }
  } catch (error) {
    await deleteDeliverableFromFirebase(id).catch(() =>
      deleteDoc(doc(db, 'siteDeliverables', id)).catch(() => undefined)
    );
    handleFirestoreError(error, OperationType.CREATE, `siteDeliverables/${id}/chunks`);
  }

  const list = getSiteDeliverables();
  list.unshift(deliverable);
  safeStorage.setJson(STORAGE_KEYS.SITE_DELIVERABLES, list);

  const isExcel =
    deliverable.fileFormat === 'excel' || isExcelFileName(deliverable.fileName);

  ctx.addNotification({
    title: `${isExcel ? 'ملف Excel مستلم جديد' : 'ملف PDF مستلم جديد'}: ${deliverable.projectName}`,
    message: `أرسل ${deliverable.senderName} ملف "${deliverable.title}" (${deliverable.fileName}) — متاح لمدة 48 ساعة.`,
    type: 'deliverable_sent',
    targetRole: 'admin',
    projectId: deliverable.projectId,
    senderId: deliverable.senderId,
    senderName: deliverable.senderName,
    linkTab: 'site-deliverables'
  });

  onProgress?.(100, {
    percent: 100,
    uploadedChunks: chunks.length,
    totalChunks: chunks.length,
    uploadedBytes: totalBytes,
    totalBytes,
    stage: 'finalizing'
  });

  ctx.notify();
  return deliverable;
}

export async function fetchSiteDeliverablePdfUrl(
  deliverable: SiteDeliverable,
  onDeleteExpired: (deliverableId: string) => Promise<boolean>
): Promise<string> {
  if (isDeliverableExpired(deliverable)) {
    await onDeleteExpired(deliverable.id).catch(() => undefined);
    throw new Error('انتهت مدة صلاحية الملف (48 ساعة) وتم حذفه تلقائياً من قاعدة البيانات.');
  }

  const cached = getCachedPdfBlobUrl(deliverable.id);
  if (cached) {
    return cached;
  }

  let chunkDocs: SiteDeliverableChunk[] = [];
  try {
    const snap = await getDocs(collection(db, 'siteDeliverables', deliverable.id, 'chunks'));
    chunkDocs = snap.docs.map((d) => d.data() as SiteDeliverableChunk);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `siteDeliverables/${deliverable.id}/chunks`);
  }

  if (chunkDocs.length === 0) {
    throw new Error('تعذر العثور على بيانات الملف في قاعدة البيانات (ربما تم حذفه).');
  }

  chunkDocs.sort((a, b) => a.index - b.index);
  const fullBase64 = chunkDocs.map((c) => c.data).join('');
  const resolvedMime =
    deliverable.mimeType ||
    (deliverable.fileFormat === 'excel' || isExcelFileName(deliverable.fileName)
      ? getExcelMimeType(deliverable.fileName)
      : 'application/pdf');
  const blob = base64ToBlob(fullBase64, resolvedMime);
  const url = URL.createObjectURL(blob);
  cachePdfBlobUrl(deliverable.id, url);
  return url;
}

export async function updateSiteDeliverableStatus(
  deliverableId: string,
  status: SiteDeliverableStatus,
  adminNote: string | undefined,
  ctx: DeliverablesDomainContext
): Promise<boolean> {
  assertFirestoreWriteAvailable();
  const list = getSiteDeliverables();
  const idx = list.findIndex((d) => d.id === deliverableId);
  if (idx === -1) return false;

  const updatedAt = new Date().toISOString();
  const receivedAt = status === 'received' ? updatedAt : list[idx].receivedAt;
  const cleanedNote = adminNote?.trim().slice(0, 1000);

  const patch = stripUndefined({
    status,
    adminNote: cleanedNote || undefined,
    receivedAt,
    updatedAt
  });

  list[idx] = stripUndefined({
    ...list[idx],
    ...patch
  });
  safeStorage.setJson(STORAGE_KEYS.SITE_DELIVERABLES, list);

  try {
    await updateDoc(doc(db, 'siteDeliverables', deliverableId), patch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `siteDeliverables/${deliverableId}`);
  }

  const adminUser = ctx.getCurrentUser();
  const recipientUserId = ctx.resolveRecipientUserId(list[idx].senderId, list[idx].senderEmail);
  ctx.addNotification({
    title:
      status === 'received'
        ? `تم استلام ملف PDF: ${list[idx].title}`
        : `ملاحظة إدارة على ملف PDF: ${list[idx].title}`,
    message:
      status === 'received'
        ? `أكدت الإدارة استلام ملف "${list[idx].fileName}" لمشروع ${list[idx].projectName}.`
        : `طلبت الإدارة مراجعة ملف "${list[idx].fileName}"${cleanedNote ? `: ${cleanedNote}` : '.'}`,
    type: 'deliverable_reviewed',
    targetRole: 'site',
    targetUserId: recipientUserId,
    projectId: list[idx].projectId,
    senderId: adminUser?.id,
    senderName: adminUser?.displayName,
    linkTab: 'site-deliverables'
  });

  ctx.notify();
  return true;
}

export async function deleteSiteDeliverable(
  deliverableId: string,
  notify: () => void
): Promise<boolean> {
  assertFirestoreWriteAvailable();
  const deleted = await deleteDeliverableFromFirebase(deliverableId);
  if (deleted) {
    removeDeliverablesFromLocalState([deliverableId], notify);
  }
  return deleted;
}

export async function cleanupExpiredDeliverables(
  expiredItems: SiteDeliverable[],
  activeUser: UserProfile | null,
  notify: () => void
): Promise<void> {
  if (isFirestoreQuotaExhausted()) return;
  const isAdmin = activeUser?.role === 'admin' || isSuperAdminEmail(activeUser?.email);
  const deletedIds = await purgeExpiredSiteDeliverablesFromFirebase(
    {
      canAccessDeliverables: canAccessSiteDeliverablesTab(activeUser),
      hasAllProjects: Boolean(isAdmin || hasAllProjectsAccess(activeUser)),
      assignedProjectIds: activeUser?.assignedProjects || []
    },
    expiredItems
  );
  if (deletedIds.length > 0) {
    removeDeliverablesFromLocalState(deletedIds, notify);
  }
}
