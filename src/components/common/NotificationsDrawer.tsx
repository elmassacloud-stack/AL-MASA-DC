import React from 'react';
import {
  Bell,
  X,
  AlertTriangle,
  FileText,
  CheckSquare,
  BellRing,
  Clock,
  CheckCheck
} from 'lucide-react';
import { AppNotification } from '../../types';
import { dataService } from '../../services/dataService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onNavigateTab: (tabId: string) => void;
}

export const NotificationsDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  notifications,
  onNavigateTab
}) => {
  if (!isOpen) return null;

  const handleNotificationClick = (notif: AppNotification) => {
    dataService.markNotificationAsRead(notif.id);
    if (notif.linkTab) {
      onNavigateTab(notif.linkTab);
      onClose();
    }
  };

  const handleMarkAllRead = () => {
    dataService.markAllNotificationsAsRead();
  };

  const getIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'urgent_issue':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'missing_report':
        return <Clock className="w-5 h-5 text-amber-500" />;
      case 'task_assigned':
        return <CheckSquare className="w-5 h-5 text-emerald-500" />;
      case 'announcement':
        return <BellRing className="w-5 h-5 text-blue-500" />;
      default:
        return <Bell className="w-5 h-5 text-blue-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md h-full shadow-2xl flex flex-col border-r border-slate-200 dark:border-slate-800 animate-in slide-in-from-left duration-200">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                مركز التنبيهات والإشعارات
              </h3>
              <span className="text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                {notifications.filter((n) => !n.isRead).length} غير مقروء
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {notifications.some((n) => !n.isRead) && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                title="تحديد الكل كمقروء"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>قراءة الكل</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Drawer List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Bell className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-semibold">لا توجد إشعارات جديدة</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                  notif.isRead
                    ? 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-70'
                    : 'bg-white dark:bg-slate-800/90 border-blue-200 dark:border-blue-900 shadow-xs'
                }`}
              >
                <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700/60 shrink-0 mt-0.5">
                  {getIcon(notif.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                      {notif.title}
                    </h4>
                    {!notif.isRead && (
                      <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                    {notif.message}
                  </p>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    {new Date(notif.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
