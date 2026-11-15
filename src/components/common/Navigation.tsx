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
  FolderGit2,
  Building2
} from 'lucide-react';
import { UserRole } from '../../types';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface Props {
  role: UserRole;
  activeTab: string;
  onTabChange: (tabId: string) => void;
  urgentIssuesCount?: number;
  openTasksCount?: number;
}

export const Navigation: React.FC<Props> = ({
  role,
  activeTab,
  onTabChange,
  urgentIssuesCount = 0,
  openTasksCount = 0
}) => {
  // Navigation tabs for Site user
  const siteNavItems: NavItem[] = [
    { id: 'daily-report', label: 'تقرير اليوم', icon: FileText },
    { id: 'report-issue', label: 'إبلاغ عن عائق', icon: AlertTriangle },
    { id: 'my-submissions', label: 'تقديماتي', icon: ClipboardList },
    { id: 'my-tasks', label: 'مهامي', icon: CheckSquare, badge: openTasksCount }
  ];

  // Navigation tabs for Admin (DC Manager)
  const adminNavItems: NavItem[] = [
    { id: 'dashboard', label: 'المؤشرات', icon: LayoutDashboard },
    { id: 'reports', label: 'التقارير', icon: FileText },
    { id: 'submittal-tracker', label: 'تتبع التقديمات', icon: Search },
    { id: 'issues', label: 'المشكلات', icon: AlertTriangle, badge: urgentIssuesCount },
    { id: 'tasks', label: 'المهام', icon: CheckSquare },
    { id: 'announcements', label: 'التعاميم', icon: BellRing },
    { id: 'projects', label: 'إدارة المشاريع', icon: Building2 },
    { id: 'users', label: 'إدارة المستخدمين', icon: Users },
    { id: 'export', label: 'التصدير', icon: Download }
  ];

  const items = role === 'admin' ? adminNavItems : siteNavItems;

  return (
    <>
      {/* Desktop / Tablet Sub-header Navigation (Horizontal scrollable pills) */}
      <nav className="hidden md:block bg-slate-100/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 py-2 px-4 transition-colors">
        <div className="max-w-7xl mx-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
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
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold leading-tight ${
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

      {/* Mobile Bottom Navigation Bar (Sticky, touch-friendly, high ergonomics) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe transition-colors shadow-lg">
        <div className="flex items-center justify-around h-16 px-1">
          {items.slice(0, role === 'admin' ? 5 : 4).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex-1 flex flex-col items-center justify-center py-1 px-1 h-full relative transition-colors touch-manipulation ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400 font-bold'
                    : 'text-slate-700 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-300 font-medium'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${isActive ? 'scale-110 text-blue-600 dark:text-blue-400' : ''}`} />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 w-4 h-4 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[11px] mt-1 leading-tight tracking-tight truncate max-w-[68px]">
                  {item.label}
                </span>
                {isActive && (
                  <span className="absolute top-0 w-8 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
                )}
              </button>
            );
          })}

          {/* If admin, show "More" button for remaining tabs */}
          {role === 'admin' && items.length > 5 && (
            <button
              onClick={() =>
                onTabChange(
                  ['announcements', 'projects', 'users', 'export'].includes(activeTab)
                    ? activeTab
                    : 'projects'
                )
              }
              className={`flex-1 flex flex-col items-center justify-center py-1 px-1 h-full relative transition-colors ${
                ['announcements', 'projects', 'users', 'export'].includes(activeTab)
                  ? 'text-blue-600 dark:text-blue-400 font-bold'
                  : 'text-slate-700 dark:text-slate-300 font-medium'
              }`}
            >
              <FolderGit2 className="w-5 h-5" />
              <span className="text-[11px] mt-1 leading-tight truncate">المزيد</span>
              {['announcements', 'projects', 'users', 'export'].includes(activeTab) && (
                <span className="absolute top-0 w-8 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
              )}
            </button>
          )}
        </div>

        {/* Secondary drawer pills if "More" tabs are active on mobile */}
        {role === 'admin' && ['announcements', 'projects', 'users', 'export'].includes(activeTab) && (
          <div className="flex items-center justify-center flex-wrap gap-1.5 py-1.5 bg-slate-100 dark:bg-slate-800/90 border-t border-slate-200 dark:border-slate-700 px-2 text-xs">
            <button
              onClick={() => onTabChange('projects')}
              className={`px-2.5 py-1 rounded-md font-semibold ${
                activeTab === 'projects'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              إدارة المشاريع
            </button>
            <button
              onClick={() => onTabChange('users')}
              className={`px-2.5 py-1 rounded-md font-semibold ${
                activeTab === 'users'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              إدارة المستخدمين
            </button>
            <button
              onClick={() => onTabChange('announcements')}
              className={`px-2.5 py-1 rounded-md font-semibold ${
                activeTab === 'announcements'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              التعاميم
            </button>
            <button
              onClick={() => onTabChange('export')}
              className={`px-2.5 py-1 rounded-md font-semibold ${
                activeTab === 'export'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              التصدير
            </button>
          </div>
        )}
      </nav>
    </>
  );
};
