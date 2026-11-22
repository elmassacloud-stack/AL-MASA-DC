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
  id?: string;
  name: string;
  url: string;
  size?: number;
  type?: string;
  chunkCount?: number;
  storageMode?: 'firestore_chunks' | 'external' | 'local';
  uploadedAt?: string;
}

export interface ReportAttachmentChunk {
  attachmentId: string;
  index: number;
  data: string;
}

export interface DailyReport {
  id: string;
  projectId: string;
  projectName: string;
  reportDate: string; // YYYY-MM-DD
  senderId: string;
  senderName: string;
  senderEmail: string;
  originalSenderName?: string;
  originalSenderEmail?: string;
  identitySyncedAt?: string;
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

export interface TaskAttachment {
  id: string;
  name: string;
  fileFormat: 'pdf' | 'excel' | 'image' | 'other';
  mimeType: string;
  fileSizeBytes: number;
  chunkCount: number;
  pageCount?: number;
  uploadedBy: string;
  createdAt: string;
  expiresAt: string;
  expiresAtMs: number;
}

export interface TaskAttachmentChunk {
  attachmentId: string;
  index: number;
  data: string;
  expiresAtMs: number;
}

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
  attachments?: TaskAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  code: string;
  description?: string;
  workScope?: string;
  scopeDisciplines?: WorkDiscipline[];
  plannedWorksCount?: number;
  location?: string;
  clientName?: string;
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

export interface NotificationPreferences {
  dailyReports: boolean;
  tasks: boolean;
  urgentTasksOnly: boolean;
  issues: boolean;
  urgentIssuesOnly: boolean;
  deliverables: boolean;
  executedWorks: boolean;
  announcements: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  jobTitle?: string;
  role: UserRole;
  allProjects?: boolean;
  canAccessExecutedWorks?: boolean;
  canAccessSiteDeliverables?: boolean;
  assignedProjects: string[]; // array of project IDs
  status: 'active' | 'disabled';
  phone?: string;
  photoUrl?: string;
  notificationPreferences?: NotificationPreferences;
  createdAt: string;
  updatedAt: string;
}

export type WorkDiscipline =
  | 'civil_structural'
  | 'architectural'
  | 'electrical'
  | 'mechanical'
  | 'finishing'
  | 'infrastructure'
  | 'other';

export type ExecutedWorkReviewStatus = 'pending' | 'approved';

export interface ExecutedWork {
  id: string;
  projectId: string;
  projectName: string;
  workDate: string; // YYYY-MM-DD
  workDescription: string;
  discipline: WorkDiscipline;
  locationArea?: string;
  quantity?: number;
  unit?: string;
  completionPercent: number; // 0..100
  relatedSubmittalNumber?: string;
  notes?: string;
  attachments?: ReportAttachment[];
  authorId: string;
  authorName: string;
  reviewStatus: ExecutedWorkReviewStatus;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
}

export type SiteDeliverableStatus = 'pending_receipt' | 'received' | 'needs_revision';

export type SiteDeliverableType = 'ir' | 'mir' | 'shop_drawing' | 'handover' | 'other';

export interface SiteDeliverable {
  id: string;
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
  chunkCount: number;
  pageCount?: number;
  senderId: string;
  senderName: string;
  senderEmail: string;
  status: SiteDeliverableStatus;
  adminNote?: string;
  receivedAt?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  expiresAtMs: number;
}

export interface SiteDeliverableChunk {
  index: number;
  data: string;
  expiresAtMs: number;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type:
    | 'urgent_issue'
    | 'issue_reported'
    | 'missing_report'
    | 'task_assigned'
    | 'announcement'
    | 'status_alert'
    | 'report_submitted'
    | 'report_reviewed'
    | 'issue_status'
    | 'task_done'
    | 'work_logged'
    | 'deliverable_sent'
    | 'deliverable_reviewed';
  priority?: 'normal' | 'urgent';
  linkTab?: string;
  targetRole?: 'admin' | 'site' | 'all';
  targetUserId?: string; // empty means role-based / all
  projectId?: string;
  senderId?: string;
  senderName?: string;
  readBy?: string[];
  isRead: boolean;
  createdAt: string;
}

export interface PersonalNote {
  id: string;
  userId: string;
  noteDate: string; // YYYY-MM-DD
  text: string;
  isCompleted: boolean;
  isStarred?: boolean;
  carriedOverFrom?: string; // YYYY-MM-DD when rolled over from an earlier day
  completedAt?: string;
  reminderDate?: string; // YYYY-MM-DD for scheduled reminder
  reminderTime?: string; // HH:mm optional reminder time
  reminderDismissed?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppBrandingSettings {
  id: 'branding';
  brandColor: string; // #RRGGBB hex color
  updatedBy?: string;
  updatedByName?: string;
  updatedAt: string;
}

export type ActivityEntityType = 'report' | 'task';

export type ActivityActionType =
  | 'report_created'
  | 'report_updated'
  | 'report_reviewed'
  | 'report_deleted'
  | 'task_created'
  | 'task_updated'
  | 'task_completed'
  | 'task_deleted';

export interface ActivityLogEntry {
  id: string;
  entityType: ActivityEntityType;
  action: ActivityActionType;
  entityId: string;
  entityTitle: string;
  projectId: string;
  projectName: string;
  actorId: string;
  actorName: string;
  actorEmail?: string;
  actorRole: UserRole;
  summary: string;
  details?: string;
  createdAt: string;
}

export interface SharedExcelLogFile {
  id: string;
  projectId: string;
  projectName: string;
  fileName: string;
  fileSizeBytes: number;
  chunkCount: number;
  uploadedBy: string;
  uploaderName: string;
  uploaderRole: UserRole;
  sourceLabel?: string;
  sheetOverridesJson?: string;
  excludedSheetIndices?: number[];
  createdAt: string;
  updatedAt: string;
}

export interface SharedExcelLogChunk {
  index: number;
  data: string;
}



