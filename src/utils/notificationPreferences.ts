import { AppNotification, NotificationPreferences } from '../types';

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  dailyReports: true,
  tasks: true,
  urgentTasksOnly: false,
  issues: true,
  urgentIssuesOnly: false,
  deliverables: true,
  executedWorks: true,
  announcements: true
};

export function normalizeNotificationPreferences(
  prefs?: Partial<NotificationPreferences> | null
): NotificationPreferences {
  return {
    dailyReports: prefs?.dailyReports ?? DEFAULT_NOTIFICATION_PREFERENCES.dailyReports,
    tasks: prefs?.tasks ?? DEFAULT_NOTIFICATION_PREFERENCES.tasks,
    urgentTasksOnly:
      prefs?.urgentTasksOnly ?? DEFAULT_NOTIFICATION_PREFERENCES.urgentTasksOnly,
    issues: prefs?.issues ?? DEFAULT_NOTIFICATION_PREFERENCES.issues,
    urgentIssuesOnly:
      prefs?.urgentIssuesOnly ?? DEFAULT_NOTIFICATION_PREFERENCES.urgentIssuesOnly,
    deliverables: prefs?.deliverables ?? DEFAULT_NOTIFICATION_PREFERENCES.deliverables,
    executedWorks: prefs?.executedWorks ?? DEFAULT_NOTIFICATION_PREFERENCES.executedWorks,
    announcements: prefs?.announcements ?? DEFAULT_NOTIFICATION_PREFERENCES.announcements
  };
}

export function areNotificationPreferencesEqual(
  a?: Partial<NotificationPreferences> | null,
  b?: Partial<NotificationPreferences> | null
): boolean {
  const normA = normalizeNotificationPreferences(a);
  const normB = normalizeNotificationPreferences(b);
  return (
    normA.dailyReports === normB.dailyReports &&
    normA.tasks === normB.tasks &&
    normA.urgentTasksOnly === normB.urgentTasksOnly &&
    normA.issues === normB.issues &&
    normA.urgentIssuesOnly === normB.urgentIssuesOnly &&
    normA.deliverables === normB.deliverables &&
    normA.executedWorks === normB.executedWorks &&
    normA.announcements === normB.announcements
  );
}

export function isNotificationAllowedForUser(
  notif: AppNotification,
  prefs?: Partial<NotificationPreferences> | null
): boolean {
  if (!prefs) return true;
  const p = normalizeNotificationPreferences(prefs);

  switch (notif.type) {
    case 'report_submitted':
    case 'report_reviewed':
    case 'missing_report':
      return p.dailyReports;

    case 'task_assigned':
    case 'task_done': {
      if (!p.tasks) return false;
      if (p.urgentTasksOnly) {
        return (
          notif.priority === 'urgent' ||
          notif.title.includes('عاجل') ||
          notif.message.includes('عاجل')
        );
      }
      return true;
    }

    case 'urgent_issue':
      return p.issues;

    case 'issue_reported':
    case 'issue_status': {
      if (!p.issues) return false;
      if (p.urgentIssuesOnly) {
        return notif.priority === 'urgent';
      }
      return true;
    }

    case 'deliverable_sent':
    case 'deliverable_reviewed':
      return p.deliverables;

    case 'work_logged':
      return p.executedWorks;

    case 'announcement':
    case 'status_alert':
      return p.announcements;

    default:
      return true;
  }
}

export const NOTIFICATION_PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  prefs: NotificationPreferences;
}> = [
  {
    id: 'all',
    label: 'جميع الإشعارات',
    description: 'استقبال كافة التحديثات والتنبيهات الفورية',
    prefs: { ...DEFAULT_NOTIFICATION_PREFERENCES }
  },
  {
    id: 'daily_reports_only',
    label: 'التقارير اليومية فقط',
    description: 'التركيز على إشعارات التقارير اليومية دون تنبيهات أخرى',
    prefs: {
      dailyReports: true,
      tasks: false,
      urgentTasksOnly: false,
      issues: false,
      urgentIssuesOnly: false,
      deliverables: false,
      executedWorks: false,
      announcements: false
    }
  },
  {
    id: 'urgent_tasks_only',
    label: 'المهام العاجلة فقط',
    description: 'استقبال تنبيهات المهام ذات الأولوية العاجلة فقط',
    prefs: {
      dailyReports: false,
      tasks: true,
      urgentTasksOnly: true,
      issues: false,
      urgentIssuesOnly: false,
      deliverables: false,
      executedWorks: false,
      announcements: false
    }
  },
  {
    id: 'urgent_all',
    label: 'العاجل فقط (مهام ومشاكل)',
    description: 'المهام العاجلة وبلاغات المشاكل العاجلة فقط',
    prefs: {
      dailyReports: false,
      tasks: true,
      urgentTasksOnly: true,
      issues: true,
      urgentIssuesOnly: true,
      deliverables: false,
      executedWorks: false,
      announcements: false
    }
  }
];
