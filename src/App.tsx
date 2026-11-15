import React, { useState, useEffect } from 'react';
import { Loader2, FolderArchive } from 'lucide-react';
import { Header } from './components/common/Header';
import { Navigation } from './components/common/Navigation';
import { LoginScreen } from './components/common/LoginScreen';
import { NotificationsDrawer } from './components/common/NotificationsDrawer';
import { SettingsModal } from './components/common/SettingsModal';
import { ShareAppModal } from './components/common/ShareAppModal';
import { ExecutedWorksView } from './components/common/ExecutedWorksView';

// Site User Views
import { DailyReportForm } from './components/site/DailyReportForm';
import { IssueReportForm } from './components/site/IssueReportForm';
import { MySubmissionsView } from './components/site/MySubmissionsView';
import { MyTasksView } from './components/site/MyTasksView';

// Admin Views
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminReportsView } from './components/admin/AdminReportsView';
import { SubmittalTrackerView } from './components/admin/SubmittalTrackerView';
import { AdminIssuesView } from './components/admin/AdminIssuesView';
import { AdminTasksView } from './components/admin/AdminTasksView';
import { AdminAnnouncementsView } from './components/admin/AdminAnnouncementsView';
import { AdminProjectsView } from './components/admin/AdminProjectsView';
import { AdminUsersView } from './components/admin/AdminUsersView';
import { ExportCenterView } from './components/admin/ExportCenterView';

import { dataService } from './services/dataService';
import { subscribeToAuthState, signOutUser } from './services/firebase';
import { canAccessProject, canAccessExecutedWorksTab } from './utils/accessControl';
import {
  UserProfile,
  Project,
  DailyReport,
  IssueReport,
  ProjectTask,
  Announcement,
  AppNotification,
  ExecutedWork
} from './types';

export default function App() {
  // Theme state
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('dc_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Firebase Auth Gate State (No dashboard access until authenticated & authorized)
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<string>('daily-report');

  // Live collections state
  const [projects, setProjects] = useState<Project[]>(() => dataService.getProjects());
  const [reports, setReports] = useState<DailyReport[]>(() => dataService.getReports());
  const [issues, setIssues] = useState<IssueReport[]>(() => dataService.getIssues());
  const [tasks, setTasks] = useState<ProjectTask[]>(() => dataService.getTasks());
  const [announcements, setAnnouncements] = useState<Announcement[]>(() =>
    dataService.getAnnouncements()
  );
  const [executedWorks, setExecutedWorks] = useState<ExecutedWork[]>(() =>
    dataService.getExecutedWorks()
  );
  const [users, setUsers] = useState<UserProfile[]>(() => dataService.getUsers());
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    dataService.getNotifications(null)
  );
  const [stalledDays, setStalledDays] = useState<number>(() =>
    dataService.getStalledDaysThreshold()
  );
  const [cutoffHour, setCutoffHour] = useState<number>(() =>
    dataService.getCutoffHour()
  );

  // Modals state
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isShareOpen, setIsShareOpen] = useState<boolean>(false);

  // Sync dark mode class with HTML element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('dc_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('dc_theme', 'light');
    }
  }, [darkMode]);

  // Listen to Firebase Auth State
  useEffect(() => {
    let active = true;
    const unsubscribeAuth = subscribeToAuthState(async (firebaseUser) => {
      if (!active) return;

      if (!firebaseUser) {
        dataService.clearSession();
        setCurrentUser(null);
        setAuthChecking(false);
        return;
      }

      setAuthChecking(true);
      try {
        const resolvedProfile = await dataService.resolveAuthenticatedProfile(firebaseUser);
        if (!active) return;
        setAuthError(null);
        setCurrentUser(resolvedProfile);
        setActiveTab(resolvedProfile.role === 'admin' ? 'dashboard' : 'daily-report');
      } catch (err) {
        if (!active) return;
        const code = err instanceof Error ? err.message : '';
        if (code === 'ACCOUNT_DISABLED') {
          setAuthError('هذا الحساب معطل حالياً. يرجى التواصل مع مسؤول النظام لإعادة التفعيل.');
        } else if (code === 'ACCOUNT_NOT_AUTHORIZED') {
          setAuthError('هذا الحساب غير مسجل أو تم حذفه من قبل مسؤول النظام.');
        } else {
          setAuthError('تعذر التحقق من صلاحيات الحساب. يرجى المحاولة مرة أخرى.');
        }
        await signOutUser().catch(() => undefined);
        dataService.clearSession();
        setCurrentUser(null);
      } finally {
        if (active) setAuthChecking(false);
      }
    });

    return () => {
      active = false;
      unsubscribeAuth();
      dataService.stopRealtimeSync();
    };
  }, []);

  // Subscribe to reactive data store changes
  useEffect(() => {
    const unsubscribe = dataService.subscribe(() => {
      const activeUser = dataService.getCurrentUser();
      setProjects(dataService.getProjects());
      setReports(dataService.getReports());
      setIssues(dataService.getIssues());
      setTasks(dataService.getTasks());
      setAnnouncements(dataService.getAnnouncements());
      setExecutedWorks(dataService.getExecutedWorks());
      setUsers(dataService.getUsers());
      setNotifications(dataService.getNotifications(activeUser));
      setStalledDays(dataService.getStalledDaysThreshold());
      setCutoffHour(dataService.getCutoffHour());
      setCurrentUser((prev) => {
        if (prev && !activeUser) {
          // Session was revoked (disabled or deleted in real-time)
          signOutUser().catch(() => undefined);
          setAuthError('تم تحديث حالة حسابك أو إيقافه من قبل مسؤول النظام.');
        }
        return activeUser;
      });
    });
    return unsubscribe;
  }, []);

  // Redirect away from Executed Works tab immediately if permission is revoked
  useEffect(() => {
    if (currentUser && !canAccessExecutedWorksTab(currentUser) && activeTab === 'executed-works') {
      setActiveTab('daily-report');
    }
  }, [currentUser, activeTab]);

  const handleLogout = async () => {
    setIsNotificationsOpen(false);
    setIsSettingsOpen(false);
    setIsShareOpen(false);
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

  // Strict Auth Gate: Show ONLY LoginScreen when unauthenticated
  if (!currentUser) {
    return (
      <LoginScreen
        darkMode={darkMode}
        onToggleDarkMode={handleToggleDarkMode}
        externalError={authError}
        onClearExternalError={() => setAuthError(null)}
      />
    );
  }

  // Urgent & task counts scoped by role and project access
  const urgentIssuesCount = issues.filter(
    (i) => i.priority === 'urgent' && i.status !== 'resolved' && canAccessProject(currentUser, i.projectId)
  ).length;

  const userOpenTasksCount = tasks.filter(
    (t) => t.status !== 'done' && canAccessProject(currentUser, t.projectId)
  ).length;

  const canAccessExecutedWorks = canAccessExecutedWorksTab(currentUser);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors font-sans antialiased">
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
        canAccessExecutedWorks={canAccessExecutedWorks}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 transition-all pb-24 md:pb-8">
        {/* SITE USER SCREENS */}
        {currentUser.role === 'site' && (
          <>
            {activeTab === 'daily-report' && (
              <DailyReportForm
                currentUser={currentUser}
                projects={projects}
                onReportSubmitted={() => setActiveTab('my-submissions')}
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
                announcements={announcements}
                onNavigateTab={(tabId) => setActiveTab(tabId)}
              />
            )}

            {activeTab === 'reports' && (
              <AdminReportsView
                reports={reports}
                projects={projects}
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

            {activeTab === 'announcements' && (
              <AdminAnnouncementsView
                announcements={announcements}
                projects={projects}
                users={users}
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
              />
            )}

            {activeTab === 'users' && (
              <AdminUsersView
                users={users}
                projects={projects}
                currentUser={currentUser}
              />
            )}

            {activeTab === 'export' && (
              <ExportCenterView
                reports={reports}
                issues={issues}
                projects={projects}
              />
            )}
          </>
        )}
      </main>

      {/* Global Drawers & Modals */}
      <NotificationsDrawer
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onNavigateTab={(tabId) => setActiveTab(tabId)}
      />

      {currentUser.role === 'admin' && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          stalledDays={stalledDays}
          onUpdateStalledDays={handleUpdateStalledDays}
          cutoffHour={cutoffHour}
          onUpdateCutoffHour={handleUpdateCutoffHour}
          onResetSeedData={handleResetSeedData}
        />
      )}

      <ShareAppModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
      />
    </div>
  );
}
