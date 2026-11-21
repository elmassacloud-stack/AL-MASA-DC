import React, { useState } from 'react';
import {
  FileText,
  AlertTriangle,
  ClipboardList,
  CheckSquare,
  LayoutDashboard,
  Search,
  BellRing,
  Users,
  Download,
  LayoutGrid,
  Building2,
  Hammer,
  FileUp,
  NotebookPen,
  FileSpreadsheet,
  UserCircle2,
  X
} from 'lucide-react';
import { UserRole } from '../../types';

interface NavItem {
  id: string;
  label: string;
  mobileLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface Props {
  role: UserRole;
  activeTab: string;
  onTabChange: (tabId: string) => void;
  urgentIssuesCount?: number;
  openTasksCount?: number;
  pendingDeliverablesCount?: number;
  personalNotesPendingCount?: number;
  canAccessExecutedWorks?: boolean;
  canAccessSiteDeliverables?: boolean;
}

export const Navigation: React.FC<Props> = ({
  role,
  activeTab,
  onTabChange,
  urgentIssuesCount = 0,
  openTasksCount = 0,
  pendingDeliverablesCount = 0,
  personalNotesPendingCount = 0,
  canAccessExecutedWorks = true,
  canAccessSiteDeliverables = true
}) => {
  const [isMoreDrawerOpen, setIsMoreDrawerOpen] = useState(false);

  // Navigation tabs for Site user
  const siteNavItems: NavItem[] = [
    { id: 'daily-report', label: 'تقرير اليوم', mobileLabel: 'التقرير', icon: FileText },
    ...(canAccessSiteDeliverables
      ? [{ id: 'site-deliverables', label: 'تسليمات الموقع', mobileLabel: 'التسليمات', icon: FileUp }]
      : []),
    ...(canAccessExecutedWorks
      ? [{ id: 'executed-works', label: 'الأعمال المنفذة', mobileLabel: 'المنفذة', icon: Hammer }]
      : []),
    { id: 'report-issue', label: 'إبلاغ عن عائق', mobileLabel: 'عائق', icon: AlertTriangle },
    { id: 'my-submissions', label: 'تقديماتي', mobileLabel: 'تقديماتي', icon: ClipboardList },
    { id: 'my-tasks', label: 'مهامي', mobileLabel: 'مهامي', icon: CheckSquare, badge: openTasksCount },
    {
      id: 'personal-notes',
      label: 'مهامي الشخصية',
      mobileLabel: 'الشخصية',
      icon: NotebookPen,
      badge: personalNotesPendingCount
    },
    { id: 'profile', label: 'ملفي الشخصي', mobileLabel: 'حسابي', icon: UserCircle2 }
  ];

  // Navigation tabs for Admin (DC Manager)
  const adminNavItems: NavItem[] = [
    { id: 'dashboard', label: 'المؤشرات', mobileLabel: 'المؤشرات', icon: LayoutDashboard },
    { id: 'reports', label: 'التقارير', mobileLabel: 'التقارير', icon: FileText },
    {
      id: 'site-deliverables',
      label: 'تسليمات الموقع',
      mobileLabel: 'التسليمات',
      icon: FileUp,
      badge: pendingDeliverablesCount
    },
    { id: 'executed-works', label: 'الأعمال المنفذة', mobileLabel: 'المنفذة', icon: Hammer },
    { id: 'submittal-tracker', label: 'تتبع التقديمات', icon: Search },
    { id: 'excel-logs', label: 'شيتات Logs', icon: FileSpreadsheet },
    { id: 'issues', label: 'المشكلات', icon: AlertTriangle, badge: urgentIssuesCount },
    { id: 'tasks', label: 'المهام', icon: CheckSquare },
    {
      id: 'personal-notes',
      label: 'مهامي الشخصية',
      icon: NotebookPen,
      badge: personalNotesPendingCount
    },
    { id: 'announcements', label: 'التعاميم', icon: BellRing },
    { id: 'projects', label: 'إدارة المشاريع', icon: Building2 },
    { id: 'users', label: 'إدارة المستخدمين', icon: Users },
    { id: 'export', label: 'التصدير', icon: Download },
    { id: 'profile', label: 'ملفي الشخصي', mobileLabel: 'حسابي', icon: UserCircle2 }
  ];

  const items = role === 'admin' ? adminNavItems : siteNavItems;
  // Android Material Design guideline: max 5 destinations on mobile bottom bar (4 primary + 1 More)
  const hasMoreMenu = items.length > 5;
  const mobilePrimaryItems = hasMoreMenu ? items.slice(0, 4) : items;
  const mobileMoreItems = hasMoreMenu ? items.slice(4) : [];
  const isMoreTabActive = mobileMoreItems.some((m) => m.id === activeTab);
  const moreBadgesTotal = mobileMoreItems.reduce((sum, item) => sum + (item.badge || 0), 0);

  const handleSelectTab = (tabId: string) => {
    setIsMoreDrawerOpen(false);
    onTabChange(tabId);
  };

  return (
    <>
      {/* Desktop / Tablet Sub-header Navigation */}
      <nav className="hidden md:block bg-slate-100/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 py-2 px-4 transition-colors">
        <div className="max-w-7xl mx-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap cursor-pointer touch-manipulation ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-tight ${
                      isActive ? 'bg-white text-blue-600' : 'bg-red-500 text-white'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Android Slide-Up Bottom Sheet for Secondary ("المزيد") Tabs */}
      {hasMoreMenu && isMoreDrawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-end"
          onClick={() => setIsMoreDrawerOpen(false)}
        >
          <div
            className="w-full bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 shadow-2xl pb-safe max-h-[80dvh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag Handle */}
            <div className="flex justify-center pt-2.5 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>

            {/* Sheet Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                جميع الأقسام
              </h3>
              <button
                type="button"
                onClick={() => setIsMoreDrawerOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="إغلاق القائمة"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 2-Column Touch-Friendly Grid */}
            <div className="p-3.5 grid grid-cols-2 gap-2.5 overflow-y-auto">
              {mobileMoreItems.map((moreItem) => {
                const Icon = moreItem.icon;
                const isActive = activeTab === moreItem.id;
                return (
                  <button
                    key={moreItem.id}
                    type="button"
                    onClick={() => handleSelectTab(moreItem.id)}
                    className={`relative flex items-center gap-2.5 px-3.5 py-3.5 rounded-2xl border text-right transition-all touch-manipulation cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800/70 text-slate-800 dark:text-slate-100 border-slate-200/80 dark:border-slate-700/80 active:bg-slate-200 dark:active:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border border-slate-200/70 dark:border-slate-700'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold leading-snug flex-1 min-w-0">
                      {moreItem.label}
                    </span>
                    {moreItem.badge !== undefined && moreItem.badge > 0 && (
                      <span
                        className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                          isActive ? 'bg-white text-blue-600' : 'bg-red-600 text-white'
                        }`}
                      >
                        {moreItem.badge > 99 ? '99+' : moreItem.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mobile / Android Bottom Navigation Bar (5 clean Material-style destinations) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe transition-colors shadow-[0_-4px_16px_rgba(15,23,42,0.06)]">
        <div
          className={`grid h-16 px-1 ${
            hasMoreMenu
              ? 'grid-cols-5'
              : mobilePrimaryItems.length === 4
                ? 'grid-cols-4'
                : 'grid-cols-5'
          }`}
        >
          {mobilePrimaryItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 relative transition-colors touch-manipulation cursor-pointer ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400 font-bold'
                    : 'text-slate-600 dark:text-slate-400 font-medium'
                }`}
              >
                <div
                  className={`relative px-3 py-1 rounded-full transition-colors ${
                    isActive ? 'bg-blue-50 dark:bg-blue-950/70' : ''
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -top-1 left-0.5 min-w-[16px] h-4 px-1 bg-red-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] leading-tight truncate max-w-full">
                  {item.mobileLabel || item.label}
                </span>
              </button>
            );
          })}

          {hasMoreMenu && (
            <button
              type="button"
              onClick={() => setIsMoreDrawerOpen((prev) => !prev)}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 relative transition-colors touch-manipulation cursor-pointer ${
                isMoreTabActive || isMoreDrawerOpen
                  ? 'text-blue-600 dark:text-blue-400 font-bold'
                  : 'text-slate-600 dark:text-slate-400 font-medium'
              }`}
            >
              <div
                className={`relative px-3 py-1 rounded-full transition-colors ${
                  isMoreTabActive || isMoreDrawerOpen ? 'bg-blue-50 dark:bg-blue-950/70' : ''
                }`}
              >
                <LayoutGrid className="w-5 h-5" />
                {moreBadgesTotal > 0 && (
                  <span className="absolute -top-1 left-0.5 min-w-[16px] h-4 px-1 bg-red-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {moreBadgesTotal > 9 ? '9+' : moreBadgesTotal}
                  </span>
                )}
              </div>
              <span className="text-[10px] leading-tight truncate max-w-full">المزيد</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
};
