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
  IssueReport,
  ProjectTask,
  Announcement,
  UserProfile,
  UserRole,
  AppNotification
} from '../types';
import {
  SEED_PROJECTS,
  SEED_REPORTS,
  SEED_ISSUES,
  SEED_TASKS,
  SEED_ANNOUNCEMENTS,
  SEED_USERS,
  getTodayDateStr
} from '../seedData';
import { DEFAULT_DAILY_REPORT_CUTOFF_HOUR, isSuperAdminEmail, SUPER_ADMIN_EMAIL } from '../config';
import {
  db,
  OperationType,
  handleFirestoreError,
  stripUndefined,
  createFirebaseUserByAdmin
} from './firebase';
import { hasAllProjectsAccess } from '../utils/accessControl';

const STORAGE_KEYS = {
  PROJECTS: 'dc_projects_v2',
  REPORTS: 'dc_reports_v2',
  ISSUES: 'dc_issues_v2',
  TASKS: 'dc_tasks_v2',
  ANNOUNCEMENTS: 'dc_announcements_v2',
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
  assignedProjects: string[];
  phone?: string;
}

class DataService {
  private listeners: Set<() => void> = new Set();
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
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(SEED_USERS));
    }
  }

  public subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
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
        profile = snap.data() as UserProfile;
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
        assignedProjects: profile?.assignedProjects?.length ? profile.assignedProjects : allProjectIds,
        status: 'active',
        phone: profile?.phone || '',
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
      const projSnap = await getDocs(collection(db, 'projects'));
      if (projSnap.empty) {
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
      }
    } catch (error) {
      console.warn('Firestore initial seed check skipped/failed:', error);
    }
  }

  public startRealtimeSync(user: UserProfile) {
    const signature = `${user.id}:${user.role}:${user.allProjects ? 'all' : (user.assignedProjects || []).join(',')}`;
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
          const nextSig = `${updatedProfile.id}:${updatedProfile.role}:${updatedProfile.allProjects ? 'all' : (updatedProfile.assignedProjects || []).join(',')}`;
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

  public addProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Project {
    const projects = this.getProjects();
    const now = new Date().toISOString();
    const newProj: Project = {
      ...project,
      id: 'proj-' + Date.now().toString(36),
      createdAt: now,
      updatedAt: now
    };
    projects.push(newProj);
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    setDoc(doc(db, 'projects', newProj.id), stripUndefined(newProj)).catch((error) =>
      handleFirestoreError(error, OperationType.CREATE, `projects/${newProj.id}`)
    );
    this.notify();
    return newProj;
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

  public saveReport(reportData: Omit<DailyReport, 'id' | 'createdAt' | 'updatedAt'>): DailyReport {
    const reports = this.getReports();
    const now = new Date().toISOString();
    const newReport: DailyReport = stripUndefined({
      ...reportData,
      id: 'rep-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6),
      createdAt: now,
      updatedAt: now
    });
    reports.unshift(newReport);
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

    setDoc(doc(db, 'reports', newReport.id), stripUndefined(newReport)).catch((error) =>
      handleFirestoreError(error, OperationType.CREATE, `reports/${newReport.id}`)
    );

    this.clearReportDraft(reportData.projectId);

    this.addNotification({
      title: `تقرير يومي جديد: ${newReport.projectName}`,
      message: `قام ${newReport.senderName} بتقديم تقرير أعمال اليوم (${newReport.reportDate}) مع ${newReport.submittedWorks.length} تقديمات و ${newReport.receivedWorks.length} استلامات.`,
      type: 'report_submitted',
      linkTab: 'reports'
    });

    this.notify();
    return newReport;
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

    this.addNotification({
      title: `مراجعة تقرير: ${reports[index].projectName}`,
      message: `تم تحديث حالة التقرير (${reports[index].reportDate}) إلى "${status}"${adminFeedback ? ` مع ملاحظات: ${adminFeedback}` : ''}`,
      type: 'report_reviewed',
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

    if (newIssue.priority === 'urgent') {
      this.addNotification({
        title: `بلاغ عاجل: ${newIssue.issueNumber}`,
        message: `تم تسجيل مشكلة عاجلة في ${newIssue.projectName}: ${newIssue.description.slice(0, 70)}...`,
        type: 'urgent_issue',
        linkTab: 'issues'
      });
    }

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

    this.addNotification({
      title: `مهمة جديدة: ${newTask.title}`,
      message: `تم إسناد مهمة جديدة لمشروع ${newTask.projectName}، موعد التسليم: ${newTask.deadline}`,
      type: 'task_assigned',
      linkTab: 'my-tasks'
    });

    this.notify();
    return newTask;
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
      title: `تعميم إداري: ${newAnn.title}`,
      message: newAnn.content.slice(0, 90) + '...',
      type: 'announcement',
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

  // --- In-App Notifications ---
  public getNotifications(user?: UserProfile | null): AppNotification[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      const list: AppNotification[] = data ? JSON.parse(data) : [];

      const activeUser = user ?? this.getCurrentUser();
      const isAdmin = activeUser?.role === 'admin' || isSuperAdminEmail(activeUser?.email);

      // Evaluate missing reports past cutoff time only for admin (or accessible projects)
      if (activeUser && isAdmin) {
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
        return list;
      }

      // Filter notifications for site users so admin-only missing/submitted alerts don't leak
      return list.filter((n) => {
        if (n.type === 'missing_report' || n.type === 'report_submitted' || n.type === 'urgent_issue') {
          return false;
        }
        if (n.targetUserId && n.targetUserId !== activeUser.id) return false;
        // Ensure site user is not shown irrelevant project tasks if projects can be matched
        return true;
      });
    } catch {
      return [];
    }
  }

  public addNotification(notif: Omit<AppNotification, 'id' | 'isRead' | 'createdAt'>) {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      const notifs: AppNotification[] = data ? JSON.parse(data) : [];
      const newNotif: AppNotification = {
        ...notif,
        id: 'notif-' + Date.now().toString(36),
        isRead: false,
        createdAt: new Date().toISOString()
      };
      notifs.unshift(newNotif);
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs.slice(0, 50)));
      this.notify();
    } catch {
      // ignore local notification errors
    }
  }

  public markNotificationAsRead(id: string) {
    const data = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    const notifs: AppNotification[] = data ? JSON.parse(data) : [];
    const idx = notifs.findIndex((n) => n.id === id);
    if (idx !== -1) {
      notifs[idx].isRead = true;
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));
      this.notify();
    }
  }

  public markAllNotificationsAsRead() {
    const data = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    const notifs: AppNotification[] = (data ? JSON.parse(data) : []).map((n: AppNotification) => ({
      ...n,
      isRead: true
    }));
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
