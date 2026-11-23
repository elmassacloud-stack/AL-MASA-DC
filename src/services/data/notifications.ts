import { arrayUnion, doc, setDoc, updateDoc } from 'firebase/firestore';
import { AppNotification, DailyReport, Project, UserProfile } from '../../types';
import { isSuperAdminEmail } from '../../config';
import { getTodayDateStr } from '../../seedData';
import {
  auth,
  db,
  getFirestoreErrorCode,
  isFirestoreQuotaExhausted,
  markFirestoreQuotaExhausted
} from '../firebase';
import { hasAllProjectsAccess } from '../../utils/accessControl';
import {
  isNotificationAllowedForUser,
  normalizeNotificationPreferences
} from '../../utils/notificationPreferences';
import {
  normalizeAssignedProjectsList,
  normalizeEmail,
  safeStorage,
  STORAGE_KEYS,
  stripUndefined
} from './shared';

export interface NotificationsDomainContext {
  getCurrentUser: () => UserProfile | null;
  getUsers: () => UserProfile[];
  getProjects: () => Project[];
  getReports: () => DailyReport[];
  getCutoffHour: () => number;
  seenNotificationIds: Set<string>;
  notify: () => void;
}

export function resolveRecipientUserId(
  users: UserProfile[],
  userId?: string,
  email?: string
): string | undefined {
  const normalizedEmail = normalizeEmail(email);
  if (userId) {
    const byId = users.find((u) => u.id === userId);
    if (byId) return byId.id;
  }
  if (normalizedEmail) {
    const byEmail = users.find((u) => normalizeEmail(u.email) === normalizedEmail);
    if (byEmail) return byEmail.id;
  }
  return userId || undefined;
}

export function isNotificationTargetingUser(notif: AppNotification, user: UserProfile): boolean {
  if (!notif.targetUserId) return true;
  if (notif.targetUserId === user.id) return true;
  const userEmail = normalizeEmail(user.email);
  return Boolean(userEmail && normalizeEmail(notif.targetUserId) === userEmail);
}

export function getNotifications(
  ctx: NotificationsDomainContext,
  user?: UserProfile | null
): AppNotification[] {
  try {
    const data = safeStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    const list: AppNotification[] = data ? JSON.parse(data) : [];

    const activeUser = user ?? ctx.getCurrentUser();
    const isAdmin = activeUser?.role === 'admin' || isSuperAdminEmail(activeUser?.email);
    const userPrefs = activeUser?.notificationPreferences;
    const allowDailyReports = normalizeNotificationPreferences(userPrefs).dailyReports;

    if (activeUser && isAdmin && allowDailyReports) {
      const projects = ctx.getProjects().filter((p) => p.status === 'active');
      const today = getTodayDateStr();
      const reports = ctx.getReports();
      const currentHour = new Date().getHours();
      const cutoffHour = ctx.getCutoffHour();

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
          (!activeUser || !n.targetUserId || isNotificationTargetingUser(n, activeUser)) &&
          (!n.targetRole || n.targetRole === 'admin' || n.targetRole === 'all') &&
          isNotificationAllowedForUser(n, userPrefs)
      );
    }

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
      if (n.targetUserId && !isNotificationTargetingUser(n, activeUser)) return false;
      if (
        n.projectId &&
        !hasAllProjectsAccess(activeUser) &&
        !normalizeAssignedProjectsList(activeUser.assignedProjects).includes(n.projectId)
      ) {
        return false;
      }
      return isNotificationAllowedForUser(n, userPrefs);
    });
  } catch {
    return [];
  }
}

export function addNotification(
  notif: Omit<AppNotification, 'id' | 'isRead' | 'createdAt' | 'readBy'>,
  ctx: NotificationsDomainContext
): void {
  try {
    const id = 'notif-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5);
    const newNotif: AppNotification = stripUndefined({
      ...notif,
      senderId: auth.currentUser?.uid || notif.senderId,
      id,
      title: notif.title.trim().slice(0, 300),
      message: notif.message.trim().slice(0, 1500),
      readBy: [],
      isRead: false,
      createdAt: new Date().toISOString()
    });

    ctx.seenNotificationIds.add(id);

    if (!isFirestoreQuotaExhausted()) {
      setDoc(doc(db, 'notifications', id), stripUndefined(newNotif)).catch((error) => {
        if (getFirestoreErrorCode(error) === 'resource-exhausted') {
          markFirestoreQuotaExhausted();
        }
      });
    }

    const activeUser = ctx.getCurrentUser();
    const activeIsAdmin =
      activeUser?.role === 'admin' || isSuperAdminEmail(activeUser?.email);
    const isTargetedToMe = Boolean(
      activeUser && newNotif.targetUserId && isNotificationTargetingUser(newNotif, activeUser)
    );
    const isRelevantLocally = activeIsAdmin
      ? (!newNotif.targetUserId || isTargetedToMe) &&
        (!newNotif.targetRole || newNotif.targetRole === 'admin' || newNotif.targetRole === 'all')
      : isTargetedToMe ||
        (!newNotif.targetUserId && (newNotif.targetRole === 'site' || newNotif.targetRole === 'all'));

    if (isRelevantLocally) {
      const data = safeStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      const notifs: AppNotification[] = data ? JSON.parse(data) : [];
      notifs.unshift(newNotif);
      safeStorage.setJson(STORAGE_KEYS.NOTIFICATIONS, notifs.slice(0, 100));
      ctx.notify();
    }
  } catch {
    // ignore notification write errors
  }
}

export function markNotificationAsRead(id: string, ctx: NotificationsDomainContext): void {
  const data = safeStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
  const notifs: AppNotification[] = data ? JSON.parse(data) : [];
  const idx = notifs.findIndex((n) => n.id === id);
  const activeUser = ctx.getCurrentUser();

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
    safeStorage.setJson(STORAGE_KEYS.NOTIFICATIONS, notifs);
    ctx.notify();

    if (!id.startsWith('notif-missing-') && !isFirestoreQuotaExhausted()) {
      const remotePatch = activeUser
        ? { isRead: true, readBy: arrayUnion(activeUser.id) }
        : { isRead: true };
      updateDoc(doc(db, 'notifications', id), remotePatch).catch((error) => {
        if (getFirestoreErrorCode(error) === 'resource-exhausted') {
          markFirestoreQuotaExhausted();
        }
      });
    }
  }
}

export function markAllNotificationsAsRead(ctx: NotificationsDomainContext): void {
  const data = safeStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
  const activeUser = ctx.getCurrentUser();
  const rawList: AppNotification[] = data ? JSON.parse(data) : [];

  const notifs: AppNotification[] = rawList.map((n: AppNotification) => {
    const prevReadBy = Array.isArray(n.readBy) ? n.readBy : [];
    const nextReadBy =
      activeUser && !prevReadBy.includes(activeUser.id)
        ? [...prevReadBy, activeUser.id]
        : prevReadBy;
    const shouldSyncRemote =
      !n.isRead && !n.id.startsWith('notif-missing-') && !isFirestoreQuotaExhausted();
    if (shouldSyncRemote) {
      const remotePatch = activeUser
        ? { isRead: true, readBy: arrayUnion(activeUser.id) }
        : { isRead: true };
      updateDoc(doc(db, 'notifications', n.id), remotePatch).catch((error) => {
        if (getFirestoreErrorCode(error) === 'resource-exhausted') {
          markFirestoreQuotaExhausted();
        }
      });
    }
    return {
      ...n,
      isRead: true,
      readBy: nextReadBy
    };
  });

  safeStorage.setJson(STORAGE_KEYS.NOTIFICATIONS, notifs);
  ctx.notify();
}
