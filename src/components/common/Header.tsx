import React, { useState, useRef, useEffect } from 'react';
import {
  Bell,
  Sun,
  Moon,
  SlidersHorizontal,
  UserCheck,
  LogOut,
  Share2,
  Users,
  MoreVertical,
  UserCircle2
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const isAdmin = currentUser.role === 'admin';
  const formattedDisplayName = currentUser.displayName.replace(
    /\bDC\b(?!\s+MANAGER)/gi,
    'DC MANAGER'
  );

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mobileMenuOpen]);

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 h-15 sm:h-16 flex items-center justify-between gap-2">
        {/* Logo and Department Brand */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="h-9 sm:h-11 px-1.5 sm:px-2 py-1 rounded-xl bg-white border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex items-center justify-center shrink-0">
            <img
              src="/assets/aistudio/WhatsApp_Image_2026-10-28_at_10.05.14_AM_da55daa3.jpeg"
              alt="شعار شركة الماسة للمقاولات"
              className="h-full w-auto max-w-[76px] sm:max-w-[140px] object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-sm sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white leading-tight truncate">
                متابعة المواقع
              </h1>
              <span
                dir="ltr"
                className="hidden sm:inline-flex text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0 whitespace-nowrap"
              >
                DC DEPARTMENT
              </span>
            </div>
            <span
              dir="ltr"
              className="sm:hidden block text-[10px] font-bold tracking-wide text-blue-700 dark:text-blue-400 leading-tight truncate"
            >
              DC DEPARTMENT
            </span>
            <p className="text-xs text-slate-600 dark:text-slate-400 hidden sm:block mt-0.5 font-medium truncate">
              إدارة مراقبة الوثائق والمشاريع
            </p>
          </div>
        </div>

        {/* Action Controls, Admin User Management Tab & User Session */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Admin-only top header navigation tab (Tablet/Desktop; mobile uses bottom sheet & overflow menu) */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => onNavigateTab('users')}
              className={`hidden md:flex px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer touch-manipulation ${
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
            className="relative w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 transition-colors touch-manipulation shrink-0 cursor-pointer"
            aria-label="التنبيهات"
            title="التنبيهات والإشعارات"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 left-1 min-w-[18px] h-[18px] px-1 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs tabular-nums">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Dark / Light Mode Toggle */}
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 transition-colors touch-manipulation shrink-0 cursor-pointer"
            aria-label={darkMode ? 'الوضع النهاري' : 'الوضع الليلي'}
            title={darkMode ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
          >
            {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Desktop/Tablet Settings Trigger */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="hidden sm:flex w-10 h-10 items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors touch-manipulation shrink-0 cursor-pointer"
            aria-label="الإعدادات وتفضيلات الإشعارات"
            title={isAdmin ? 'الإعدادات وتفضيلات الإشعارات' : 'تفضيلات الإشعارات'}
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>

          {/* Desktop/Tablet Share App URL Trigger */}
          {onOpenShare && (
            <button
              type="button"
              onClick={onOpenShare}
              className="hidden sm:flex px-2.5 h-10 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors touch-manipulation items-center gap-1.5 cursor-pointer shrink-0"
              aria-label="رابط التطبيق والمشاركة"
              title="مشاركة رابط التطبيق مع مهندسي المواقع"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden lg:inline text-xs font-bold whitespace-nowrap">
                رابط التطبيق
              </span>
            </button>
          )}

          <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-0.5 hidden md:block" />

          {/* Current User Profile Button (Desktop/Tablet) */}
          <button
            type="button"
            onClick={() => onNavigateTab('profile')}
            className={`hidden md:flex items-center gap-2 py-1 px-2.5 rounded-xl border transition-all shrink-0 cursor-pointer touch-manipulation ${
              activeTab === 'profile'
                ? 'bg-blue-50 dark:bg-blue-950/70 border-blue-400 dark:border-blue-600 ring-1 ring-blue-500/30'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="فتح ملفي الشخصي وتعديل البيانات وكلمة المرور"
          >
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0 overflow-hidden border border-blue-200/70 dark:border-blue-800/70">
              {currentUser.photoUrl ? (
                <img
                  src={currentUser.photoUrl}
                  alt={formattedDisplayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserCheck className="w-4 h-4" />
              )}
            </div>
            <div className="text-right leading-tight">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                {formattedDisplayName}
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400 font-medium truncate max-w-[200px]">
                {currentUser.jobTitle || (isAdmin ? 'مسؤول النظام (Admin)' : 'مهندس موقع')}
              </div>
            </div>
          </button>

          {/* Desktop/Tablet Logout Button */}
          <button
            type="button"
            onClick={onLogout}
            className="hidden sm:flex items-center gap-1.5 py-2 px-3 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
            title="تسجيل الخروج من الحساب"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>تسجيل الخروج</span>
          </button>

          {/* Mobile / Android Overflow Menu (Zero header crowding on 360px screens) */}
          <div ref={mobileMenuRef} className="relative sm:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors touch-manipulation cursor-pointer ${
                mobileMenuOpen || activeTab === 'profile'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700'
              }`}
              aria-label="قائمة الحساب والإعدادات"
              aria-expanded={mobileMenuOpen}
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {mobileMenuOpen && (
              <div className="absolute left-0 mt-2 w-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden z-50">
                {/* User Account Card (tappable to open profile) */}
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onNavigateTab('profile');
                  }}
                  className="w-full px-3.5 py-3 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2.5 text-right transition-colors cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0 overflow-hidden border border-blue-200/70 dark:border-blue-800/70">
                    {currentUser.photoUrl ? (
                      <img
                        src={currentUser.photoUrl}
                        alt={formattedDisplayName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <UserCheck className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-right">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {formattedDisplayName}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {currentUser.jobTitle || (isAdmin ? 'مسؤول النظام (Admin)' : 'مهندس موقع')}
                    </div>
                  </div>
                </button>

                {/* Menu Actions */}
                <div className="p-1.5 space-y-0.5 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigateTab('profile');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer ${
                      activeTab === 'profile'
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200'
                    }`}
                  >
                    <UserCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>ملفي الشخصي وكلمة المرور</span>
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onNavigateTab('users');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 cursor-pointer"
                    >
                      <Users className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span>إدارة المستخدمين</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onOpenSettings();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 cursor-pointer"
                  >
                    <SlidersHorizontal className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                    <span>{isAdmin ? 'الإعدادات وتفضيلات الإشعارات' : 'تفضيلات الإشعارات'}</span>
                  </button>

                  {onOpenShare && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenShare();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 cursor-pointer"
                    >
                      <Share2 className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                      <span>مشاركة رابط التطبيق</span>
                    </button>
                  )}

                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 active:bg-rose-100 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 shrink-0" />
                    <span>تسجيل الخروج</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
