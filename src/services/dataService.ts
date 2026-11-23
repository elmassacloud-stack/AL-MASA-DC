import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  arrayUnion,
  runTransaction,
  writeBatch,
  Query,
  QueryConstraint,
  QuerySnapshot,
  DocumentData,
  Unsubscribe
} from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import {
  Project,
  DailyReport,
  ReportAttachment,
  ReportAttachmentChunk,
  IssueReport,
  ProjectTask,
  TaskAttachment,
  Announcement,
  UserProfile,
  UserRole,
  NotificationPreferences,
  AppNotification,
  ExecutedWork,
  WorkDiscipline,
  SiteDeliverable,
  SiteDeliverableStatus,
  PersonalNote,
  AppBrandingSettings,
  ActivityLogEntry,
  ActivityEntityType,
  ActivityActionType,
  SharedExcelLogFile
} from '../types';
import {
  SEED_PROJECTS,
  SEED_REPORTS,
  SEED_ISSUES,
  SEED_TASKS,
  SEED_ANNOUNCEMENTS,
  SEED_USERS,
  SEED_EXECUTED_WORKS,
  getTodayDateStr
} from '../seedData';
import {
  DEFAULT_DAILY_REPORT_CUTOFF_HOUR,
  MAX_REPORT_ATTACHMENT_SIZE_BYTES,
  MAX_REPORT_ATTACHMENTS,
  REPORT_ATTACHMENT_CHUNK_SIZE_CHARS,
  TASK_ATTACHMENT_RETENTION_MS,
  MAX_TASK_ATTACHMENT_SIZE_BYTES,
  MAX_TASK_ATTACHMENTS,
  TASK_ATTACHMENT_CHUNK_SIZE_CHARS,
  isSuperAdminEmail,
  SUPER_ADMIN_EMAIL
} from '../config';
import {
  auth,
  db,
  OperationType,
  handleFirestoreError,
  getFirestoreErrorCode,
  isFirestoreQuotaExhausted,
  markFirestoreQuotaExhausted,
  assertFirestoreWriteAvailable,
  formatFirestoreError,
  FIRESTORE_QUOTA_EXHAUSTED_MESSAGE,
  stripUndefined,
  updateCurrentAuthDisplayName,
  isDeliverableExpired,
  isTaskAttachmentExpired,
  deleteTaskAttachmentChunksFromFirebase,
  deleteAllTaskChunksFromFirebase,
  purgeExpiredTaskAttachmentsFromFirebase,
  startFirebaseDeliverablesAutoCleanupScheduler,
  stopFirebaseDeliverablesAutoCleanupScheduler,
  cachePdfBlobUrl,
  getCachedPdfBlobUrl,
  revokePdfBlobUrl,
  revokeAllPdfBlobUrls
} from './firebase';

export {
  formatFirestoreError,
  assertFirestoreWriteAvailable,
  isFirestoreQuotaExhausted,
  markFirestoreQuotaExhausted,
  FIRESTORE_QUOTA_EXHAUSTED_MESSAGE
};
import {
  hasAllProjectsAccess,
  canAccessExecutedWorksTab,
  canAccessSiteDeliverablesTab
} from '../utils/accessControl';
import {
  base64ToBlob,
  splitBase64IntoChunks,
  isExcelFileName,
  getExcelMimeType,
  PreparedReportAttachment,
  PreparedTaskAttachment
} from '../utils/pdfUtils';
import {
  normalizeNotificationPreferences,
  isNotificationAllowedForUser
} from '../utils/notificationPreferences';
import {
  DEFAULT_BRAND_COLOR,
  isValidHexColor,
  normalizeHexColor
} from '../utils/brandTheme';
import {
  safeStorage,
  STORAGE_KEYS,
  normalizeEmail,
  chunkArray,
  normalizeAssignedProjectsList,
  normalizeUserProfile,
  type CreateUserPayload,
  type DeliverableUploadProgress,
  type ReportUploadProgress,
  type TaskUploadProgress,
  type HistoricalSyncSummary,
  type CreateSiteDeliverablePayload
} from './data/shared';
import * as reportsDomain from './data/reports';
import * as tasksDomain from './data/tasks';
import * as issuesDomain from './data/issues';
import * as usersDomain from './data/users';
import * as notificationsDomain from './data/notifications';
import * as deliverablesDomain from './data/deliverables';
import * as excelLogsDomain from './data/excelLogs';

export type {
  CreateUserPayload,
  DeliverableUploadProgress,
  ReportUploadProgress,
  TaskUploadProgress,
  HistoricalSyncSummary,
  CreateSiteDeliverablePayload
};
export {
  reportsDomain,
  tasksDomain,
  issuesDomain,
  usersDomain,
  notificationsDomain,
  deliverablesDomain,
  excelLogsDomain
};

const localStorage = safeStorage;


class DataService {
  private listeners: Set<() => void> = new Set();
  private liveNotificationListeners: Set<(notif: AppNotification) => void> = new Set();
  private seenNotificationIds: Set<string> = new Set();
  private notificationsInitialized = false;
  private firestoreUnsubs: Unsubscribe[] = [];
  private currentSyncSignature: string | null = null;
  private autoIdentitySyncRunning = false;
  private autoIdentitySyncTimer: ReturnType<typeof setTimeout> | null = null;
  private attemptedAutoSyncKeys: Set<string> = new Set();
  private olderLoadedByCollection: Map<string, Map<string, unknown>> = new Map();
  private syncWindowCutoffIso: string | null = null;

  constructor() {
    this.ensureInitialized();
  }

  private ensureInitialized() {
    if (!localStorage.getItem(STORAGE_KEYS.PROJECTS)) {
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(SEED_PROJECTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.REPORTS)) {
      localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(SEED_REPORTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.ISSUES)) {
      localStorage.setItem(STORAGE_KEYS.ISSUES, JSON.stringify(SEED_ISSUES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.TASKS)) {
      localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(SEED_TASKS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.ANNOUNCEMENTS)) {
      localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(SEED_ANNOUNCEMENTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.EXECUTED_WORKS)) {
      localStorage.setItem(STORAGE_KEYS.EXECUTED_WORKS, JSON.stringify(SEED_EXECUTED_WORKS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(SEED_USERS));
    }
  }

  public subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public subscribeToLiveNotifications(callback: (notif: AppNotification) => void): () => void {
    this.liveNotificationListeners.add(callback);
    return () => this.liveNotificationListeners.delete(callback);
  }

  private emitLiveNotification(notif: AppNotification) {
    this.liveNotificationListeners.forEach((cb) => {
      try {
        cb(notif);
      } catch (err) {
        console.error('Live notification callback error:', err);
      }
    });
  }

  private notify() {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error('Subscriber callback error:', err);
      }
    });
  }

  // --- Session & Auth Profile Resolution ---
  public getCurrentUser(): UserProfile | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('Failed parsing current user:', e);
    }
    return null;
  }

  public setCurrentUser(user: UserProfile | null) {
    if (!user) {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    } else {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    }
    this.notify();
  }

  public clearSession() {
    this.stopRealtimeSync();
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    localStorage.removeItem(STORAGE_KEYS.PROJECTS);
    localStorage.removeItem(STORAGE_KEYS.REPORTS);
    localStorage.removeItem(STORAGE_KEYS.ISSUES);
    localStorage.removeItem(STORAGE_KEYS.TASKS);
    localStorage.removeItem(STORAGE_KEYS.ANNOUNCEMENTS);
    localStorage.removeItem(STORAGE_KEYS.EXECUTED_WORKS);
    localStorage.removeItem(STORAGE_KEYS.SITE_DELIVERABLES);
    localStorage.removeItem(STORAGE_KEYS.USERS);
    localStorage.removeItem(STORAGE_KEYS.NOTIFICATIONS);
    localStorage.removeItem(STORAGE_KEYS.PERSONAL_NOTES);
    localStorage.removeItem(STORAGE_KEYS.ACTIVITY_LOGS);
    localStorage.removeItem(STORAGE_KEYS.EXCEL_LOGS);
    this.notify();
  }

  /**
   * Resolves the authenticated Firebase User against Firestore `/users/{uid}`
   * and enforces active status & Super Admin bootstrapping.
   */
  public async resolveAuthenticatedProfile(firebaseUser: FirebaseUser): Promise<UserProfile> {
    const email = normalizeEmail(firebaseUser.email);
    const uid = firebaseUser.uid;
    const isSuper = isSuperAdminEmail(email);
    const userDocRef = doc(db, 'users', uid);

    if (isSuper) {
      const now = new Date().toISOString();
      const cachedProfile = this.getUsers().find((u) => u.id === uid) || null;
      const allProjectIds = this.getProjects().map((p) => p.id);
      const superProfile: UserProfile = {
        id: uid,
        email: SUPER_ADMIN_EMAIL,
        displayName:
          cachedProfile?.displayName || firebaseUser.displayName || 'مدير النظام العام (DC)',
        jobTitle: cachedProfile?.jobTitle || 'المدير العام — إدارة مراقبة الوثائق',
        role: 'admin',
        allProjects: true,
        canAccessExecutedWorks: true,
        canAccessSiteDeliverables: true,
        assignedProjects: cachedProfile?.assignedProjects?.length
          ? cachedProfile.assignedProjects
          : allProjectIds,
        status: 'active',
        phone: cachedProfile?.phone || '',
        photoUrl: cachedProfile?.photoUrl || firebaseUser.photoURL || undefined,
        notificationPreferences: cachedProfile?.notificationPreferences,
        createdAt: cachedProfile?.createdAt || now,
        updatedAt: cachedProfile?.updatedAt || now
      };

      if (!isFirestoreQuotaExhausted()) {
        void getDoc(userDocRef)
          .then((snap) => {
            const remoteProfile = snap.exists()
              ? normalizeUserProfile(snap.data() as Partial<UserProfile>, uid, email)
              : null;

            const mergedProfile: UserProfile = {
              id: uid,
              email: SUPER_ADMIN_EMAIL,
              displayName:
                remoteProfile?.displayName || superProfile.displayName,
              jobTitle: remoteProfile?.jobTitle || superProfile.jobTitle,
              role: 'admin',
              allProjects: true,
              canAccessExecutedWorks: true,
              canAccessSiteDeliverables: true,
              assignedProjects: remoteProfile?.assignedProjects?.length
                ? remoteProfile.assignedProjects
                : superProfile.assignedProjects,
              status: 'active',
              phone: remoteProfile?.phone ?? superProfile.phone,
              photoUrl: remoteProfile?.photoUrl ?? superProfile.photoUrl,
              notificationPreferences:
                remoteProfile?.notificationPreferences ?? superProfile.notificationPreferences,
              createdAt: remoteProfile?.createdAt || superProfile.createdAt,
              updatedAt: remoteProfile?.updatedAt || superProfile.updatedAt
            };

            const activeUser = this.getCurrentUser();
            if (
              remoteProfile &&
              activeUser?.id === uid &&
              JSON.stringify(mergedProfile) !== JSON.stringify(activeUser)
            ) {
              this.upsertLocalUser(mergedProfile);
              this.setCurrentUser(mergedProfile);
            }

            const needsRemoteSync =
              !remoteProfile ||
              normalizeEmail(remoteProfile.email) !== SUPER_ADMIN_EMAIL ||
              remoteProfile.role !== 'admin' ||
              remoteProfile.status !== 'active' ||
              remoteProfile.allProjects !== true ||
              remoteProfile.canAccessExecutedWorks !== true ||
              remoteProfile.canAccessSiteDeliverables !== true;

            if (needsRemoteSync && !isFirestoreQuotaExhausted()) {
              const syncPayload: UserProfile = {
                ...mergedProfile,
                updatedAt: new Date().toISOString()
              };
              return setDoc(userDocRef, stripUndefined(syncPayload));
            }
            return undefined;
          })
          .catch((error) => {
            if (getFirestoreErrorCode(error) === 'resource-exhausted') {
              markFirestoreQuotaExhausted();
            }
          });
      }

      void this.seedFirestoreIfEmpty().catch(() => undefined);
      this.upsertLocalUser(superProfile);
      this.setCurrentUser(superProfile);
      this.startRealtimeSync(superProfile);
      return superProfile;
    }

    let profile: UserProfile | null = null;
    try {
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        profile = normalizeUserProfile(snap.data() as Partial<UserProfile>, uid, email);
      }
    } catch (error) {
      if (getFirestoreErrorCode(error) === 'resource-exhausted') {
        markFirestoreQuotaExhausted();
      }
      handleFirestoreError(error, OperationType.GET, `users/${uid}`);
    }

    // Non-Super-Admin users must have an active profile in Firestore `/users/{uid}`
    if (!profile) {
      throw new Error('ACCOUNT_NOT_AUTHORIZED');
    }

    if (profile.status === 'disabled') {
      throw new Error('ACCOUNT_DISABLED');
    }

    // Sync Firestore email for admins only (non-admin email changes are restricted to admins in firestore.rules)
    if (profile.role === 'admin' && email && normalizeEmail(profile.email) !== email) {
      const syncedAt = new Date().toISOString();
      profile = { ...profile, email, updatedAt: syncedAt };
      try {
        await updateDoc(userDocRef, { email, updatedAt: syncedAt });
      } catch {
        // Keep local resolved profile even if transient network/rules sync fails
      }
    }

    this.upsertLocalUser(profile);
    this.setCurrentUser(profile);
    this.startRealtimeSync(profile);
    return profile;
  }

  private async seedFirestoreIfEmpty() {
    if (isFirestoreQuotaExhausted()) return;
    const SEED_FLAG_KEY = 'dc_firestore_seed_checked_v1';
    if (localStorage.getItem(SEED_FLAG_KEY) === '1') {
      return;
    }
    try {
      const [projSnap, reportsSnap, usersSnap] = await Promise.all([
        getDocs(query(collection(db, 'projects'), limit(1))),
        getDocs(query(collection(db, 'reports'), limit(1))),
        getDocs(query(collection(db, 'users'), limit(2)))
      ]);
      if (projSnap.empty && reportsSnap.empty && usersSnap.size <= 1) {
        for (const p of SEED_PROJECTS) {
          await setDoc(doc(db, 'projects', p.id), stripUndefined(p));
        }
        for (const r of SEED_REPORTS) {
          await setDoc(doc(db, 'reports', r.id), stripUndefined(r));
        }
        for (const i of SEED_ISSUES) {
          await setDoc(doc(db, 'issues', i.id), stripUndefined(i));
        }
        for (const t of SEED_TASKS) {
          await setDoc(doc(db, 'tasks', t.id), stripUndefined(t));
        }
        for (const a of SEED_ANNOUNCEMENTS) {
          await setDoc(doc(db, 'announcements', a.id), stripUndefined(a));
        }
        for (const w of SEED_EXECUTED_WORKS) {
          await setDoc(doc(db, 'executedWorks', w.id), stripUndefined(w));
        }
      }
      localStorage.setItem(SEED_FLAG_KEY, '1');
    } catch (error) {
      console.warn('Firestore initial seed check skipped/failed:', error);
    }
  }

  private resolveRecipientUserId(userId?: string, email?: string): string | undefined {
    return notificationsDomain.resolveRecipientUserId(this.getUsers(), userId, email);
  }

  private isNotificationTargetingUser(notif: AppNotification, user: UserProfile): boolean {
    return notificationsDomain.isNotificationTargetingUser(notif, user);
  }

  private mergeWithOlderItems<T>(collectionName: string, liveItems: T[]): T[] {
    const olderMap = this.olderLoadedByCollection.get(collectionName);
    if (!olderMap || olderMap.size === 0) return liveItems;
    const mergedMap = new Map<string, T>();
    olderMap.forEach((item, id) => {
      mergedMap.set(id, item as T);
    });
    liveItems.forEach((item) => {
      const itemId = (item as unknown as { id?: string }).id;
      if (itemId) mergedMap.set(itemId, item);
    });
    return Array.from(mergedMap.values());
  }

  private handleSnapshotError(error: unknown, operationType: OperationType, path: string): void {
    const code = getFirestoreErrorCode(error);
    if (code === 'resource-exhausted') {
      markFirestoreQuotaExhausted();
    }
    console.warn(`Firestore listener (${operationType} ${path}): ${code}`);
  }

  private subscribeSnapshotWithFallback(
    primaryQuery: Query<DocumentData>,
    fallbackQuery: Query<DocumentData> | null,
    onNext: (snap: QuerySnapshot<DocumentData>) => void,
    path: string
  ): void {
    let activeUnsub: Unsubscribe | null = null;
    let disposed = false;

    const registerUnsub: Unsubscribe = () => {
      disposed = true;
      if (activeUnsub) {
        activeUnsub();
        activeUnsub = null;
      }
    };
    this.firestoreUnsubs.push(registerUnsub);

    activeUnsub = onSnapshot(
      primaryQuery,
      onNext,
      (error) => {
        const code = getFirestoreErrorCode(error);
        if (code === 'failed-precondition' && fallbackQuery && !disposed) {
          if (activeUnsub) {
            activeUnsub();
            activeUnsub = null;
          }
          console.warn(
            `Firestore composite index missing for "${path}"; using bounded fallback query until firestore.indexes.json is deployed.`
          );
          activeUnsub = onSnapshot(fallbackQuery, onNext, (fallbackErr) =>
            this.handleSnapshotError(fallbackErr, OperationType.LIST, path)
          );
          return;
        }
        this.handleSnapshotError(error, OperationType.LIST, path);
      }
    );
  }

  private subscribeToScopedCollection<T>(
    collectionName: string,
    fieldName: 'id' | 'projectId',
    allProjAccess: boolean,
    assigned: string[],
    storageKey: string,
    onItems: (docs: T[]) => void,
    sortFn?: (a: T, b: T) => number,
    options?: { cutoffIso?: string; orderByField?: string; maxDocs?: number }
  ) {
    const baseConstraints: QueryConstraint[] = [];
    if (options?.orderByField) {
      if (options.cutoffIso) {
        baseConstraints.push(where(options.orderByField, '>=', options.cutoffIso));
      }
      baseConstraints.push(orderBy(options.orderByField, 'desc'));
    }
    if (options?.maxDocs && options.maxDocs > 0) {
      baseConstraints.push(limit(options.maxDocs));
    }

    const fallbackConstraints: QueryConstraint[] = [];
    if (options?.maxDocs && options.maxDocs > 0) {
      fallbackConstraints.push(limit(options.maxDocs));
    }

    if (allProjAccess) {
      const primaryQuery =
        baseConstraints.length > 0
          ? query(collection(db, collectionName), ...baseConstraints)
          : collection(db, collectionName);
      const fallbackQuery =
        options?.orderByField
          ? query(collection(db, collectionName), ...fallbackConstraints)
          : null;

      this.subscribeSnapshotWithFallback(
        primaryQuery,
        fallbackQuery,
        (snap) => {
          const liveList = snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
          const list = this.mergeWithOlderItems<T>(collectionName, liveList);
          if (sortFn) list.sort(sortFn);
          onItems(list);
        },
        collectionName
      );
      return;
    }

    if (assigned.length === 0) {
      safeStorage.setJson(storageKey, []);
      this.notify();
      return;
    }

    const batches = chunkArray(assigned, 30);
    const batchResults: T[][] = batches.map(() => []);

    batches.forEach((batchIds, batchIndex) => {
      const primaryQuery = query(
        collection(db, collectionName),
        where(fieldName, 'in', batchIds),
        ...baseConstraints
      );
      const fallbackQuery = options?.orderByField
        ? query(collection(db, collectionName), where(fieldName, 'in', batchIds), ...fallbackConstraints)
        : null;

      this.subscribeSnapshotWithFallback(
        primaryQuery,
        fallbackQuery,
        (snap) => {
          batchResults[batchIndex] = snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
          const mergedMap = new Map<string, T>();
          batchResults.forEach((items) => {
            items.forEach((item) => {
              const itemId = (item as unknown as { id?: string }).id;
              if (itemId) mergedMap.set(itemId, item);
            });
          });
          const merged = this.mergeWithOlderItems<T>(
            collectionName,
            Array.from(mergedMap.values())
          );
          if (sortFn) merged.sort(sortFn);
          onItems(merged);
        },
        collectionName
      );
    });
  }

  public startRealtimeSync(user: UserProfile) {
    const canExecWorks = canAccessExecutedWorksTab(user);
    const canDeliverables = canAccessSiteDeliverablesTab(user);
    const assigned = normalizeAssignedProjectsList(user.assignedProjects);
    const signature = `${user.id}:${user.role}:${user.allProjects ? 'all' : assigned.join(',')}:${canExecWorks ? '1' : '0'}:${canDeliverables ? '1' : '0'}`;
    if (this.currentSyncSignature === signature && this.firestoreUnsubs.length > 0) {
      return;
    }
    this.stopRealtimeSync();
    this.currentSyncSignature = signature;

    const isAdmin = user.role === 'admin' || isSuperAdminEmail(user.email);
    const allProjAccess = hasAllProjectsAccess(user);
    const cutoffIso60d = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    this.syncWindowCutoffIso = cutoffIso60d;

    // 1. User profile / Users list sync (bounded)
    if (isAdmin) {
      const unsubUsers = onSnapshot(
        query(collection(db, 'users'), limit(500)),
        (snap) => {
          const list = snap.docs.map((d) =>
            normalizeUserProfile(d.data() as Partial<UserProfile>, d.id)
          );
          if (list.length > 0) {
            safeStorage.setJson(STORAGE_KEYS.USERS, list);
            const active = this.getCurrentUser();
            const refreshedSelf = list.find((u) => u.id === user.id);
            if (active && refreshedSelf && refreshedSelf.id === active.id) {
              safeStorage.setJson(STORAGE_KEYS.CURRENT_USER, refreshedSelf);
            }
            this.notify();
            this.scheduleAutoIdentitySync();
          }
        },
        (error) => this.handleSnapshotError(error, OperationType.LIST, 'users')
      );
      this.firestoreUnsubs.push(unsubUsers);
    } else {
      const unsubSelf = onSnapshot(
        doc(db, 'users', user.id),
        (snap) => {
          if (!snap.exists()) {
            // User deleted by admin
            this.clearSession();
            return;
          }
          const updatedProfile = normalizeUserProfile(
            snap.data() as Partial<UserProfile>,
            user.id,
            user.email
          );
          if (updatedProfile.status === 'disabled') {
            this.clearSession();
            return;
          }
          this.upsertLocalUser(updatedProfile);
          safeStorage.setJson(STORAGE_KEYS.CURRENT_USER, updatedProfile);
          const nextCanExec = canAccessExecutedWorksTab(updatedProfile);
          const nextCanDeliverables = canAccessSiteDeliverablesTab(updatedProfile);
          const nextAssigned = normalizeAssignedProjectsList(updatedProfile.assignedProjects);
          const nextSig = `${updatedProfile.id}:${updatedProfile.role}:${updatedProfile.allProjects ? 'all' : nextAssigned.join(',')}:${nextCanExec ? '1' : '0'}:${nextCanDeliverables ? '1' : '0'}`;
          if (nextSig !== this.currentSyncSignature) {
            this.startRealtimeSync(updatedProfile);
          } else {
            this.notify();
            this.scheduleAutoIdentitySync();
          }
        },
        (error) => this.handleSnapshotError(error, OperationType.GET, `users/${user.id}`)
      );
      this.firestoreUnsubs.push(unsubSelf);
    }

    // 2. Projects sync (bounded, available to all active users)
    this.subscribeToScopedCollection<Project>(
      'projects',
      'id',
      true,
      assigned,
      STORAGE_KEYS.PROJECTS,
      (list) => {
        safeStorage.setJson(STORAGE_KEYS.PROJECTS, list);
        this.notify();
      },
      undefined,
      { maxDocs: 200 }
    );

    // 2b. Global App Branding Settings sync (Custom Brand Color managed by Admins)
    this.firestoreUnsubs.push(
      onSnapshot(
        doc(db, 'appSettings', 'branding'),
        (snap) => {
          if (!snap.exists()) return;
          const data = snap.data() as Partial<AppBrandingSettings>;
          if (typeof data.brandColor === 'string' && isValidHexColor(data.brandColor)) {
            const normalized = normalizeHexColor(data.brandColor);
            if (localStorage.getItem(STORAGE_KEYS.BRAND_COLOR) !== normalized) {
              localStorage.setItem(STORAGE_KEYS.BRAND_COLOR, normalized);
              this.notify();
            }
          }
        },
        (error) => this.handleSnapshotError(error, OperationType.GET, 'appSettings/branding')
      )
    );

    // 3. Reports sync (most recent 60 days, ordered desc, limit 300)
    this.subscribeToScopedCollection<DailyReport>(
      'reports',
      'projectId',
      allProjAccess,
      assigned,
      STORAGE_KEYS.REPORTS,
      (list) => {
        safeStorage.setJson(STORAGE_KEYS.REPORTS, list);
        this.notify();
        this.scheduleAutoIdentitySync();
      },
      (a, b) => b.createdAt.localeCompare(a.createdAt),
      { cutoffIso: cutoffIso60d, orderByField: 'createdAt', maxDocs: 300 }
    );

    // 4. Issues sync (most recent 60 days, ordered desc, limit 300)
    this.subscribeToScopedCollection<IssueReport>(
      'issues',
      'projectId',
      allProjAccess,
      assigned,
      STORAGE_KEYS.ISSUES,
      (list) => {
        safeStorage.setJson(STORAGE_KEYS.ISSUES, list);
        this.notify();
        this.scheduleAutoIdentitySync();
      },
      (a, b) => b.createdAt.localeCompare(a.createdAt),
      { cutoffIso: cutoffIso60d, orderByField: 'createdAt', maxDocs: 300 }
    );

    // 5. Tasks sync (most recent 60 days, ordered desc, limit 300 + 48-hour auto-cleanup)
    this.subscribeToScopedCollection<ProjectTask>(
      'tasks',
      'projectId',
      allProjAccess,
      assigned,
      STORAGE_KEYS.TASKS,
      (list) => {
        safeStorage.setJson(STORAGE_KEYS.TASKS, list);
        this.notify();
        const nowMs = Date.now();
        const hasExpired = list.some((t) =>
          (t.attachments || []).some((att) => isTaskAttachmentExpired(att, nowMs))
        );
        if (hasExpired) {
          void this.cleanupExpiredTaskAttachments(list);
        }
      },
      (a, b) => b.createdAt.localeCompare(a.createdAt),
      { cutoffIso: cutoffIso60d, orderByField: 'createdAt', maxDocs: 300 }
    );

    // 6. Announcements sync (ordered desc, limit 100)
    this.subscribeSnapshotWithFallback(
      query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(100)),
      query(collection(db, 'announcements'), limit(100)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ ...(d.data() as Announcement), id: d.id }))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        safeStorage.setJson(STORAGE_KEYS.ANNOUNCEMENTS, list);
        this.notify();
        this.scheduleAutoIdentitySync();
      },
      'announcements'
    );

    // 7. Executed Works sync (most recent 60 days, ordered desc, limit 300)
    if (!canExecWorks) {
      safeStorage.setJson(STORAGE_KEYS.EXECUTED_WORKS, []);
      this.notify();
    } else {
      this.subscribeToScopedCollection<ExecutedWork>(
        'executedWorks',
        'projectId',
        allProjAccess,
        assigned,
        STORAGE_KEYS.EXECUTED_WORKS,
        (list) => {
          safeStorage.setJson(STORAGE_KEYS.EXECUTED_WORKS, list);
          this.notify();
          this.scheduleAutoIdentitySync();
        },
        (a, b) => b.createdAt.localeCompare(a.createdAt),
        { cutoffIso: cutoffIso60d, orderByField: 'createdAt', maxDocs: 300 }
      );
    }

    // 8. Site PDF Deliverables sync (most recent 60 days, ordered desc, limit 300)
    const processDeliverablesSnapshot = (rawList: SiteDeliverable[]) => {
      const nowMs = Date.now();
      const activeList = rawList
        .filter((item) => !isDeliverableExpired(item, nowMs))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const expiredList = rawList.filter((item) => isDeliverableExpired(item, nowMs));

      safeStorage.setJson(STORAGE_KEYS.SITE_DELIVERABLES, activeList);
      this.notify();
      this.scheduleAutoIdentitySync();

      if (expiredList.length > 0) {
        this.cleanupExpiredDeliverables(expiredList).catch(() => undefined);
      }
    };

    if (!canDeliverables) {
      safeStorage.setJson(STORAGE_KEYS.SITE_DELIVERABLES, []);
      this.notify();
    } else if (allProjAccess) {
      this.subscribeToScopedCollection<SiteDeliverable>(
        'siteDeliverables',
        'projectId',
        true,
        assigned,
        STORAGE_KEYS.SITE_DELIVERABLES,
        processDeliverablesSnapshot,
        undefined,
        { cutoffIso: cutoffIso60d, orderByField: 'createdAt', maxDocs: 300 }
      );
    } else {
      let ownDeliverables: SiteDeliverable[] = [];
      let projectDeliverables: SiteDeliverable[] = [];
      const mergeAndProcessDeliverables = () => {
        const mergedMap = new Map<string, SiteDeliverable>();
        [...projectDeliverables, ...ownDeliverables].forEach((item) => {
          if (item.id) mergedMap.set(item.id, item);
        });
        processDeliverablesSnapshot(
          this.mergeWithOlderItems<SiteDeliverable>(
            'siteDeliverables',
            Array.from(mergedMap.values())
          )
        );
      };

      this.subscribeSnapshotWithFallback(
        query(
          collection(db, 'siteDeliverables'),
          where('senderId', '==', user.id),
          where('createdAt', '>=', cutoffIso60d),
          orderBy('createdAt', 'desc'),
          limit(300)
        ),
        query(
          collection(db, 'siteDeliverables'),
          where('senderId', '==', user.id),
          limit(300)
        ),
        (snap) => {
          ownDeliverables = snap.docs.map((d) => ({ ...(d.data() as SiteDeliverable), id: d.id }));
          mergeAndProcessDeliverables();
        },
        'siteDeliverables'
      );

      if (assigned.length > 0) {
        this.subscribeToScopedCollection<SiteDeliverable>(
          'siteDeliverables',
          'projectId',
          false,
          assigned,
          STORAGE_KEYS.SITE_DELIVERABLES,
          (list) => {
            projectDeliverables = list;
            mergeAndProcessDeliverables();
          },
          undefined,
          { cutoffIso: cutoffIso60d, orderByField: 'createdAt', maxDocs: 300 }
        );
      }
    }

    // Start Firebase periodic 48-hour auto-cleanup scheduler for deliverables & task attachments
    startFirebaseDeliverablesAutoCleanupScheduler(
      () => ({
        canAccessDeliverables: canDeliverables,
        hasAllProjects: allProjAccess,
        assignedProjectIds: assigned
      }),
      (deletedIds) => {
        this.removeDeliverablesFromLocalState(deletedIds);
      },
      () => this.cleanupExpiredTaskAttachments()
    );

    // 9. Real-time Notifications sync across devices (orderBy createdAt desc, limit 100)
    this.seenNotificationIds.clear();
    this.notificationsInitialized = false;

    const processNotificationsList = (incomingList: AppNotification[]) => {
      const normalized = incomingList
        .map((n) => ({
          ...n,
          isRead: n.isRead || (Array.isArray(n.readBy) && n.readBy.includes(user.id))
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 100);

      if (!this.notificationsInitialized) {
        normalized.forEach((n) => this.seenNotificationIds.add(n.id));
        this.notificationsInitialized = true;
      } else {
        normalized.forEach((n) => {
          if (!this.seenNotificationIds.has(n.id)) {
            this.seenNotificationIds.add(n.id);
            const latestUser = this.getCurrentUser() || user;
            const latestIsAdmin =
              latestUser.role === 'admin' || isSuperAdminEmail(latestUser.email);
            const isFromSelf = Boolean(n.senderId && n.senderId === latestUser.id);
            const targetMatchesUser = this.isNotificationTargetingUser(n, latestUser);
            const roleMatchesUser = latestIsAdmin
              ? !n.targetRole || n.targetRole === 'admin' || n.targetRole === 'all'
              : n.targetRole === 'site' || n.targetRole === 'all' || (!n.targetRole && Boolean(n.targetUserId));
            const visibleToUser = n.targetUserId
              ? targetMatchesUser
              : roleMatchesUser;
            const projectAllowed =
              latestIsAdmin ||
              !n.projectId ||
              hasAllProjectsAccess(latestUser) ||
              normalizeAssignedProjectsList(latestUser.assignedProjects).includes(n.projectId);
            const allowedByPrefs = isNotificationAllowedForUser(
              n,
              latestUser.notificationPreferences
            );
            if (!n.isRead && !isFromSelf && visibleToUser && projectAllowed && allowedByPrefs) {
              this.emitLiveNotification(n);
            }
          }
        });
      }

      safeStorage.setJson(STORAGE_KEYS.NOTIFICATIONS, normalized);
      this.notify();
    };

    if (isAdmin) {
      this.subscribeSnapshotWithFallback(
        query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(100)),
        query(collection(db, 'notifications'), limit(100)),
        (snap) => {
          processNotificationsList(snap.docs.map((d) => ({ ...(d.data() as AppNotification), id: d.id })));
        },
        'notifications'
      );
    } else {
      let directItems: AppNotification[] = [];
      let broadcastItems: AppNotification[] = [];
      const mergeAndProcess = () => {
        const mergedMap = new Map<string, AppNotification>();
        [...directItems, ...broadcastItems].forEach((n) => mergedMap.set(n.id, n));
        processNotificationsList(Array.from(mergedMap.values()));
      };

      this.subscribeSnapshotWithFallback(
        query(
          collection(db, 'notifications'),
          where('targetUserId', '==', user.id),
          orderBy('createdAt', 'desc'),
          limit(100)
        ),
        query(
          collection(db, 'notifications'),
          where('targetUserId', '==', user.id),
          limit(100)
        ),
        (snap) => {
          directItems = snap.docs.map((d) => ({ ...(d.data() as AppNotification), id: d.id }));
          mergeAndProcess();
        },
        'notifications'
      );

      this.subscribeSnapshotWithFallback(
        query(
          collection(db, 'notifications'),
          where('targetRole', 'in', ['site', 'all']),
          orderBy('createdAt', 'desc'),
          limit(100)
        ),
        query(
          collection(db, 'notifications'),
          where('targetRole', 'in', ['site', 'all']),
          limit(100)
        ),
        (snap) => {
          broadcastItems = snap.docs.map((d) => ({ ...(d.data() as AppNotification), id: d.id }));
          mergeAndProcess();
        },
        'notifications'
      );
    }

    // 10. Strictly Private Personal Notes sync (owner-only, ordered desc, limit 200)
    this.subscribeSnapshotWithFallback(
      query(
        collection(db, 'users', user.id, 'personalNotes'),
        where('userId', '==', user.id),
        orderBy('createdAt', 'desc'),
        limit(200)
      ),
      query(
        collection(db, 'users', user.id, 'personalNotes'),
        where('userId', '==', user.id),
        limit(200)
      ),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ ...(d.data() as PersonalNote), id: d.id }))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        safeStorage.setJson(STORAGE_KEYS.PERSONAL_NOTES, list);
        this.notify();
      },
      `users/${user.id}/personalNotes`
    );

    // 11. System Activity Log sync (Admin-only, server-ordered desc, limit 500)
    if (isAdmin) {
      this.subscribeSnapshotWithFallback(
        query(collection(db, 'activityLogs'), orderBy('createdAt', 'desc'), limit(500)),
        query(collection(db, 'activityLogs'), limit(500)),
        (snap) => {
          const list = snap.docs
            .map((d) => ({ ...(d.data() as ActivityLogEntry), id: d.id }))
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          safeStorage.setJson(STORAGE_KEYS.ACTIVITY_LOGS, list);
          this.notify();
        },
        'activityLogs'
      );
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVITY_LOGS);
    }
  }

  public async loadOlderCollectionItems(
    collectionName: 'reports' | 'issues' | 'tasks' | 'executedWorks' | 'siteDeliverables',
    pageSize = 100
  ): Promise<number> {
    const user = this.getCurrentUser();
    if (!user) return 0;

    const storageKeyMap: Record<typeof collectionName, string> = {
      reports: STORAGE_KEYS.REPORTS,
      issues: STORAGE_KEYS.ISSUES,
      tasks: STORAGE_KEYS.TASKS,
      executedWorks: STORAGE_KEYS.EXECUTED_WORKS,
      siteDeliverables: STORAGE_KEYS.SITE_DELIVERABLES
    };
    const storageKey = storageKeyMap[collectionName];

    let existingItems: Array<{ id: string; createdAt?: string }> = [];
    try {
      const raw = localStorage.getItem(storageKey);
      existingItems = raw ? JSON.parse(raw) : [];
    } catch {
      existingItems = [];
    }

    let cursorIso =
      this.syncWindowCutoffIso ||
      new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    for (const item of existingItems) {
      if (item.createdAt && item.createdAt < cursorIso) {
        cursorIso = item.createdAt;
      }
    }

    const allProjAccess = hasAllProjectsAccess(user);
    const assigned = normalizeAssignedProjectsList(user.assignedProjects);
    const fetchedDocs: Array<{ id: string; createdAt?: string }> = [];

    try {
      if (allProjAccess) {
        const snap = await getDocs(
          query(
            collection(db, collectionName),
            where('createdAt', '<', cursorIso),
            orderBy('createdAt', 'desc'),
            limit(pageSize)
          )
        );
        snap.docs.forEach((d) => {
          fetchedDocs.push({ ...(d.data() as { createdAt?: string }), id: d.id });
        });
      } else {
        const batches = chunkArray(assigned, 30);
        for (const batchIds of batches) {
          const snap = await getDocs(
            query(
              collection(db, collectionName),
              where('projectId', 'in', batchIds),
              where('createdAt', '<', cursorIso),
              orderBy('createdAt', 'desc'),
              limit(pageSize)
            )
          );
          snap.docs.forEach((d) => {
            fetchedDocs.push({ ...(d.data() as { createdAt?: string }), id: d.id });
          });
        }
        if (collectionName === 'siteDeliverables') {
          const ownSnap = await getDocs(
            query(
              collection(db, 'siteDeliverables'),
              where('senderId', '==', user.id),
              where('createdAt', '<', cursorIso),
              orderBy('createdAt', 'desc'),
              limit(pageSize)
            )
          );
          ownSnap.docs.forEach((d) => {
            fetchedDocs.push({ ...(d.data() as { createdAt?: string }), id: d.id });
          });
        }
      }
    } catch (error) {
      const code = getFirestoreErrorCode(error);
      if (code === 'failed-precondition' || code === 'resource-exhausted') {
        if (code === 'resource-exhausted') markFirestoreQuotaExhausted();
        return 0;
      }
      handleFirestoreError(error, OperationType.LIST, collectionName);
    }

    if (fetchedDocs.length === 0) return 0;

    let olderMap = this.olderLoadedByCollection.get(collectionName);
    if (!olderMap) {
      olderMap = new Map<string, unknown>();
      this.olderLoadedByCollection.set(collectionName, olderMap);
    }

    const existingIds = new Set(existingItems.map((i) => i.id));
    let addedCount = 0;
    fetchedDocs.forEach((item) => {
      if (!item.id) return;
      olderMap!.set(item.id, item);
      if (!existingIds.has(item.id)) {
        existingItems.push(item);
        existingIds.add(item.id);
        addedCount += 1;
      }
    });

    if (addedCount > 0) {
      existingItems.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      safeStorage.setJson(storageKey, existingItems);
      this.notify();
    }

    return addedCount;
  }

  public stopRealtimeSync() {
    this.firestoreUnsubs.forEach((unsub) => {
      try {
        unsub();
      } catch {
        // ignore unsubscribe errors
      }
    });
    this.firestoreUnsubs = [];
    this.currentSyncSignature = null;
    this.syncWindowCutoffIso = null;
    this.olderLoadedByCollection.clear();
    this.seenNotificationIds.clear();
    this.notificationsInitialized = false;
    if (this.autoIdentitySyncTimer !== null) {
      clearTimeout(this.autoIdentitySyncTimer);
      this.autoIdentitySyncTimer = null;
    }
    this.attemptedAutoSyncKeys.clear();
    stopFirebaseDeliverablesAutoCleanupScheduler();
    revokeAllPdfBlobUrls();
  }

  private upsertLocalUser(user: UserProfile) {
    usersDomain.upsertLocalUser(user);
  }

  // --- Projects ---
  public getProjects(): Project[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public async addProject(
    project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Project> {
    assertFirestoreWriteAvailable();
    const projects = this.getProjects();
    const now = new Date().toISOString();
    const validDisciplines: WorkDiscipline[] = [
      'civil_structural',
      'architectural',
      'electrical',
      'mechanical',
      'finishing',
      'infrastructure',
      'other'
    ];
    const cleanedDescription = project.description?.trim().slice(0, 1000);
    const cleanedWorkScope = project.workScope?.trim().slice(0, 2000);
    const cleanedLocation = project.location?.trim().slice(0, 200);
    const cleanedClientName = project.clientName?.trim().slice(0, 200);
    const cleanedDisciplines = Array.isArray(project.scopeDisciplines)
      ? Array.from(
          new Set(project.scopeDisciplines.filter((d) => validDisciplines.includes(d)))
        ).slice(0, 10)
      : [];

    const cleanedPlannedWorks =
      typeof project.plannedWorksCount === 'number' && Number.isFinite(project.plannedWorksCount)
        ? Math.max(0, Math.min(100000, Math.round(project.plannedWorksCount)))
        : undefined;

    const newProj: Project = stripUndefined({
      id: 'proj-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
      name: project.name.trim().slice(0, 200),
      code: project.code.trim().toUpperCase().slice(0, 80),
      description: cleanedDescription ? cleanedDescription : undefined,
      workScope: cleanedWorkScope ? cleanedWorkScope : undefined,
      scopeDisciplines: cleanedDisciplines.length > 0 ? cleanedDisciplines : undefined,
      plannedWorksCount:
        cleanedPlannedWorks !== undefined && cleanedPlannedWorks > 0
          ? cleanedPlannedWorks
          : undefined,
      location: cleanedLocation ? cleanedLocation : undefined,
      clientName: cleanedClientName ? cleanedClientName : undefined,
      status: project.status === 'completed' ? 'completed' : 'active',
      createdAt: now,
      updatedAt: now
    });
    projects.push(newProj);
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    try {
      await setDoc(doc(db, 'projects', newProj.id), stripUndefined(newProj));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `projects/${newProj.id}`);
    }
    this.notify();
    return newProj;
  }

  public async updateProject(
    projectId: string,
    updates: Partial<
      Pick<
        Project,
        | 'name'
        | 'code'
        | 'description'
        | 'workScope'
        | 'scopeDisciplines'
        | 'plannedWorksCount'
        | 'location'
        | 'clientName'
        | 'status'
      >
    >
  ): Promise<boolean> {
    assertFirestoreWriteAvailable();
    const projects = this.getProjects();
    const idx = projects.findIndex((p) => p.id === projectId);
    if (idx === -1) return false;

    const validDisciplines: WorkDiscipline[] = [
      'civil_structural',
      'architectural',
      'electrical',
      'mechanical',
      'finishing',
      'infrastructure',
      'other'
    ];
    const sanitizedDisciplines =
      updates.scopeDisciplines !== undefined
        ? Array.from(
            new Set(updates.scopeDisciplines.filter((d) => validDisciplines.includes(d)))
          ).slice(0, 10)
        : undefined;
    const sanitizedPlannedWorks =
      updates.plannedWorksCount !== undefined
        ? Number.isFinite(updates.plannedWorksCount)
          ? Math.max(0, Math.min(100000, Math.round(updates.plannedWorksCount)))
          : 0
        : undefined;

    const updatedAt = new Date().toISOString();
    const nextProject: Project = stripUndefined({
      ...projects[idx],
      ...(updates.name !== undefined ? { name: updates.name.trim().slice(0, 200) } : {}),
      ...(updates.code !== undefined ? { code: updates.code.trim().toUpperCase().slice(0, 80) } : {}),
      ...(updates.description !== undefined
        ? { description: updates.description.trim().slice(0, 1000) }
        : {}),
      ...(updates.workScope !== undefined
        ? { workScope: updates.workScope.trim().slice(0, 2000) }
        : {}),
      ...(sanitizedDisciplines !== undefined ? { scopeDisciplines: sanitizedDisciplines } : {}),
      ...(sanitizedPlannedWorks !== undefined ? { plannedWorksCount: sanitizedPlannedWorks } : {}),
      ...(updates.location !== undefined
        ? { location: updates.location.trim().slice(0, 200) }
        : {}),
      ...(updates.clientName !== undefined
        ? { clientName: updates.clientName.trim().slice(0, 200) }
        : {}),
      ...(updates.status !== undefined ? { status: updates.status } : {}),
      updatedAt
    });

    projects[idx] = nextProject;
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));

    const patch = stripUndefined({
      ...(updates.name !== undefined ? { name: nextProject.name } : {}),
      ...(updates.code !== undefined ? { code: nextProject.code } : {}),
      ...(updates.description !== undefined ? { description: nextProject.description } : {}),
      ...(updates.workScope !== undefined ? { workScope: nextProject.workScope } : {}),
      ...(sanitizedDisciplines !== undefined ? { scopeDisciplines: sanitizedDisciplines } : {}),
      ...(sanitizedPlannedWorks !== undefined ? { plannedWorksCount: sanitizedPlannedWorks } : {}),
      ...(updates.location !== undefined ? { location: nextProject.location } : {}),
      ...(updates.clientName !== undefined ? { clientName: nextProject.clientName } : {}),
      ...(updates.status !== undefined ? { status: nextProject.status } : {}),
      updatedAt
    });

    try {
      await updateDoc(doc(db, 'projects', projectId), patch);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}`);
    }

    this.notify();
    return true;
  }

  public async deleteProject(projectId: string): Promise<boolean> {
    assertFirestoreWriteAvailable();
    const projects = this.getProjects();
    if (!projects.some((p) => p.id === projectId)) return false;

    const remainingProjects = projects.filter((p) => p.id !== projectId);
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(remainingProjects));

    try {
      await deleteDoc(doc(db, 'projects', projectId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `projects/${projectId}`);
    }

    // Remove deleted projectId from any user's assignedProjects list
    const users = this.getUsers();
    const now = new Date().toISOString();
    const updatedUsers = users.map((u) => {
      if (u.assignedProjects?.includes(projectId)) {
        const nextAssigned = u.assignedProjects.filter((id) => id !== projectId);
        updateDoc(doc(db, 'users', u.id), {
          assignedProjects: nextAssigned,
          updatedAt: now
        }).catch(() => undefined);
        return { ...u, assignedProjects: nextAssigned, updatedAt: now };
      }
      return u;
    });
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));

    this.notify();
    return true;
  }

  // --- Executed Works (الأعمال المنفذة بالموقع) ---
  public getExecutedWorks(): ExecutedWork[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EXECUTED_WORKS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private async uploadExecutedWorkAttachmentChunks(
    workId: string,
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
            setDoc(doc(db, 'executedWorks', workId, 'chunks', chunkId), chunkDoc).then(() => {
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

  private async deleteExecutedWorkChunksByIds(workId: string, chunkIds: string[]) {
    for (const chunkId of chunkIds) {
      await deleteDoc(doc(db, 'executedWorks', workId, 'chunks', chunkId)).catch(() => undefined);
    }
  }

  private async deleteExecutedWorkAttachmentChunks(workId: string, attachmentId: string) {
    if (!attachmentId) return;
    try {
      const snap = await getDocs(
        query(
          collection(db, 'executedWorks', workId, 'chunks'),
          where('attachmentId', '==', attachmentId)
        )
      );
      await Promise.allSettled(
        snap.docs.map((d) => deleteDoc(doc(db, 'executedWorks', workId, 'chunks', d.id)))
      );
      revokePdfBlobUrl(`exec-${workId}-${attachmentId}`);
    } catch {
      // Ignore background cleanup errors
    }
  }

  public async addExecutedWork(
    work: Omit<ExecutedWork, 'id' | 'createdAt' | 'updatedAt'>,
    pendingAttachments: PreparedReportAttachment[] = [],
    onProgress?: (progress: ReportUploadProgress) => void
  ): Promise<ExecutedWork> {
    assertFirestoreWriteAvailable();
    const existingStaticAttachments = (work.attachments || []).filter(
      (att) => att.storageMode !== 'firestore_chunks' && att.url && !att.url.startsWith('blob:')
    );
    if (existingStaticAttachments.length + pendingAttachments.length > MAX_REPORT_ATTACHMENTS) {
      throw new Error(`الحد الأقصى للمرفقات هو ${MAX_REPORT_ATTACHMENTS} ملفات.`);
    }

    const preparedChunked = pendingAttachments.map((item) => {
      if (item.size <= 0 || item.size > MAX_REPORT_ATTACHMENT_SIZE_BYTES) {
        throw new Error(`حجم المرفق «${item.name}» يتجاوز الحد الأقصى المسموح (5 ميجابايت).`);
      }
      const chunks = splitBase64IntoChunks(item.base64, REPORT_ATTACHMENT_CHUNK_SIZE_CHARS);
      if (chunks.length === 0 || chunks.length >= 20) {
        throw new Error(`تعذر تجهيز المرفق «${item.name}» للرفع.`);
      }
      return { item, chunks };
    });

    const list = this.getExecutedWorks();
    const now = new Date().toISOString();
    const chunkedMeta: ReportAttachment[] = preparedChunked.map(({ item, chunks }) => ({
      id: item.attachmentId,
      name: item.name,
      url: 'firestore://chunked',
      size: item.size,
      type: item.type,
      chunkCount: chunks.length,
      storageMode: 'firestore_chunks',
      uploadedAt: now
    }));
    const finalAttachments = [...existingStaticAttachments, ...chunkedMeta].slice(
      0,
      MAX_REPORT_ATTACHMENTS
    );

    const newWork: ExecutedWork = stripUndefined({
      id: 'exec-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
      projectId: work.projectId,
      projectName: work.projectName.trim().slice(0, 200),
      workDate: work.workDate.trim().slice(0, 20),
      workDescription: work.workDescription.trim().slice(0, 1000),
      discipline: work.discipline,
      locationArea: work.locationArea?.trim().slice(0, 200) || undefined,
      quantity:
        typeof work.quantity === 'number' && Number.isFinite(work.quantity) && work.quantity >= 0
          ? work.quantity
          : undefined,
      unit: work.unit?.trim().slice(0, 40) || undefined,
      completionPercent: Math.max(0, Math.min(100, Math.round(work.completionPercent))),
      relatedSubmittalNumber: work.relatedSubmittalNumber?.trim().slice(0, 120) || undefined,
      notes: work.notes?.trim().slice(0, 2000) || undefined,
      attachments: finalAttachments.length > 0 ? finalAttachments : undefined,
      authorId: auth.currentUser?.uid || work.authorId,
      authorName: work.authorName.trim().slice(0, 150),
      reviewStatus: work.reviewStatus,
      adminNote: work.adminNote?.trim().slice(0, 1000) || undefined,
      createdAt: now,
      updatedAt: now
    });

    const totalBytes = preparedChunked.reduce((sum, entry) => sum + entry.item.size, 0);
    const totalChunks = preparedChunked.reduce((sum, entry) => sum + entry.chunks.length, 0);
    if (preparedChunked.length > 0) {
      onProgress?.({
        percent: 8,
        currentFileIndex: 1,
        totalFiles: preparedChunked.length,
        currentFileName: preparedChunked[0].item.name,
        uploadedChunks: 0,
        totalChunks,
        uploadedBytes: 0,
        totalBytes,
        stage: 'metadata'
      });
    }

    try {
      await setDoc(doc(db, 'executedWorks', newWork.id), stripUndefined(newWork));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `executedWorks/${newWork.id}`);
    }

    if (preparedChunked.length > 0) {
      let writtenChunkIds: string[] = [];
      try {
        writtenChunkIds = await this.uploadExecutedWorkAttachmentChunks(
          newWork.id,
          preparedChunked,
          onProgress
        );
      } catch (error) {
        await this.deleteExecutedWorkChunksByIds(newWork.id, writtenChunkIds);
        await deleteDoc(doc(db, 'executedWorks', newWork.id)).catch(() => undefined);
        handleFirestoreError(error, OperationType.CREATE, `executedWorks/${newWork.id}/chunks`);
      }

      onProgress?.({
        percent: 100,
        currentFileIndex: preparedChunked.length,
        totalFiles: preparedChunked.length,
        currentFileName: preparedChunked[preparedChunked.length - 1].item.name,
        uploadedChunks: totalChunks,
        totalChunks,
        uploadedBytes: totalBytes,
        totalBytes,
        stage: 'finalizing'
      });
    }

    list.unshift(newWork);
    localStorage.setItem(STORAGE_KEYS.EXECUTED_WORKS, JSON.stringify(list));

    this.addNotification({
      title: `عمل منفذ جديد: ${newWork.projectName}`,
      message: `سجّل ${newWork.authorName}: ${newWork.workDescription.slice(0, 80)} (${newWork.completionPercent}%)${finalAttachments.length > 0 ? ` — ${finalAttachments.length} مرفق` : ''}`,
      type: 'work_logged',
      targetRole: 'admin',
      projectId: newWork.projectId,
      senderId: newWork.authorId,
      senderName: newWork.authorName,
      linkTab: 'executed-works'
    });

    this.notify();
    return newWork;
  }

  public async updateExecutedWork(
    workId: string,
    updates: Partial<
      Pick<
        ExecutedWork,
        | 'workDate'
        | 'workDescription'
        | 'discipline'
        | 'locationArea'
        | 'quantity'
        | 'unit'
        | 'completionPercent'
        | 'relatedSubmittalNumber'
        | 'notes'
        | 'attachments'
        | 'reviewStatus'
        | 'adminNote'
      >
    >,
    pendingAttachments: PreparedReportAttachment[] = [],
    onProgress?: (progress: ReportUploadProgress) => void
  ): Promise<boolean> {
    assertFirestoreWriteAvailable();
    const list = this.getExecutedWorks();
    const idx = list.findIndex((w) => w.id === workId);
    if (idx === -1) return false;

    const existing = list[idx];
    const updatedAt = new Date().toISOString();
    const shouldTouchAttachments =
      updates.attachments !== undefined || pendingAttachments.length > 0;

    let nextAttachments: ReportAttachment[] | undefined = existing.attachments;
    let writtenChunkIds: string[] = [];

    if (shouldTouchAttachments) {
      const keptAttachments = (updates.attachments ?? existing.attachments ?? []).filter(
        (att) => att && att.name && att.url && !att.url.startsWith('blob:')
      );
      if (keptAttachments.length + pendingAttachments.length > MAX_REPORT_ATTACHMENTS) {
        throw new Error(`الحد الأقصى للمرفقات هو ${MAX_REPORT_ATTACHMENTS} ملفات.`);
      }

      const preparedChunked = pendingAttachments.map((item) => {
        if (item.size <= 0 || item.size > MAX_REPORT_ATTACHMENT_SIZE_BYTES) {
          throw new Error(`حجم المرفق «${item.name}» يتجاوز الحد الأقصى المسموح (5 ميجابايت).`);
        }
        const chunks = splitBase64IntoChunks(item.base64, REPORT_ATTACHMENT_CHUNK_SIZE_CHARS);
        if (chunks.length === 0 || chunks.length >= 20) {
          throw new Error(`تعذر تجهيز المرفق «${item.name}» للرفع.`);
        }
        return { item, chunks };
      });

      if (preparedChunked.length > 0) {
        const totalBytes = preparedChunked.reduce((sum, entry) => sum + entry.item.size, 0);
        const totalChunks = preparedChunked.reduce((sum, entry) => sum + entry.chunks.length, 0);
        onProgress?.({
          percent: 10,
          currentFileIndex: 1,
          totalFiles: preparedChunked.length,
          currentFileName: preparedChunked[0].item.name,
          uploadedChunks: 0,
          totalChunks,
          uploadedBytes: 0,
          totalBytes,
          stage: 'uploading'
        });

        try {
          writtenChunkIds = await this.uploadExecutedWorkAttachmentChunks(
            workId,
            preparedChunked,
            onProgress
          );
        } catch (error) {
          await this.deleteExecutedWorkChunksByIds(workId, writtenChunkIds);
          handleFirestoreError(error, OperationType.CREATE, `executedWorks/${workId}/chunks`);
        }
      }

      const newlyUploadedMeta: ReportAttachment[] = preparedChunked.map(({ item, chunks }) => ({
        id: item.attachmentId,
        name: item.name,
        url: 'firestore://chunked',
        size: item.size,
        type: item.type,
        chunkCount: chunks.length,
        storageMode: 'firestore_chunks',
        uploadedAt: updatedAt
      }));

      nextAttachments = [...keptAttachments, ...newlyUploadedMeta].slice(0, MAX_REPORT_ATTACHMENTS);
    }

    const merged: ExecutedWork = stripUndefined({
      ...existing,
      ...(updates.workDate !== undefined ? { workDate: updates.workDate.trim().slice(0, 20) } : {}),
      ...(updates.workDescription !== undefined
        ? { workDescription: updates.workDescription.trim().slice(0, 1000) }
        : {}),
      ...(updates.discipline !== undefined ? { discipline: updates.discipline } : {}),
      ...(updates.locationArea !== undefined
        ? { locationArea: updates.locationArea.trim().slice(0, 200) }
        : {}),
      ...(updates.quantity !== undefined ? { quantity: updates.quantity } : {}),
      ...(updates.unit !== undefined ? { unit: updates.unit.trim().slice(0, 40) } : {}),
      ...(updates.completionPercent !== undefined
        ? { completionPercent: Math.max(0, Math.min(100, Math.round(updates.completionPercent))) }
        : {}),
      ...(updates.relatedSubmittalNumber !== undefined
        ? { relatedSubmittalNumber: updates.relatedSubmittalNumber.trim().slice(0, 120) }
        : {}),
      ...(updates.notes !== undefined ? { notes: updates.notes.trim().slice(0, 2000) } : {}),
      ...(shouldTouchAttachments ? { attachments: nextAttachments ?? [] } : {}),
      ...(updates.reviewStatus !== undefined ? { reviewStatus: updates.reviewStatus } : {}),
      ...(updates.adminNote !== undefined
        ? { adminNote: updates.adminNote.trim().slice(0, 1000) }
        : {}),
      updatedAt
    });

    const patch = stripUndefined({
      ...(updates.workDate !== undefined ? { workDate: merged.workDate } : {}),
      ...(updates.workDescription !== undefined ? { workDescription: merged.workDescription } : {}),
      ...(updates.discipline !== undefined ? { discipline: merged.discipline } : {}),
      ...(updates.locationArea !== undefined ? { locationArea: merged.locationArea } : {}),
      ...(updates.quantity !== undefined ? { quantity: merged.quantity } : {}),
      ...(updates.unit !== undefined ? { unit: merged.unit } : {}),
      ...(updates.completionPercent !== undefined ? { completionPercent: merged.completionPercent } : {}),
      ...(updates.relatedSubmittalNumber !== undefined
        ? { relatedSubmittalNumber: merged.relatedSubmittalNumber }
        : {}),
      ...(updates.notes !== undefined ? { notes: merged.notes } : {}),
      ...(shouldTouchAttachments ? { attachments: nextAttachments ?? [] } : {}),
      ...(updates.reviewStatus !== undefined ? { reviewStatus: merged.reviewStatus } : {}),
      ...(updates.adminNote !== undefined ? { adminNote: merged.adminNote } : {}),
      updatedAt
    });

    try {
      await updateDoc(doc(db, 'executedWorks', workId), patch);
    } catch (error) {
      if (writtenChunkIds.length > 0) {
        await this.deleteExecutedWorkChunksByIds(workId, writtenChunkIds);
      }
      handleFirestoreError(error, OperationType.UPDATE, `executedWorks/${workId}`);
    }

    // Delete orphaned chunks for any removed attachment
    if (shouldTouchAttachments) {
      const keptIds = new Set((nextAttachments || []).map((a) => a.id).filter(Boolean));
      const removedChunkedIds = (existing.attachments || [])
        .filter((a) => a.storageMode === 'firestore_chunks' && a.id && !keptIds.has(a.id))
        .map((a) => a.id!);
      if (removedChunkedIds.length > 0) {
        Promise.allSettled(
          removedChunkedIds.map((attId) => this.deleteExecutedWorkAttachmentChunks(workId, attId))
        ).catch(() => undefined);
      }
    }

    if (pendingAttachments.length > 0) {
      const totalBytes = pendingAttachments.reduce((sum, item) => sum + item.size, 0);
      onProgress?.({
        percent: 100,
        currentFileIndex: pendingAttachments.length,
        totalFiles: pendingAttachments.length,
        currentFileName: pendingAttachments[pendingAttachments.length - 1].name,
        uploadedChunks: writtenChunkIds.length,
        totalChunks: writtenChunkIds.length,
        uploadedBytes: totalBytes,
        totalBytes,
        stage: 'finalizing'
      });
    }

    list[idx] = merged;
    localStorage.setItem(STORAGE_KEYS.EXECUTED_WORKS, JSON.stringify(list));

    this.notify();
    return true;
  }

  public async deleteExecutedWork(workId: string): Promise<boolean> {
    assertFirestoreWriteAvailable();
    const list = this.getExecutedWorks();
    const target = list.find((w) => w.id === workId);
    if (!target) return false;

    // Delete chunked attachments first while parent doc still exists for security rule verification
    try {
      const chunkSnap = await getDocs(collection(db, 'executedWorks', workId, 'chunks'));
      if (!chunkSnap.empty) {
        await Promise.allSettled(
          chunkSnap.docs.map((d) => deleteDoc(doc(db, 'executedWorks', workId, 'chunks', d.id)))
        );
      }
      for (const att of target.attachments || []) {
        if (att.id) {
          revokePdfBlobUrl(`exec-${workId}-${att.id}`);
        }
      }
    } catch {
      // Ignore cleanup errors if no chunks exist
    }

    try {
      await deleteDoc(doc(db, 'executedWorks', workId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `executedWorks/${workId}`);
    }

    const remaining = list.filter((w) => w.id !== workId);
    localStorage.setItem(STORAGE_KEYS.EXECUTED_WORKS, JSON.stringify(remaining));

    this.notify();
    return true;
  }

  public async fetchExecutedWorkAttachmentUrl(
    workId: string,
    attachment: ReportAttachment
  ): Promise<string> {
    if (
      attachment.storageMode === 'firestore_chunks' ||
      (attachment.id && attachment.chunkCount && attachment.chunkCount > 0)
    ) {
      const cacheKey = `exec-${workId}-${attachment.id}`;
      const cached = getCachedPdfBlobUrl(cacheKey);
      if (cached) return cached;

      let chunkDocs: ReportAttachmentChunk[] = [];
      try {
        const snap = await getDocs(
          query(
            collection(db, 'executedWorks', workId, 'chunks'),
            where('attachmentId', '==', attachment.id)
          )
        );
        chunkDocs = snap.docs.map((d) => d.data() as ReportAttachmentChunk);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, `executedWorks/${workId}/chunks`);
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

    throw new Error('تعذر فتح هذا المرفق. يرجى إعادة رفعه من جديد.');
  }

  // --- Site PDF Deliverables (تسليمات الموقع - حذف تلقائي من Firebase بعد 48 ساعة) ---
  private getDeliverablesContext(): deliverablesDomain.DeliverablesDomainContext {
    return {
      getCurrentUser: () => this.getCurrentUser(),
      resolveRecipientUserId: (userId, email) => this.resolveRecipientUserId(userId, email),
      addNotification: (notif) => this.addNotification(notif),
      notify: () => this.notify()
    };
  }

  public getSiteDeliverables(): SiteDeliverable[] {
    return deliverablesDomain.getSiteDeliverables();
  }

  public async createSiteDeliverable(
    payload: CreateSiteDeliverablePayload,
    base64Pdf: string,
    onProgress?: (percent: number, info?: DeliverableUploadProgress) => void
  ): Promise<SiteDeliverable> {
    return deliverablesDomain.createSiteDeliverable(
      payload,
      base64Pdf,
      this.getDeliverablesContext(),
      onProgress
    );
  }

  public async fetchSiteDeliverablePdfUrl(deliverable: SiteDeliverable): Promise<string> {
    return deliverablesDomain.fetchSiteDeliverablePdfUrl(deliverable, (id) =>
      this.deleteSiteDeliverable(id)
    );
  }

  public async updateSiteDeliverableStatus(
    deliverableId: string,
    status: SiteDeliverableStatus,
    adminNote?: string
  ): Promise<boolean> {
    return deliverablesDomain.updateSiteDeliverableStatus(
      deliverableId,
      status,
      adminNote,
      this.getDeliverablesContext()
    );
  }

  public async deleteSiteDeliverable(deliverableId: string): Promise<boolean> {
    return deliverablesDomain.deleteSiteDeliverable(deliverableId, () => this.notify());
  }

  public async cleanupExpiredDeliverables(expiredItems: SiteDeliverable[]): Promise<void> {
    return deliverablesDomain.cleanupExpiredDeliverables(
      expiredItems,
      this.getCurrentUser(),
      () => this.notify()
    );
  }

  private removeDeliverablesFromLocalState(deletedIds: string[]) {
    deliverablesDomain.removeDeliverablesFromLocalState(deletedIds, () => this.notify());
  }

  // --- Daily Reports ---
  public getReports(): DailyReport[] {
    return reportsDomain.getReports();
  }

  public getReportById(id: string): DailyReport | undefined {
    return reportsDomain.getReportById(id);
  }

  public getReportForProjectDate(projectId: string, reportDate: string): DailyReport | undefined {
    return reportsDomain.getReportForProjectDate(projectId, reportDate);
  }

  private async uploadReportAttachmentChunks(
    reportId: string,
    preparedFiles: { item: PreparedReportAttachment; chunks: string[] }[],
    onProgress?: (progress: ReportUploadProgress) => void
  ): Promise<string[]> {
    return reportsDomain.uploadReportAttachmentChunks(reportId, preparedFiles, onProgress);
  }

  private async deleteChunksByIds(reportId: string, chunkIds: string[]) {
    return reportsDomain.deleteReportChunksByIds(reportId, chunkIds);
  }

  private async deleteReportAttachmentChunks(reportId: string, attachmentId: string) {
    return reportsDomain.deleteReportAttachmentChunks(reportId, attachmentId);
  }

  public async saveReport(
    reportData: Omit<DailyReport, 'id' | 'createdAt' | 'updatedAt'>,
    pendingAttachments: PreparedReportAttachment[] = [],
    onProgress?: (progress: ReportUploadProgress) => void
  ): Promise<DailyReport> {
    assertFirestoreWriteAvailable();
    const reports = this.getReports();

    const existingStaticAttachments = (reportData.attachments || []).filter(
      (att) => att.storageMode !== 'firestore_chunks' && att.url && !att.url.startsWith('blob:')
    );
    if (existingStaticAttachments.length + pendingAttachments.length > MAX_REPORT_ATTACHMENTS) {
      throw new Error(`الحد الأقصى للمرفقات في التقرير الواحد هو ${MAX_REPORT_ATTACHMENTS} ملفات.`);
    }

    const now = new Date().toISOString();
    const preparedChunked = pendingAttachments.map((item) => {
      if (item.size <= 0 || item.size > MAX_REPORT_ATTACHMENT_SIZE_BYTES) {
        throw new Error(`حجم المرفق «${item.name}» يتجاوز الحد الأقصى المسموح (5 ميجابايت).`);
      }
      const chunks = splitBase64IntoChunks(item.base64, REPORT_ATTACHMENT_CHUNK_SIZE_CHARS);
      if (chunks.length === 0 || chunks.length >= 20) {
        throw new Error(`تعذر تجهيز المرفق «${item.name}» للرفع.`);
      }
      return { item, chunks };
    });

    const chunkedMeta: ReportAttachment[] = preparedChunked.map(({ item, chunks }) => ({
      id: item.attachmentId,
      name: item.name,
      url: 'firestore://chunked',
      size: item.size,
      type: item.type,
      chunkCount: chunks.length,
      storageMode: 'firestore_chunks',
      uploadedAt: now
    }));

    const finalAttachments = [...existingStaticAttachments, ...chunkedMeta].slice(
      0,
      MAX_REPORT_ATTACHMENTS
    );

    const sanitizeRows = (rows: DailyReport['submittedWorks']) =>
      (Array.isArray(rows) ? rows : []).slice(0, 200).map((item, rIdx) =>
        stripUndefined({
          id: (item.id || `row-${rIdx + 1}`).slice(0, 128),
          rowNumber: rIdx + 1,
          itemDescription: (item.itemDescription || '').trim().slice(0, 1000),
          submittalNumber: (item.submittalNumber || '').trim().slice(0, 120),
          rev: Number.isFinite(Number(item.rev)) ? Number(item.rev) : 0,
          status: item.status
        })
      );

    const candidateId = `rep-${reportData.projectId}-${reportData.reportDate}`;
    const reportId =
      candidateId.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(candidateId)
        ? candidateId
        : 'rep-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);

    const sanitizedNotes =
      reportData.notes !== undefined ? String(reportData.notes).trim().slice(0, 4000) : undefined;
    const sanitizedFeedback =
      reportData.adminFeedback !== undefined
        ? String(reportData.adminFeedback).trim().slice(0, 2000)
        : undefined;

    const normalizedSenderEmail = normalizeEmail(
      reportData.senderEmail || auth.currentUser?.email
    ).slice(0, 200);
    const normalizedSenderName = (reportData.senderName || auth.currentUser?.displayName || 'مستخدم')
      .trim()
      .slice(0, 150);

    const newReport: DailyReport = stripUndefined({
      ...reportData,
      projectName: (reportData.projectName || '').trim().slice(0, 200),
      reportDate: (reportData.reportDate || '').trim().slice(0, 20),
      senderId: (auth.currentUser?.uid || reportData.senderId || '').trim().slice(0, 128),
      senderEmail: normalizedSenderEmail,
      senderName: normalizedSenderName,
      originalSenderName: normalizedSenderName,
      originalSenderEmail: normalizedSenderEmail,
      submittedWorks: sanitizeRows(reportData.submittedWorks),
      receivedWorks: sanitizeRows(reportData.receivedWorks),
      notes: sanitizedNotes,
      adminFeedback: sanitizedFeedback,
      id: reportId,
      attachments: finalAttachments,
      createdAt: now,
      updatedAt: now
    });

    const totalBytes = preparedChunked.reduce((sum, entry) => sum + entry.item.size, 0);
    const totalChunks = preparedChunked.reduce((sum, entry) => sum + entry.chunks.length, 0);
    if (preparedChunked.length > 0) {
      onProgress?.({
        percent: 8,
        currentFileIndex: 1,
        totalFiles: preparedChunked.length,
        currentFileName: preparedChunked[0].item.name,
        uploadedChunks: 0,
        totalChunks,
        uploadedBytes: 0,
        totalBytes,
        stage: 'metadata'
      });
    }

    const reportDocRef = doc(db, 'reports', newReport.id);
    const OTHER_SENDER_CONFLICT_MSG = 'يوجد تقرير لهذا المشروع في هذا التاريخ من مستخدم آخر';
    let savedReport: DailyReport = newReport;
    let wasUpdate = false;

    try {
      const txResult = await runTransaction(db, async (tx) => {
        const existingSnap = await tx.get(reportDocRef);
        if (existingSnap.exists()) {
          const existingData = {
            ...(existingSnap.data() as DailyReport),
            id: existingSnap.id
          };
          if (existingData.senderId && existingData.senderId !== newReport.senderId) {
            throw new Error(OTHER_SENDER_CONFLICT_MSG);
          }
          const mergedAttachments =
            finalAttachments.length > 0
              ? [...(existingData.attachments || []), ...finalAttachments].slice(
                  0,
                  MAX_REPORT_ATTACHMENTS
                )
              : existingData.attachments || [];
          const updatePayload = stripUndefined({
            projectId: newReport.projectId,
            projectName: newReport.projectName,
            reportDate: newReport.reportDate,
            submittedWorks: newReport.submittedWorks,
            receivedWorks: newReport.receivedWorks,
            notes: newReport.notes,
            attachments: mergedAttachments,
            status: 'submitted' as const,
            updatedAt: now
          });
          tx.update(reportDocRef, updatePayload);
          return {
            wasUpdate: true,
            report: {
              ...existingData,
              ...updatePayload
            } as DailyReport
          };
        }

        tx.set(reportDocRef, stripUndefined(newReport));
        return {
          wasUpdate: false,
          report: newReport
        };
      });
      savedReport = txResult.report;
      wasUpdate = txResult.wasUpdate;
    } catch (error) {
      if (error instanceof Error && error.message === OTHER_SENDER_CONFLICT_MSG) {
        throw error;
      }
      handleFirestoreError(
        error,
        wasUpdate ? OperationType.UPDATE : OperationType.CREATE,
        `reports/${newReport.id}`
      );
    }

    if (preparedChunked.length > 0) {
      try {
        await this.uploadReportAttachmentChunks(savedReport.id, preparedChunked, onProgress);
      } catch (error) {
        for (const entry of preparedChunked) {
          await this.deleteReportAttachmentChunks(savedReport.id, entry.item.attachmentId);
        }
        if (!wasUpdate) {
          await deleteDoc(doc(db, 'reports', savedReport.id)).catch(() => undefined);
        }
        handleFirestoreError(error, OperationType.CREATE, `reports/${savedReport.id}/chunks`);
      }

      onProgress?.({
        percent: 100,
        currentFileIndex: preparedChunked.length,
        totalFiles: preparedChunked.length,
        currentFileName: preparedChunked[preparedChunked.length - 1].item.name,
        uploadedChunks: totalChunks,
        totalChunks,
        uploadedBytes: totalBytes,
        totalBytes,
        stage: 'finalizing'
      });
    }

    const updatedReports = [savedReport, ...reports.filter((r) => r.id !== savedReport.id)];
    safeStorage.setJson(STORAGE_KEYS.REPORTS, updatedReports);

    this.clearReportDraft(reportData.projectId);

    this.addNotification({
      title: wasUpdate
        ? `تحديث تقرير يومي: ${savedReport.projectName}`
        : `تقرير يومي جديد: ${savedReport.projectName}`,
      message: `قام ${savedReport.senderName} ${wasUpdate ? 'بتحديث' : 'بتقديم'} تقرير أعمال اليوم (${savedReport.reportDate}) مع ${savedReport.submittedWorks.length} تقديمات و ${savedReport.receivedWorks.length} استلامات.`,
      type: 'report_submitted',
      targetRole: 'admin',
      projectId: savedReport.projectId,
      senderId: savedReport.senderId,
      senderName: savedReport.senderName,
      linkTab: 'reports'
    });

    this.recordActivityLog({
      entityType: 'report',
      action: wasUpdate ? 'report_updated' : 'report_created',
      entityId: savedReport.id,
      entityTitle: `تقرير يومي (${savedReport.reportDate})`,
      projectId: savedReport.projectId,
      projectName: savedReport.projectName,
      summary: wasUpdate
        ? `تم تحديث التقرير اليومي بعدد ${savedReport.submittedWorks.length} تقديمات و${savedReport.receivedWorks.length} استلامات.`
        : `تم تقديم تقرير يومي جديد بعدد ${savedReport.submittedWorks.length} تقديمات و${savedReport.receivedWorks.length} استلامات.`,
      details: savedReport.notes ? `ملاحظات التقرير: ${savedReport.notes}` : undefined
    });

    this.notify();
    return savedReport;
  }

  public async updateDailyReport(
    reportId: string,
    updates: Partial<
      Pick<
        DailyReport,
        | 'projectId'
        | 'projectName'
        | 'reportDate'
        | 'submittedWorks'
        | 'receivedWorks'
        | 'notes'
        | 'attachments'
      >
    >,
    pendingNewAttachments: PreparedReportAttachment[] = [],
    onProgress?: (progress: ReportUploadProgress) => void
  ): Promise<boolean> {
    assertFirestoreWriteAvailable();
    const reports = this.getReports();
    const idx = reports.findIndex((r) => r.id === reportId);
    if (idx === -1) return false;

    const existing = reports[idx];
    const updatedAt = new Date().toISOString();
    const nextProjectId = updates.projectId ?? existing.projectId;
    const nextProjectName = (updates.projectName ?? existing.projectName).trim().slice(0, 200);
    const nextReportDate = (updates.reportDate ?? existing.reportDate).trim().slice(0, 20);

    const conflictingReport = reports.find(
      (r) => r.id !== reportId && r.projectId === nextProjectId && r.reportDate === nextReportDate
    );
    if (conflictingReport) {
      throw new Error('DAILY_REPORT_ALREADY_EXISTS');
    }

    const baseKeptAttachments = (updates.attachments ?? existing.attachments ?? []).map((att) =>
      stripUndefined({
        id: att.id,
        name: att.name,
        url: att.url,
        size: att.size,
        type: att.type,
        chunkCount: att.chunkCount,
        storageMode: att.storageMode,
        uploadedAt: att.uploadedAt
      })
    );

    if (baseKeptAttachments.length + pendingNewAttachments.length > MAX_REPORT_ATTACHMENTS) {
      throw new Error(`الحد الأقصى للمرفقات في التقرير الواحد هو ${MAX_REPORT_ATTACHMENTS} ملفات.`);
    }

    const preparedChunked = pendingNewAttachments.map((item) => {
      if (item.size <= 0 || item.size > MAX_REPORT_ATTACHMENT_SIZE_BYTES) {
        throw new Error(`حجم المرفق «${item.name}» يتجاوز الحد الأقصى المسموح (5 ميجابايت).`);
      }
      const chunks = splitBase64IntoChunks(item.base64, REPORT_ATTACHMENT_CHUNK_SIZE_CHARS);
      if (chunks.length === 0 || chunks.length >= 20) {
        throw new Error(`تعذر تجهيز المرفق «${item.name}» للرفع.`);
      }
      return { item, chunks };
    });

    let writtenChunkIds: string[] = [];
    if (preparedChunked.length > 0) {
      const totalBytes = preparedChunked.reduce((sum, entry) => sum + entry.item.size, 0);
      const totalChunks = preparedChunked.reduce((sum, entry) => sum + entry.chunks.length, 0);
      onProgress?.({
        percent: 10,
        currentFileIndex: 1,
        totalFiles: preparedChunked.length,
        currentFileName: preparedChunked[0].item.name,
        uploadedChunks: 0,
        totalChunks,
        uploadedBytes: 0,
        totalBytes,
        stage: 'uploading'
      });

      try {
        writtenChunkIds = await this.uploadReportAttachmentChunks(
          reportId,
          preparedChunked,
          onProgress
        );
      } catch (error) {
        await this.deleteChunksByIds(reportId, writtenChunkIds);
        handleFirestoreError(error, OperationType.CREATE, `reports/${reportId}/chunks`);
      }
    }

    const newlyUploadedMeta: ReportAttachment[] = preparedChunked.map(({ item, chunks }) => ({
      id: item.attachmentId,
      name: item.name,
      url: 'firestore://chunked',
      size: item.size,
      type: item.type,
      chunkCount: chunks.length,
      storageMode: 'firestore_chunks',
      uploadedAt: updatedAt
    }));

    const sanitizeRows = (rows: DailyReport['submittedWorks']) =>
      (Array.isArray(rows) ? rows : []).slice(0, 200).map((item, rIdx) =>
        stripUndefined({
          id: (item.id || `row-${rIdx + 1}`).slice(0, 128),
          rowNumber: rIdx + 1,
          itemDescription: (item.itemDescription || '').trim().slice(0, 1000),
          submittalNumber: (item.submittalNumber || '').trim().slice(0, 120),
          rev: Number.isFinite(Number(item.rev)) ? Number(item.rev) : 0,
          status: item.status
        })
      );

    const nextSubmittedWorks = sanitizeRows(updates.submittedWorks ?? existing.submittedWorks);
    const nextReceivedWorks = sanitizeRows(updates.receivedWorks ?? existing.receivedWorks);
    const nextNotes = (updates.notes !== undefined ? updates.notes : existing.notes || '')
      .trim()
      .slice(0, 4000);
    const nextAttachments = [...baseKeptAttachments, ...newlyUploadedMeta].slice(
      0,
      MAX_REPORT_ATTACHMENTS
    );

    const updatedReport: DailyReport = stripUndefined({
      ...existing,
      projectId: nextProjectId,
      projectName: nextProjectName,
      reportDate: nextReportDate,
      submittedWorks: nextSubmittedWorks,
      receivedWorks: nextReceivedWorks,
      notes: nextNotes || undefined,
      attachments: nextAttachments,
      status: 'submitted',
      updatedAt
    });

    const reportRef = doc(db, 'reports', reportId);
    const updatePayload = stripUndefined({
      projectId: nextProjectId,
      projectName: nextProjectName,
      reportDate: nextReportDate,
      submittedWorks: nextSubmittedWorks,
      receivedWorks: nextReceivedWorks,
      notes: nextNotes,
      attachments: nextAttachments,
      status: 'submitted' as const,
      updatedAt
    });

    let savedReportId = reportId;
    try {
      await updateDoc(reportRef, updatePayload);
    } catch (error) {
      const errCode = (error as { code?: string })?.code || '';
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errCode === 'not-found' || errMsg.includes('No document to update')) {
        const currentUser = this.getCurrentUser();
        const fallbackSenderId = (auth.currentUser?.uid || existing.senderId || currentUser?.id || '').slice(0, 128);
        const fallbackSenderEmail = normalizeEmail(
          existing.senderEmail || currentUser?.email || auth.currentUser?.email
        ).slice(0, 200);
        const fallbackSenderName = (
          existing.senderName ||
          currentUser?.displayName ||
          auth.currentUser?.displayName ||
          'مستخدم'
        )
          .trim()
          .slice(0, 150);

        const canonicalCandidate = `rep-${nextProjectId}-${nextReportDate}`;
        const targetId =
          canonicalCandidate.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(canonicalCandidate)
            ? canonicalCandidate
            : reportId;
        savedReportId = targetId;

        try {
          const sanitizedAdminFeedback =
            typeof existing.adminFeedback === 'string' && existing.adminFeedback.trim()
              ? existing.adminFeedback.trim().slice(0, 2000)
              : undefined;
          await setDoc(
            doc(db, 'reports', targetId),
            stripUndefined({
              id: targetId,
              projectId: nextProjectId,
              projectName: nextProjectName,
              reportDate: nextReportDate,
              senderId: fallbackSenderId,
              senderName: fallbackSenderName,
              senderEmail: fallbackSenderEmail,
              originalSenderName: existing.originalSenderName || fallbackSenderName,
              originalSenderEmail: existing.originalSenderEmail || fallbackSenderEmail,
              submittedWorks: nextSubmittedWorks,
              receivedWorks: nextReceivedWorks,
              notes: nextNotes || undefined,
              attachments: nextAttachments,
              status: 'submitted' as const,
              adminFeedback: sanitizedAdminFeedback,
              createdAt: existing.createdAt || updatedAt,
              updatedAt
            })
          );
        } catch (createError) {
          if (writtenChunkIds.length > 0) {
            await this.deleteChunksByIds(reportId, writtenChunkIds);
          }
          handleFirestoreError(createError, OperationType.CREATE, `reports/${targetId}`);
        }
      } else {
        if (writtenChunkIds.length > 0) {
          await this.deleteChunksByIds(reportId, writtenChunkIds);
        }
        handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
      }
    }

    // Delete orphaned chunks for any chunked attachment removed by the user
    const keptIds = new Set(nextAttachments.map((a) => a.id).filter(Boolean));
    const removedChunkedIds = (existing.attachments || [])
      .filter((a) => a.storageMode === 'firestore_chunks' && a.id && !keptIds.has(a.id))
      .map((a) => a.id!);
    if (removedChunkedIds.length > 0) {
      Promise.allSettled(
        removedChunkedIds.map((attId) => this.deleteReportAttachmentChunks(reportId, attId))
      ).catch(() => undefined);
    }

    if (preparedChunked.length > 0) {
      const totalBytes = preparedChunked.reduce((sum, entry) => sum + entry.item.size, 0);
      const totalChunks = preparedChunked.reduce((sum, entry) => sum + entry.chunks.length, 0);
      onProgress?.({
        percent: 100,
        currentFileIndex: preparedChunked.length,
        totalFiles: preparedChunked.length,
        currentFileName: preparedChunked[preparedChunked.length - 1].item.name,
        uploadedChunks: totalChunks,
        totalChunks,
        uploadedBytes: totalBytes,
        totalBytes,
        stage: 'finalizing'
      });
    }

    reports[idx] = { ...updatedReport, id: savedReportId };
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

    const activeUser = this.getCurrentUser();
    this.addNotification({
      title: `تعديل تقرير يومي: ${updatedReport.projectName}`,
      message: `قام ${activeUser?.displayName || updatedReport.senderName} بتعديل التقرير اليومي (${updatedReport.reportDate}) — ${updatedReport.submittedWorks.length} تقديمات و ${updatedReport.receivedWorks.length} استلامات.`,
      type: 'report_submitted',
      targetRole: 'admin',
      projectId: updatedReport.projectId,
      senderId: activeUser?.id || updatedReport.senderId,
      senderName: activeUser?.displayName || updatedReport.senderName,
      linkTab: 'reports'
    });

    const reportChanges: string[] = [];
    if (existing.reportDate !== updatedReport.reportDate) {
      reportChanges.push(`تاريخ التقرير: ${existing.reportDate} ← ${updatedReport.reportDate}`);
    }
    if (existing.submittedWorks.length !== updatedReport.submittedWorks.length) {
      reportChanges.push(
        `التقديمات: ${existing.submittedWorks.length} ← ${updatedReport.submittedWorks.length}`
      );
    }
    if (existing.receivedWorks.length !== updatedReport.receivedWorks.length) {
      reportChanges.push(
        `الاستلامات: ${existing.receivedWorks.length} ← ${updatedReport.receivedWorks.length}`
      );
    }
    if ((existing.notes || '') !== (updatedReport.notes || '')) {
      reportChanges.push('تم تحديث الملاحظات');
    }
    if ((existing.attachments?.length || 0) !== (updatedReport.attachments?.length || 0)) {
      reportChanges.push(
        `المرفقات: ${existing.attachments?.length || 0} ← ${updatedReport.attachments?.length || 0}`
      );
    }

    this.recordActivityLog({
      entityType: 'report',
      action: 'report_updated',
      entityId: savedReportId,
      entityTitle: `تقرير يومي (${updatedReport.reportDate})`,
      projectId: updatedReport.projectId,
      projectName: updatedReport.projectName,
      summary: `تم تعديل التقرير اليومي (${updatedReport.submittedWorks.length} تقديمات و${updatedReport.receivedWorks.length} استلامات).`,
      details: reportChanges.length > 0 ? reportChanges.join(' | ') : undefined
    });

    this.notify();
    return true;
  }

  public async fetchReportAttachmentUrl(
    reportId: string,
    attachment: ReportAttachment
  ): Promise<string> {
    return reportsDomain.fetchReportAttachmentUrl(reportId, attachment);
  }

  public async updateReportStatus(
    reportId: string,
    status: DailyReport['status'],
    adminFeedback?: string
  ): Promise<boolean> {
    assertFirestoreWriteAvailable();
    const reports = this.getReports();
    const index = reports.findIndex((r) => r.id === reportId);
    if (index === -1) return false;

    const updatedAt = new Date().toISOString();
    const rawFeedback = adminFeedback !== undefined ? adminFeedback : reports[index].adminFeedback;
    const nextFeedback =
      rawFeedback !== undefined ? String(rawFeedback).trim().slice(0, 2000) : undefined;

    try {
      await updateDoc(
        doc(db, 'reports', reportId),
        stripUndefined({
          status,
          adminFeedback: nextFeedback,
          updatedAt
        })
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
    }

    const statusArMap: Record<DailyReport['status'], string> = {
      submitted: 'قيد المراجعة',
      reviewed: 'تمت المراجعة والاعتماد',
      needs_revision: 'مطلوب تعديل'
    };
    const prevStatusAr = statusArMap[reports[index].status] || reports[index].status;
    const nextStatusAr = statusArMap[status] || status;

    reports[index] = stripUndefined({
      ...reports[index],
      status,
      adminFeedback: nextFeedback,
      updatedAt
    });
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

    const adminUser = this.getCurrentUser();
    const recipientUserId = this.resolveRecipientUserId(
      reports[index].senderId,
      reports[index].senderEmail
    );
    this.addNotification({
      title: `مراجعة تقرير: ${reports[index].projectName}`,
      message: `تم تحديث حالة التقرير (${reports[index].reportDate}) إلى "${nextStatusAr}"${nextFeedback ? ` مع ملاحظات: ${nextFeedback}` : ''}`,
      type: 'report_reviewed',
      targetRole: 'site',
      targetUserId: recipientUserId,
      projectId: reports[index].projectId,
      senderId: adminUser?.id,
      senderName: adminUser?.displayName,
      linkTab: 'my-submissions'
    });

    this.recordActivityLog({
      entityType: 'report',
      action: 'report_reviewed',
      entityId: reports[index].id,
      entityTitle: `تقرير يومي (${reports[index].reportDate})`,
      projectId: reports[index].projectId,
      projectName: reports[index].projectName,
      summary: `تم تحديث حالة مراجعة التقرير من «${prevStatusAr}» إلى «${nextStatusAr}».`,
      details: nextFeedback ? `ملاحظات المسؤول: ${nextFeedback}` : undefined
    });

    this.notify();
    return true;
  }

  public async deleteDailyReport(reportId: string): Promise<boolean> {
    assertFirestoreWriteAvailable();
    const activeUser = this.getCurrentUser();
    const isAdminUser =
      activeUser?.role === 'admin' ||
      isSuperAdminEmail(auth.currentUser?.email || activeUser?.email);

    if (!isAdminUser) {
      throw new Error('صلاحية حذف التقارير اليومية متاحة لمسؤول النظام (الأدمن) فقط.');
    }

    const reports = this.getReports();
    const targetReport = reports.find((r) => r.id === reportId);
    if (!targetReport) return false;

    // Clean up any chunked attachment payloads stored under reports/{reportId}/chunks
    try {
      const chunksRef = collection(db, 'reports', reportId, 'chunks');
      const chunkSnap = await getDocs(chunksRef);
      if (!chunkSnap.empty) {
        const docs = chunkSnap.docs;
        for (let i = 0; i < docs.length; i += 400) {
          const batch = writeBatch(db);
          docs.slice(i, i + 400).forEach((chunkDoc) => {
            batch.delete(doc(db, 'reports', reportId, 'chunks', chunkDoc.id));
          });
          await batch.commit();
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `reports/${reportId}/chunks`);
    }

    // Revoke any cached blob URLs for this report's attachments
    (targetReport.attachments || []).forEach((att) => {
      if (att.id) {
        revokePdfBlobUrl(`report-${reportId}-${att.id}`);
      }
    });

    try {
      await deleteDoc(doc(db, 'reports', reportId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `reports/${reportId}`);
    }

    const remaining = reports.filter((r) => r.id !== reportId);
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(remaining));

    this.recordActivityLog({
      entityType: 'report',
      action: 'report_deleted',
      entityId: targetReport.id,
      entityTitle: `تقرير يومي (${targetReport.reportDate})`,
      projectId: targetReport.projectId,
      projectName: targetReport.projectName,
      summary: `تم حذف التقرير اليومي لمشروع ${targetReport.projectName} بتاريخ ${targetReport.reportDate}.`,
      details: `المرسل: ${targetReport.senderName} | التقديمات: ${targetReport.submittedWorks.length} | الاستلامات: ${targetReport.receivedWorks.length}`
    });

    this.notify();
    return true;
  }

  // Local Autosave Draft
  public saveReportDraft(projectId: string, draftData: Partial<DailyReport>) {
    reportsDomain.saveReportDraft(projectId, draftData);
  }

  public getReportDraft(projectId: string): { data: Partial<DailyReport>; savedAt: string } | null {
    return reportsDomain.getReportDraft(projectId);
  }

  public clearReportDraft(projectId: string) {
    reportsDomain.clearReportDraft(projectId);
  }

  // --- Issues ---
  public getIssues(): IssueReport[] {
    return issuesDomain.getIssues();
  }

  public async addIssue(
    issue: Omit<IssueReport, 'id' | 'issueNumber' | 'createdAt' | 'updatedAt' | 'status'>
  ): Promise<IssueReport> {
    return issuesDomain.addIssue(issue, {
      addNotification: (notif) => this.addNotification(notif),
      notify: () => this.notify()
    });
  }

  public async updateIssue(
    issueId: string,
    updates: Partial<Pick<IssueReport, 'status' | 'adminComment' | 'resolvedAt'>>
  ): Promise<boolean> {
    return issuesDomain.updateIssue(issueId, updates, () => this.notify());
  }

  // --- Tasks ---
  private getTasksRaw(): ProjectTask[] {
    return tasksDomain.getTasksRaw();
  }

  public getTasks(): ProjectTask[] {
    return tasksDomain.getTasks();
  }

  public async cleanupExpiredTaskAttachments(candidateTasks?: ProjectTask[]): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;
    const activeUser = this.getCurrentUser();
    if (!activeUser) return;
    const isAdmin = activeUser.role === 'admin' || isSuperAdminEmail(activeUser.email);
    const sourceTasks = candidateTasks ?? this.getTasksRaw();
    const nowMs = Date.now();

    const hasAnyExpired = sourceTasks.some((t) =>
      (t.attachments || []).some((att) => isTaskAttachmentExpired(att, nowMs))
    );
    if (!hasAnyExpired) return;

    const updatedMap = await purgeExpiredTaskAttachmentsFromFirebase(sourceTasks, isAdmin);
    const currentRaw = this.getTasksRaw();
    let changed = false;
    const nextTasks = currentRaw.map((t) => {
      if (updatedMap[t.id]) {
        changed = true;
        return { ...t, attachments: updatedMap[t.id] };
      }
      if (t.attachments && t.attachments.some((att) => isTaskAttachmentExpired(att, nowMs))) {
        changed = true;
        return {
          ...t,
          attachments: t.attachments.filter((att) => !isTaskAttachmentExpired(att, nowMs))
        };
      }
      return t;
    });

    if (changed) {
      localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(nextTasks));
      this.notify();
    }
  }

  private async uploadTaskAttachmentChunks(
    taskId: string,
    preparedFiles: { item: PreparedTaskAttachment; chunks: string[]; expiresAtMs: number }[],
    onProgress?: (progress: TaskUploadProgress) => void
  ): Promise<string[]> {
    return tasksDomain.uploadTaskAttachmentChunks(taskId, preparedFiles, onProgress);
  }

  private async deleteTaskChunksByIds(taskId: string, chunkIds: string[]) {
    return tasksDomain.deleteTaskChunksByIds(taskId, chunkIds);
  }

  public async addTask(
    task: Omit<ProjectTask, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'attachments'>,
    pendingAttachments: PreparedTaskAttachment[] = [],
    onProgress?: (progress: TaskUploadProgress) => void
  ): Promise<ProjectTask> {
    assertFirestoreWriteAvailable();
    if (pendingAttachments.length > MAX_TASK_ATTACHMENTS) {
      throw new Error(`الحد الأقصى للمرفقات في المهمة الواحدة هو ${MAX_TASK_ATTACHMENTS} ملفات.`);
    }

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const expiresAtMs = nowMs + TASK_ATTACHMENT_RETENTION_MS;
    const expiresAt = new Date(expiresAtMs).toISOString();
    const uploaderId = auth.currentUser?.uid || task.createdBy;

    const preparedChunked = pendingAttachments.map((item) => {
      if (item.fileSizeBytes <= 0 || item.fileSizeBytes > MAX_TASK_ATTACHMENT_SIZE_BYTES) {
        throw new Error(`حجم الملف «${item.name}» يتجاوز الحد الأقصى المسموح (25 ميجابايت).`);
      }
      const chunks = splitBase64IntoChunks(item.base64, TASK_ATTACHMENT_CHUNK_SIZE_CHARS);
      if (chunks.length === 0 || chunks.length >= 60) {
        throw new Error(`تعذر تجهيز المرفق «${item.name}» للرفع.`);
      }
      return { item, chunks, expiresAtMs };
    });

    const attachmentsMeta: TaskAttachment[] = preparedChunked.map(({ item, chunks }) =>
      stripUndefined({
        id: item.attachmentId,
        name: item.name,
        fileFormat: item.fileFormat,
        mimeType: item.mimeType,
        fileSizeBytes: item.fileSizeBytes,
        chunkCount: chunks.length,
        pageCount: item.pageCount,
        uploadedBy: uploaderId,
        createdAt: now,
        expiresAt,
        expiresAtMs
      })
    );

    const newTask: ProjectTask = stripUndefined({
      ...task,
      createdBy: uploaderId,
      id: 'task-' + nowMs.toString(36) + '-' + Math.random().toString(36).substring(2, 5),
      status: 'pending',
      ...(attachmentsMeta.length > 0 ? { attachments: attachmentsMeta } : {}),
      createdAt: now,
      updatedAt: now
    });

    const totalBytes = preparedChunked.reduce((sum, entry) => sum + entry.item.fileSizeBytes, 0);
    const totalChunks = preparedChunked.reduce((sum, entry) => sum + entry.chunks.length, 0);
    if (preparedChunked.length > 0) {
      onProgress?.({
        percent: 8,
        currentFileIndex: 1,
        totalFiles: preparedChunked.length,
        currentFileName: preparedChunked[0].item.name,
        uploadedChunks: 0,
        totalChunks,
        uploadedBytes: 0,
        totalBytes,
        stage: 'metadata'
      });
    }

    try {
      await setDoc(doc(db, 'tasks', newTask.id), stripUndefined(newTask));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `tasks/${newTask.id}`);
    }

    if (preparedChunked.length > 0) {
      let writtenIds: string[] = [];
      try {
        writtenIds = await this.uploadTaskAttachmentChunks(newTask.id, preparedChunked, onProgress);
      } catch (error) {
        await this.deleteTaskChunksByIds(newTask.id, writtenIds);
        await deleteDoc(doc(db, 'tasks', newTask.id)).catch(() => undefined);
        handleFirestoreError(error, OperationType.CREATE, `tasks/${newTask.id}/chunks`);
      }

      onProgress?.({
        percent: 100,
        currentFileIndex: preparedChunked.length,
        totalFiles: preparedChunked.length,
        currentFileName: preparedChunked[preparedChunked.length - 1].item.name,
        uploadedChunks: totalChunks,
        totalChunks,
        uploadedBytes: totalBytes,
        totalBytes,
        stage: 'finalizing'
      });
    }

    const tasks = this.getTasksRaw();
    tasks.unshift(newTask);
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));

    const adminUser = this.getCurrentUser();
    const attachNote =
      attachmentsMeta.length > 0
        ? ` مع ${attachmentsMeta.length} مرفق${attachmentsMeta.length > 1 ? 'ات' : ''} (متاحة 48 ساعة)`
        : '';
    this.addNotification({
      title:
        newTask.priority === 'urgent'
          ? `مهمة عاجلة: ${newTask.title}`
          : `مهمة جديدة: ${newTask.title}`,
      message: `تم إسناد مهمة ${newTask.priority === 'urgent' ? 'عاجلة ' : 'جديدة '}لمشروع ${newTask.projectName}${attachNote}، موعد التسليم: ${newTask.deadline}`,
      type: 'task_assigned',
      priority: newTask.priority,
      targetRole: 'site',
      projectId: newTask.projectId,
      senderId: adminUser?.id || newTask.createdBy,
      senderName: adminUser?.displayName,
      linkTab: 'my-tasks'
    });

    this.recordActivityLog({
      entityType: 'task',
      action: 'task_created',
      entityId: newTask.id,
      entityTitle: newTask.title,
      projectId: newTask.projectId,
      projectName: newTask.projectName,
      summary: `تم إنشاء مهمة ${newTask.priority === 'urgent' ? 'عاجلة' : 'جديدة'} بموعد تسليم ${newTask.deadline}.`,
      details: newTask.description ? newTask.description : undefined
    });

    this.notify();
    return newTask;
  }

  public async updateTask(
    taskId: string,
    updates: Partial<
      Pick<
        ProjectTask,
        | 'projectId'
        | 'projectName'
        | 'title'
        | 'description'
        | 'deadline'
        | 'priority'
        | 'status'
        | 'attachments'
      >
    >,
    pendingNewAttachments: PreparedTaskAttachment[] = [],
    onProgress?: (progress: TaskUploadProgress) => void
  ): Promise<boolean> {
    assertFirestoreWriteAvailable();
    const tasks = this.getTasksRaw();
    const idx = tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return false;

    const existing = tasks[idx];
    const nowMs = Date.now();
    const updatedAt = new Date(nowMs).toISOString();
    const expiresAtMs = nowMs + TASK_ATTACHMENT_RETENTION_MS;
    const expiresAt = new Date(expiresAtMs).toISOString();

    const nextProjectId = updates.projectId ?? existing.projectId;
    const nextProjectName = (updates.projectName ?? existing.projectName).trim().slice(0, 200);
    const nextTitle = (updates.title ?? existing.title).trim().slice(0, 300);
    const nextDescription = (updates.description ?? existing.description).trim().slice(0, 4000);
    const nextDeadline = (updates.deadline ?? existing.deadline).trim().slice(0, 20);
    const nextPriority = updates.priority ?? existing.priority;
    const nextStatus = updates.status ?? existing.status;

    if (!nextTitle) return false;

    const keptAttachments = (updates.attachments ?? existing.attachments ?? []).filter(
      (att) => !isTaskAttachmentExpired(att, nowMs)
    );

    if (keptAttachments.length + pendingNewAttachments.length > MAX_TASK_ATTACHMENTS) {
      throw new Error(`الحد الأقصى للمرفقات في المهمة الواحدة هو ${MAX_TASK_ATTACHMENTS} ملفات.`);
    }

    const preparedChunked = pendingNewAttachments.map((item) => {
      if (item.fileSizeBytes <= 0 || item.fileSizeBytes > MAX_TASK_ATTACHMENT_SIZE_BYTES) {
        throw new Error(`حجم الملف «${item.name}» يتجاوز الحد الأقصى المسموح (25 ميجابايت).`);
      }
      const chunks = splitBase64IntoChunks(item.base64, TASK_ATTACHMENT_CHUNK_SIZE_CHARS);
      if (chunks.length === 0 || chunks.length >= 60) {
        throw new Error(`تعذر تجهيز المرفق «${item.name}» للرفع.`);
      }
      return { item, chunks, expiresAtMs };
    });

    let writtenChunkIds: string[] = [];
    if (preparedChunked.length > 0) {
      const totalBytes = preparedChunked.reduce((sum, entry) => sum + entry.item.fileSizeBytes, 0);
      const totalChunks = preparedChunked.reduce((sum, entry) => sum + entry.chunks.length, 0);
      onProgress?.({
        percent: 10,
        currentFileIndex: 1,
        totalFiles: preparedChunked.length,
        currentFileName: preparedChunked[0].item.name,
        uploadedChunks: 0,
        totalChunks,
        uploadedBytes: 0,
        totalBytes,
        stage: 'uploading'
      });

      try {
        writtenChunkIds = await this.uploadTaskAttachmentChunks(taskId, preparedChunked, onProgress);
      } catch (error) {
        await this.deleteTaskChunksByIds(taskId, writtenChunkIds);
        handleFirestoreError(error, OperationType.CREATE, `tasks/${taskId}/chunks`);
      }
    }

    const uploaderId = auth.currentUser?.uid || existing.createdBy;
    const newlyUploadedMeta: TaskAttachment[] = preparedChunked.map(({ item, chunks }) =>
      stripUndefined({
        id: item.attachmentId,
        name: item.name,
        fileFormat: item.fileFormat,
        mimeType: item.mimeType,
        fileSizeBytes: item.fileSizeBytes,
        chunkCount: chunks.length,
        pageCount: item.pageCount,
        uploadedBy: uploaderId,
        createdAt: updatedAt,
        expiresAt,
        expiresAtMs
      })
    );

    const nextAttachments = [...keptAttachments, ...newlyUploadedMeta].slice(
      0,
      MAX_TASK_ATTACHMENTS
    );

    const updatedTask: ProjectTask = stripUndefined({
      ...existing,
      projectId: nextProjectId,
      projectName: nextProjectName,
      title: nextTitle,
      description: nextDescription,
      deadline: nextDeadline,
      priority: nextPriority,
      status: nextStatus,
      attachments: nextAttachments,
      updatedAt
    });

    try {
      await updateDoc(
        doc(db, 'tasks', taskId),
        stripUndefined({
          projectId: nextProjectId,
          projectName: nextProjectName,
          title: nextTitle,
          description: nextDescription,
          deadline: nextDeadline,
          priority: nextPriority,
          status: nextStatus,
          attachments: nextAttachments,
          updatedAt
        })
      );
    } catch (error) {
      if (writtenChunkIds.length > 0) {
        await this.deleteTaskChunksByIds(taskId, writtenChunkIds);
      }
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
    }

    // Delete orphaned chunks for any attachment removed by admin
    const keptIds = new Set(nextAttachments.map((a) => a.id));
    const removedAttachmentIds = (existing.attachments || [])
      .filter((a) => !keptIds.has(a.id))
      .map((a) => a.id);
    if (removedAttachmentIds.length > 0) {
      Promise.allSettled(
        removedAttachmentIds.map((attId) => deleteTaskAttachmentChunksFromFirebase(taskId, attId))
      ).catch(() => undefined);
    }

    if (preparedChunked.length > 0) {
      const totalBytes = preparedChunked.reduce((sum, entry) => sum + entry.item.fileSizeBytes, 0);
      const totalChunks = preparedChunked.reduce((sum, entry) => sum + entry.chunks.length, 0);
      onProgress?.({
        percent: 100,
        currentFileIndex: preparedChunked.length,
        totalFiles: preparedChunked.length,
        currentFileName: preparedChunked[preparedChunked.length - 1].item.name,
        uploadedChunks: totalChunks,
        totalChunks,
        uploadedBytes: totalBytes,
        totalBytes,
        stage: 'finalizing'
      });
    }

    tasks[idx] = updatedTask;
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));

    const adminUser = this.getCurrentUser();
    this.addNotification({
      title:
        nextPriority === 'urgent'
          ? `تحديث مهمة عاجلة: ${nextTitle}`
          : `تحديث مهمة: ${nextTitle}`,
      message: `قام ${adminUser?.displayName || 'مسؤول النظام'} بتحديث تفاصيل المهمة لمشروع ${nextProjectName} (موعد التسليم: ${nextDeadline}).`,
      type: 'task_assigned',
      priority: nextPriority,
      targetRole: 'site',
      projectId: nextProjectId,
      senderId: adminUser?.id || existing.createdBy,
      senderName: adminUser?.displayName,
      linkTab: 'my-tasks'
    });

    const taskStatusAr: Record<ProjectTask['status'], string> = {
      pending: 'معلقة',
      in_progress: 'قيد التنفيذ',
      done: 'مكتملة'
    };
    const taskDiffs: string[] = [];
    if (existing.status !== nextStatus) {
      taskDiffs.push(`الحالة: ${taskStatusAr[existing.status]} ← ${taskStatusAr[nextStatus]}`);
    }
    if (existing.deadline !== nextDeadline) {
      taskDiffs.push(`موعد التسليم: ${existing.deadline} ← ${nextDeadline}`);
    }
    if (existing.priority !== nextPriority) {
      taskDiffs.push(
        `الأولوية: ${existing.priority === 'urgent' ? 'عاجلة' : 'عادية'} ← ${nextPriority === 'urgent' ? 'عاجلة' : 'عادية'}`
      );
    }
    if (existing.title !== nextTitle) {
      taskDiffs.push(`العنوان: ${existing.title} ← ${nextTitle}`);
    }
    if (existing.description !== nextDescription) {
      taskDiffs.push('تم تحديث الوصف');
    }
    if (pendingNewAttachments.length > 0) {
      taskDiffs.push(`إضافة ${pendingNewAttachments.length} مرفق`);
    }

    this.recordActivityLog({
      entityType: 'task',
      action: 'task_updated',
      entityId: taskId,
      entityTitle: nextTitle,
      projectId: nextProjectId,
      projectName: nextProjectName,
      summary:
        taskDiffs.length > 0
          ? `تم تعديل المهمة (${taskDiffs.slice(0, 2).join('، ')}).`
          : `تم تحديث بيانات المهمة (موعد التسليم: ${nextDeadline}).`,
      details: taskDiffs.length > 0 ? taskDiffs.join(' | ') : undefined
    });

    this.notify();
    return true;
  }

  public async fetchTaskAttachmentUrl(
    taskId: string,
    attachment: TaskAttachment
  ): Promise<string> {
    return tasksDomain.fetchTaskAttachmentUrl(taskId, attachment, () =>
      this.cleanupExpiredTaskAttachments()
    );
  }

  public async deleteTask(taskId: string): Promise<boolean> {
    assertFirestoreWriteAvailable();
    const tasks = this.getTasksRaw();
    const targetTask = tasks.find((t) => t.id === taskId);
    if (!targetTask) return false;

    await deleteAllTaskChunksFromFirebase(taskId);

    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${taskId}`);
    }

    const remaining = tasks.filter((t) => t.id !== taskId);
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(remaining));

    this.recordActivityLog({
      entityType: 'task',
      action: 'task_deleted',
      entityId: targetTask.id,
      entityTitle: targetTask.title,
      projectId: targetTask.projectId,
      projectName: targetTask.projectName,
      summary: `تم حذف المهمة من مشروع ${targetTask.projectName}.`,
      details: `موعد التسليم السابق: ${targetTask.deadline}`
    });

    this.notify();
    return true;
  }

  public async completeTask(
    taskId: string,
    userId: string,
    proofNote: string,
    proofAttachment?: string
  ): Promise<boolean> {
    assertFirestoreWriteAvailable();
    const tasks = this.getTasks();
    const idx = tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return false;

    const now = new Date().toISOString();
    const patch = stripUndefined({
      status: 'done' as const,
      completedBy: userId,
      completedAt: now,
      proofNote,
      proofAttachment,
      updatedAt: now
    });

    try {
      await updateDoc(doc(db, 'tasks', taskId), patch);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
    }

    tasks[idx] = {
      ...tasks[idx],
      ...patch
    };
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));

    const activeUser = this.getCurrentUser();
    this.addNotification({
      title: `تم إنجاز مهمة: ${tasks[idx].title}`,
      message: `أنهى ${activeUser?.displayName || 'مهندس الموقع'} المهمة في مشروع ${tasks[idx].projectName}.`,
      type: 'task_done',
      priority: tasks[idx].priority,
      targetRole: 'admin',
      projectId: tasks[idx].projectId,
      senderId: userId,
      senderName: activeUser?.displayName,
      linkTab: 'tasks'
    });

    this.recordActivityLog({
      entityType: 'task',
      action: 'task_completed',
      entityId: tasks[idx].id,
      entityTitle: tasks[idx].title,
      projectId: tasks[idx].projectId,
      projectName: tasks[idx].projectName,
      summary: `تم إتمام المهمة وتحديث حالتها إلى «مكتملة».`,
      details: proofNote ? `ملاحظة الإنجاز: ${proofNote}` : undefined
    });

    this.notify();
    return true;
  }

  // --- Announcements ---
  public getAnnouncements(): Announcement[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ANNOUNCEMENTS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public async addAnnouncement(
    ann: Omit<Announcement, 'id' | 'createdAt' | 'readBy'>
  ): Promise<Announcement> {
    assertFirestoreWriteAvailable();
    const items = this.getAnnouncements();
    const newAnn: Announcement = stripUndefined({
      ...ann,
      id: 'ann-' + Date.now().toString(36),
      readBy: [],
      createdAt: new Date().toISOString()
    });

    try {
      await setDoc(doc(db, 'announcements', newAnn.id), stripUndefined(newAnn));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `announcements/${newAnn.id}`);
    }

    items.unshift(newAnn);
    localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(items));

    this.addNotification({
      title: newAnn.isUrgent
        ? `تعميم إداري عاجل: ${newAnn.title}`
        : `تعميم إداري: ${newAnn.title}`,
      message: newAnn.content.slice(0, 90) + '...',
      type: 'announcement',
      priority: newAnn.isUrgent ? 'urgent' : 'normal',
      targetRole: 'all',
      projectId: newAnn.targetProjects.length === 1 ? newAnn.targetProjects[0] : undefined,
      senderId: newAnn.createdBy,
      senderName: newAnn.authorName,
      linkTab: 'announcements'
    });

    this.notify();
    return newAnn;
  }

  public markAnnouncementRead(announcementId: string, userId: string): boolean {
    const items = this.getAnnouncements();
    const idx = items.findIndex((a) => a.id === announcementId);
    if (idx === -1) return false;

    if (!items[idx].readBy.includes(userId)) {
      items[idx].readBy = [...items[idx].readBy, userId];
      safeStorage.setJson(STORAGE_KEYS.ANNOUNCEMENTS, items);

      if (!isFirestoreQuotaExhausted()) {
        updateDoc(doc(db, 'announcements', announcementId), {
          readBy: arrayUnion(userId)
        }).catch((error) => {
          if (getFirestoreErrorCode(error) === 'resource-exhausted') {
            markFirestoreQuotaExhausted();
          }
        });
      }

      this.notify();
    }
    return true;
  }

  // --- Users Management (Firebase Auth + Firestore) ---
  private getUsersContext(): usersDomain.UsersDomainContext {
    return {
      getCurrentUser: () => this.getCurrentUser(),
      setCurrentUser: (user) => this.setCurrentUser(user),
      getProjects: () => this.getProjects(),
      notify: () => this.notify()
    };
  }

  public getUsers(): UserProfile[] {
    return usersDomain.getUsers();
  }

  public async createUserWithAuth(payload: CreateUserPayload): Promise<UserProfile> {
    return usersDomain.createUserWithAuth(payload, this.getUsersContext());
  }

  public async updateUser(userId: string, updates: Partial<UserProfile>): Promise<boolean> {
    assertFirestoreWriteAvailable();
    const users = this.getUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return false;

    const target = users[idx];
    // Protect Super Admin from role downgrade or disablement & keep site deliverables upload enabled for all users
    const sanitizedUpdates = {
      ...updates,
      canAccessSiteDeliverables: true
    };
    if (isSuperAdminEmail(target.email)) {
      sanitizedUpdates.role = 'admin';
      sanitizedUpdates.status = 'active';
      sanitizedUpdates.allProjects = true;
      sanitizedUpdates.canAccessExecutedWorks = true;
      sanitizedUpdates.canAccessSiteDeliverables = true;
    }

    const updatedUser: UserProfile = normalizeUserProfile(
      {
        ...target,
        ...sanitizedUpdates,
        updatedAt: new Date().toISOString()
      },
      userId,
      target.email
    );

    users[idx] = updatedUser;
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));

    try {
      await setDoc(doc(db, 'users', userId), stripUndefined(updatedUser));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }

    const currentUser = this.getCurrentUser();
    if (currentUser && currentUser.id === userId) {
      this.setCurrentUser(updatedUser);
    }

    // Propagate user displayName/email to any historical reports & records that still carry an older value
    if (updates.displayName !== undefined || updates.email !== undefined) {
      await this.propagateUserIdentityToHistoricalRecords({
        userId: updatedUser.id,
        previousEmail: target.email,
        displayName: updatedUser.displayName,
        email: updatedUser.email,
        includeAnnouncements: updatedUser.role === 'admin'
      });
    }

    this.notify();
    return true;
  }

  public async deleteUser(userId: string): Promise<boolean> {
    return usersDomain.deleteUser(userId, this.getUsersContext());
  }

  public async updateMyNotificationPreferences(
    prefs: NotificationPreferences
  ): Promise<boolean> {
    return usersDomain.updateMyNotificationPreferences(prefs, this.getUsersContext());
  }

  public async updateMyProfile(updates: {
    displayName?: string;
    jobTitle?: string;
    phone?: string;
    photoUrl?: string | null;
    email?: string;
  }): Promise<UserProfile | null> {
    assertFirestoreWriteAvailable();
    const activeUser = this.getCurrentUser();
    if (!activeUser) return null;

    const updatedAt = new Date().toISOString();
    const firestorePatch: Record<string, string> = { updatedAt };
    const nextUserDraft: Partial<UserProfile> = {
      ...activeUser,
      updatedAt
    };

    if (updates.displayName !== undefined) {
      const cleanName = updates.displayName.trim().slice(0, 150);
      if (cleanName.length === 0) {
        throw new Error('يرجى إدخال الاسم الكامل.');
      }
      firestorePatch.displayName = cleanName;
      nextUserDraft.displayName = cleanName;
    }

    if (updates.jobTitle !== undefined) {
      const cleanJob = updates.jobTitle.trim().slice(0, 150);
      firestorePatch.jobTitle = cleanJob;
      nextUserDraft.jobTitle = cleanJob || undefined;
    }

    if (updates.phone !== undefined) {
      const cleanPhone = updates.phone.trim().slice(0, 40);
      firestorePatch.phone = cleanPhone;
      nextUserDraft.phone = cleanPhone || undefined;
    }

    if (updates.photoUrl !== undefined) {
      const cleanPhoto =
        updates.photoUrl === null ? '' : updates.photoUrl.trim().slice(0, 350000);
      firestorePatch.photoUrl = cleanPhoto;
      nextUserDraft.photoUrl = cleanPhoto || undefined;
    }

    if (updates.email !== undefined) {
      const isAdminActor = activeUser.role === 'admin' || isSuperAdminEmail(activeUser.email);
      if (!isAdminActor) {
        throw new Error('تعديل البريد الإلكتروني متاح لمسؤول النظام فقط.');
      }
      const cleanEmail = normalizeEmail(updates.email);
      if (cleanEmail.length >= 3 && cleanEmail.length <= 200) {
        if (!isSuperAdminEmail(activeUser.email) && isSuperAdminEmail(cleanEmail)) {
          throw new Error('لا يمكن استخدام هذا البريد الإلكتروني.');
        }
        firestorePatch.email = cleanEmail;
        nextUserDraft.email = cleanEmail;
      }
    }

    try {
      await updateDoc(doc(db, 'users', activeUser.id), firestorePatch);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${activeUser.id}`);
    }

    if (firestorePatch.displayName && firestorePatch.displayName !== activeUser.displayName) {
      await updateCurrentAuthDisplayName(firestorePatch.displayName).catch(() => undefined);
    }

    const updatedUser = normalizeUserProfile(
      nextUserDraft,
      activeUser.id,
      nextUserDraft.email || activeUser.email
    );
    this.upsertLocalUser(updatedUser);
    this.setCurrentUser(updatedUser);

    // Propagate displayName / email to any previous reports & submissions by this user that still carry an older name/email
    if (updates.displayName !== undefined || updates.email !== undefined) {
      await this.propagateUserIdentityToHistoricalRecords({
        userId: updatedUser.id,
        previousEmail: activeUser.email,
        displayName: updatedUser.displayName,
        email: updatedUser.email,
        includeAnnouncements: updatedUser.role === 'admin'
      });
    }

    this.notify();
    return updatedUser;
  }

  /**
   * Synchronizes a user's updated displayName (and email) across all historical
   * Daily Reports, Executed Works, Site Deliverables, Issue Reports, and Announcements
   * owned by that user in Firestore and local caches.
   */
  private getIdentitySyncDayStorageKey(date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `dc_identity_sync_${y}${m}${d}`;
  }

  private loadPersistedAutoSyncKeys(userId: string): Set<string> {
    const todayKey = this.getIdentitySyncDayStorageKey();
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        // Prune older daily identity sync keys
        for (let i = window.localStorage.length - 1; i >= 0; i--) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith('dc_identity_sync_') && k !== todayKey) {
            window.localStorage.removeItem(k);
          }
        }
        const raw = window.localStorage.getItem(todayKey);
        if (!raw) return new Set<string>();
        const parsed = JSON.parse(raw) as Record<string, string[]>;
        const list = parsed && Array.isArray(parsed[userId]) ? parsed[userId] : [];
        return new Set<string>(list);
      }
    } catch {
      // ignore storage errors
    }
    return new Set<string>();
  }

  private savePersistedAutoSyncKeys(userId: string, keys: Set<string>): void {
    const todayKey = this.getIdentitySyncDayStorageKey();
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        let parsed: Record<string, string[]> = {};
        const raw = window.localStorage.getItem(todayKey);
        if (raw) {
          const candidate = JSON.parse(raw);
          if (candidate && typeof candidate === 'object') {
            parsed = candidate as Record<string, string[]>;
          }
        }
        parsed[userId] = Array.from(keys).slice(-200);
        window.localStorage.setItem(todayKey, JSON.stringify(parsed));
      }
    } catch {
      // ignore storage errors
    }
  }

  private async commitIdentityPatchList(
    collectionName: string,
    entries: Array<{ id: string; patch: Record<string, string> }>
  ): Promise<number> {
    if (entries.length === 0 || isFirestoreQuotaExhausted()) return 0;
    let updatedCount = 0;

    for (const chunk of chunkArray(entries, 400)) {
      if (isFirestoreQuotaExhausted()) break;
      try {
        const batch = writeBatch(db);
        chunk.forEach(({ id, patch }) => {
          batch.update(doc(db, collectionName, id), patch);
        });
        await batch.commit();
        updatedCount += chunk.length;
      } catch (error) {
        if (getFirestoreErrorCode(error) === 'resource-exhausted') {
          markFirestoreQuotaExhausted();
          break;
        }
        // Fallback per-document so a single legacy or out-of-scope doc never blocks other updates
        for (const { id, patch } of chunk) {
          if (isFirestoreQuotaExhausted()) break;
          try {
            await updateDoc(doc(db, collectionName, id), patch);
            updatedCount += 1;
          } catch (docError) {
            if (getFirestoreErrorCode(docError) === 'resource-exhausted') {
              markFirestoreQuotaExhausted();
              break;
            }
            // Skip individual doc if not writable under current rules
          }
        }
      }
    }

    return updatedCount;
  }

  private async propagateUserIdentityToHistoricalRecords(params: {
    userId: string;
    previousEmail?: string;
    displayName: string;
    email?: string;
    includeAnnouncements?: boolean;
    maxDocs?: number;
  }): Promise<HistoricalSyncSummary> {
    const { userId, displayName, includeAnnouncements } = params;
    let remainingDocs =
      typeof params.maxDocs === 'number' && Number.isFinite(params.maxDocs)
        ? Math.max(0, Math.floor(params.maxDocs))
        : Number.POSITIVE_INFINITY;
    const prevEmail = normalizeEmail(params.previousEmail);
    const nextEmail = normalizeEmail(params.email);
    const now = new Date().toISOString();

    const summary: HistoricalSyncSummary = {
      totalUpdated: 0,
      reportsUpdated: 0,
      executedWorksUpdated: 0,
      deliverablesUpdated: 0,
      issuesUpdated: 0,
      announcementsUpdated: 0
    };

    const activeActor = this.getCurrentUser();
    const isAdminActor =
      activeActor?.role === 'admin' || isSuperAdminEmail(activeActor?.email || auth.currentUser?.email);

    const isMatchingSender = (
      senderId?: string,
      senderEmail?: string,
      originalSenderEmail?: string
    ) => {
      if (senderId && senderId === userId) return true;
      // Non-admins strictly rely on senderId == uid (matching hardened firestore.rules)
      if (!isAdminActor) return false;
      const clean = normalizeEmail(senderEmail);
      const cleanOrig = normalizeEmail(originalSenderEmail);
      return Boolean(
        (clean && ((prevEmail && clean === prevEmail) || (nextEmail && clean === nextEmail))) ||
          (cleanOrig &&
            ((prevEmail && cleanOrig === prevEmail) || (nextEmail && cleanOrig === nextEmail)))
      );
    };

    // 1. Daily Reports (`reports`) — preserves immutable originalSenderName / originalSenderEmail
    const reports = this.getReports();
    const reportEntries: Array<{ id: string; patch: Record<string, string> }> = [];
    const updatedReports = reports.map((rep) => {
      if (!isMatchingSender(rep.senderId, rep.senderEmail, rep.originalSenderEmail)) return rep;
      const needsName = rep.senderName !== displayName;
      const needsEmail = Boolean(nextEmail && normalizeEmail(rep.senderEmail) !== nextEmail);
      if (!needsName && !needsEmail) return rep;

      const preservedOriginalName = rep.originalSenderName || rep.senderName || displayName;
      const preservedOriginalEmail = rep.originalSenderEmail || rep.senderEmail || nextEmail;

      const patch: Record<string, string> = {
        senderName: displayName,
        identitySyncedAt: now,
        updatedAt: now
      };
      if (!rep.originalSenderName && rep.senderName) {
        patch.originalSenderName = rep.senderName;
      }
      if (!rep.originalSenderEmail && rep.senderEmail) {
        patch.originalSenderEmail = rep.senderEmail;
      }
      if (needsEmail) {
        patch.senderEmail = nextEmail;
      }

      reportEntries.push({ id: rep.id, patch });
      return {
        ...rep,
        senderName: displayName,
        senderEmail: needsEmail ? nextEmail : rep.senderEmail,
        originalSenderName: preservedOriginalName,
        originalSenderEmail: preservedOriginalEmail,
        identitySyncedAt: now,
        updatedAt: now
      };
    });
    if (reportEntries.length > 0 && remainingDocs > 0 && !isFirestoreQuotaExhausted()) {
      const capped = Number.isFinite(remainingDocs)
        ? reportEntries.slice(0, remainingDocs)
        : reportEntries;
      localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(updatedReports));
      summary.reportsUpdated = await this.commitIdentityPatchList('reports', capped);
      summary.totalUpdated += summary.reportsUpdated;
      remainingDocs = Math.max(0, remainingDocs - capped.length);
    }

    if (remainingDocs <= 0 || isFirestoreQuotaExhausted()) return summary;

    // 2. Executed Works (`executedWorks`)
    const executedWorks = this.getExecutedWorks();
    const workEntries: Array<{ id: string; patch: Record<string, string> }> = [];
    const updatedWorks = executedWorks.map((work) => {
      if (work.authorId !== userId || work.authorName === displayName) return work;
      workEntries.push({
        id: work.id,
        patch: { authorName: displayName, updatedAt: now }
      });
      return { ...work, authorName: displayName, updatedAt: now };
    });
    if (workEntries.length > 0 && remainingDocs > 0 && !isFirestoreQuotaExhausted()) {
      const capped = Number.isFinite(remainingDocs)
        ? workEntries.slice(0, remainingDocs)
        : workEntries;
      localStorage.setItem(STORAGE_KEYS.EXECUTED_WORKS, JSON.stringify(updatedWorks));
      summary.executedWorksUpdated = await this.commitIdentityPatchList(
        'executedWorks',
        capped
      );
      summary.totalUpdated += summary.executedWorksUpdated;
      remainingDocs = Math.max(0, remainingDocs - capped.length);
    }

    if (remainingDocs <= 0 || isFirestoreQuotaExhausted()) return summary;

    // 3. Site Deliverables (`siteDeliverables`)
    const deliverables = this.getSiteDeliverables();
    const deliverableEntries: Array<{ id: string; patch: Record<string, string> }> = [];
    const updatedDeliverables = deliverables.map((del) => {
      if (!isMatchingSender(del.senderId, del.senderEmail)) return del;
      const needsName = del.senderName !== displayName;
      const needsEmail = Boolean(nextEmail && normalizeEmail(del.senderEmail) !== nextEmail);
      if (!needsName && !needsEmail) return del;

      const patch: Record<string, string> = {
        senderName: displayName,
        updatedAt: now
      };
      if (needsEmail) {
        patch.senderEmail = nextEmail;
      }
      deliverableEntries.push({ id: del.id, patch });
      return {
        ...del,
        senderName: displayName,
        senderEmail: needsEmail ? nextEmail : del.senderEmail,
        updatedAt: now
      };
    });
    if (deliverableEntries.length > 0 && remainingDocs > 0 && !isFirestoreQuotaExhausted()) {
      const capped = Number.isFinite(remainingDocs)
        ? deliverableEntries.slice(0, remainingDocs)
        : deliverableEntries;
      localStorage.setItem(STORAGE_KEYS.SITE_DELIVERABLES, JSON.stringify(updatedDeliverables));
      summary.deliverablesUpdated = await this.commitIdentityPatchList(
        'siteDeliverables',
        capped
      );
      summary.totalUpdated += summary.deliverablesUpdated;
      remainingDocs = Math.max(0, remainingDocs - capped.length);
    }

    if (remainingDocs <= 0 || isFirestoreQuotaExhausted()) return summary;

    // 4. Issue Reports (`issues`)
    const issues = this.getIssues();
    const issueEntries: Array<{ id: string; patch: Record<string, string> }> = [];
    const updatedIssues = issues.map((issue) => {
      if (issue.authorId !== userId || issue.authorName === displayName) return issue;
      issueEntries.push({
        id: issue.id,
        patch: { authorName: displayName, updatedAt: now }
      });
      return { ...issue, authorName: displayName, updatedAt: now };
    });
    if (issueEntries.length > 0 && remainingDocs > 0 && !isFirestoreQuotaExhausted()) {
      const capped = Number.isFinite(remainingDocs)
        ? issueEntries.slice(0, remainingDocs)
        : issueEntries;
      localStorage.setItem(STORAGE_KEYS.ISSUES, JSON.stringify(updatedIssues));
      summary.issuesUpdated = await this.commitIdentityPatchList('issues', capped);
      summary.totalUpdated += summary.issuesUpdated;
      remainingDocs = Math.max(0, remainingDocs - capped.length);
    }

    if (remainingDocs <= 0 || isFirestoreQuotaExhausted()) return summary;

    // 5. Announcements (`announcements`) — Admin only
    if (includeAnnouncements) {
      const announcements = this.getAnnouncements();
      const annEntries: Array<{ id: string; patch: Record<string, string> }> = [];
      const updatedAnnouncements = announcements.map((ann) => {
        if (ann.createdBy !== userId || ann.authorName === displayName) return ann;
        annEntries.push({
          id: ann.id,
          patch: { authorName: displayName }
        });
        return { ...ann, authorName: displayName };
      });
      if (annEntries.length > 0 && remainingDocs > 0 && !isFirestoreQuotaExhausted()) {
        const capped = Number.isFinite(remainingDocs)
          ? annEntries.slice(0, remainingDocs)
          : annEntries;
        localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(updatedAnnouncements));
        summary.announcementsUpdated = await this.commitIdentityPatchList(
          'announcements',
          capped
        );
        summary.totalUpdated += summary.announcementsUpdated;
      }
    }

    return summary;
  }

  /**
   * Debounced background scheduler that silently syncs any historical reports or submissions
   * whose stored sender/author metadata lags behind the user's current profile.
   */
  private scheduleAutoIdentitySync() {
    if (this.autoIdentitySyncTimer !== null) {
      clearTimeout(this.autoIdentitySyncTimer);
    }
    this.autoIdentitySyncTimer = setTimeout(() => {
      this.autoIdentitySyncTimer = null;
      void this.runSilentAutoIdentitySync();
    }, 300);
  }

  private async runSilentAutoIdentitySync() {
    if (this.autoIdentitySyncRunning || isFirestoreQuotaExhausted()) return;
    const activeUser = this.getCurrentUser();
    if (!activeUser) return;

    const MAX_DOCS_PER_RUN = 50;
    let remainingDocBudget = MAX_DOCS_PER_RUN;

    const persistedKeys = this.loadPersistedAutoSyncKeys(activeUser.id);
    persistedKeys.forEach((k) => this.attemptedAutoSyncKeys.add(k));
    let keysDirty = false;

    this.autoIdentitySyncRunning = true;
    try {
      const isAdmin = activeUser.role === 'admin' || isSuperAdminEmail(activeUser.email);
      const targetUsers: UserProfile[] = isAdmin
        ? Array.from(
            new Map<string, UserProfile>([
              ...this.getUsers().map((u) => [u.id, u] as const),
              [activeUser.id, activeUser]
            ]).values()
          )
        : [activeUser];

      const reports = this.getReports();
      const executedWorks = this.getExecutedWorks();
      const deliverables = this.getSiteDeliverables();
      const issues = this.getIssues();
      const announcements = isAdmin ? this.getAnnouncements() : [];

      let anyUpdated = false;

      for (const user of targetUsers) {
        if (remainingDocBudget <= 0 || isFirestoreQuotaExhausted()) break;

        const displayName = (user.displayName || '').trim().slice(0, 150);
        const email = normalizeEmail(user.email).slice(0, 200);
        if (!displayName) continue;

        const staleIds: string[] = [];

        for (const rep of reports) {
          const matches = isAdmin
            ? rep.senderId === user.id ||
              (email && normalizeEmail(rep.senderEmail) === email) ||
              (email && normalizeEmail(rep.originalSenderEmail) === email)
            : rep.senderId === user.id;
          if (!matches) continue;
          const needsName = rep.senderName !== displayName;
          const needsEmail = Boolean(email && normalizeEmail(rep.senderEmail) !== email);
          if (needsName || needsEmail) {
            staleIds.push(`r:${rep.id}`);
          }
        }

        for (const work of executedWorks) {
          if (work.authorId === user.id && work.authorName !== displayName) {
            staleIds.push(`w:${work.id}`);
          }
        }

        for (const del of deliverables) {
          const matches =
            del.senderId === user.id || (email && normalizeEmail(del.senderEmail) === email);
          if (!matches) continue;
          const needsName = del.senderName !== displayName;
          const needsEmail = Boolean(email && normalizeEmail(del.senderEmail) !== email);
          if (needsName || needsEmail) {
            staleIds.push(`d:${del.id}`);
          }
        }

        for (const issue of issues) {
          if (issue.authorId === user.id && issue.authorName !== displayName) {
            staleIds.push(`i:${issue.id}`);
          }
        }

        if (isAdmin && user.role === 'admin') {
          for (const ann of announcements) {
            if (ann.createdBy === user.id && ann.authorName !== displayName) {
              staleIds.push(`a:${ann.id}`);
            }
          }
        }

        if (staleIds.length === 0) continue;

        const attemptKey = `${user.id}|${displayName}|${email}|${staleIds.sort().join(',')}`;
        if (this.attemptedAutoSyncKeys.has(attemptKey)) continue;
        this.attemptedAutoSyncKeys.add(attemptKey);
        keysDirty = true;

        const docsToAttempt = Math.min(remainingDocBudget, staleIds.length);
        const summary = await this.propagateUserIdentityToHistoricalRecords({
          userId: user.id,
          previousEmail: email,
          displayName,
          email,
          includeAnnouncements: isAdmin && user.role === 'admin',
          maxDocs: remainingDocBudget
        });
        remainingDocBudget = Math.max(0, remainingDocBudget - docsToAttempt);
        if (summary.totalUpdated > 0) {
          anyUpdated = true;
        }
        if (isFirestoreQuotaExhausted()) {
          break;
        }
      }

      if (keysDirty) {
        this.savePersistedAutoSyncKeys(activeUser.id, this.attemptedAutoSyncKeys);
      }

      if (anyUpdated) {
        this.notify();
      }
    } catch {
      // Auto-sync is strictly silent and non-blocking
    } finally {
      this.autoIdentitySyncRunning = false;
    }
  }

  /**
   * Explicitly re-syncs all historical reports & submissions owned by the currently signed-in user
   * with their latest displayName and email, while preserving immutable original author metadata.
   */
  public async resyncMyHistoricalRecords(): Promise<HistoricalSyncSummary> {
    assertFirestoreWriteAvailable();
    const activeUser = this.getCurrentUser();
    if (!activeUser) {
      return {
        totalUpdated: 0,
        reportsUpdated: 0,
        executedWorksUpdated: 0,
        deliverablesUpdated: 0,
        issuesUpdated: 0,
        announcementsUpdated: 0
      };
    }

    const summary = await this.propagateUserIdentityToHistoricalRecords({
      userId: activeUser.id,
      previousEmail: activeUser.email,
      displayName: activeUser.displayName,
      email: activeUser.email,
      includeAnnouncements: activeUser.role === 'admin'
    });
    this.notify();
    return summary;
  }

  /**
   * Allows an Admin to explicitly re-sync all historical records for a specific user profile.
   */
  public async resyncUserHistoricalRecordsByAdmin(userId: string): Promise<HistoricalSyncSummary> {
    assertFirestoreWriteAvailable();
    const targetUser = this.getUsers().find((u) => u.id === userId);
    if (!targetUser) {
      return {
        totalUpdated: 0,
        reportsUpdated: 0,
        executedWorksUpdated: 0,
        deliverablesUpdated: 0,
        issuesUpdated: 0,
        announcementsUpdated: 0
      };
    }

    const summary = await this.propagateUserIdentityToHistoricalRecords({
      userId: targetUser.id,
      previousEmail: targetUser.email,
      displayName: targetUser.displayName,
      email: targetUser.email,
      includeAnnouncements: targetUser.role === 'admin'
    });
    this.notify();
    return summary;
  }

  /**
   * Allows an Admin (or report owner) to re-sync a single historical report's sender metadata
   * against the author's latest UserProfile while preserving originalSenderName / originalSenderEmail.
   */
  public async resyncSingleReportIdentity(reportId: string): Promise<DailyReport | null> {
    assertFirestoreWriteAvailable();
    const reports = this.getReports();
    const idx = reports.findIndex((r) => r.id === reportId);
    if (idx === -1) return null;

    const report = reports[idx];
    const users = this.getUsers();
    const activeUser = this.getCurrentUser();
    const isAdminActor =
      activeUser?.role === 'admin' || isSuperAdminEmail(activeUser?.email || auth.currentUser?.email);
    const matchedUser =
      users.find((u) => u.id === report.senderId) ||
      (isAdminActor
        ? users.find((u) => normalizeEmail(u.email) === normalizeEmail(report.senderEmail))
        : undefined) ||
      (activeUser && activeUser.id === report.senderId ? activeUser : undefined);

    if (!matchedUser) return report;

    const nextName = matchedUser.displayName.trim().slice(0, 150);
    const nextEmail = normalizeEmail(matchedUser.email).slice(0, 200);
    const needsName = report.senderName !== nextName;
    const needsEmail = Boolean(nextEmail && normalizeEmail(report.senderEmail) !== nextEmail);
    if (!needsName && !needsEmail) return report;

    const now = new Date().toISOString();
    const preservedOriginalName = report.originalSenderName || report.senderName || nextName;
    const preservedOriginalEmail = report.originalSenderEmail || report.senderEmail || nextEmail;

    const patch: Record<string, string> = {
      senderName: nextName,
      identitySyncedAt: now,
      updatedAt: now
    };
    if (!report.originalSenderName && report.senderName) {
      patch.originalSenderName = report.senderName;
    }
    if (!report.originalSenderEmail && report.senderEmail) {
      patch.originalSenderEmail = report.senderEmail;
    }
    if (needsEmail) {
      patch.senderEmail = nextEmail;
    }

    try {
      await updateDoc(doc(db, 'reports', report.id), patch);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `reports/${report.id}`);
    }

    const updatedReport: DailyReport = {
      ...report,
      senderName: nextName,
      senderEmail: needsEmail ? nextEmail : report.senderEmail,
      originalSenderName: preservedOriginalName,
      originalSenderEmail: preservedOriginalEmail,
      identitySyncedAt: now,
      updatedAt: now
    };

    const nextReports = [...reports];
    nextReports[idx] = updatedReport;
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(nextReports));
    this.notify();
    return updatedReport;
  }

  // --- In-App Notifications ---
  private getNotificationsContext(): notificationsDomain.NotificationsDomainContext {
    return {
      getCurrentUser: () => this.getCurrentUser(),
      getUsers: () => this.getUsers(),
      getProjects: () => this.getProjects(),
      getReports: () => this.getReports(),
      getCutoffHour: () => this.getCutoffHour(),
      seenNotificationIds: this.seenNotificationIds,
      notify: () => this.notify()
    };
  }

  public getNotifications(user?: UserProfile | null): AppNotification[] {
    return notificationsDomain.getNotifications(this.getNotificationsContext(), user);
  }

  public addNotification(
    notif: Omit<AppNotification, 'id' | 'isRead' | 'createdAt' | 'readBy'>
  ) {
    notificationsDomain.addNotification(notif, this.getNotificationsContext());
  }

  public markNotificationAsRead(id: string) {
    notificationsDomain.markNotificationAsRead(id, this.getNotificationsContext());
  }

  public markAllNotificationsAsRead() {
    notificationsDomain.markAllNotificationsAsRead(this.getNotificationsContext());
  }

  // --- Personal Daily Notes & Tasks (Strictly Private Per User) ---
  public getPersonalNotes(userId?: string): PersonalNote[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PERSONAL_NOTES);
      const parsed: PersonalNote[] = data ? JSON.parse(data) : [];
      const activeUid = userId || this.getCurrentUser()?.id;
      if (!activeUid) return [];
      return parsed.filter((n) => n.userId === activeUid);
    } catch {
      return [];
    }
  }

  public async addPersonalNote(
    text: string,
    noteDate: string,
    isStarred = false,
    reminder?: { date?: string; time?: string }
  ): Promise<PersonalNote | null> {
    assertFirestoreWriteAvailable();
    const activeUser = this.getCurrentUser();
    const uid = auth.currentUser?.uid || activeUser?.id;
    const cleanText = text.trim().slice(0, 500);
    if (!uid || !cleanText) return null;

    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(noteDate) ? noteDate : getTodayDateStr();
    const validReminderDate =
      reminder?.date && /^\d{4}-\d{2}-\d{2}$/.test(reminder.date) ? reminder.date : undefined;
    const validReminderTime =
      validReminderDate && reminder?.time && /^\d{2}:\d{2}$/.test(reminder.time)
        ? reminder.time
        : undefined;
    const now = new Date().toISOString();
    const id = `pn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

    const note: PersonalNote = stripUndefined({
      id,
      userId: uid,
      noteDate: validDate,
      text: cleanText,
      isCompleted: false,
      isStarred: Boolean(isStarred),
      reminderDate: validReminderDate,
      reminderTime: validReminderTime,
      reminderDismissed: validReminderDate ? false : undefined,
      createdAt: now,
      updatedAt: now
    });

    const notes = this.getPersonalNotes(uid);
    notes.unshift(note);
    localStorage.setItem(STORAGE_KEYS.PERSONAL_NOTES, JSON.stringify(notes));
    this.notify();

    try {
      await setDoc(doc(db, 'users', uid, 'personalNotes', id), note);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${uid}/personalNotes/${id}`);
    }

    return note;
  }

  public async togglePersonalNote(noteId: string): Promise<void> {
    assertFirestoreWriteAvailable();
    const uid = auth.currentUser?.uid || this.getCurrentUser()?.id;
    if (!uid) return;

    const notes = this.getPersonalNotes(uid);
    const idx = notes.findIndex((n) => n.id === noteId);
    if (idx === -1) return;

    const now = new Date().toISOString();
    const nextCompleted = !notes[idx].isCompleted;
    const nextCompletedAt = nextCompleted ? now : '';

    notes[idx] = {
      ...notes[idx],
      isCompleted: nextCompleted,
      completedAt: nextCompletedAt,
      updatedAt: now
    };
    localStorage.setItem(STORAGE_KEYS.PERSONAL_NOTES, JSON.stringify(notes));
    this.notify();

    try {
      await updateDoc(doc(db, 'users', uid, 'personalNotes', noteId), {
        isCompleted: nextCompleted,
        completedAt: nextCompletedAt,
        updatedAt: now
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/personalNotes/${noteId}`);
    }
  }

  public async togglePersonalNoteStar(noteId: string): Promise<void> {
    assertFirestoreWriteAvailable();
    const uid = auth.currentUser?.uid || this.getCurrentUser()?.id;
    if (!uid) return;

    const notes = this.getPersonalNotes(uid);
    const idx = notes.findIndex((n) => n.id === noteId);
    if (idx === -1) return;

    const now = new Date().toISOString();
    const nextStarred = !notes[idx].isStarred;
    notes[idx] = {
      ...notes[idx],
      isStarred: nextStarred,
      updatedAt: now
    };
    localStorage.setItem(STORAGE_KEYS.PERSONAL_NOTES, JSON.stringify(notes));
    this.notify();

    try {
      await updateDoc(doc(db, 'users', uid, 'personalNotes', noteId), {
        isStarred: nextStarred,
        updatedAt: now
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/personalNotes/${noteId}`);
    }
  }

  public async updatePersonalNoteText(noteId: string, newText: string): Promise<void> {
    assertFirestoreWriteAvailable();
    const uid = auth.currentUser?.uid || this.getCurrentUser()?.id;
    const cleanText = newText.trim().slice(0, 500);
    if (!uid || !cleanText) return;

    const notes = this.getPersonalNotes(uid);
    const idx = notes.findIndex((n) => n.id === noteId);
    if (idx === -1) return;

    const now = new Date().toISOString();
    notes[idx] = {
      ...notes[idx],
      text: cleanText,
      updatedAt: now
    };
    localStorage.setItem(STORAGE_KEYS.PERSONAL_NOTES, JSON.stringify(notes));
    this.notify();

    try {
      await updateDoc(doc(db, 'users', uid, 'personalNotes', noteId), {
        text: cleanText,
        updatedAt: now
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/personalNotes/${noteId}`);
    }
  }

  public async setPersonalNoteReminder(
    noteId: string,
    reminderDate: string,
    reminderTime = ''
  ): Promise<void> {
    assertFirestoreWriteAvailable();
    const uid = auth.currentUser?.uid || this.getCurrentUser()?.id;
    if (!uid) return;

    const notes = this.getPersonalNotes(uid);
    const idx = notes.findIndex((n) => n.id === noteId);
    if (idx === -1) return;

    const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(reminderDate) ? reminderDate : '';
    const cleanTime = cleanDate && /^\d{2}:\d{2}$/.test(reminderTime) ? reminderTime : '';
    const now = new Date().toISOString();

    notes[idx] = {
      ...notes[idx],
      reminderDate: cleanDate,
      reminderTime: cleanTime,
      reminderDismissed: false,
      updatedAt: now
    };
    localStorage.setItem(STORAGE_KEYS.PERSONAL_NOTES, JSON.stringify(notes));
    this.notify();

    try {
      await updateDoc(doc(db, 'users', uid, 'personalNotes', noteId), {
        reminderDate: cleanDate,
        reminderTime: cleanTime,
        reminderDismissed: false,
        updatedAt: now
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/personalNotes/${noteId}`);
    }
  }

  public async dismissPersonalNoteReminder(noteId: string): Promise<void> {
    assertFirestoreWriteAvailable();
    const uid = auth.currentUser?.uid || this.getCurrentUser()?.id;
    if (!uid) return;

    const notes = this.getPersonalNotes(uid);
    const idx = notes.findIndex((n) => n.id === noteId);
    if (idx === -1) return;

    const now = new Date().toISOString();
    notes[idx] = {
      ...notes[idx],
      reminderDismissed: true,
      updatedAt: now
    };
    localStorage.setItem(STORAGE_KEYS.PERSONAL_NOTES, JSON.stringify(notes));
    this.notify();

    try {
      await updateDoc(doc(db, 'users', uid, 'personalNotes', noteId), {
        reminderDismissed: true,
        updatedAt: now
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/personalNotes/${noteId}`);
    }
  }

  public async carryOverPersonalNotes(noteIds: string[], targetDate: string): Promise<number> {
    assertFirestoreWriteAvailable();
    const uid = auth.currentUser?.uid || this.getCurrentUser()?.id;
    if (!uid || noteIds.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return 0;

    const idSet = new Set(noteIds);
    const notes = this.getPersonalNotes(uid);
    const now = new Date().toISOString();
    const updates: Array<{ id: string; carriedOverFrom: string }> = [];

    const nextNotes = notes.map((n) => {
      if (!idSet.has(n.id) || n.noteDate === targetDate) return n;
      const originDate = n.carriedOverFrom || n.noteDate;
      updates.push({ id: n.id, carriedOverFrom: originDate });
      return {
        ...n,
        noteDate: targetDate,
        isCompleted: false,
        completedAt: '',
        carriedOverFrom: originDate,
        updatedAt: now
      };
    });

    if (updates.length === 0) return 0;

    localStorage.setItem(STORAGE_KEYS.PERSONAL_NOTES, JSON.stringify(nextNotes));
    this.notify();

    await Promise.all(
      updates.map(async (item) => {
        try {
          await updateDoc(doc(db, 'users', uid, 'personalNotes', item.id), {
            noteDate: targetDate,
            isCompleted: false,
            completedAt: '',
            carriedOverFrom: item.carriedOverFrom,
            updatedAt: now
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.UPDATE,
            `users/${uid}/personalNotes/${item.id}`
          );
        }
      })
    );

    return updates.length;
  }

  public async deletePersonalNotes(noteIds: string[]): Promise<number> {
    assertFirestoreWriteAvailable();
    const uid = auth.currentUser?.uid || this.getCurrentUser()?.id;
    if (!uid || noteIds.length === 0) return 0;

    const idSet = new Set(noteIds);
    const notes = this.getPersonalNotes(uid);
    const toDelete = notes.filter((n) => idSet.has(n.id));
    if (toDelete.length === 0) return 0;

    const remaining = notes.filter((n) => !idSet.has(n.id));
    localStorage.setItem(STORAGE_KEYS.PERSONAL_NOTES, JSON.stringify(remaining));
    this.notify();

    await Promise.all(
      toDelete.map(async (item) => {
        try {
          await deleteDoc(doc(db, 'users', uid, 'personalNotes', item.id));
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.DELETE,
            `users/${uid}/personalNotes/${item.id}`
          );
        }
      })
    );

    return toDelete.length;
  }

  // --- Settings (Stalled days, Cutoff) ---
  public getStalledDaysThreshold(): number {
    const val = localStorage.getItem(STORAGE_KEYS.STALLED_DAYS_LIMIT);
    return val ? parseInt(val, 10) : 7;
  }

  public setStalledDaysThreshold(days: number) {
    localStorage.setItem(STORAGE_KEYS.STALLED_DAYS_LIMIT, String(days));
    this.notify();
  }

  public getCutoffHour(): number {
    const val = localStorage.getItem(STORAGE_KEYS.CUTOFF_HOUR);
    return val ? parseInt(val, 10) : DEFAULT_DAILY_REPORT_CUTOFF_HOUR;
  }

  public setCutoffHour(hour: number) {
    localStorage.setItem(STORAGE_KEYS.CUTOFF_HOUR, String(hour));
    this.notify();
  }

  public getBrandColor(): string {
    const val = localStorage.getItem(STORAGE_KEYS.BRAND_COLOR);
    return val && isValidHexColor(val) ? normalizeHexColor(val) : DEFAULT_BRAND_COLOR;
  }

  public async saveBrandColor(hex: string): Promise<boolean> {
    if (!isValidHexColor(hex)) return false;
    const normalized = normalizeHexColor(hex);
    const activeUser = this.getCurrentUser();
    const now = new Date().toISOString();

    localStorage.setItem(STORAGE_KEYS.BRAND_COLOR, normalized);
    this.notify();

    if (!auth.currentUser || !activeUser || activeUser.role !== 'admin') {
      return true;
    }

    assertFirestoreWriteAvailable();

    const payload: AppBrandingSettings = stripUndefined({
      id: 'branding' as const,
      brandColor: normalized,
      updatedBy: activeUser.id.slice(0, 128),
      updatedByName: activeUser.displayName.slice(0, 150),
      updatedAt: now
    });

    try {
      await setDoc(doc(db, 'appSettings', 'branding'), payload);
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'appSettings/branding');
      return false;
    }
  }

  // --- System Activity Log (Reports & Tasks Audit Trail) ---
  public getActivityLogs(): ActivityLogEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ACTIVITY_LOGS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ActivityLogEntry[]) : [];
    } catch {
      return [];
    }
  }

  private recordActivityLog(input: {
    entityType: ActivityEntityType;
    action: ActivityActionType;
    entityId: string;
    entityTitle: string;
    projectId: string;
    projectName: string;
    summary: string;
    details?: string;
  }) {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return;

    const activeUser = this.getCurrentUser();
    const isAdminActor =
      activeUser?.role === 'admin' || isSuperAdminEmail(firebaseUser.email || activeUser?.email);
    const actorRole: UserRole = isAdminActor ? 'admin' : 'site';

    const sanitizeId = (val: string) =>
      String(val || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 128);

    const safeEntityId = sanitizeId(input.entityId);
    const safeProjectId = sanitizeId(input.projectId);
    if (!safeEntityId || !safeProjectId) return;

    const now = new Date().toISOString();
    const id = `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const safeEntityTitle = (input.entityTitle || 'سجل نظام').trim().slice(0, 300) || 'سجل نظام';
    const safeProjectName = (input.projectName || 'مشروع').trim().slice(0, 200) || 'مشروع';
    const safeActorName =
      (activeUser?.displayName || firebaseUser.displayName || firebaseUser.email || 'مستخدم')
        .trim()
        .slice(0, 150) || 'مستخدم';
    const safeActorEmail = (activeUser?.email || firebaseUser.email || '').trim().slice(0, 200);
    const safeSummary = (input.summary || 'تم تنفيذ تحديث').trim().slice(0, 600) || 'تم تنفيذ تحديث';
    const safeDetails = input.details ? input.details.trim().slice(0, 2000) : undefined;

    const entry: ActivityLogEntry = stripUndefined({
      id,
      entityType: input.entityType,
      action: input.action,
      entityId: safeEntityId,
      entityTitle: safeEntityTitle,
      projectId: safeProjectId,
      projectName: safeProjectName,
      actorId: firebaseUser.uid.slice(0, 128),
      actorName: safeActorName,
      actorEmail: safeActorEmail || undefined,
      actorRole,
      summary: safeSummary,
      details: safeDetails || undefined,
      createdAt: now
    });

    if (isAdminActor) {
      const currentLogs = this.getActivityLogs();
      const nextLogs = [entry, ...currentLogs.filter((l) => l.id !== entry.id)].slice(0, 500);
      localStorage.setItem(STORAGE_KEYS.ACTIVITY_LOGS, JSON.stringify(nextLogs));
    }

    if (!isFirestoreQuotaExhausted()) {
      setDoc(doc(db, 'activityLogs', entry.id), entry).catch((error) => {
        if (getFirestoreErrorCode(error) === 'resource-exhausted') {
          markFirestoreQuotaExhausted();
        }
      });
    }
  }

  // --- Cloud-Synced Excel Logs (Shared across Site Engineers & Admins) ---
  private getExcelLogsContext(): excelLogsDomain.ExcelLogsDomainContext {
    return {
      getCurrentUser: () => this.getCurrentUser(),
      notify: () => this.notify()
    };
  }

  public getSharedExcelLogs(): SharedExcelLogFile[] {
    return excelLogsDomain.getSharedExcelLogs();
  }

  public async uploadSharedExcelLog(payload: {
    id: string;
    projectId: string;
    projectName: string;
    fileName: string;
    buffer: ArrayBuffer;
    sourceLabel?: string;
  }): Promise<SharedExcelLogFile> {
    return excelLogsDomain.uploadSharedExcelLog(payload, this.getExcelLogsContext());
  }

  public async fetchSharedExcelLogBuffer(log: SharedExcelLogFile): Promise<ArrayBuffer> {
    return excelLogsDomain.fetchSharedExcelLogBuffer(log);
  }

  public async updateSharedExcelLogMeta(
    logId: string,
    sheetOverrides: Record<number, unknown>,
    excludedSheetIndices: number[]
  ): Promise<boolean> {
    return excelLogsDomain.updateSharedExcelLogMeta(
      logId,
      sheetOverrides,
      excludedSheetIndices,
      this.getExcelLogsContext()
    );
  }

  public async deleteSharedExcelLog(logId: string): Promise<boolean> {
    return excelLogsDomain.deleteSharedExcelLog(logId, this.getExcelLogsContext());
  }

  public async deleteAllSharedExcelLogs(): Promise<number> {
    return excelLogsDomain.deleteAllSharedExcelLogs(this.getExcelLogsContext());
  }

  // Reset sample project/report data
  public async resetToSeed() {
    assertFirestoreWriteAvailable();
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(SEED_PROJECTS));
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(SEED_REPORTS));
    localStorage.setItem(STORAGE_KEYS.ISSUES, JSON.stringify(SEED_ISSUES));
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(SEED_TASKS));
    localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(SEED_ANNOUNCEMENTS));
    localStorage.setItem(STORAGE_KEYS.EXECUTED_WORKS, JSON.stringify(SEED_EXECUTED_WORKS));
    localStorage.removeItem(STORAGE_KEYS.NOTIFICATIONS);

    for (const p of SEED_PROJECTS) {
      await setDoc(doc(db, 'projects', p.id), stripUndefined(p)).catch(() => undefined);
    }
    for (const r of SEED_REPORTS) {
      await setDoc(doc(db, 'reports', r.id), stripUndefined(r)).catch(() => undefined);
    }
    for (const i of SEED_ISSUES) {
      await setDoc(doc(db, 'issues', i.id), stripUndefined(i)).catch(() => undefined);
    }
    for (const t of SEED_TASKS) {
      await setDoc(doc(db, 'tasks', t.id), stripUndefined(t)).catch(() => undefined);
    }
    for (const a of SEED_ANNOUNCEMENTS) {
      await setDoc(doc(db, 'announcements', a.id), stripUndefined(a)).catch(() => undefined);
    }
    for (const w of SEED_EXECUTED_WORKS) {
      await setDoc(doc(db, 'executedWorks', w.id), stripUndefined(w)).catch(() => undefined);
    }

    this.notify();
  }

  // Export full JSON backup of all application data
  public exportFullBackup(): string {
    const backup = {
      appName: 'متابعة المواقع - إدارة مراقبة الوثائق (DC)',
      version: '2.0.0-firebase',
      exportedAt: new Date().toISOString(),
      projects: this.getProjects(),
      reports: this.getReports(),
      issues: this.getIssues(),
      tasks: this.getTasks(),
      announcements: this.getAnnouncements(),
      executedWorks: this.getExecutedWorks(),
      users: this.getUsers(),
      notifications: this.getNotifications(),
      stalledDays: this.getStalledDaysThreshold(),
      cutoffHour: this.getCutoffHour(),
      brandColor: this.getBrandColor()
    };
    return JSON.stringify(backup, null, 2);
  }

  // Import JSON backup and update reactive state
  public importBackup(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (Array.isArray(data.projects)) localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(data.projects));
      if (Array.isArray(data.reports)) localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(data.reports));
      if (Array.isArray(data.issues)) localStorage.setItem(STORAGE_KEYS.ISSUES, JSON.stringify(data.issues));
      if (Array.isArray(data.tasks)) localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(data.tasks));
      if (Array.isArray(data.announcements)) localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(data.announcements));
      if (Array.isArray(data.executedWorks)) localStorage.setItem(STORAGE_KEYS.EXECUTED_WORKS, JSON.stringify(data.executedWorks));
      if (Array.isArray(data.users)) localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(data.users));
      if (Array.isArray(data.notifications)) localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(data.notifications));
      if (typeof data.stalledDays === 'number') localStorage.setItem(STORAGE_KEYS.STALLED_DAYS_LIMIT, String(data.stalledDays));
      if (typeof data.cutoffHour === 'number') localStorage.setItem(STORAGE_KEYS.CUTOFF_HOUR, String(data.cutoffHour));
      if (typeof data.brandColor === 'string' && isValidHexColor(data.brandColor)) {
        localStorage.setItem(STORAGE_KEYS.BRAND_COLOR, normalizeHexColor(data.brandColor));
      }
      this.notify();
      return true;
    } catch (e) {
      console.error('Import backup failed:', e);
      return false;
    }
  }
}

export const dataService = new DataService();
