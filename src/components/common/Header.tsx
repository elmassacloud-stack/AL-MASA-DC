import {
  Building2,
  Bell,
  Sun,
  Moon,
  SlidersHorizontal,
  UserCheck,
  LogOut,
  FolderArchive,
  Share2
} from 'lucide-react';
import { UserProfile, AppNotification } from '../../types';

interface Props {
  currentUser: UserProfile;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  onOpenAuth: () => void;
  onOpenShare?: () => void;
  notifications: AppNotification[];
}

export const Header: React.FC<Props> = ({
  currentUser,
  darkMode,
  onToggleDarkMode,
  onOpenNotifications,
  onOpenSettings,
  onOpenAuth,
  onOpenShare,
  notifications
}) => {
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
        {/* Logo and Department Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
            <FolderArchive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white leading-none">
                متابعة المواقع
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                DC
              </span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 hidden xs:block mt-0.5 font-medium">
              إدارة مراقبة الوثائق والمشاريع
            </p>
          </div>
        </div>

        {/* Action Controls & User Badge */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Notifications Bell */}
          <button
            onClick={onOpenNotifications}
            className="relative p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors touch-manipulation"
            aria-label="التنبيهات"
            title="التنبيهات والإشعارات"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 left-1 w-5 h-5 bg-red-600 text-white text-[11px] font-bold rounded-full flex items-center justify-center shadow-xs animate-bounce">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Dark / Light Mode Toggle */}
          <button
            onClick={onToggleDarkMode}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors touch-manipulation"
            aria-label={darkMode ? 'الوضع النهاري' : 'الوضع الليلي'}
            title={darkMode ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
          >
            {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Settings Trigger */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors touch-manipulation"
            aria-label="الإعدادات"
            title="إعدادات النظام والمدد الزمنية"
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>

          {/* Share App URL Trigger */}
          {onOpenShare && (
            <button
              onClick={onOpenShare}
              className="p-2 rounded-lg text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors touch-manipulation flex items-center gap-1.5 cursor-pointer"
              aria-label="رابط التطبيق والمشاركة"
              title="مشاركة رابط التطبيق مع مهندسي المواقع"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden md:inline text-xs font-bold">
                رابط التطبيق
              </span>
            </button>
          )}

          <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />

          {/* User Account / Role Switcher Pill */}
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-2 py-1.5 px-2.5 sm:px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 bg-slate-50 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 transition-all text-right"
            title="تبديل المستخدم أو تسجيل الخروج"
          >
            <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
              <UserCheck className="w-4 h-4" />
            </div>
            <div className="hidden sm:block text-right leading-tight">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                {currentUser.displayName}
              </div>
              <div className="text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                {currentUser.role === 'admin' ? 'مدير DC' : 'مهندس موقع'}
              </div>
            </div>
            <LogOut className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300 mr-1" />
          </button>
        </div>
      </div>
    </header>
  );
};
