import React, { useState, useEffect } from 'react';
import { Header } from './components/common/Header';
import { Navigation } from './components/common/Navigation';
import { LoginModal } from './components/common/LoginModal';
import { NotificationsDrawer } from './components/common/NotificationsDrawer';
import { SettingsModal } from './components/common/SettingsModal';
import { ShareAppModal } from './components/common/ShareAppModal';

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
import { AdminUsersView } from './components/admin/AdminUsersView';
import { ExportCenterView } from './components/admin/ExportCenterView';

import { dataService } from './services/dataService';
import {
  UserProfile,
  Project,
  DailyReport,
  IssueReport,
  ProjectTask,
  Announcement,
  AppNotification
} from './types';

export default function App() {
  // Theme state
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('dc_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Active user session
  const [currentUser, setCurrentUser] = useState<UserProfile>(() =>
    dataService.getCurrentUser()
  );

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<string>(() =>
    currentUser.role === 'admin' ? 'dashboard' : 'daily-report'
  );

  // Live collections state
  const [projects, setProjects] = useState<Project[]>(() => dataService.getProjects());
  const [reports, setReports] = useState<DailyReport[]>(() => dataService.getReports());
  const [issues, setIssues] = useState<IssueReport[]>(() => dataService.getIssues());
  const [tasks, setTasks] = useState<ProjectTask[]>(() => dataService.getTasks());
  const [announcements, setAnnouncements] = useState<Announcement[]>(() =>
    dataService.getAnnouncements()
  );
  const [users, setUsers] = useState<UserProfile[]>(() => dataService.getUsers());
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    dataService.getNotifications()
  );
  const [stalledDays, setStalledDays] = useState<number>(() =>
    dataService.getStalledDaysThreshold()
  );
  const [cutoffHour, setCutoffHour] = useState<number>(() =>
    dataService.getCutoffHour()
  );

  // Modals state
  const [isLoginOpen, setIsLoginOpen] = useState<boolean>(false);
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

  // Subscribe to reactive data store changes
  useEffect(() => {
    const unsubscribe = dataService.subscribe(() => {
      setProjects(dataService.getProjects());
      setReports(dataService.getReports());
      setIssues(dataService.getIssues());
      setTasks(dataService.getTasks());
      setAnnouncements(dataService.getAnnouncements());
      setUsers(dataService.getUsers());
      setNotifications(dataService.getNotifications());
      setStalledDays(dataService.getStalledDaysThreshold());
      setCutoffHour(dataService.getCutoffHour());
      setCurrentUser(dataService.getCurrentUser());
    });
    return unsubscribe;
  }, []);

  // When current user changes role, adjust active tab safely
  const handleSelectUser = (user: UserProfile) => {
    dataService.setCurrentUser(user);
    setCurrentUser(user);
    if (user.role === 'admin') {
      setActiveTab('dashboard');
    } else {
      setActiveTab('daily-report');
    }
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

  const handleResetSeedData = () => {
    dataService.resetToSeed();
    const freshUser = dataService.getCurrentUser();
    setCurrentUser(freshUser);
    setActiveTab(freshUser.role === 'admin' ? 'dashboard' : 'daily-report');
  };

  // Urgent counts for navigation badges
  const urgentIssuesCount = issues.filter(
    (i) => i.priority === 'urgent' && i.status !== 'resolved'
  ).length;

  const userOpenTasksCount = tasks.filter(
    (t) =>
      t.status !== 'done' &&
      (currentUser.role === 'admin' || currentUser.assignedProjects.includes(t.projectId))
  ).length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors font-sans antialiased">
      {/* Top Application Header */}
      <Header
        currentUser={currentUser}
        darkMode={darkMode}
        onToggleDarkMode={handleToggleDarkMode}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAuth={() => setIsLoginOpen(true)}
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
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 transition-all">
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

            {activeTab === 'submittal-tracker' && (
              <SubmittalTrackerView
                reports={reports}
                stalledDaysThreshold={stalledDays}
                onUpdateStalledDays={handleUpdateStalledDays}
              />
            )}

            {activeTab === 'issues' && (
              <AdminIssuesView issues={issues} projects={projects} />
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

            {activeTab === 'users' && (
              <AdminUsersView
                users={users}
                projects={projects}
                currentUser={currentUser}
                onSwitchUser={handleSelectUser}
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

      {/* Global Modals & Drawers */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        users={users}
        currentUser={currentUser}
        onSelectUser={handleSelectUser}
      />

      <NotificationsDrawer
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onNavigateTab={(tabId) => setActiveTab(tabId)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
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
    </div>
  );
}
