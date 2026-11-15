import {
  Project,
  DailyReport,
  IssueReport,
  ProjectTask,
  Announcement,
  UserProfile,
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
import { DEFAULT_DAILY_REPORT_CUTOFF_HOUR } from '../config';

const STORAGE_KEYS = {
  PROJECTS: 'dc_projects_v1',
  REPORTS: 'dc_reports_v1',
  ISSUES: 'dc_issues_v1',
  TASKS: 'dc_tasks_v1',
  ANNOUNCEMENTS: 'dc_announcements_v1',
  USERS: 'dc_users_v1',
  NOTIFICATIONS: 'dc_notifications_v1',
  CURRENT_USER: 'dc_active_user_v1',
  REPORT_DRAFT_PREFIX: 'dc_report_draft_',
  STALLED_DAYS_LIMIT: 'dc_stalled_days_limit',
  CUTOFF_HOUR: 'dc_cutoff_hour'
};

class DataService {
  private listeners: Set<() => void> = new Set();

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
    if (!localStorage.getItem(STORAGE_KEYS.CURRENT_USER)) {
      // Default to admin user for initial seamless inspection
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(SEED_USERS[0]));
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

  // --- Current User & Session Management ---
  public getCurrentUser(): UserProfile {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('Failed parsing current user:', e);
    }
    return SEED_USERS[0];
  }

  public setCurrentUser(user: UserProfile) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    this.notify();
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
    const newProj: Project = {
      ...project,
      id: 'proj-' + Date.now().toString(36),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    projects.push(newProj);
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
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
    const newReport: DailyReport = {
      ...reportData,
      id: 'rep-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    reports.unshift(newReport);
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

    // Clear local draft for this project
    this.clearReportDraft(reportData.projectId);

    // In-app notification for admin
    this.addNotification({
      title: `تقرير يومي جديد: ${newReport.projectName}`,
      message: `قام ${newReport.senderName} بتقديم تقرير أعمال اليوم (${newReport.reportDate}) مع ${newReport.submittedWorks.length} تقديمات و ${newReport.receivedWorks.length} استلامات.`,
      type: 'report_submitted',
      linkTab: 'reports'
    });

    // Notify & check if report alerts
    this.notify();
    return newReport;
  }

  public updateReportStatus(reportId: string, status: DailyReport['status'], adminFeedback?: string): boolean {
    const reports = this.getReports();
    const index = reports.findIndex((r) => r.id === reportId);
    if (index === -1) return false;

    reports[index] = {
      ...reports[index],
      status,
      adminFeedback: adminFeedback !== undefined ? adminFeedback : reports[index].adminFeedback,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

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

    const newIssue: IssueReport = {
      ...issue,
      id: 'iss-' + Date.now().toString(36),
      issueNumber,
      status: 'new',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    issues.unshift(newIssue);
    localStorage.setItem(STORAGE_KEYS.ISSUES, JSON.stringify(issues));

    // If urgent, add an in-app notification for admin
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

    issues[idx] = {
      ...issues[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
      resolvedAt: updates.status === 'resolved' ? new Date().toISOString() : issues[idx].resolvedAt
    };
    localStorage.setItem(STORAGE_KEYS.ISSUES, JSON.stringify(issues));
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
    const newTask: ProjectTask = {
      ...task,
      id: 'task-' + Date.now().toString(36),
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    tasks.unshift(newTask);
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));

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

    tasks[idx] = {
      ...tasks[idx],
      status: 'done',
      completedBy: userId,
      completedAt: new Date().toISOString(),
      proofNote,
      proofAttachment,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
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
    const newAnn: Announcement = {
      ...ann,
      id: 'ann-' + Date.now().toString(36),
      readBy: [],
      createdAt: new Date().toISOString()
    };
    items.unshift(newAnn);
    localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(items));

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
      items[idx].readBy.push(userId);
      localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(items));
      this.notify();
    }
    return true;
  }

  // --- Users Management ---
  public getUsers(): UserProfile[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USERS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public addUser(user: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>): UserProfile {
    const users = this.getUsers();
    const newUser: UserProfile = {
      ...user,
      id: 'user-' + Date.now().toString(36),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    users.push(newUser);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    this.notify();
    return newUser;
  }

  public updateUser(userId: string, updates: Partial<UserProfile>): boolean {
    const users = this.getUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return false;

    users[idx] = {
      ...users[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));

    // If current user modified, update session
    const currentUser = this.getCurrentUser();
    if (currentUser.id === userId) {
      this.setCurrentUser(users[idx]);
    }

    this.notify();
    return true;
  }

  // --- In-App Notifications ---
  public getNotifications(): AppNotification[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      const list: AppNotification[] = data ? JSON.parse(data) : [];

      // Also dynamically evaluate missing reports past cutoff time for admin
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

      return list;
    } catch {
      return [];
    }
  }

  public addNotification(notif: Omit<AppNotification, 'id' | 'isRead' | 'createdAt'>) {
    const notifs = this.getNotifications();
    const newNotif: AppNotification = {
      ...notif,
      id: 'notif-' + Date.now().toString(36),
      isRead: false,
      createdAt: new Date().toISOString()
    };
    notifs.unshift(newNotif);
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs.slice(0, 50)));
    this.notify();
  }

  public markNotificationAsRead(id: string) {
    const notifs = this.getNotifications();
    const idx = notifs.findIndex((n) => n.id === id);
    if (idx !== -1) {
      notifs[idx].isRead = true;
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));
      this.notify();
    }
  }

  public markAllNotificationsAsRead() {
    const notifs = this.getNotifications().map((n) => ({ ...n, isRead: true }));
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

  // Reset to original seed data
  public resetToSeed() {
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(SEED_PROJECTS));
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(SEED_REPORTS));
    localStorage.setItem(STORAGE_KEYS.ISSUES, JSON.stringify(SEED_ISSUES));
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(SEED_TASKS));
    localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(SEED_ANNOUNCEMENTS));
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(SEED_USERS));
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(SEED_USERS[0]));
    localStorage.removeItem(STORAGE_KEYS.NOTIFICATIONS);
    this.notify();
  }

  // Export full JSON backup of all application data
  public exportFullBackup(): string {
    const backup = {
      appName: 'متابعة المواقع - إدارة مراقبة الوثائق (DC)',
      version: '1.0.0-standalone',
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
