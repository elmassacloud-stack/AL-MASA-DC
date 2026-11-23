import { UserProfile, UserRole } from '../../types';
import { isSuperAdminEmail } from '../../config';
import { stripUndefined } from '../firebase';
import { normalizeNotificationPreferences } from '../../utils/notificationPreferences';

export { stripUndefined };

const memoryStorageFallback = new Map<string, string>();
const memoryJsonCache = new Map<string, unknown>();
const lastPersistedSerialized = new Map<string, string>();
const pendingStorageTimers = new Map<string, ReturnType<typeof setTimeout>>();
const STORAGE_DEBOUNCE_MS = 300;

function isQuotaExceededError(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return (
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22 ||
      err.code === 1014
    );
  }
  return Boolean(
    err &&
      typeof err === 'object' &&
      'name' in err &&
      ((err as { name?: string }).name === 'QuotaExceededError' ||
        (err as { name?: string }).name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

function flushStorageKey(key: string): void {
  const timer = pendingStorageTimers.get(key);
  if (timer !== undefined) {
    clearTimeout(timer);
    pendingStorageTimers.delete(key);
  }

  let serialized: string | undefined;
  if (memoryJsonCache.has(key)) {
    try {
      serialized = JSON.stringify(memoryJsonCache.get(key));
      memoryStorageFallback.set(key, serialized);
    } catch {
      return;
    }
  } else {
    serialized = memoryStorageFallback.get(key);
  }

  if (serialized === undefined) return;
  if (lastPersistedSerialized.get(key) === serialized) return;

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, serialized);
      lastPersistedSerialized.set(key, serialized);
    }
  } catch (err) {
    if (isQuotaExceededError(err)) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore cleanup error
      }
      lastPersistedSerialized.delete(key);
    }
  }
}

function scheduleStorageFlush(key: string): void {
  const existingTimer = pendingStorageTimers.get(key);
  if (existingTimer !== undefined) {
    clearTimeout(existingTimer);
  }
  const timer = setTimeout(() => {
    pendingStorageTimers.delete(key);
    flushStorageKey(key);
  }, STORAGE_DEBOUNCE_MS);
  pendingStorageTimers.set(key, timer);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const key of Array.from(pendingStorageTimers.keys())) {
      flushStorageKey(key);
    }
  });
}

export const safeStorage = {
  getItem(key: string): string | null {
    if (memoryStorageFallback.has(key)) {
      return memoryStorageFallback.get(key) ?? null;
    }
    if (memoryJsonCache.has(key)) {
      try {
        const serialized = JSON.stringify(memoryJsonCache.get(key));
        memoryStorageFallback.set(key, serialized);
        return serialized;
      } catch {
        return null;
      }
    }
    try {
      const stored =
        typeof window !== 'undefined' && window.localStorage
          ? window.localStorage.getItem(key)
          : null;
      if (stored !== null) {
        memoryStorageFallback.set(key, stored);
        lastPersistedSerialized.set(key, stored);
      }
      return stored;
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    memoryJsonCache.delete(key);
    const prevMem = memoryStorageFallback.get(key);
    if (prevMem === value && lastPersistedSerialized.get(key) === value) {
      return;
    }
    memoryStorageFallback.set(key, value);
    if (lastPersistedSerialized.get(key) === value) {
      return;
    }
    scheduleStorageFlush(key);
  },
  setJson(key: string, value: unknown): void {
    memoryJsonCache.set(key, value);
    memoryStorageFallback.delete(key);
    scheduleStorageFlush(key);
  },
  removeItem(key: string): void {
    const existingTimer = pendingStorageTimers.get(key);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
      pendingStorageTimers.delete(key);
    }
    memoryJsonCache.delete(key);
    memoryStorageFallback.delete(key);
    lastPersistedSerialized.delete(key);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // ignore storage errors
    }
  }
};

export const STORAGE_KEYS = {
  PROJECTS: 'dc_projects_v2',
  REPORTS: 'dc_reports_v2',
  ISSUES: 'dc_issues_v2',
  TASKS: 'dc_tasks_v2',
  ANNOUNCEMENTS: 'dc_announcements_v2',
  EXECUTED_WORKS: 'dc_executed_works_v2',
  SITE_DELIVERABLES: 'dc_site_deliverables_v2',
  USERS: 'dc_users_v2',
  NOTIFICATIONS: 'dc_notifications_v2',
  PERSONAL_NOTES: 'dc_personal_notes_v2',
  ACTIVITY_LOGS: 'dc_activity_logs_v2',
  EXCEL_LOGS: 'dc_shared_excel_logs_v2',
  CURRENT_USER: 'dc_active_user_v2',
  REPORT_DRAFT_PREFIX: 'dc_report_draft_',
  STALLED_DAYS_LIMIT: 'dc_stalled_days_limit',
  CUTOFF_HOUR: 'dc_cutoff_hour',
  BRAND_COLOR: 'dc_brand_color_v1'
};

export function normalizeEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function normalizeAssignedProjectsList(projects?: unknown): string[] {
  if (!Array.isArray(projects)) return [];
  return Array.from(
    new Set(projects.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
  );
}

export function normalizeUserProfile(
  raw: Partial<UserProfile>,
  docId: string,
  fallbackEmail?: string
): UserProfile {
  const email = normalizeEmail(raw.email || fallbackEmail);
  const role: UserRole = raw.role === 'admin' || isSuperAdminEmail(email) ? 'admin' : 'site';
  const now = new Date().toISOString();
  return stripUndefined({
    id: docId,
    email,
    displayName: (raw.displayName || email || 'مستخدم').trim().slice(0, 150),
    jobTitle: raw.jobTitle !== undefined ? String(raw.jobTitle).trim().slice(0, 150) : undefined,
    role,
    allProjects: role === 'admin' ? true : raw.allProjects === true,
    canAccessExecutedWorks: role === 'admin' ? true : raw.canAccessExecutedWorks !== false,
    canAccessSiteDeliverables: true,
    assignedProjects: normalizeAssignedProjectsList(raw.assignedProjects),
    status: raw.status === 'disabled' ? 'disabled' : 'active',
    phone: raw.phone ? String(raw.phone).trim().slice(0, 40) : undefined,
    photoUrl:
      typeof raw.photoUrl === 'string' && raw.photoUrl.trim().length > 0
        ? raw.photoUrl.trim().slice(0, 350000)
        : undefined,
    notificationPreferences: raw.notificationPreferences
      ? normalizeNotificationPreferences(raw.notificationPreferences)
      : undefined,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now
  });
}

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

export type TaskUploadProgress = ReportUploadProgress;

export interface HistoricalSyncSummary {
  totalUpdated: number;
  reportsUpdated: number;
  executedWorksUpdated: number;
  deliverablesUpdated: number;
  issuesUpdated: number;
  announcementsUpdated: number;
}

export interface CreateSiteDeliverablePayload {
  projectId: string;
  projectName: string;
  title: string;
  deliverableType: import('../../types').SiteDeliverableType;
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
