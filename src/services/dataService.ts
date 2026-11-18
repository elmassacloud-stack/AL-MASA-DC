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
  Announcement,
  UserProfile,
  UserRole,
  NotificationPreferences,
  AppNotification,
  ExecutedWork,
  SiteDeliverable,
  SiteDeliverableChunk,
  SiteDeliverableType,
  SiteDeliverableStatus
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
  SITE_DELIVERABLE_RETENTION_MS,
  MAX_PDF_FILE_SIZE_BYTES,
  PDF_CHUNK_SIZE_CHARS,
  MAX_REPORT_ATTACHMENT_SIZE_BYTES,
  MAX_REPORT_ATTACHMENTS,
  REPORT_ATTACHMENT_CHUNK_SIZE_CHARS,
  isSuperAdminEmail,
  SUPER_ADMIN_EMAIL
} from '../config';
import {
  auth,
  db,
  OperationType,
  handleFirestoreError,
  stripUndefined,
  createFirebaseUserByAdmin,
  isDeliverableExpired,
  deleteDeliverableFromFirebase,
  purgeExpiredSiteDeliverablesFromFirebase,
  startFirebaseDeliverablesAutoCleanupScheduler,
  stopFirebaseDeliverablesAutoCleanupScheduler,
  cachePdfBlobUrl,
  getCachedPdfBlobUrl,
  revokePdfBlobUrl,
  revokeAllPdfBlobUrls
} from './firebase';
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
  PreparedReportAttachment
} from '../utils/pdfUtils';
import {
  normalizeNotificationPreferences,
  isNotificationAllowedForUser
} from '../utils/notificationPreferences';

const STORAGE_KEYS = {
  PROJECTS: 'dc_projects_v2',
  REPORTS: 'dc_reports_v2',
  ISSUES: 'dc_issues_v2',
  TASKS: 'dc_tasks_v2',
  ANNOUNCEMENTS: 'dc_announcements_v2',
  EXECUTED_WORKS: 'dc_executed_works_v2',
  SITE_DELIVERABLES: 'dc_site_deliverables_v2',
  USERS: 'dc_users_v2',
  NOTIFICATIONS: 'dc_notifications_v2',
  CURRENT_USER: 'dc_active_user_v2',
  REPORT_DRAFT_PREFIX: 'dc_report_draft_',
  STALLED_DAYS_LIMIT: 'dc_stalled_days_limit',
  CUTOFF_HOUR: 'dc_cutoff_hour'
};

export interface CreateUserPayload {
  displayName: string;
  jobTitle: string;
  email: string;
  password: string;
  role: UserRole;
  allProjects: boolean;
  canAccessExecutedWorks: boolean;
  canAccessSiteDeliverables: boolean;
  assignedProjects: string[];
  phone?: string;
}

export interface DeliverableUploadProgress {
  percent: number;
  uploadedChunks: number;
  totalChunks: number;
  uploadedBytes: number;
  totalBytes: number;
  stage: 'metadata' | 'uploading' | 'finalizing';
}

export interface ReportUploadProgress {
  percent: number;
  currentFileIndex: number;
  totalFiles: number;
  currentFileName: string;
  uploadedChunks: number;
  totalChunks: number;
  uploadedBytes: number;
  totalBytes: number;
  stage: 'metadata' | 'uploading' | 'finalizing';
}

export interface CreateSiteDeliverablePayload {
  projectId: string;
  projectName: string;
  title: string;
  deliverableType: SiteDeliverableType;
  submittalNumber?: string;
  rev?: number;
  notes?: string;
  fileName: string;
  fileFormat?: 'pdf' | 'excel';
  mimeType?: string;
  fileSizeBytes: number;
  pageCount?: number;
  senderId: string;
  senderName: string;
  senderEmail: string;
}

class DataService {
  private listeners: Set<() => void> = new Set();
  private liveNotificationListeners: Set<(notif: AppNotification) => void> = new Set();
  private seenNotificationIds: Set<string> = new Set();
  private notificationsInitialized = false;
  private firestoreUnsubs: Unsubscribe[] = [];
  private currentSyncSignature: string | null = null;

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
    this.notify();
  }

  /**
   * Resolves the authenticated Firebase User against Firestore `/users/{uid}`
   * and enforces active status & Super Admin bootstrapping.
   */
  public async resolveAuthenticatedProfile(firebaseUser: FirebaseUser): Promise<UserProfile> {
    const email = (firebaseUser.email || '').trim().toLowerCase();
    const uid = firebaseUser.uid;
    const isSuper = isSuperAdminEmail(email);

    let profile: UserProfile | null = null;
    const userDocRef = doc(db, 'users', uid);

    try {
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        profile = { ...(snap.data() as UserProfile), id: uid };
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${uid}`);
    }

    if (isSuper) {
      const now = new Date().toISOString();
      const allProjectIds = this.getProjects().map((p) => p.id);
      const superProfile: UserProfile = {
        id: uid,
        email: SUPER_ADMIN_EMAIL,
        displayName: profile?.displayName || firebaseUser.displayName || 'مدير النظام العام (DC)',
        jobTitle: profile?.jobTitle || 'المدير العام — إدارة مراقبة الوثائق',
        role: 'admin',
        allProjects: true,
        canAccessExecutedWorks: true,
        canAccessSiteDeliverables: true,
        assignedProjects: profile?.assignedProjects?.length ? profile.assignedProjects : allProjectIds,
        status: 'active',
        phone: profile?.phone || '',
        notificationPreferences: profile?.notificationPreferences,
        createdAt: profile?.createdAt || now,
        updatedAt: now
      };

      try {
        await setDoc(userDocRef, stripUndefined(superProfile));
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
      }

      await this.seedFirestoreIfEmpty();
      this.upsertLocalUser(superProfile);
      this.setCurrentUser(superProfile);
      this.startRealtimeSync(superProfile);
      return superProfile;
    }

    // Non-Super-Admin users must have an active profile in Firestore `/users/{uid}`
    if (!profile) {
      throw new Error('ACCOUNT_NOT_AUTHORIZED');
    }

    if (profile.status === 'disabled') {
      throw new Error('ACCOUNT_DISABLED');
    }

    this.upsertLocalUser(profile);
    this.setCurrentUser(profile);
    this.startRealtimeSync(profile);
    return profile;
  }

  private async seedFirestoreIfEmpty() {
    try {
      const [projSnap, reportsSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'projects')),
        getDocs(collection(db, 'reports')),
        getDocs(collection(db, 'users'))
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
    } catch (error) {
      console.warn('Firestore initial seed check skipped/failed:', error);
    }
  }

  public startRealtimeSync(user: UserProfile) {
    const canExecWorks = canAccessExecutedWorksTab(user);
    const canDeliverables = canAccessSiteDeliverablesTab(user);
    const signature = `${user.id}:${user.role}:${user.allProjects ? 'all' : (user.assignedProjects || []).join(',')}:${canExecWorks ? '1' : '0'}:${canDeliverables ? '1' : '0'}`;
    if (this.currentSyncSignature === signature && this.firestoreUnsubs.length > 0) {
      return;
    }
    this.stopRealtimeSync();
    this.currentSyncSignature = signature;

    const isAdmin = user.role === 'admin' || isSuperAdminEmail(user.email);
    const allProjAccess = hasAllProjectsAccess(user);
    const assigned = (user.assignedProjects || []).slice(0, 30);

    // 1. User profile / Users list sync
    if (isAdmin) {
      const unsubUsers = onSnapshot(
        collection(db, 'users'),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as UserProfile);
          if (list.length > 0) {
            localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(list));
            const active = this.getCurrentUser();
            const refreshedSelf = list.find((u) => u.id === user.id);
            if (active && refreshedSelf && refreshedSelf.id === active.id) {
              localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(refreshedSelf));
            }
            this.notify();
          }
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'users')
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
          const updatedProfile = snap.data() as UserProfile;
          if (updatedProfile.status === 'disabled') {
            this.clearSession();
            return;
          }
          this.upsertLocalUser(updatedProfile);
          localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updatedProfile));
          const nextCanExec = canAccessExecutedWorksTab(updatedProfile);
          const nextCanDeliverables = canAccessSiteDeliverablesTab(updatedProfile);
          const nextSig = `${updatedProfile.id}:${updatedProfile.role}:${updatedProfile.allProjects ? 'all' : (updatedProfile.assignedProjects || []).join(',')}:${nextCanExec ? '1' : '0'}:${nextCanDeliverables ? '1' : '0'}`;
          if (nextSig !== this.currentSyncSignature) {
            this.startRealtimeSync(updatedProfile);
          } else {
            this.notify();
          }
        },
        (error) => handleFirestoreError(error, OperationType.GET, `users/${user.id}`)
      );
      this.firestoreUnsubs.push(unsubSelf);
    }

    // 2. Projects sync
    if (allProjAccess) {
      this.firestoreUnsubs.push(
        onSnapshot(
          collection(db, 'projects'),
          (snap) => {
            const list = snap.docs.map((d) => d.data() as Project);
            localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(list));
            this.notify();
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'projects')
        )
      );
    } else if (assigned.length > 0) {
      this.firestoreUnsubs.push(
        onSnapshot(
          query(collection(db, 'projects'), where('id', 'in', assigned)),
          (snap) => {
            const list = snap.docs.map((d) => d.data() as Project);
            localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(list));
            this.notify();
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'projects')
        )
      );
    } else {
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify([]));
      this.notify();
    }

    // 3. Reports sync
    if (allProjAccess) {
      this.firestoreUnsubs.push(
        onSnapshot(
          collection(db, 'reports'),
          (snap) => {
            const list = snap.docs
              .map((d) => d.data() as DailyReport)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(list));
            this.notify();
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'reports')
        )
      );
    } else if (assigned.length > 0) {
      this.firestoreUnsubs.push(
        onSnapshot(
          query(collection(db, 'reports'), where('projectId', 'in', assigned)),
          (snap) => {
            const list = snap.docs
              .map((d) => d.data() as DailyReport)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(list));
            this.notify();
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'reports')
        )
      );
    } else {
      localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify([]));
      this.notify();
    }

    // 4. Issues sync
    if (allProjAccess) {
      this.firestoreUnsubs.push(
        onSnapshot(
          collection(db, 'issues'),
          (snap) => {
            const list = snap.docs
              .map((d) => d.data() as IssueReport)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            localStorage.setItem(STORAGE_KEYS.ISSUES, JSON.stringify(list));
            this.notify();
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'issues')
        )
      );
    } else if (assigned.length > 0) {
      this.firestoreUnsubs.push(
        onSnapshot(
          query(collection(db, 'issues'), where('projectId', 'in', assigned)),
          (snap) => {
            const list = snap.docs
              .map((d) => d.data() as IssueReport)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            localStorage.setItem(STORAGE_KEYS.ISSUES, JSON.stringify(list));
            this.notify();
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'issues')
        )
      );
    } else {
      localStorage.setItem(STORAGE_KEYS.ISSUES, JSON.stringify([]));
      this.notify();
    }

    // 5. Tasks sync
    if (allProjAccess) {
      this.firestoreUnsubs.push(
        onSnapshot(
          collection(db, 'tasks'),
          (snap) => {
            const list = snap.docs
              .map((d) => d.data() as ProjectTask)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(list));
            this.notify();
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'tasks')
        )
      );
    } else if (assigned.length > 0) {
      this.firestoreUnsubs.push(
        onSnapshot(
          query(collection(db, 'tasks'), where('projectId', 'in', assigned)),
          (snap) => {
            const list = snap.docs
              .map((d) => d.data() as ProjectTask)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(list));
            this.notify();
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'tasks')
        )
      );
    } else {
      localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify([]));
      this.notify();
    }

    // 6. Announcements sync
    this.firestoreUnsubs.push(
      onSnapshot(
        collection(db, 'announcements'),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data() as Announcement)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(list));
          this.notify();
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'announcements')
      )
    );

    // 7. Executed Works sync (only if user has permission to access Executed Works tab)
    if (!canExecWorks) {
      localStorage.setItem(STORAGE_KEYS.EXECUTED_WORKS, JSON.stringify([]));
      this.notify();
    } else if (allProjAccess) {
      this.firestoreUnsubs.push(
        onSnapshot(
          collection(db, 'executedWorks'),
          (snap) => {
            const list = snap.docs
              .map((d) => d.data() as ExecutedWork)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            localStorage.setItem(STORAGE_KEYS.EXECUTED_WORKS, JSON.stringify(list));
            this.notify();
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'executedWorks')
        )
      );
    } else if (assigned.length > 0) {
      this.firestoreUnsubs.push(
        onSnapshot(
          query(collection(db, 'executedWorks'), where('projectId', 'in', assigned)),
          (snap) => {
            const list = snap.docs
              .map((d) => d.data() as ExecutedWork)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            localStorage.setItem(STORAGE_KEYS.EXECUTED_WORKS, JSON.stringify(list));
            this.notify();
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'executedWorks')
        )
      );
    } else {
      localStorage.setItem(STORAGE_KEYS.EXECUTED_WORKS, JSON.stringify([]));
      this.notify();
    }

    // 8. Site PDF Deliverables sync (48-hour auto-expiring items)
    const processDeliverablesSnapshot = (rawList: SiteDeliverable[]) => {
      const nowMs = Date.now();
      const activeList = rawList
        .filter((item) => !isDeliverableExpired(item, nowMs))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const expiredList = rawList.filter((item) => isDeliverableExpired(item, nowMs));

      localStorage.setItem(STORAGE_KEYS.SITE_DELIVERABLES, JSON.stringify(activeList));
      this.notify();

      if (expiredList.length > 0) {
        this.cleanupExpiredDeliverables(expiredList).catch(() => undefined);
      }
    };

    if (!canDeliverables) {
      localStorage.setItem(STORAGE_KEYS.SITE_DELIVERABLES, JSON.stringify([]));
      this.notify();
    } else if (allProjAccess) {
      this.firestoreUnsubs.push(
        onSnapshot(
          collection(db, 'siteDeliverables'),
          (snap) => {
            processDeliverablesSnapshot(snap.docs.map((d) => d.data() as SiteDeliverable));
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'siteDeliverables')
        )
      );
    } else if (assigned.length > 0) {
      this.firestoreUnsubs.push(
        onSnapshot(
          query(collection(db, 'siteDeliverables'), where('projectId', 'in', assigned)),
          (snap) => {
            processDeliverablesSnapshot(snap.docs.map((d) => d.data() as SiteDeliverable));
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'siteDeliverables')
        )
      );
    } else {
      localStorage.setItem(STORAGE_KEYS.SITE_DELIVERABLES, JSON.stringify([]));
      this.notify();
    }

    // Start Firebase periodic 48-hour auto-cleanup scheduler for memory & storage management
    if (canDeliverables) {
      startFirebaseDeliverablesAutoCleanupScheduler(
        () => ({
          canAccessDeliverables: canDeliverables,
          hasAllProjects: allProjAccess,
          assignedProjectIds: assigned
        }),
        (deletedIds) => {
          this.removeDeliverablesFromLocalState(deletedIds);
        }
      );
    }

    // 9. Real-time Notifications sync across devices
    this.seenNotificationIds.clear();
    this.notificationsInitialized = false;

    const processNotificationsList = (incomingList: AppNotification[]) => {
      const normalized = incomingList
        .map((n) => ({
          ...n,
          isRead: n.isRead || (Array.isArray(n.readBy) && n.readBy.includes(user.id))
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 60);

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
            const isFromSelf = n.senderId && n.senderId === latestUser.id;
            const visibleToUser = latestIsAdmin
              ? !n.targetRole || n.targetRole === 'admin' || n.targetRole === 'all'
              : n.targetUserId === latestUser.id ||
                n.targetRole === 'site' ||
                n.targetRole === 'all';
            const projectAllowed =
              latestIsAdmin ||
              !n.projectId ||
              hasAllProjectsAccess(latestUser) ||
              (latestUser.assignedProjects || []).includes(n.projectId);
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

      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(normalized));
      this.notify();
    };

    if (isAdmin) {
      this.firestoreUnsubs.push(
        onSnapshot(
          collection(db, 'notifications'),
          (snap) => {
            processNotificationsList(snap.docs.map((d) => d.data() as AppNotification));
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'notifications')
        )
      );
    } else {
      let directItems: AppNotification[] = [];
      let broadcastItems: AppNotification[] = [];
      const mergeAndProcess = () => {
        const mergedMap = new Map<string, AppNotification>();
        [...directItems, ...broadcastItems].forEach((n) => mergedMap.set(n.id, n));
        processNotificationsList(Array.from(mergedMap.values()));
      };

      this.firestoreUnsubs.push(
        onSnapshot(
          query(collection(db, 'notifications'), where('targetUserId', '==', user.id)),
          (snap) => {
            directItems = snap.docs.map((d) => d.data() as AppNotification);
            mergeAndProcess();
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'notifications')
        )
      );

      this.firestoreUnsubs.push(
        onSnapshot(
          query(collection(db, 'notifications'), where('targetRole', 'in', ['site', 'all'])),
          (snap) => {
            broadcastItems = snap.docs.map((d) => d.data() as AppNotification);
            mergeAndProcess();
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'notifications')
        )
      );
    }
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
    this.seenNotificationIds.clear();
    this.notificationsInitialized = false;
    stopFirebaseDeliverablesAutoCleanupScheduler();
    revokeAllPdfBlobUrls();
  }

  private upsertLocalUser(user: UserProfile) {
    const users = this.getUsers();
    const idx = users.findIndex((u) => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase());
    if (idx !== -1) {
      users[idx] = user;
    } else {
      users.push(user);
    }
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
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
    const projects = this.getProjects();
    const now = new Date().toISOString();
    const cleanedDescription = project.description?.trim().slice(0, 1000);
    const newProj: Project = stripUndefined({
      id: 'proj-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
      name: project.name.trim().slice(0, 200),
      code: project.code.trim().toUpperCase().slice(0, 80),
      description: cleanedDescription ? cleanedDescription : undefined,
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
    updates: Partial<Pick<Project, 'name' | 'code' | 'description' | 'status'>>
  ): Promise<boolean> {
    const projects = this.getProjects();
    const idx = projects.findIndex((p) => p.id === projectId);
    if (idx === -1) return false;

    const updatedAt = new Date().toISOString();
    const nextProject: Project = stripUndefined({
      ...projects[idx],
      ...(updates.name !== undefined ? { name: updates.name.trim().slice(0, 200) } : {}),
      ...(updates.code !== undefined ? { code: updates.code.trim().toUpperCase().slice(0, 80) } : {}),
      ...(updates.description !== undefined
        ? { description: updates.description.trim().slice(0, 1000) }
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

  public async addExecutedWork(
    work: Omit<ExecutedWork, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ExecutedWork> {
    const list = this.getExecutedWorks();
    const now = new Date().toISOString();
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
      authorId: work.authorId,
      authorName: work.authorName.trim().slice(0, 150),
      reviewStatus: work.reviewStatus,
      adminNote: work.adminNote?.trim().slice(0, 1000) || undefined,
      createdAt: now,
      updatedAt: now
    });

    list.unshift(newWork);
    localStorage.setItem(STORAGE_KEYS.EXECUTED_WORKS, JSON.stringify(list));

    try {
      await setDoc(doc(db, 'executedWorks', newWork.id), stripUndefined(newWork));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `executedWorks/${newWork.id}`);
    }

    this.addNotification({
      title: `عمل منفذ جديد: ${newWork.projectName}`,
      message: `سجّل ${newWork.authorName}: ${newWork.workDescription.slice(0, 80)} (${newWork.completionPercent}%)`,
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
        | 'reviewStatus'
        | 'adminNote'
      >
    >
  ): Promise<boolean> {
    const list = this.getExecutedWorks();
    const idx = list.findIndex((w) => w.id === workId);
    if (idx === -1) return false;

    const updatedAt = new Date().toISOString();
    const merged: ExecutedWork = stripUndefined({
      ...list[idx],
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
      ...(updates.reviewStatus !== undefined ? { reviewStatus: updates.reviewStatus } : {}),
      ...(updates.adminNote !== undefined
        ? { adminNote: updates.adminNote.trim().slice(0, 1000) }
        : {}),
      updatedAt
    });

    list[idx] = merged;
    localStorage.setItem(STORAGE_KEYS.EXECUTED_WORKS, JSON.stringify(list));

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
      ...(updates.reviewStatus !== undefined ? { reviewStatus: merged.reviewStatus } : {}),
      ...(updates.adminNote !== undefined ? { adminNote: merged.adminNote } : {}),
      updatedAt
    });

    try {
      await updateDoc(doc(db, 'executedWorks', workId), patch);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `executedWorks/${workId}`);
    }

    this.notify();
    return true;
  }

  public async deleteExecutedWork(workId: string): Promise<boolean> {
    const list = this.getExecutedWorks();
    if (!list.some((w) => w.id === workId)) return false;

    const remaining = list.filter((w) => w.id !== workId);
    localStorage.setItem(STORAGE_KEYS.EXECUTED_WORKS, JSON.stringify(remaining));

    try {
      await deleteDoc(doc(db, 'executedWorks', workId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `executedWorks/${workId}`);
    }

    this.notify();
    return true;
  }

  // --- Site PDF Deliverables (تسليمات الموقع - حذف تلقائي من Firebase بعد 48 ساعة) ---
  public getSiteDeliverables(): SiteDeliverable[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SITE_DELIVERABLES);
      if (!data) return [];
      const parsed: SiteDeliverable[] = JSON.parse(data);
      const nowMs = Date.now();
      return parsed.filter((item) => !isDeliverableExpired(item, nowMs));
    } catch {
      return [];
    }
  }

  public async createSiteDeliverable(
    payload: CreateSiteDeliverablePayload,
    base64Pdf: string,
    onProgress?: (percent: number, info?: DeliverableUploadProgress) => void
  ): Promise<SiteDeliverable> {
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
      senderName: payload.senderName.trim().slice(0, 150),
      senderEmail: payload.senderEmail.trim().slice(0, 200),
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
      // Roll back parent doc and any already-uploaded chunks if upload fails
      await deleteDeliverableFromFirebase(id)
        .catch(() => deleteDoc(doc(db, 'siteDeliverables', id)).catch(() => undefined));
      handleFirestoreError(error, OperationType.CREATE, `siteDeliverables/${id}/chunks`);
    }

    const list = this.getSiteDeliverables();
    list.unshift(deliverable);
    localStorage.setItem(STORAGE_KEYS.SITE_DELIVERABLES, JSON.stringify(list));

    const isExcel =
      deliverable.fileFormat === 'excel' || isExcelFileName(deliverable.fileName);

    this.addNotification({
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

    this.notify();
    return deliverable;
  }

  public async fetchSiteDeliverablePdfUrl(deliverable: SiteDeliverable): Promise<string> {
    if (isDeliverableExpired(deliverable)) {
      await this.deleteSiteDeliverable(deliverable.id).catch(() => undefined);
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

  public async updateSiteDeliverableStatus(
    deliverableId: string,
    status: SiteDeliverableStatus,
    adminNote?: string
  ): Promise<boolean> {
    const list = this.getSiteDeliverables();
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
    localStorage.setItem(STORAGE_KEYS.SITE_DELIVERABLES, JSON.stringify(list));

    try {
      await updateDoc(doc(db, 'siteDeliverables', deliverableId), patch);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `siteDeliverables/${deliverableId}`);
    }

    const adminUser = this.getCurrentUser();
    this.addNotification({
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
      targetUserId: list[idx].senderId,
      projectId: list[idx].projectId,
      senderId: adminUser?.id,
      senderName: adminUser?.displayName,
      linkTab: 'site-deliverables'
    });

    this.notify();
    return true;
  }

  public async deleteSiteDeliverable(deliverableId: string): Promise<boolean> {
    const deleted = await deleteDeliverableFromFirebase(deliverableId);
    if (deleted) {
      this.removeDeliverablesFromLocalState([deliverableId]);
    }
    return deleted;
  }

  public async cleanupExpiredDeliverables(expiredItems: SiteDeliverable[]): Promise<void> {
    const activeUser = this.getCurrentUser();
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
      this.removeDeliverablesFromLocalState(deletedIds);
    }
  }

  private removeDeliverablesFromLocalState(deletedIds: string[]) {
    if (deletedIds.length === 0) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SITE_DELIVERABLES);
      if (!stored) return;
      const list: SiteDeliverable[] = JSON.parse(stored);
      const idSet = new Set(deletedIds);
      const filtered = list.filter((d) => !idSet.has(d.id));
      if (filtered.length !== list.length) {
        localStorage.setItem(STORAGE_KEYS.SITE_DELIVERABLES, JSON.stringify(filtered));
        this.notify();
      }
    } catch {
      // ignore parse errors
    }
  }

  // --- Daily Reports ---
  public getReports(): DailyReport[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.REPORTS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public getReportById(id: string): DailyReport | undefined {
    return this.getReports().find((r) => r.id === id);
  }

  public getReportForProjectDate(projectId: string, reportDate: string): DailyReport | undefined {
    return this.getReports().find(
      (r) => r.projectId === projectId && r.reportDate === reportDate
    );
  }

  private async uploadReportAttachmentChunks(
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

  private async deleteChunksByIds(reportId: string, chunkIds: string[]) {
    for (const chunkId of chunkIds) {
      await deleteDoc(doc(db, 'reports', reportId, 'chunks', chunkId)).catch(() => undefined);
    }
  }

  private async deleteReportAttachmentChunks(reportId: string, attachmentId: string) {
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

  public async saveReport(
    reportData: Omit<DailyReport, 'id' | 'createdAt' | 'updatedAt'>,
    pendingAttachments: PreparedReportAttachment[] = [],
    onProgress?: (progress: ReportUploadProgress) => void
  ): Promise<DailyReport> {
    const reports = this.getReports();
    const duplicate = reports.find(
      (r) => r.projectId === reportData.projectId && r.reportDate === reportData.reportDate
    );
    if (duplicate) {
      throw new Error('DAILY_REPORT_ALREADY_EXISTS');
    }

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

    const candidateId = `rep-${reportData.projectId}-${reportData.reportDate}`;
    const reportId =
      candidateId.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(candidateId)
        ? candidateId
        : 'rep-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);

    const newReport: DailyReport = stripUndefined({
      ...reportData,
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

    try {
      await setDoc(doc(db, 'reports', newReport.id), stripUndefined(newReport));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `reports/${newReport.id}`);
    }

    if (preparedChunked.length > 0) {
      try {
        await this.uploadReportAttachmentChunks(newReport.id, preparedChunked, onProgress);
      } catch (error) {
        // Roll back report and any partial chunks so today's report is not stuck in half-saved state
        for (const entry of preparedChunked) {
          await this.deleteReportAttachmentChunks(newReport.id, entry.item.attachmentId);
        }
        await deleteDoc(doc(db, 'reports', newReport.id)).catch(() => undefined);
        handleFirestoreError(error, OperationType.CREATE, `reports/${newReport.id}/chunks`);
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

    reports.unshift(newReport);
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

    this.clearReportDraft(reportData.projectId);

    this.addNotification({
      title: `تقرير يومي جديد: ${newReport.projectName}`,
      message: `قام ${newReport.senderName} بتقديم تقرير أعمال اليوم (${newReport.reportDate}) مع ${newReport.submittedWorks.length} تقديمات و ${newReport.receivedWorks.length} استلامات.`,
      type: 'report_submitted',
      targetRole: 'admin',
      projectId: newReport.projectId,
      senderId: newReport.senderId,
      senderName: newReport.senderName,
      linkTab: 'reports'
    });

    this.notify();
    return newReport;
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
      rows.slice(0, 200).map((item, rIdx) =>
        stripUndefined({
          id: item.id || `row-${rIdx + 1}`,
          rowNumber: rIdx + 1,
          itemDescription: (item.itemDescription || '').trim(),
          submittalNumber: (item.submittalNumber || '').trim(),
          rev: Number.isFinite(Number(item.rev)) ? Number(item.rev) : 0,
          status: item.status
        })
      );

    const nextSubmittedWorks = sanitizeRows(updates.submittedWorks ?? existing.submittedWorks);
    const nextReceivedWorks = sanitizeRows(updates.receivedWorks ?? existing.receivedWorks);
    const nextNotes =
      updates.notes !== undefined ? updates.notes.trim().slice(0, 4000) : existing.notes;
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

    try {
      await updateDoc(
        doc(db, 'reports', reportId),
        stripUndefined({
          projectId: nextProjectId,
          projectName: nextProjectName,
          reportDate: nextReportDate,
          submittedWorks: nextSubmittedWorks,
          receivedWorks: nextReceivedWorks,
          notes: nextNotes ?? '',
          attachments: nextAttachments,
          status: 'submitted',
          updatedAt
        })
      );
    } catch (error) {
      if (writtenChunkIds.length > 0) {
        await this.deleteChunksByIds(reportId, writtenChunkIds);
      }
      handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
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

    reports[idx] = updatedReport;
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

    this.notify();
    return true;
  }

  public async fetchReportAttachmentUrl(
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

  public updateReportStatus(reportId: string, status: DailyReport['status'], adminFeedback?: string): boolean {
    const reports = this.getReports();
    const index = reports.findIndex((r) => r.id === reportId);
    if (index === -1) return false;

    const updatedAt = new Date().toISOString();
    const nextFeedback = adminFeedback !== undefined ? adminFeedback : reports[index].adminFeedback;
    reports[index] = stripUndefined({
      ...reports[index],
      status,
      adminFeedback: nextFeedback,
      updatedAt
    });
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

    updateDoc(
      doc(db, 'reports', reportId),
      stripUndefined({
        status,
        adminFeedback: nextFeedback,
        updatedAt
      })
    ).catch((error) => handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`));

    const adminUser = this.getCurrentUser();
    this.addNotification({
      title: `مراجعة تقرير: ${reports[index].projectName}`,
      message: `تم تحديث حالة التقرير (${reports[index].reportDate}) إلى "${status}"${adminFeedback ? ` مع ملاحظات: ${adminFeedback}` : ''}`,
      type: 'report_reviewed',
      targetRole: 'site',
      targetUserId: reports[index].senderId,
      projectId: reports[index].projectId,
      senderId: adminUser?.id,
      senderName: adminUser?.displayName,
      linkTab: 'my-submissions'
    });

    this.notify();
    return true;
  }

  // Local Autosave Draft
  public saveReportDraft(projectId: string, draftData: Partial<DailyReport>) {
    try {
      const key = STORAGE_KEYS.REPORT_DRAFT_PREFIX + projectId;
      localStorage.setItem(
        key,
        JSON.stringify({
          data: draftData,
          savedAt: new Date().toISOString()
        })
      );
    } catch (e) {
      console.warn('Autosave draft failed:', e);
    }
  }

  public getReportDraft(projectId: string): { data: Partial<DailyReport>; savedAt: string } | null {
    try {
      const key = STORAGE_KEYS.REPORT_DRAFT_PREFIX + projectId;
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  }

  public clearReportDraft(projectId: string) {
    try {
      const key = STORAGE_KEYS.REPORT_DRAFT_PREFIX + projectId;
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('Clear draft failed:', e);
    }
  }

  // --- Issues ---
  public getIssues(): IssueReport[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ISSUES);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public addIssue(issue: Omit<IssueReport, 'id' | 'issueNumber' | 'createdAt' | 'updatedAt' | 'status'>): IssueReport {
    const issues = this.getIssues();
    const year = new Date().getFullYear();
    const nextSeq = String(issues.length + 1).padStart(3, '0');
    const issueNumber = `ISS-${year}-${nextSeq}`;
    const now = new Date().toISOString();

    const newIssue: IssueReport = stripUndefined({
      ...issue,
      id: 'iss-' + Date.now().toString(36),
      issueNumber,
      status: 'new',
      createdAt: now,
      updatedAt: now
    });
    issues.unshift(newIssue);
    localStorage.setItem(STORAGE_KEYS.ISSUES, JSON.stringify(issues));

    setDoc(doc(db, 'issues', newIssue.id), stripUndefined(newIssue)).catch((error) =>
      handleFirestoreError(error, OperationType.CREATE, `issues/${newIssue.id}`)
    );

    const isUrgent = newIssue.priority === 'urgent';
    this.addNotification({
      title: isUrgent
        ? `بلاغ عاجل: ${newIssue.issueNumber} — ${newIssue.projectName}`
        : `بلاغ مشكلة جديدة: ${newIssue.issueNumber} — ${newIssue.projectName}`,
      message: `أبلغ ${newIssue.authorName} عن ${isUrgent ? 'مشكلة عاجلة' : 'مشكلة بالموقع'}: ${newIssue.description.slice(0, 80)}${newIssue.description.length > 80 ? '...' : ''}`,
      type: isUrgent ? 'urgent_issue' : 'issue_reported',
      priority: newIssue.priority,
      targetRole: 'admin',
      projectId: newIssue.projectId,
      senderId: newIssue.authorId,
      senderName: newIssue.authorName,
      linkTab: 'issues'
    });

    this.notify();
    return newIssue;
  }

  public updateIssue(
    issueId: string,
    updates: Partial<Pick<IssueReport, 'status' | 'adminComment' | 'resolvedAt'>>
  ): boolean {
    const issues = this.getIssues();
    const idx = issues.findIndex((i) => i.id === issueId);
    if (idx === -1) return false;

    const updatedAt = new Date().toISOString();
    const resolvedAt = updates.status === 'resolved' ? updatedAt : issues[idx].resolvedAt;
    const patch = stripUndefined({
      ...updates,
      updatedAt,
      resolvedAt
    });

    issues[idx] = {
      ...issues[idx],
      ...patch
    };
    localStorage.setItem(STORAGE_KEYS.ISSUES, JSON.stringify(issues));

    updateDoc(doc(db, 'issues', issueId), patch).catch((error) =>
      handleFirestoreError(error, OperationType.UPDATE, `issues/${issueId}`)
    );

    this.notify();
    return true;
  }

  // --- Tasks ---
  public getTasks(): ProjectTask[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TASKS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public addTask(task: Omit<ProjectTask, 'id' | 'createdAt' | 'updatedAt' | 'status'>): ProjectTask {
    const tasks = this.getTasks();
    const now = new Date().toISOString();
    const newTask: ProjectTask = stripUndefined({
      ...task,
      id: 'task-' + Date.now().toString(36),
      status: 'pending',
      createdAt: now,
      updatedAt: now
    });
    tasks.unshift(newTask);
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));

    setDoc(doc(db, 'tasks', newTask.id), stripUndefined(newTask)).catch((error) =>
      handleFirestoreError(error, OperationType.CREATE, `tasks/${newTask.id}`)
    );

    const adminUser = this.getCurrentUser();
    this.addNotification({
      title:
        newTask.priority === 'urgent'
          ? `مهمة عاجلة: ${newTask.title}`
          : `مهمة جديدة: ${newTask.title}`,
      message: `تم إسناد مهمة ${newTask.priority === 'urgent' ? 'عاجلة ' : 'جديدة '}لمشروع ${newTask.projectName}، موعد التسليم: ${newTask.deadline}`,
      type: 'task_assigned',
      priority: newTask.priority,
      targetRole: 'site',
      projectId: newTask.projectId,
      senderId: adminUser?.id || newTask.createdBy,
      senderName: adminUser?.displayName,
      linkTab: 'my-tasks'
    });

    this.notify();
    return newTask;
  }

  public async updateTask(
    taskId: string,
    updates: Partial<
      Pick<
        ProjectTask,
        'projectId' | 'projectName' | 'title' | 'description' | 'deadline' | 'priority' | 'status'
      >
    >
  ): Promise<boolean> {
    const tasks = this.getTasks();
    const idx = tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return false;

    const existing = tasks[idx];
    const updatedAt = new Date().toISOString();
    const nextProjectId = updates.projectId ?? existing.projectId;
    const nextProjectName = (updates.projectName ?? existing.projectName).trim().slice(0, 200);
    const nextTitle = (updates.title ?? existing.title).trim().slice(0, 300);
    const nextDescription = (updates.description ?? existing.description).trim().slice(0, 4000);
    const nextDeadline = (updates.deadline ?? existing.deadline).trim().slice(0, 20);
    const nextPriority = updates.priority ?? existing.priority;
    const nextStatus = updates.status ?? existing.status;

    if (!nextTitle) return false;

    const updatedTask: ProjectTask = stripUndefined({
      ...existing,
      projectId: nextProjectId,
      projectName: nextProjectName,
      title: nextTitle,
      description: nextDescription,
      deadline: nextDeadline,
      priority: nextPriority,
      status: nextStatus,
      updatedAt
    });

    tasks[idx] = updatedTask;
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));

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
          updatedAt
        })
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
    }

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

    this.notify();
    return true;
  }

  public async deleteTask(taskId: string): Promise<boolean> {
    const tasks = this.getTasks();
    if (!tasks.some((t) => t.id === taskId)) return false;

    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${taskId}`);
    }

    const remaining = tasks.filter((t) => t.id !== taskId);
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(remaining));
    this.notify();
    return true;
  }

  public completeTask(taskId: string, userId: string, proofNote: string, proofAttachment?: string): boolean {
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

    tasks[idx] = {
      ...tasks[idx],
      ...patch
    };
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));

    updateDoc(doc(db, 'tasks', taskId), patch).catch((error) =>
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`)
    );

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

  public addAnnouncement(ann: Omit<Announcement, 'id' | 'createdAt' | 'readBy'>): Announcement {
    const items = this.getAnnouncements();
    const newAnn: Announcement = stripUndefined({
      ...ann,
      id: 'ann-' + Date.now().toString(36),
      readBy: [],
      createdAt: new Date().toISOString()
    });
    items.unshift(newAnn);
    localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(items));

    setDoc(doc(db, 'announcements', newAnn.id), stripUndefined(newAnn)).catch((error) =>
      handleFirestoreError(error, OperationType.CREATE, `announcements/${newAnn.id}`)
    );

    this.addNotification({
      title: newAnn.isUrgent
        ? `تعميم إداري عاجل: ${newAnn.title}`
        : `تعميم إداري: ${newAnn.title}`,
      message: newAnn.content.slice(0, 90) + '...',
      type: 'announcement',
      priority: newAnn.isUrgent ? 'urgent' : 'normal',
      targetRole: 'all',
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
      const nextReadBy = [...items[idx].readBy, userId];
      items[idx].readBy = nextReadBy;
      localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(items));

      updateDoc(doc(db, 'announcements', announcementId), { readBy: nextReadBy }).catch((error) =>
        handleFirestoreError(error, OperationType.UPDATE, `announcements/${announcementId}`)
      );

      this.notify();
    }
    return true;
  }

  // --- Users Management (Firebase Auth + Firestore) ---
  public getUsers(): UserProfile[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USERS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public async createUserWithAuth(payload: CreateUserPayload): Promise<UserProfile> {
    const uid = await createFirebaseUserByAdmin(
      payload.email,
      payload.password,
      payload.displayName
    );
    const now = new Date().toISOString();
    const isAdminUser = payload.role === 'admin' || isSuperAdminEmail(payload.email);

    const newUser: UserProfile = stripUndefined({
      id: uid,
      email: payload.email.trim().toLowerCase(),
      displayName: payload.displayName.trim(),
      jobTitle: payload.jobTitle.trim(),
      role: isAdminUser ? 'admin' : 'site',
      allProjects: isAdminUser ? true : Boolean(payload.allProjects),
      canAccessExecutedWorks: isAdminUser ? true : Boolean(payload.canAccessExecutedWorks),
      canAccessSiteDeliverables: isAdminUser ? true : Boolean(payload.canAccessSiteDeliverables),
      assignedProjects:
        isAdminUser || payload.allProjects
          ? this.getProjects().map((p) => p.id)
          : payload.assignedProjects,
      status: 'active',
      phone: payload.phone?.trim() || undefined,
      createdAt: now,
      updatedAt: now
    });

    try {
      await setDoc(doc(db, 'users', newUser.id), stripUndefined(newUser));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${newUser.id}`);
    }

    this.upsertLocalUser(newUser);
    this.notify();
    return newUser;
  }

  public async updateUser(userId: string, updates: Partial<UserProfile>): Promise<boolean> {
    const users = this.getUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return false;

    const target = users[idx];
    // Protect Super Admin from role downgrade or disablement
    const sanitizedUpdates = { ...updates };
    if (isSuperAdminEmail(target.email)) {
      sanitizedUpdates.role = 'admin';
      sanitizedUpdates.status = 'active';
      sanitizedUpdates.allProjects = true;
      sanitizedUpdates.canAccessExecutedWorks = true;
      sanitizedUpdates.canAccessSiteDeliverables = true;
    }

    const updatedUser: UserProfile = stripUndefined({
      ...target,
      ...sanitizedUpdates,
      updatedAt: new Date().toISOString()
    });

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

    this.notify();
    return true;
  }

  public async deleteUser(userId: string): Promise<boolean> {
    const users = this.getUsers();
    const target = users.find((u) => u.id === userId);
    if (!target) return false;

    // Never allow deleting Super Admin or currently signed-in admin
    const currentUser = this.getCurrentUser();
    if (isSuperAdminEmail(target.email) || (currentUser && currentUser.id === userId)) {
      return false;
    }

    try {
      await deleteDoc(doc(db, 'users', userId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
    }

    const filtered = users.filter((u) => u.id !== userId);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(filtered));
    this.notify();
    return true;
  }

  public async updateMyNotificationPreferences(
    prefs: NotificationPreferences
  ): Promise<boolean> {
    const activeUser = this.getCurrentUser();
    if (!activeUser) return false;

    const normalizedPrefs = normalizeNotificationPreferences(prefs);
    const updatedAt = new Date().toISOString();
    const updatedUser: UserProfile = stripUndefined({
      ...activeUser,
      notificationPreferences: normalizedPrefs,
      updatedAt
    });

    try {
      await updateDoc(doc(db, 'users', activeUser.id), {
        notificationPreferences: normalizedPrefs,
        updatedAt
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${activeUser.id}`);
    }

    this.upsertLocalUser(updatedUser);
    this.setCurrentUser(updatedUser);
    this.notify();
    return true;
  }

  // --- In-App Notifications ---
  public getNotifications(user?: UserProfile | null): AppNotification[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      const list: AppNotification[] = data ? JSON.parse(data) : [];

      const activeUser = user ?? this.getCurrentUser();
      const isAdmin = activeUser?.role === 'admin' || isSuperAdminEmail(activeUser?.email);
      const userPrefs = activeUser?.notificationPreferences;
      const allowDailyReports = normalizeNotificationPreferences(userPrefs).dailyReports;

      // Evaluate missing reports past cutoff time only for admin (when dailyReports preference is enabled)
      if (activeUser && isAdmin && allowDailyReports) {
        const projects = this.getProjects().filter((p) => p.status === 'active');
        const today = getTodayDateStr();
        const reports = this.getReports();
        const currentHour = new Date().getHours();
        const cutoffHour = this.getCutoffHour();

        if (currentHour >= cutoffHour) {
          projects.forEach((proj) => {
            const hasReport = reports.some((r) => r.projectId === proj.id && r.reportDate === today);
            if (!hasReport) {
              const notifId = `notif-missing-${proj.id}-${today}`;
              if (!list.some((n) => n.id === notifId)) {
                list.unshift({
                  id: notifId,
                  title: `تأخر تقرير اليوم: ${proj.name}`,
                  message: `تجاوز الوقت المحدد (${cutoffHour}:00) ولم يتم استلام تقرير الأعمال اليومي لمشروع ${proj.name}.`,
                  type: 'missing_report',
                  linkTab: 'reports',
                  isRead: false,
                  createdAt: new Date().toISOString()
                });
              }
            }
          });
        }
      }

      if (!activeUser || isAdmin) {
        return list.filter(
          (n) =>
            (!n.targetRole || n.targetRole === 'admin' || n.targetRole === 'all') &&
            isNotificationAllowedForUser(n, userPrefs)
        );
      }

      // Filter notifications for site users so admin-only alerts don't leak, project scope and user preferences are respected
      return list.filter((n) => {
        if (
          n.targetRole === 'admin' ||
          n.type === 'missing_report' ||
          n.type === 'report_submitted' ||
          n.type === 'urgent_issue' ||
          n.type === 'issue_reported' ||
          n.type === 'work_logged' ||
          n.type === 'deliverable_sent' ||
          n.type === 'task_done'
        ) {
          return false;
        }
        if (n.targetUserId && n.targetUserId !== activeUser.id) return false;
        if (
          n.projectId &&
          !hasAllProjectsAccess(activeUser) &&
          !(activeUser.assignedProjects || []).includes(n.projectId)
        ) {
          return false;
        }
        return isNotificationAllowedForUser(n, userPrefs);
      });
    } catch {
      return [];
    }
  }

  public addNotification(
    notif: Omit<AppNotification, 'id' | 'isRead' | 'createdAt' | 'readBy'>
  ) {
    try {
      const id = 'notif-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5);
      const newNotif: AppNotification = stripUndefined({
        ...notif,
        id,
        title: notif.title.trim().slice(0, 300),
        message: notif.message.trim().slice(0, 1500),
        readBy: [],
        isRead: false,
        createdAt: new Date().toISOString()
      });

      this.seenNotificationIds.add(id);

      setDoc(doc(db, 'notifications', id), stripUndefined(newNotif)).catch((error) =>
        handleFirestoreError(error, OperationType.CREATE, `notifications/${id}`)
      );

      const activeUser = this.getCurrentUser();
      const activeIsAdmin =
        activeUser?.role === 'admin' || isSuperAdminEmail(activeUser?.email);
      const isRelevantLocally = activeIsAdmin
        ? !newNotif.targetRole || newNotif.targetRole === 'admin' || newNotif.targetRole === 'all'
        : newNotif.targetRole !== 'admin';

      if (isRelevantLocally) {
        const data = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
        const notifs: AppNotification[] = data ? JSON.parse(data) : [];
        notifs.unshift(newNotif);
        localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs.slice(0, 60)));
        this.notify();
      }
    } catch {
      // ignore notification write errors
    }
  }

  public markNotificationAsRead(id: string) {
    const data = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    const notifs: AppNotification[] = data ? JSON.parse(data) : [];
    const idx = notifs.findIndex((n) => n.id === id);
    const activeUser = this.getCurrentUser();

    if (idx !== -1) {
      const prevReadBy = Array.isArray(notifs[idx].readBy) ? notifs[idx].readBy! : [];
      const nextReadBy =
        activeUser && !prevReadBy.includes(activeUser.id)
          ? [...prevReadBy, activeUser.id]
          : prevReadBy;
      notifs[idx] = {
        ...notifs[idx],
        isRead: true,
        readBy: nextReadBy
      };
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));
      this.notify();

      if (!id.startsWith('notif-missing-')) {
        updateDoc(doc(db, 'notifications', id), {
          isRead: true,
          readBy: nextReadBy
        }).catch(() => undefined);
      }
    }
  }

  public markAllNotificationsAsRead() {
    const data = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    const activeUser = this.getCurrentUser();
    const rawList: AppNotification[] = data ? JSON.parse(data) : [];

    const notifs: AppNotification[] = rawList.map((n: AppNotification) => {
      const prevReadBy = Array.isArray(n.readBy) ? n.readBy : [];
      const nextReadBy =
        activeUser && !prevReadBy.includes(activeUser.id)
          ? [...prevReadBy, activeUser.id]
          : prevReadBy;
      const shouldSyncRemote = !n.isRead && !n.id.startsWith('notif-missing-');
      if (shouldSyncRemote) {
        updateDoc(doc(db, 'notifications', n.id), {
          isRead: true,
          readBy: nextReadBy
        }).catch(() => undefined);
      }
      return {
        ...n,
        isRead: true,
        readBy: nextReadBy
      };
    });

    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));
    this.notify();
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

  // Reset sample project/report data
  public async resetToSeed() {
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
      cutoffHour: this.getCutoffHour()
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
      this.notify();
      return true;
    } catch (e) {
      console.error('Import backup failed:', e);
      return false;
    }
  }
}

export const dataService = new DataService();
