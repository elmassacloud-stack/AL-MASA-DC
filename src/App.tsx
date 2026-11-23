import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Loader2, FolderArchive, BellRing, X, ArrowUpLeft, AlertTriangle } from 'lucide-react';
import { Header } from './components/common/Header';
import { Navigation } from './components/common/Navigation';
import { LoginScreen } from './components/common/LoginScreen';
import { NotificationsDrawer } from './components/common/NotificationsDrawer';
import { SettingsModal } from './components/common/SettingsModal';
import { ShareAppModal } from './components/common/ShareAppModal';
import { UserProfileView } from './components/common/UserProfileView';

// Site User Views
import { DailyReportForm } from './components/site/DailyReportForm';
import { IssueReportForm } from './components/site/IssueReportForm';
import { MySubmissionsView } from './components/site/MySubmissionsView';
import { MyTasksView } from './components/site/MyTasksView';

// Admin Views
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminIssuesView } from './components/admin/AdminIssuesView';
import { AdminTasksView } from './components/admin/AdminTasksView';
import { AdminUsersView } from './components/admin/AdminUsersView';

// Lazy-loaded heavy views (code-split)
const ExecutedWorksView = lazy(() =>
  import('./components/common/ExecutedWorksView').then((m) => ({ default: m.ExecutedWorksView }))
);
const SiteDeliverablesView = lazy(() =>
  import('./components/common/SiteDeliverablesView').then((m) => ({ default: m.SiteDeliverablesView }))
);
const PersonalNotesView = lazy(() =>
  import('./components/common/PersonalNotesView').then((m) => ({ default: m.PersonalNotesView }))
);
const AdminReportsView = lazy(() =>
  import('./components/admin/AdminReportsView').then((m) => ({ default: m.AdminReportsView }))
);
const SubmittalTrackerView = lazy(() =>
  import('./components/admin/SubmittalTrackerView').then((m) => ({ default: m.SubmittalTrackerView }))
);
const AdminProjectsView = lazy(() =>
  import('./components/admin/AdminProjectsView').then((m) => ({ default: m.AdminProjectsView }))
);
const ExportCenterView = lazy(() =>
  import('./components/admin/ExportCenterView').then((m) => ({ default: m.ExportCenterView }))
);

import { dataService } from './services/dataService';
import {
  subscribeToAuthState,
  signOutUser,
  isFirestoreQuotaExhausted,
  subscribeToFirestoreQuotaState
} from './services/firebase';
import {
  canAccessProject,
  canAccessExecutedWorksTab,
  canAccessSiteDeliverablesTab
} from './utils/accessControl';
import {
  showBrowserNotification,
  playSubtleNotificationChime
} from './utils/browserNotifications';
import { applyBrandColorToDocument } from './utils/brandTheme';
import {
  UserProfile,
  NotificationPreferences,
  Project,
  DailyReport,
  IssueReport,
  ProjectTask,
  AppNotification,
  ExecutedWork,
  SiteDeliverable,
  PersonalNote
} from './types';
import { getTodayDateStr } from './seedData';

export default function App() {
  // Theme state
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('dc_theme');
      if (saved) return saved === 'dark';
    } catch {
      // ignore storage errors
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  // Firebase Auth Gate State (No dashboard access until authenticated & authorized)
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authTimedOut, setAuthTimedOut] = useState<boolean>(false);
  const [authRetryTick, setAuthRetryTick] = useState<number>(0);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [quotaExhausted, setQuotaExhausted] = useState<boolean>(() => isFirestoreQuotaExhausted());

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<string>('daily-report');

  // Live collections state
  const [projects, setProjects] = useState<Project[]>(() => dataService.getProjects());
  const [reports, setReports] = useState<DailyReport[]>(() => dataService.getReports());
  const [issues, setIssues] = useState<IssueReport[]>(() => dataService.getIssues());
  const [tasks, setTasks] = useState<ProjectTask[]>(() => dataService.getTasks());
  const [executedWorks, setExecutedWorks] = useState<ExecutedWork[]>(() =>
    dataService.getExecutedWorks()
  );
  const [siteDeliverables, setSiteDeliverables] = useState<SiteDeliverable[]>(() =>
    dataService.getSiteDeliverables()
  );
  const [users, setUsers] = useState<UserProfile[]>(() => dataService.getUsers());
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    dataService.getNotifications(null)
  );
  const [personalNotes, setPersonalNotes] = useState<PersonalNote[]>(() =>
    dataService.getPersonalNotes()
  );
  const [stalledDays, setStalledDays] = useState<number>(() =>
    dataService.getStalledDaysThreshold()
  );
  const [cutoffHour, setCutoffHour] = useState<number>(() =>
    dataService.getCutoffHour()
  );
  const [brandColor, setBrandColor] = useState<string>(() => {
    const initial = dataService.getBrandColor();
    applyBrandColorToDocument(initial);
    return initial;
  });

  // Modals & Live Toast state
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isShareOpen, setIsShareOpen] = useState<boolean>(false);
  const [liveToast, setLiveToast] = useState<AppNotification | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // Sync dark mode class with HTML element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      try {
        localStorage.setItem('dc_theme', 'dark');
      } catch {
        // ignore storage errors
      }
    } else {
      document.documentElement.classList.remove('dark');
      try {
        localStorage.setItem('dc_theme', 'light');
      } catch {
        // ignore storage errors
      }
    }
  }, [darkMode]);

  // Sync custom Brand Color CSS variables globally across buttons & menus
  useEffect(() => {
    applyBrandColorToDocument(brandColor);
  }, [brandColor]);

  // Subscribe to global Firestore daily write quota exhaustion state
  useEffect(() => {
    setQuotaExhausted(isFirestoreQuotaExhausted());
    return subscribeToFirestoreQuotaState((exhausted) => {
      setQuotaExhausted(exhausted);
    });
  }, []);

  // Listen to Firebase Auth State with 15s safety & profile resolution timeouts
  useEffect(() => {
    let active = true;
    let authStateReceived = false;
    const AUTH_TIMEOUT_MS = 15000;

    const authInitSafetyTimer = window.setTimeout(() => {
      if (!active || authStateReceived) return;
      setAuthError('تعذر التحقق من صلاحيات الحساب. يرجى المحاولة مرة أخرى.');
      setAuthTimedOut(true);
      setAuthChecking(false);
    }, AUTH_TIMEOUT_MS);

    const unsubscribeAuth = subscribeToAuthState(async (firebaseUser) => {
      if (!active) return;
      authStateReceived = true;
      window.clearTimeout(authInitSafetyTimer);

      if (!firebaseUser) {
        dataService.clearSession();
        setCurrentUser(null);
        setAuthTimedOut(false);
        setAuthChecking(false);
        return;
      }

      setAuthChecking(true);
      let profileTimeoutId: number | null = null;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          profileTimeoutId = window.setTimeout(() => {
            reject(new Error('AUTH_PROFILE_TIMEOUT'));
          }, AUTH_TIMEOUT_MS);
        });
        const resolvedProfile = await Promise.race([
          dataService.resolveAuthenticatedProfile(firebaseUser),
          timeoutPromise
        ]);
        if (!active) return;
        setAuthError(null);
        setAuthTimedOut(false);
        setCurrentUser(resolvedProfile);
        setActiveTab(resolvedProfile.role === 'admin' ? 'dashboard' : 'daily-report');
      } catch (err) {
        if (!active) return;
        const code = err instanceof Error ? err.message : '';
        if (code === 'AUTH_PROFILE_TIMEOUT') {
          setAuthError('تعذر التحقق من صلاحيات الحساب. يرجى المحاولة مرة أخرى.');
          setAuthTimedOut(true);
          setCurrentUser(null);
        } else if (code === 'ACCOUNT_DISABLED') {
          setAuthError('هذا الحساب معطل حالياً. يرجى التواصل مع مسؤول النظام لإعادة التفعيل.');
          setAuthTimedOut(false);
          await signOutUser().catch(() => undefined);
          dataService.clearSession();
          setCurrentUser(null);
        } else if (code === 'ACCOUNT_NOT_AUTHORIZED') {
          setAuthError('هذا الحساب غير مسجل أو تم حذفه من قبل مسؤول النظام.');
          setAuthTimedOut(false);
          await signOutUser().catch(() => undefined);
          dataService.clearSession();
          setCurrentUser(null);
        } else {
          setAuthError('تعذر التحقق من صلاحيات الحساب. يرجى المحاولة مرة أخرى.');
          setAuthTimedOut(true);
          setCurrentUser(null);
        }
      } finally {
        if (profileTimeoutId !== null) {
          window.clearTimeout(profileTimeoutId);
        }
        if (active) setAuthChecking(false);
      }
    });

    return () => {
      active = false;
      window.clearTimeout(authInitSafetyTimer);
      unsubscribeAuth();
      dataService.stopRealtimeSync();
    };
  }, [authRetryTick]);

  const handleRetryAuth = () => {
    setAuthError(null);
    setAuthTimedOut(false);
    setAuthChecking(true);
    setAuthRetryTick((prev) => prev + 1);
  };

  // Subscribe to reactive data store changes
  useEffect(() => {
    const unsubscribe = dataService.subscribe(() => {
      const activeUser = dataService.getCurrentUser();
      setProjects(dataService.getProjects());
      setReports(dataService.getReports());
      setIssues(dataService.getIssues());
      setTasks(dataService.getTasks());
      setExecutedWorks(dataService.getExecutedWorks());
      setSiteDeliverables(dataService.getSiteDeliverables());
      setUsers(dataService.getUsers());
      setNotifications(dataService.getNotifications(activeUser));
      setPersonalNotes(dataService.getPersonalNotes(activeUser?.id));
      setStalledDays(dataService.getStalledDaysThreshold());
      setCutoffHour(dataService.getCutoffHour());
      setBrandColor(dataService.getBrandColor());
      setCurrentUser((prev) => {
        if (prev && !activeUser) {
          // Session was revoked (disabled or deleted in real-time)
          signOutUser().catch(() => undefined);
          setAuthError('تم تحديث حالة حسابك أو إيقافه من قبل مسؤول النظام.');
          return null;
        }
        if (prev && activeUser && JSON.stringify(prev) === JSON.stringify(activeUser)) {
          return prev;
        }
        return activeUser;
      });
    });
    return unsubscribe;
  }, []);

  // Redirect away from removed or restricted tabs immediately if needed
  useEffect(() => {
    if (!currentUser) return;
    if (
      activeTab === 'activity-log' ||
      activeTab === 'announcements' ||
      activeTab === 'excel-logs'
    ) {
      setActiveTab(currentUser.role === 'admin' ? 'dashboard' : 'daily-report');
    } else if (!canAccessExecutedWorksTab(currentUser) && activeTab === 'executed-works') {
      setActiveTab('daily-report');
    } else if (!canAccessSiteDeliverablesTab(currentUser) && activeTab === 'site-deliverables') {
      setActiveTab('daily-report');
    }
  }, [currentUser, activeTab]);

  // Real-time live notifications (in-app toast + chime + Web Notification)
  useEffect(() => {
    if (!currentUser) return;
    const unsubscribeLive = dataService.subscribeToLiveNotifications((notif) => {
      setLiveToast(notif);
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = window.setTimeout(() => {
        setLiveToast(null);
        toastTimerRef.current = null;
      }, 7000);

      playSubtleNotificationChime();
      showBrowserNotification(notif.title, notif.message, () => {
        dataService.markNotificationAsRead(notif.id);
        if (notif.linkTab) {
          setActiveTab(notif.linkTab);
        } else {
          setIsNotificationsOpen(true);
        }
      });
    });

    return () => {
      unsubscribeLive();
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, [currentUser?.id]);

  const handleLogout = async () => {
    setIsNotificationsOpen(false);
    setIsSettingsOpen(false);
    setIsShareOpen(false);
    setLiveToast(null);
    setAuthError(null);
    dataService.clearSession();
    setCurrentUser(null);
    await signOutUser().catch(() => undefined);
  };

  const handleToggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  const handleUpdateStalledDays = (days: number) => {
    dataService.setStalledDaysThreshold(days);
    setStalledDays(days);
  };

  const handleUpdateCutoffHour = (hour: number) => {
    dataService.setCutoffHour(hour);
    setCutoffHour(hour);
  };

  const handleResetSeedData = async () => {
    await dataService.resetToSeed();
  };

  const handleUpdateNotificationPreferences = async (
    prefs: NotificationPreferences
  ): Promise<boolean> => {
    return dataService.updateMyNotificationPreferences(prefs);
  };

  const handleUpdateBrandColor = async (hex: string): Promise<boolean> => {
    const ok = await dataService.saveBrandColor(hex);
    if (ok) {
      setBrandColor(dataService.getBrandColor());
    }
    return ok;
  };

  // Loading Screen while resolving Firebase Auth session
  if (authChecking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-4">
        <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/25 mb-4">
          <FolderArchive className="w-7 h-7" />
        </div>
        <div className="flex items-center gap-2.5 text-sm font-bold text-slate-700 dark:text-slate-300">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          <span>جاري التحقق من جلسة الدخول والصلاحيات...</span>
        </div>
      </div>
    );
  }

  const quotaBanner = quotaExhausted ? (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-amber-50 dark:bg-amber-950/90 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-amber-900 dark:text-amber-200 text-xs sm:text-sm font-bold flex items-center justify-center gap-2"
    >
      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span>قاعدة البيانات وصلت الحد اليومي للكتابة</span>
    </div>
  ) : null;

  // Strict Auth Gate: Show ONLY LoginScreen when unauthenticated
  if (!currentUser) {
    return (
      <>
        {quotaBanner}
        <LoginScreen
          darkMode={darkMode}
          onToggleDarkMode={handleToggleDarkMode}
          externalError={authError}
          onClearExternalError={() => {
            setAuthError(null);
            setAuthTimedOut(false);
          }}
          onRetryAuth={authTimedOut ? handleRetryAuth : undefined}
        />
      </>
    );
  }

  // Urgent & task counts scoped by role and project access
  const urgentIssuesCount = issues.filter(
    (i) => i.priority === 'urgent' && i.status !== 'resolved' && canAccessProject(currentUser, i.projectId)
  ).length;

  const userOpenTasksCount = tasks.filter(
    (t) => t.status !== 'done' && canAccessProject(currentUser, t.projectId)
  ).length;

  const pendingDeliverablesCount = siteDeliverables.filter(
    (d) =>
      d.status === 'pending_receipt' &&
      (d.senderId === currentUser.id || canAccessProject(currentUser, d.projectId))
  ).length;

  const canAccessExecutedWorks = canAccessExecutedWorksTab(currentUser);
  const canAccessSiteDeliverables = canAccessSiteDeliverablesTab(currentUser);

  const todayDateStr = getTodayDateStr();
  const personalNotesPendingCount = personalNotes.filter(
    (n) => n.userId === currentUser.id && !n.isCompleted && n.noteDate <= todayDateStr
  ).length;

  return (
    <div className="min-h-[100dvh] flex flex-col overflow-x-clip bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors font-sans antialiased">
      {quotaBanner}
      {/* Top Application Header */}
      <Header
        currentUser={currentUser}
        activeTab={activeTab}
        onNavigateTab={(tabId) => setActiveTab(tabId)}
        darkMode={darkMode}
        onToggleDarkMode={handleToggleDarkMode}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLogout={handleLogout}
        onOpenShare={() => setIsShareOpen(true)}
        notifications={notifications}
      />

      {/* Main Navigation Bar */}
      <Navigation
        role={currentUser.role}
        activeTab={activeTab}
        onTabChange={(tabId) => setActiveTab(tabId)}
        urgentIssuesCount={urgentIssuesCount}
        openTasksCount={userOpenTasksCount}
        pendingDeliverablesCount={pendingDeliverablesCount}
        personalNotesPendingCount={personalNotesPendingCount}
        canAccessExecutedWorks={canAccessExecutedWorks}
        canAccessSiteDeliverables={canAccessSiteDeliverables}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 transition-all pb-24 md:pb-8">
        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-600 dark:text-slate-300">
              <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
              <span className="text-sm font-semibold">جاري تحميل الشاشة...</span>
            </div>
          }
        >
        {/* SITE USER SCREENS */}
        {currentUser.role === 'site' && (
          <>
            {activeTab === 'daily-report' && (
              <DailyReportForm
                currentUser={currentUser}
                projects={projects}
                reports={reports}
                onReportSubmitted={() => setActiveTab('my-submissions')}
              />
            )}

            {activeTab === 'site-deliverables' && canAccessSiteDeliverables && (
              <SiteDeliverablesView
                currentUser={currentUser}
                projects={projects}
                deliverables={siteDeliverables}
              />
            )}

            {activeTab === 'executed-works' && canAccessExecutedWorks && (
              <ExecutedWorksView
                currentUser={currentUser}
                projects={projects}
                executedWorks={executedWorks}
              />
            )}

            {activeTab === 'report-issue' && (
              <IssueReportForm
                currentUser={currentUser}
                projects={projects}
                onIssueReported={() => setActiveTab('my-submissions')}
              />
            )}

            {activeTab === 'my-submissions' && (
              <MySubmissionsView
                currentUser={currentUser}
                projects={projects}
                reports={reports}
                issues={issues}
              />
            )}

            {activeTab === 'my-tasks' && (
              <MyTasksView currentUser={currentUser} tasks={tasks} />
            )}
          </>
        )}

        {/* ADMIN (DC MANAGER) SCREENS */}
        {currentUser.role === 'admin' && (
          <>
            {activeTab === 'dashboard' && (
              <AdminDashboard
                projects={projects}
                reports={reports}
                issues={issues}
                tasks={tasks}
                onNavigateTab={(tabId) => setActiveTab(tabId)}
              />
            )}

            {activeTab === 'reports' && (
              <AdminReportsView
                reports={reports}
                projects={projects}
                users={users}
                currentUser={currentUser}
              />
            )}

            {activeTab === 'site-deliverables' && (
              <SiteDeliverablesView
                currentUser={currentUser}
                projects={projects}
                deliverables={siteDeliverables}
                users={users}
              />
            )}

            {activeTab === 'executed-works' && (
              <ExecutedWorksView
                currentUser={currentUser}
                projects={projects}
                executedWorks={executedWorks}
                users={users}
              />
            )}

            {activeTab === 'submittal-tracker' && (
              <SubmittalTrackerView
                reports={reports}
                projects={projects}
                stalledDaysThreshold={stalledDays}
                onUpdateStalledDays={handleUpdateStalledDays}
              />
            )}

            {activeTab === 'issues' && (
              <AdminIssuesView
                issues={issues}
                projects={projects}
                users={users}
              />
            )}

            {activeTab === 'tasks' && (
              <AdminTasksView
                tasks={tasks}
                projects={projects}
                currentUser={currentUser}
              />
            )}

            {activeTab === 'projects' && (
              <AdminProjectsView
                projects={projects}
                reports={reports}
                issues={issues}
                tasks={tasks}
                users={users}
                siteDeliverables={siteDeliverables}
                executedWorks={executedWorks}
                onNavigateTab={setActiveTab}
              />
            )}

            {activeTab === 'users' && (
              <AdminUsersView
                users={users}
                projects={projects}
                currentUser={currentUser}
              />
            )}

            {activeTab === 'export-center' && (
              <ExportCenterView
                reports={reports}
                issues={issues}
                projects={projects}
              />
            )}
          </>
        )}

        {/* SHARED PRIVATE PERSONAL NOTES SCREEN (FOR EVERY USER) */}
        {activeTab === 'personal-notes' && (
          <PersonalNotesView
            currentUser={currentUser}
            personalNotes={personalNotes}
          />
        )}

        {/* SHARED USER PROFILE SCREEN (FOR EVERY USER) */}
        {activeTab === 'profile' && (
          <UserProfileView
            currentUser={currentUser}
            projects={projects}
          />
        )}
        </Suspense>
      </main>

      {/* Global Drawers & Modals */}
      <NotificationsDrawer
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onNavigateTab={(tabId) => setActiveTab(tabId)}
        onOpenPreferences={() => setIsSettingsOpen(true)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentUser={currentUser}
        onUpdateNotificationPreferences={handleUpdateNotificationPreferences}
        brandColor={brandColor}
        onUpdateBrandColor={handleUpdateBrandColor}
        stalledDays={stalledDays}
        onUpdateStalledDays={handleUpdateStalledDays}
        cutoffHour={cutoffHour}
        onUpdateCutoffHour={handleUpdateCutoffHour}
        onResetSeedData={handleResetSeedData}
      />

      <ShareAppModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
      />

      {/* Live Real-Time Notification Floating Toast */}
      {liveToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-6 left-4 right-4 sm:right-auto sm:w-96 z-50 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-2xl shadow-2xl p-3.5 flex items-start gap-3 animate-in slide-in-from-bottom-4 duration-200"
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              liveToast.type === 'urgent_issue'
                ? 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400'
                : 'bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
            }`}
          >
            <BellRing className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                {liveToast.title}
              </h4>
              <button
                onClick={() => setLiveToast(null)}
                className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded cursor-pointer shrink-0"
                aria-label="إغلاق التنبيه"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2 leading-relaxed">
              {liveToast.message}
            </p>
            <div className="flex items-center justify-between gap-2 mt-2">
              <span className="text-[10px] text-slate-400">
                {liveToast.senderName ? `من: ${liveToast.senderName}` : 'إشعار فوري'}
              </span>
              <button
                onClick={() => {
                  dataService.markNotificationAsRead(liveToast.id);
                  if (liveToast.linkTab) {
                    setActiveTab(liveToast.linkTab);
                  } else {
                    setIsNotificationsOpen(true);
                  }
                  setLiveToast(null);
                }}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>عرض</span>
                <ArrowUpLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
