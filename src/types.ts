export type UserRole = 'admin' | 'site';

export type SubmittalStatusCode = 'W' | 'A' | 'B' | 'C' | 'D';

export interface SubmittalStatusMeta {
  code: SubmittalStatusCode;
  labelAr: string;
  labelEn: string;
  badgeClass: string;
  bgLight: string;
  textColor: string;
  borderClass: string;
  description: string;
}

export interface SubmittalItem {
  id: string;
  rowNumber: number; // م
  itemDescription: string; // البند
  submittalNumber: string; // رقم التقديم (LTR)
  rev: number; // REV
  status: SubmittalStatusCode; // الموقف
}

export interface ReportAttachment {
  name: string;
  url: string;
  size?: number;
  type?: string;
}

export interface DailyReport {
  id: string;
  projectId: string;
  projectName: string;
  reportDate: string; // YYYY-MM-DD
  senderId: string;
  senderName: string;
  senderEmail: string;
  submittedWorks: SubmittalItem[]; // الأعمال المقدمة
  receivedWorks: SubmittalItem[]; // الأعمال المستلمة
  notes?: string;
  attachments?: ReportAttachment[];
  status: 'submitted' | 'reviewed' | 'needs_revision';
  adminFeedback?: string;
  createdAt: string;
  updatedAt: string;
}

export type IssueType = 'equipment' | 'network' | 'electrical_ac' | 'documents_archive' | 'other';
export type IssuePriority = 'normal' | 'urgent';
export type IssueStatus = 'new' | 'in_progress' | 'resolved';

export interface IssueReport {
  id: string;
  issueNumber: string; // e.g. ISS-2026-001
  projectId: string;
  projectName: string;
  authorId: string;
  authorName: string;
  type: IssueType;
  priority: IssuePriority;
  description: string;
  photoUrl?: string;
  status: IssueStatus;
  adminComment?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus = 'pending' | 'in_progress' | 'done';

export interface ProjectTask {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  description: string;
  deadline: string; // YYYY-MM-DD
  priority: 'normal' | 'urgent';
  status: TaskStatus;
  createdBy: string;
  completedBy?: string;
  completedAt?: string;
  proofNote?: string;
  proofAttachment?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  code: string;
  description?: string;
  status: 'active' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  targetProjects: string[]; // empty for all projects
  isUrgent: boolean;
  createdBy: string;
  authorName: string;
  readBy: string[]; // user IDs who confirmed reading
  createdAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  assignedProjects: string[]; // array of project IDs
  status: 'active' | 'disabled';
  phone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type:
    | 'urgent_issue'
    | 'missing_report'
    | 'task_assigned'
    | 'announcement'
    | 'status_alert'
    | 'report_submitted'
    | 'report_reviewed'
    | 'issue_status'
    | 'task_done';
  linkTab?: string;
  targetUserId?: string; // empty means admin or all
  isRead: boolean;
  createdAt: string;
}
