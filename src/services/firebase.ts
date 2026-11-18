import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updateProfile,
  User,
  Auth
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  collection,
  getDocFromServer,
  getDocs,
  updateDoc,
  query,
  where,
  writeBatch,
  Firestore
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { SITE_DELIVERABLE_RETENTION_MS, TASK_ATTACHMENT_RETENTION_MS } from '../config';
import { SiteDeliverable, ProjectTask, TaskAttachment } from '../types';

// Primary Firebase Application
const primaryApp: FirebaseApp =
  getApps().find((a) => a.name === '[DEFAULT]') || initializeApp(firebaseConfig);

const firestoreDatabaseId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
export const auth: Auth = getAuth(primaryApp);
export const db: Firestore = firestoreDatabaseId
  ? getFirestore(primaryApp, firestoreDatabaseId)
  : getFirestore(primaryApp);

// Test Firestore connection at boot (required by Firebase integration guidelines)
async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('يرجى التحقق من اتصال الإنترنت وإعدادات Firebase.');
    }
  }
}
testFirestoreConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      cleaned[key] = val;
    }
  }
  return cleaned as T;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export async function sendResetPasswordEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export function subscribeToAuthState(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

/**
 * Creates a Firebase Auth user using a secondary Firebase App instance
 * so the currently logged-in Admin session is NOT interrupted or logged out.
 */
export async function createFirebaseUserByAdmin(
  email: string,
  password: string,
  displayName: string
): Promise<string> {
  const secondaryAppName = 'AdminUserCreator';
  const secondaryApp =
    getApps().find((a) => a.name === secondaryAppName) ||
    initializeApp(firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const cred = await createUserWithEmailAndPassword(
      secondaryAuth,
      email.trim().toLowerCase(),
      password
    );
    if (displayName.trim()) {
      await updateProfile(cred.user, { displayName: displayName.trim() });
    }
    return cred.user.uid;
  } finally {
    await signOut(secondaryAuth).catch(() => undefined);
  }
}

export function translateFirebaseAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code || '';
  const message = (error as { message?: string })?.message || '';

  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    message.includes('invalid-credential')
  ) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  }
  if (code === 'auth/invalid-email') {
    return 'صيغة البريد الإلكتروني غير صحيحة.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'هذا البريد الإلكتروني مسجل مسبقاً في نظام المصادقة.';
  }
  if (code === 'auth/weak-password') {
    return 'كلمة المرور ضعيفة جداً؛ يجب أن تتكون من 6 أحرف على الأقل.';
  }
  if (code === 'auth/too-many-requests') {
    return 'تم حظر المحاولات مؤقتاً لكثرة المحاولات الخاطئة. يرجى المحاولة بعد قليل.';
  }
  if (code === 'auth/user-disabled') {
    return 'تم تعطيل هذا الحساب. يرجى التواصل مع مسؤول النظام.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'تسجيل الدخول بالبريد وكلمة المرور غير مفعل حالياً في إعدادات Firebase Console.';
  }
  if (code === 'auth/network-request-failed') {
    return 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.';
  }
  return 'حدث خطأ أثناء المصادقة. يرجى التحقق من البيانات والمحاولة مجدداً.';
}

/**
 * ============================================================================
 * 48-HOUR AUTO CLEANUP & MEMORY MANAGEMENT FOR SITE PDF DELIVERABLES
 * الحذف التلقائي لملفات PDF في تبويب "تسليمات الموقع" بعد مرور 48 ساعة على الرفع
 * ============================================================================
 */
const SITE_DELIVERABLES_COLLECTION = 'siteDeliverables';
const SITE_DELIVERABLES_CLEANUP_INTERVAL_MS = 2 * 60 * 1000; // فحص دوري كل دقيقتين

const inFlightDeliverableDeletions = new Set<string>();
const inFlightTaskAttachmentCleanups = new Set<string>();
const pdfBlobUrlMemoryCache = new Map<string, string>();
let deliverablesCleanupTimer: ReturnType<typeof setInterval> | null = null;

export interface DeliverableCleanupScope {
  canAccessDeliverables: boolean;
  hasAllProjects: boolean;
  assignedProjectIds: string[];
}

export function cachePdfBlobUrl(deliverableId: string, url: string): void {
  const existingUrl = pdfBlobUrlMemoryCache.get(deliverableId);
  if (existingUrl && existingUrl !== url) {
    URL.revokeObjectURL(existingUrl);
  }
  pdfBlobUrlMemoryCache.set(deliverableId, url);
}

export function getCachedPdfBlobUrl(deliverableId: string): string | undefined {
  return pdfBlobUrlMemoryCache.get(deliverableId);
}

export function revokePdfBlobUrl(deliverableId: string): void {
  const cachedUrl = pdfBlobUrlMemoryCache.get(deliverableId);
  if (cachedUrl) {
    URL.revokeObjectURL(cachedUrl);
    pdfBlobUrlMemoryCache.delete(deliverableId);
  }
}

export function revokeTaskBlobUrls(taskId: string): void {
  const prefix = `task-${taskId}-`;
  Array.from(pdfBlobUrlMemoryCache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) {
      revokePdfBlobUrl(key);
    }
  });
}

export function revokeAllPdfBlobUrls(): void {
  pdfBlobUrlMemoryCache.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore revoke errors
    }
  });
  pdfBlobUrlMemoryCache.clear();
}

/**
 * Checks whether a SiteDeliverable has reached or exceeded 48 hours since its upload (`createdAt`).
 */
export function isDeliverableExpired(
  deliverable: Pick<SiteDeliverable, 'createdAt' | 'expiresAtMs'>,
  nowMs = Date.now()
): boolean {
  if (typeof deliverable.expiresAtMs === 'number' && Number.isFinite(deliverable.expiresAtMs)) {
    return nowMs >= deliverable.expiresAtMs;
  }
  const uploadedAtMs = Date.parse(deliverable.createdAt);
  if (Number.isFinite(uploadedAtMs)) {
    return nowMs - uploadedAtMs >= SITE_DELIVERABLE_RETENTION_MS;
  }
  return false;
}

/**
 * Atomically deletes a SiteDeliverable and all its PDF chunks from Firebase Firestore,
 * and revokes its cached Blob URL from browser memory.
 */
export async function deleteDeliverableFromFirebase(deliverableId: string): Promise<boolean> {
  if (!deliverableId || inFlightDeliverableDeletions.has(deliverableId)) {
    return false;
  }

  inFlightDeliverableDeletions.add(deliverableId);
  try {
    const chunksRef = collection(db, SITE_DELIVERABLES_COLLECTION, deliverableId, 'chunks');
    let chunkDocs;
    try {
      const snap = await getDocs(chunksRef);
      chunkDocs = snap.docs;
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `${SITE_DELIVERABLES_COLLECTION}/${deliverableId}/chunks`
      );
    }

    const batch = writeBatch(db);
    chunkDocs.forEach((chunkDoc) => {
      batch.delete(doc(db, SITE_DELIVERABLES_COLLECTION, deliverableId, 'chunks', chunkDoc.id));
    });
    batch.delete(doc(db, SITE_DELIVERABLES_COLLECTION, deliverableId));

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `${SITE_DELIVERABLES_COLLECTION}/${deliverableId}`
      );
    }

    revokePdfBlobUrl(deliverableId);
    return true;
  } finally {
    inFlightDeliverableDeletions.delete(deliverableId);
  }
}

/**
 * Queries Firebase for any SiteDeliverables older than 48 hours within the user's authorized scope
 * (or processes a preloaded snapshot list) and deletes them along with their chunks.
 * Returns the array of deleted deliverable IDs.
 */
export async function purgeExpiredSiteDeliverablesFromFirebase(
  scope: DeliverableCleanupScope,
  preloadedDeliverables?: SiteDeliverable[]
): Promise<string[]> {
  if (!scope.canAccessDeliverables || !auth.currentUser) {
    return [];
  }

  const nowMs = Date.now();
  let candidates: SiteDeliverable[] = [];

  if (preloadedDeliverables) {
    candidates = preloadedDeliverables.filter((item) => isDeliverableExpired(item, nowMs));
  } else {
    try {
      if (scope.hasAllProjects) {
        const expiredQuery = query(
          collection(db, SITE_DELIVERABLES_COLLECTION),
          where('expiresAtMs', '<=', nowMs)
        );
        const snap = await getDocs(expiredQuery);
        candidates = snap.docs
          .map((d) => d.data() as SiteDeliverable)
          .filter((item) => isDeliverableExpired(item, nowMs));
      } else if (scope.assignedProjectIds.length > 0) {
        const scopedQuery = query(
          collection(db, SITE_DELIVERABLES_COLLECTION),
          where('projectId', 'in', scope.assignedProjectIds.slice(0, 30))
        );
        const snap = await getDocs(scopedQuery);
        candidates = snap.docs
          .map((d) => d.data() as SiteDeliverable)
          .filter((item) => isDeliverableExpired(item, nowMs));
      }
    } catch {
      // Background sweep must not crash UI on transient network or rules boundary checks
      return [];
    }
  }

  const deletedIds: string[] = [];
  for (const item of candidates) {
    try {
      const deleted = await deleteDeliverableFromFirebase(item.id);
      if (deleted) {
        deletedIds.push(item.id);
      }
    } catch {
      // Skip if deleted concurrently by another client or pending server clock skew
    }
  }

  return deletedIds;
}

/**
 * Starts the periodic Firebase auto-cleanup scheduler that sweeps expired PDF deliverables
 * and expired Admin task attachments (older than 48 hours) immediately and periodically.
 */
export function startFirebaseDeliverablesAutoCleanupScheduler(
  getScope: () => DeliverableCleanupScope | null,
  onPurged?: (deletedIds: string[]) => void,
  onExtraSweep?: () => Promise<void> | void
): void {
  stopFirebaseDeliverablesAutoCleanupScheduler();

  const runSweep = async () => {
    const scope = getScope();
    if (scope && scope.canAccessDeliverables) {
      const deletedIds = await purgeExpiredSiteDeliverablesFromFirebase(scope);
      if (deletedIds.length > 0 && onPurged) {
        onPurged(deletedIds);
      }
    }
    if (onExtraSweep) {
      await Promise.resolve(onExtraSweep()).catch(() => undefined);
    }
  };

  // Initial immediate sweep on activation
  void runSweep();

  // Periodic sweep while session remains active
  deliverablesCleanupTimer = setInterval(() => {
    void runSweep();
  }, SITE_DELIVERABLES_CLEANUP_INTERVAL_MS);
}

export function stopFirebaseDeliverablesAutoCleanupScheduler(): void {
  if (deliverablesCleanupTimer) {
    clearInterval(deliverablesCleanupTimer);
    deliverablesCleanupTimer = null;
  }
}

/**
 * ============================================================================
 * 48-HOUR AUTO CLEANUP FOR ADMIN TASK ATTACHMENTS
 * الحذف التلقائي لمرفقات المهام بعد مرور 48 ساعة من الرفع
 * ============================================================================
 */
export function isTaskAttachmentExpired(
  attachment: Pick<TaskAttachment, 'createdAt' | 'expiresAtMs'>,
  nowMs = Date.now()
): boolean {
  if (typeof attachment.expiresAtMs === 'number' && Number.isFinite(attachment.expiresAtMs)) {
    return nowMs >= attachment.expiresAtMs;
  }
  const uploadedAtMs = Date.parse(attachment.createdAt);
  if (Number.isFinite(uploadedAtMs)) {
    return nowMs - uploadedAtMs >= TASK_ATTACHMENT_RETENTION_MS;
  }
  return false;
}

export async function deleteTaskAttachmentChunksFromFirebase(
  taskId: string,
  attachmentId: string
): Promise<void> {
  if (!taskId || !attachmentId) return;
  const chunksSnap = await getDocs(
    query(collection(db, 'tasks', taskId, 'chunks'), where('attachmentId', '==', attachmentId))
  );
  if (!chunksSnap.empty) {
    const docs = chunksSnap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      docs.slice(i, i + 400).forEach((d) => {
        batch.delete(doc(db, 'tasks', taskId, 'chunks', d.id));
      });
      await batch.commit();
    }
  }
  revokePdfBlobUrl(`task-${taskId}-${attachmentId}`);
}

export async function deleteAllTaskChunksFromFirebase(taskId: string): Promise<void> {
  if (!taskId) return;
  try {
    const chunksSnap = await getDocs(collection(db, 'tasks', taskId, 'chunks'));
    if (!chunksSnap.empty) {
      const docs = chunksSnap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        docs.slice(i, i + 400).forEach((d) => {
          batch.delete(doc(db, 'tasks', taskId, 'chunks', d.id));
        });
        await batch.commit();
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `tasks/${taskId}/chunks`);
  } finally {
    revokeTaskBlobUrls(taskId);
  }
}

/**
 * Purges expired task attachment chunks (> 48h) from Firestore,
 * and if the current user is Admin, strips expired attachment entries from the parent Task document.
 */
export async function purgeExpiredTaskAttachmentsFromFirebase(
  tasks: ProjectTask[],
  isAdmin: boolean
): Promise<Record<string, TaskAttachment[]>> {
  if (!auth.currentUser || tasks.length === 0) return {};

  const nowMs = Date.now();
  const updatedAttachmentsByTaskId: Record<string, TaskAttachment[]> = {};

  for (const task of tasks) {
    const attachments = task.attachments || [];
    if (attachments.length === 0) continue;

    const expired = attachments.filter((att) => isTaskAttachmentExpired(att, nowMs));
    if (expired.length === 0) continue;

    const active = attachments.filter((att) => !isTaskAttachmentExpired(att, nowMs));
    let anyChunkDeleted = false;

    for (const att of expired) {
      const lockKey = `${task.id}:${att.id}`;
      if (inFlightTaskAttachmentCleanups.has(lockKey)) continue;
      inFlightTaskAttachmentCleanups.add(lockKey);
      try {
        await deleteTaskAttachmentChunksFromFirebase(task.id, att.id);
        anyChunkDeleted = true;
      } catch {
        // Ignore transient permission / server-clock skew / concurrent deletion errors
      } finally {
        inFlightTaskAttachmentCleanups.delete(lockKey);
      }
    }

    if (isAdmin && (anyChunkDeleted || expired.length > 0)) {
      try {
        await updateDoc(doc(db, 'tasks', task.id), {
          attachments: active,
          updatedAt: new Date().toISOString()
        });
        updatedAttachmentsByTaskId[task.id] = active;
      } catch {
        // Ignore if task was already deleted or concurrently modified
      }
    }
  }

  return updatedAttachmentsByTaskId;
}
