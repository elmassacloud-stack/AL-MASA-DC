import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { SharedExcelLogChunk, SharedExcelLogFile, UserProfile, UserRole } from '../../types';
import { isSuperAdminEmail, MAX_PDF_FILE_SIZE_BYTES, PDF_CHUNK_SIZE_CHARS } from '../../config';
import {
  auth,
  db,
  getFirestoreErrorCode,
  handleFirestoreError,
  isFirestoreQuotaExhausted,
  markFirestoreQuotaExhausted,
  OperationType
} from '../firebase';
import {
  base64ToArrayBuffer,
  splitBase64IntoChunks,
  uint8ArrayToBase64
} from '../../utils/pdfUtils';
import { safeStorage, STORAGE_KEYS, stripUndefined } from './shared';

export interface ExcelLogsDomainContext {
  getCurrentUser: () => UserProfile | null;
  notify: () => void;
}

export function isExcelLogLoadingPausedForProject(info: {
  projectId?: string | null;
  projectName?: string | null;
  projectCode?: string | null;
}): boolean {
  const combined = `${info.projectId || ''} ${info.projectName || ''} ${info.projectCode || ''}`.toLowerCase();
  return (
    combined.includes('رافيل') ||
    combined.includes('راڤيل') ||
    combined.includes('ravel') ||
    combined.includes('ravil')
  );
}

export function getSharedExcelLogs(): SharedExcelLogFile[] {
  try {
    const raw = safeStorage.getItem(STORAGE_KEYS.EXCEL_LOGS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SharedExcelLogFile[]) : [];
  } catch {
    return [];
  }
}

export async function uploadSharedExcelLog(
  payload: {
    id: string;
    projectId: string;
    projectName: string;
    fileName: string;
    buffer: ArrayBuffer;
    sourceLabel?: string;
  },
  ctx: ExcelLogsDomainContext
): Promise<SharedExcelLogFile> {
  if (
    isExcelLogLoadingPausedForProject({
      projectId: payload.projectId,
      projectName: payload.projectName
    })
  ) {
    throw new Error('تم إيقاف تحميل ورفع شيت اللوج لموقع رافيل.');
  }

  const firebaseUser = auth.currentUser;
  if (!firebaseUser) {
    throw new Error('يجب تسجيل الدخول أولاً لرفع وحفظ شيتات اللوج سحابياً.');
  }

  const totalBytes = payload.buffer.byteLength;
  if (totalBytes <= 0 || totalBytes > MAX_PDF_FILE_SIZE_BYTES) {
    throw new Error('حجم ملف Excel يتجاوز الحد الأقصى المسموح للمزامنة السحابية (25 ميجابايت).');
  }

  const base64 = uint8ArrayToBase64(new Uint8Array(payload.buffer));
  const chunks = splitBase64IntoChunks(base64, PDF_CHUNK_SIZE_CHARS);
  if (chunks.length === 0 || chunks.length > 60) {
    throw new Error('تعذر تجهيز ملف Excel للمزامنة السحابية بسبب حجمه.');
  }

  const activeUser = ctx.getCurrentUser();
  const isAdminActor =
    activeUser?.role === 'admin' || isSuperAdminEmail(firebaseUser.email || activeUser?.email);
  if (!isAdminActor) {
    throw new Error('تبويب اللوج متاح للأدمن فقط.');
  }
  const uploaderRole: UserRole = 'admin';
  const nowIso = new Date().toISOString();

  const safeId = payload.id
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  const safeProjectId = payload.projectId
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);

  const record: SharedExcelLogFile = stripUndefined({
    id: safeId,
    projectId: safeProjectId,
    projectName: (payload.projectName || 'مشروع').trim().slice(0, 200) || 'مشروع',
    fileName: (payload.fileName || 'log.xlsx').trim().slice(0, 260) || 'log.xlsx',
    fileSizeBytes: Math.round(totalBytes),
    chunkCount: chunks.length,
    uploadedBy: firebaseUser.uid.slice(0, 128),
    uploaderName:
      (activeUser?.displayName || firebaseUser.displayName || firebaseUser.email || 'مستخدم')
        .trim()
        .slice(0, 150) || 'مستخدم',
    uploaderRole,
    sourceLabel: payload.sourceLabel ? payload.sourceLabel.trim().slice(0, 200) : undefined,
    createdAt: nowIso,
    updatedAt: nowIso
  });

  try {
    await setDoc(doc(db, 'excelLogs', safeId), record);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `excelLogs/${safeId}`);
  }

  try {
    const BATCH_CONCURRENCY = 5;
    for (let start = 0; start < chunks.length; start += BATCH_CONCURRENCY) {
      const end = Math.min(start + BATCH_CONCURRENCY, chunks.length);
      const batchPromises: Promise<void>[] = [];
      for (let idx = start; idx < end; idx++) {
        const chunkDoc: SharedExcelLogChunk = {
          index: idx,
          data: chunks[idx]
        };
        batchPromises.push(
          setDoc(doc(db, 'excelLogs', safeId, 'chunks', `chunk-${idx}`), chunkDoc)
        );
      }
      await Promise.all(batchPromises);
    }
  } catch (error) {
    await deleteSharedExcelLog(safeId, ctx).catch(() =>
      deleteDoc(doc(db, 'excelLogs', safeId)).catch(() => undefined)
    );
    handleFirestoreError(error, OperationType.CREATE, `excelLogs/${safeId}/chunks`);
  }

  const currentList = getSharedExcelLogs();
  const nextList = [record, ...currentList.filter((item) => item.id !== record.id)];
  safeStorage.setJson(STORAGE_KEYS.EXCEL_LOGS, nextList);
  ctx.notify();
  return record;
}

export async function fetchSharedExcelLogBuffer(log: SharedExcelLogFile): Promise<ArrayBuffer> {
  if (
    isExcelLogLoadingPausedForProject({
      projectId: log.projectId,
      projectName: log.projectName
    })
  ) {
    throw new Error('تم إيقاف تحميل شيت اللوج لموقع رافيل.');
  }

  let chunkDocs: SharedExcelLogChunk[] = [];
  try {
    const snap = await getDocs(collection(db, 'excelLogs', log.id, 'chunks'));
    chunkDocs = snap.docs.map((d) => d.data() as SharedExcelLogChunk);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `excelLogs/${log.id}/chunks`);
  }

  if (chunkDocs.length === 0) {
    throw new Error(`لم يتم العثور على محتوى ملف اللوج «${log.fileName}» في قاعدة البيانات.`);
  }

  chunkDocs.sort((a, b) => a.index - b.index);
  const fullBase64 = chunkDocs.map((c) => c.data).join('');
  return base64ToArrayBuffer(fullBase64);
}

export async function updateSharedExcelLogMeta(
  logId: string,
  sheetOverrides: Record<number, unknown>,
  excludedSheetIndices: number[],
  ctx: ExcelLogsDomainContext
): Promise<boolean> {
  const logs = getSharedExcelLogs();
  const target = logs.find((item) => item.id === logId);
  if (!target) return false;

  const activeUser = ctx.getCurrentUser();
  const isAdminActor =
    activeUser?.role === 'admin' || isSuperAdminEmail(auth.currentUser?.email || activeUser?.email);
  if (!isAdminActor) {
    return false;
  }

  const serializedOverrides = JSON.stringify(sheetOverrides || {});
  if (serializedOverrides.length > 30000) return false;
  const safeExcluded = (excludedSheetIndices || [])
    .filter((n) => Number.isInteger(n) && n >= 0)
    .slice(0, 200);
  const updatedAt = new Date().toISOString();

  if (isFirestoreQuotaExhausted()) {
    return false;
  }

  try {
    await updateDoc(doc(db, 'excelLogs', logId), {
      sheetOverridesJson: serializedOverrides,
      excludedSheetIndices: safeExcluded,
      updatedAt
    });
  } catch (error) {
    if (getFirestoreErrorCode(error) === 'resource-exhausted') {
      markFirestoreQuotaExhausted();
    }
    return false;
  }

  const updatedLogs = logs.map((item) =>
    item.id === logId
      ? {
          ...item,
          sheetOverridesJson: serializedOverrides,
          excludedSheetIndices: safeExcluded,
          updatedAt
        }
      : item
  );
  safeStorage.setJson(STORAGE_KEYS.EXCEL_LOGS, updatedLogs);
  ctx.notify();
  return true;
}

export async function deleteSharedExcelLog(
  logId: string,
  ctx: ExcelLogsDomainContext
): Promise<boolean> {
  const logs = getSharedExcelLogs();
  const activeUser = ctx.getCurrentUser();
  const isAdminActor =
    activeUser?.role === 'admin' || isSuperAdminEmail(auth.currentUser?.email || activeUser?.email);

  if (!isAdminActor) {
    throw new Error('يمكن للأدمن فقط حذف شيت اللوج من قاعدة البيانات.');
  }

  try {
    const snap = await getDocs(collection(db, 'excelLogs', logId, 'chunks'));
    if (!snap.empty) {
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        docs.slice(i, i + 400).forEach((chunkDoc) => {
          batch.delete(doc(db, 'excelLogs', logId, 'chunks', chunkDoc.id));
        });
        await batch.commit();
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `excelLogs/${logId}/chunks`);
  }

  try {
    await deleteDoc(doc(db, 'excelLogs', logId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `excelLogs/${logId}`);
  }

  const remaining = logs.filter((item) => item.id !== logId);
  safeStorage.setJson(STORAGE_KEYS.EXCEL_LOGS, remaining);
  ctx.notify();
  return true;
}

export async function deleteAllSharedExcelLogs(
  ctx: ExcelLogsDomainContext
): Promise<number> {
  const activeUser = ctx.getCurrentUser();
  const isAdminActor =
    activeUser?.role === 'admin' || isSuperAdminEmail(auth.currentUser?.email || activeUser?.email);

  if (!isAdminActor) {
    throw new Error('يمكن للأدمن فقط حذف جميع شيتات اللوج من قاعدة البيانات.');
  }

  let logIds: string[] = [];
  try {
    const snap = await getDocs(collection(db, 'excelLogs'));
    logIds = snap.docs.map((d) => d.id);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'excelLogs');
  }

  for (const logId of logIds) {
    try {
      const chunksSnap = await getDocs(collection(db, 'excelLogs', logId, 'chunks'));
      if (!chunksSnap.empty) {
        const docs = chunksSnap.docs;
        for (let i = 0; i < docs.length; i += 400) {
          const batch = writeBatch(db);
          docs.slice(i, i + 400).forEach((chunkDoc) => {
            batch.delete(doc(db, 'excelLogs', logId, 'chunks', chunkDoc.id));
          });
          await batch.commit();
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `excelLogs/${logId}/chunks`);
    }

    try {
      await deleteDoc(doc(db, 'excelLogs', logId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `excelLogs/${logId}`);
    }
  }

  safeStorage.setJson(STORAGE_KEYS.EXCEL_LOGS, []);
  ctx.notify();
  return logIds.length;
}

