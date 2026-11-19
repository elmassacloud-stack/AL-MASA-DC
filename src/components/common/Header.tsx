import React from 'react';
import {
  Bell,
  Sun,
  Moon,
  SlidersHorizontal,
  UserCheck,
  LogOut,
  Share2,
  Users
} from 'lucide-react';
import { UserProfile, AppNotification } from '../../types';

interface Props {
  currentUser: UserProfile;
  activeTab: string;
  onNavigateTab: (tabId: string) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onOpenShare?: () => void;
  notifications: AppNotification[];
}

export const Header: React.FC<Props> = ({
  currentUser,
  activeTab,
  onNavigateTab,
  darkMode,
  onToggleDarkMode,
  onOpenNotifications,
  onOpenSettings,
  onLogout,
  onOpenShare,
  notifications
}) => {
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const isAdmin = currentUser.role === 'admin';

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
        {/* Logo and Department Brand */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 sm:h-11 px-2 py-1 rounded-xl bg-white border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex items-center justify-center shrink-0">
            <img
              src="/assets/aistudio/WhatsApp_Image_2026-10-28_at_10.05.14_AM_da55daa3.jpeg"
              alt="شعار شركة الماسة للمقاولات"
              className="h-full w-auto max-w-[120px] sm:max-w-[140px] object-contain"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white leading-none whitespace-nowrap">
                متابعة المواقع
              </h1>
              <span
                dir="ltr"
                className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0 whitespace-nowrap"
              >
                DC DEPARTMENT
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 hidden sm:block mt-0.5 font-medium truncate">
              إدارة مراقبة الوثائق والمشاريع
            </p>
          </div>
        </div>

        {/* Action Controls, Admin User Management Tab & User Session */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Admin-only top header navigation tab: إدارة المستخدمين */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => onNavigateTab('users')}
              className={`px-2.5 sm:px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer touch-manipulation ${
                activeTab === 'users'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                  : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60'
              }`}
              title="إدارة حسابات المستخدمين والصلاحيات"
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>إدارة المستخدمين</span>
            </button>
          )}

          {/* Notifications Bell */}
          <button
            type="button"
            onClick={onOpenNotifications}
            className="relative p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors touch-manipulation shrink-0 cursor-pointer"
            aria-label="التنبيهات"
            title="التنبيهات والإشعارات"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 left-0.5 min-w-[18px] h-[18px] px-1 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs tabular-nums">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Dark / Light Mode Toggle */}
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors touch-manipulation shrink-0 cursor-pointer"
            aria-label={darkMode ? 'الوضع النهاري' : 'الوضع الليلي'}
            title={darkMode ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
          >
            {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Settings Trigger (Notification Preferences for all users + System Settings for Admin) */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors touch-manipulation shrink-0 cursor-pointer"
            aria-label="الإعدادات وتفضيلات الإشعارات"
            title={isAdmin ? 'الإعدادات وتفضيلات الإشعارات' : 'تفضيلات الإشعارات'}
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>

          {/* Share App URL Trigger */}
          {onOpenShare && (
            <button
              type="button"
              onClick={onOpenShare}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors touch-manipulation flex items-center gap-1.5 cursor-pointer shrink-0"
              aria-label="رابط التطبيق والمشاركة"
              title="مشاركة رابط التطبيق مع مهندسي المواقع"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden lg:inline text-xs font-bold whitespace-nowrap">
                رابط التطبيق
              </span>
            </button>
          )}

          <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-0.5 hidden sm:block" />

          {/* Current User Info */}
          <div className="hidden md:flex items-center gap-2 py-1 px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 shrink-0">
            <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
              <UserCheck className="w-4 h-4" />
            </div>
            <div className="text-right leading-tight">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                {currentUser.displayName.replace(/\bDC\b(?!\s+MANAGER)/gi, 'DC MANAGER')}
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400 font-medium truncate max-w-[200px]">
                {currentUser.jobTitle || (isAdmin ? 'مسؤول النظام (Admin)' : 'مهندس موقع')}
              </div>
            </div>
          </div>

          {/* Logout Button */}
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1.5 py-2 px-2.5 sm:px-3 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
            title="تسجيل الخروج من الحساب"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">تسجيل الخروج</span>
          </button>
        </div>
      </div>
    </header>
  );
};
