import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updateProfile,
  updatePassword,
  updateEmail,
  verifyBeforeUpdateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
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
import firebaseAppletConfig from '../../firebase-applet-config.json';
import { SITE_DELIVERABLE_RETENTION_MS, TASK_ATTACHMENT_RETENTION_MS } from '../config';
import { SiteDeliverable, ProjectTask, TaskAttachment } from '../types';

// Primary Firestore & App Authentication configuration (gen-lang-client-0751190379)
const PRIMARY_FIRESTORE_FALLBACK_CONFIG = {
  projectId: 'gen-lang-client-0751190379',
  appId: '1:561086494322:web:c38590b93c0f953da034eb',
  apiKey: 'AIzaSyABFi68TFq4rMVnvgNZiIkGROEMRS0J9Dk',
  authDomain: 'gen-lang-client-0751190379.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-dc-731fa181-7511-4cbc-af75-e665ff0247af',
  storageBucket: 'gen-lang-client-0751190379.firebasestorage.app',
  messagingSenderId: '561086494322',
  measurementId: '',
  oAuthClientId: '561086494322-rtp5k7ptajd1dl5ggreuultel4olcjn2.apps.googleusercontent.com',
  recaptchaSiteKey: ''
};

const appletConfigWithDb = firebaseAppletConfig as typeof firebaseAppletConfig & {
  firestoreDatabaseId?: string;
};

// Use firebase-applet-config.json directly when it contains the Firestore database ID;
// otherwise preserve the existing Firestore project while dedicating firebase-applet-config.json
// to the provisioned Google Workspace OAuth project.
const firebaseConfig = appletConfigWithDb.firestoreDatabaseId
  ? appletConfigWithDb
  : PRIMARY_FIRESTORE_FALLBACK_CONFIG;

// Primary Firebase Application
const primaryApp: FirebaseApp =
  getApps().find((a) => a.name === '[DEFAULT]') || initializeApp(firebaseConfig);

const firestoreDatabaseId = firebaseConfig.firestoreDatabaseId;
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
  code: string;
  operationType: OperationType;
  path: string | null;
}

const QUOTA_EXHAUSTED_DATE_STORAGE_KEY = 'dc_firestore_quota_paused_date';
let firestoreWriteQuotaExhaustedDate: string | null = null;
const firestoreQuotaListeners = new Set<(exhausted: boolean) => void>();

function getLocalTodayDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function readStoredQuotaExhaustedDate(): string | null {
  try {
    return typeof localStorage !== 'undefined'
      ? localStorage.getItem(QUOTA_EXHAUSTED_DATE_STORAGE_KEY)
      : null;
  } catch {
    return null;
  }
}

export const FIRESTORE_QUOTA_EXHAUSTED_MESSAGE =
  'تم الوصول للحد اليومي المسموح به لقاعدة البيانات. يتم تجديد الحصة تلقائياً الساعة 10:00 صباحاً بتوقيت مصر.';

export const FIRESTORE_PERMISSION_DENIED_MESSAGE =
  'ليس لديك صلاحية تنفيذ هذا الإجراء. يرجى التواصل مع مدير النظام.';

export const FIRESTORE_UNAVAILABLE_MESSAGE =
  'تعذر الاتصال بقاعدة البيانات حالياً. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.';

export const FIRESTORE_NOT_FOUND_MESSAGE =
  'السجل المطلوب غير موجود أو تم حذفه مسبقاً.';

export const FIRESTORE_DEFAULT_ERROR_MESSAGE =
  'حدث خطأ غير متوقع أثناء حفظ البيانات. يرجى المحاولة مرة أخرى.';

function normalizeErrorCode(rawCode?: string | null): string {
  if (!rawCode || typeof rawCode !== 'string') return '';
  const trimmed = rawCode.trim().toLowerCase();
  if (!trimmed) return '';
  const slashIdx = trimmed.lastIndexOf('/');
  return slashIdx !== -1 ? trimmed.slice(slashIdx + 1) : trimmed;
}

function tryParseJsonRecord(input: string): Record<string, unknown> | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function extractFirestoreErrorInfo(error: unknown): {
  code: string;
  message: string;
  isStructuredJson: boolean;
} {
  let rawCode = '';
  let message = '';
  let isStructuredJson = false;

  if (typeof error === 'string') {
    message = error;
    const parsed = tryParseJsonRecord(error);
    if (parsed) {
      isStructuredJson = true;
      if (typeof parsed.code === 'string') rawCode = parsed.code;
      if (typeof parsed.message === 'string') message = parsed.message;
      else if (typeof parsed.error === 'string') message = parsed.error;
    }
  } else if (error instanceof Error) {
    message = error.message || '';
    if ('code' in error && typeof (error as { code?: unknown }).code === 'string') {
      rawCode = (error as { code: string }).code;
    }
    const parsed = tryParseJsonRecord(message);
    if (parsed) {
      isStructuredJson = true;
      if (
        typeof parsed.code === 'string' &&
        (!rawCode || rawCode === 'firestore_error')
      ) {
        rawCode = parsed.code;
      }
      if (typeof parsed.message === 'string') {
        message = parsed.message;
      } else if (typeof parsed.error === 'string') {
        message = parsed.error;
      }
    }
  } else if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.code === 'string') rawCode = record.code;
    if (typeof record.message === 'string') {
      message = record.message;
    } else if (typeof record.error === 'string') {
      message = record.error;
    } else if (record.error && typeof record.error === 'object') {
      const nested = record.error as Record<string, unknown>;
      if (!rawCode && typeof nested.code === 'string') rawCode = nested.code;
      if (typeof nested.message === 'string') message = nested.message;
    }
    const parsed = tryParseJsonRecord(message);
    if (parsed) {
      isStructuredJson = true;
      if (
        typeof parsed.code === 'string' &&
        (!rawCode || rawCode === 'firestore_error')
      ) {
        rawCode = parsed.code;
      }
      if (typeof parsed.message === 'string') {
        message = parsed.message;
      } else if (typeof parsed.error === 'string') {
        message = parsed.error;
      }
    }
  }

  let code = normalizeErrorCode(rawCode);
  const lowerMsg = message.toLowerCase();

  if (!code || code === 'firestore_error' || code === 'unknown') {
    if (
      lowerMsg.includes('resource-exhausted') ||
      lowerMsg.includes('resource_exhausted') ||
      lowerMsg.includes('quota limit exceeded') ||
      lowerMsg.includes('quota exceeded') ||
      message.includes(FIRESTORE_QUOTA_EXHAUSTED_MESSAGE)
    ) {
      code = 'resource-exhausted';
    } else if (
      lowerMsg.includes('permission-denied') ||
      lowerMsg.includes('permission_denied') ||
      lowerMsg.includes('missing or insufficient permissions')
    ) {
      code = 'permission-denied';
    } else if (
      lowerMsg.includes('network-request-failed') ||
      lowerMsg.includes('unavailable') ||
      lowerMsg.includes('client is offline') ||
      lowerMsg.includes('failed to fetch') ||
      lowerMsg.includes('networkerror') ||
      lowerMsg.includes('network error')
    ) {
      code = 'unavailable';
    } else if (
      lowerMsg.includes('not-found') ||
      lowerMsg.includes('not_found') ||
      lowerMsg.includes('no document to update')
    ) {
      code = 'not-found';
    }
  }

  return { code, message, isStructuredJson };
}

export function getFirestoreErrorCode(error: unknown): string {
  const { code } = extractFirestoreErrorInfo(error);
  return code || 'firestore_error';
}

export function isFirestoreQuotaExhausted(): boolean {
  const today = getLocalTodayDateKey();
  if (firestoreWriteQuotaExhaustedDate === today) {
    return true;
  }
  const stored = readStoredQuotaExhaustedDate();
  if (stored === today) {
    firestoreWriteQuotaExhaustedDate = today;
    return true;
  }
  if (stored && stored !== today) {
    firestoreWriteQuotaExhaustedDate = null;
    try {
      localStorage.removeItem(QUOTA_EXHAUSTED_DATE_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }
  return false;
}

export function markFirestoreQuotaExhausted(): void {
  const today = getLocalTodayDateKey();
  const alreadyMarkedToday = firestoreWriteQuotaExhaustedDate === today;
  firestoreWriteQuotaExhaustedDate = today;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(QUOTA_EXHAUSTED_DATE_STORAGE_KEY, today);
    }
  } catch {
    // ignore storage errors
  }
  if (!alreadyMarkedToday) {
    firestoreQuotaListeners.forEach((listener) => {
      try {
        listener(true);
      } catch {
        // ignore listener errors
      }
    });
  }
}

export function subscribeToFirestoreQuotaState(
  listener: (exhausted: boolean) => void
): () => void {
  firestoreQuotaListeners.add(listener);
  return () => {
    firestoreQuotaListeners.delete(listener);
  };
}

export function assertFirestoreWriteAvailable(): void {
  if (isFirestoreQuotaExhausted()) {
    const err = new Error(FIRESTORE_QUOTA_EXHAUSTED_MESSAGE) as Error & { code?: string };
    err.code = 'resource-exhausted';
    throw err;
  }
}

export function formatFirestoreError(
  error: unknown,
  fallbackMessage = FIRESTORE_DEFAULT_ERROR_MESSAGE
): string {
  const { code, message, isStructuredJson } = extractFirestoreErrorInfo(error);
  const lowerMsg = message.toLowerCase();

  if (
    code === 'resource-exhausted' ||
    code === 'resource_exhausted' ||
    lowerMsg.includes('quota limit exceeded') ||
    lowerMsg.includes('quota exceeded') ||
    lowerMsg.includes('resource-exhausted')
  ) {
    markFirestoreQuotaExhausted();
    return FIRESTORE_QUOTA_EXHAUSTED_MESSAGE;
  }

  if (
    code === 'permission-denied' ||
    code === 'permission_denied' ||
    lowerMsg.includes('missing or insufficient permissions')
  ) {
    return FIRESTORE_PERMISSION_DENIED_MESSAGE;
  }

  if (
    code === 'unavailable' ||
    code === 'network-request-failed' ||
    code === 'deadline-exceeded' ||
    lowerMsg.includes('client is offline') ||
    lowerMsg.includes('network-request-failed') ||
    lowerMsg.includes('failed to fetch')
  ) {
    return FIRESTORE_UNAVAILABLE_MESSAGE;
  }

  if (
    code === 'not-found' ||
    code === 'not_found' ||
    lowerMsg.includes('no document to update')
  ) {
    return FIRESTORE_NOT_FOUND_MESSAGE;
  }

  const trimmed = message.trim();
  const hasArabic = /[\u0600-\u06FF]/.test(trimmed);
  const looksRawTechnical =
    isStructuredJson ||
    trimmed.startsWith('{') ||
    trimmed.includes('"operationType"') ||
    trimmed.includes('"code"') ||
    trimmed.includes('FirebaseError');

  if (hasArabic && !looksRawTechnical) {
    return trimmed;
  }

  return fallbackMessage || FIRESTORE_DEFAULT_ERROR_MESSAGE;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const code = getFirestoreErrorCode(error);
  if (code === 'resource-exhausted') {
    markFirestoreQuotaExhausted();
  }
  const errInfo: FirestoreErrorInfo = {
    code,
    operationType,
    path
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
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

export async function updateCurrentAuthDisplayName(displayName: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const trimmed = displayName.trim();
  if (trimmed && user.displayName !== trimmed) {
    await updateProfile(user, { displayName: trimmed });
  }
}

export async function changeCurrentUserPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('لم يتم العثور على جلسة مستخدم نشطة.');
  }
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

export async function changeCurrentUserEmail(
  currentPassword: string,
  newEmail: string
): Promise<{ status: 'updated' | 'verification_sent'; email: string }> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('لم يتم العثور على جلسة مستخدم نشطة.');
  }
  const normalizedEmail = newEmail.trim().toLowerCase();
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);

  try {
    await updateEmail(user, normalizedEmail);
    return { status: 'updated', email: normalizedEmail };
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    if (code === 'auth/operation-not-allowed') {
      await verifyBeforeUpdateEmail(user, normalizedEmail);
      return { status: 'verification_sent', email: normalizedEmail };
    }
    throw error;
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
    return 'البريد الإلكتروني أو كلمة المرور الحالية غير صحيحة.';
  }
  if (code === 'auth/invalid-email') {
    return 'صيغة البريد الإلكتروني غير صحيحة.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'هذا البريد الإلكتروني مسجل مسبقاً لحساب آخر.';
  }
  if (code === 'auth/weak-password') {
    return 'كلمة المرور ضعيفة جداً؛ يجب أن تتكون من 6 أحرف على الأقل.';
  }
  if (code === 'auth/requires-recent-login') {
    return 'لأسباب أمنية، يرجى تسجيل الخروج وإعادة الدخول ثم المحاولة مرة أخرى.';
  }
  if (code === 'auth/too-many-requests') {
    return 'تم حظر المحاولات مؤقتاً لكثرة المحاولات الخاطئة. يرجى المحاولة بعد قليل.';
  }
  if (code === 'auth/user-disabled') {
    return 'تم تعطيل هذا الحساب. يرجى التواصل مع مسؤول النظام.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'تتطلب هذه العملية التحقق من البريد الإلكتروني أو تفعيلها من إعدادات Firebase.';
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
  if (!scope.canAccessDeliverables || !auth.currentUser || isFirestoreQuotaExhausted()) {
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
    } catch (error) {
      if (getFirestoreErrorCode(error) === 'resource-exhausted') {
        markFirestoreQuotaExhausted();
      }
      // Background sweep must not crash UI on transient network or rules boundary checks
      return [];
    }
  }

  const deletedIds: string[] = [];
  for (const item of candidates) {
    if (isFirestoreQuotaExhausted()) break;
    try {
      const deleted = await deleteDeliverableFromFirebase(item.id);
      if (deleted) {
        deletedIds.push(item.id);
      }
    } catch (error) {
      if (getFirestoreErrorCode(error) === 'resource-exhausted') {
        markFirestoreQuotaExhausted();
        break;
      }
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
    if (isFirestoreQuotaExhausted()) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const scope = getScope();
    if (scope && scope.canAccessDeliverables) {
      const deletedIds = await purgeExpiredSiteDeliverablesFromFirebase(scope);
      if (deletedIds.length > 0 && onPurged) {
        onPurged(deletedIds);
      }
    }
    if (onExtraSweep && !isFirestoreQuotaExhausted()) {
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
  if (!auth.currentUser || tasks.length === 0 || isFirestoreQuotaExhausted()) return {};

  const nowMs = Date.now();
  const updatedAttachmentsByTaskId: Record<string, TaskAttachment[]> = {};

  for (const task of tasks) {
    if (isFirestoreQuotaExhausted()) break;
    const attachments = task.attachments || [];
    if (attachments.length === 0) continue;

    const expired = attachments.filter((att) => isTaskAttachmentExpired(att, nowMs));
    if (expired.length === 0) continue;

    const active = attachments.filter((att) => !isTaskAttachmentExpired(att, nowMs));
    let anyChunkDeleted = false;

    for (const att of expired) {
      if (isFirestoreQuotaExhausted()) break;
      const lockKey = `${task.id}:${att.id}`;
      if (inFlightTaskAttachmentCleanups.has(lockKey)) continue;
      inFlightTaskAttachmentCleanups.add(lockKey);
      try {
        await deleteTaskAttachmentChunksFromFirebase(task.id, att.id);
        anyChunkDeleted = true;
      } catch (error) {
        if (getFirestoreErrorCode(error) === 'resource-exhausted') {
          markFirestoreQuotaExhausted();
        }
        // Ignore transient permission / server-clock skew / concurrent deletion errors
      } finally {
        inFlightTaskAttachmentCleanups.delete(lockKey);
      }
    }

    if (!isFirestoreQuotaExhausted() && isAdmin && (anyChunkDeleted || expired.length > 0)) {
      try {
        await updateDoc(doc(db, 'tasks', task.id), {
          attachments: active,
          updatedAt: new Date().toISOString()
        });
        updatedAttachmentsByTaskId[task.id] = active;
      } catch (error) {
        if (getFirestoreErrorCode(error) === 'resource-exhausted') {
          markFirestoreQuotaExhausted();
        }
        // Ignore if task was already deleted or concurrently modified
      }
    }
  }

  return updatedAttachmentsByTaskId;
}
