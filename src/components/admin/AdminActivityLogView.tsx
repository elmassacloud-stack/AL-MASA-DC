import React, { useMemo, useState } from 'react';
import {
  History,
  Search,
  Filter,
  RotateCcw,
  FileText,
  CheckSquare,
  PlusCircle,
  Pencil,
  CheckCircle2,
  Trash2,
  ClipboardCheck,
  Building2,
  User as UserIcon,
  Calendar,
  Clock,
  ShieldCheck,
  ArrowUpLeft,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  ActivityLogEntry,
  ActivityActionType,
  ActivityEntityType,
  Project,
  UserProfile
} from '../../types';
import { getTodayDateStr } from '../../seedData';

interface Props {
  activityLogs: ActivityLogEntry[];
  projects: Project[];
  users: UserProfile[];
  onNavigateTab?: (tabId: string) => void;
}

interface ActionMeta {
  label: string;
  badgeClass: string;
  iconBgClass: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ACTION_META: Record<ActivityActionType, ActionMeta> = {
  report_created: {
    label: 'تقديم تقرير يومي',
    badgeClass:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    iconBgClass:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300',
    icon: PlusCircle
  },
  report_updated: {
    label: 'تعديل تقرير يومي',
    badgeClass:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
    iconBgClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300',
    icon: Pencil
  },
  report_reviewed: {
    label: 'مراجعة تقرير يومي',
    badgeClass:
      'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
    iconBgClass:
      'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300',
    icon: ClipboardCheck
  },
  task_created: {
    label: 'إنشاء مهمة جديدة',
    badgeClass:
      'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
    iconBgClass: 'bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300',
    icon: PlusCircle
  },
  task_updated: {
    label: 'تعديل مهمة',
    badgeClass:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    iconBgClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300',
    icon: Pencil
  },
  task_completed: {
    label: 'إنجاز مهمة',
    badgeClass:
      'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800',
    iconBgClass: 'bg-teal-100 text-teal-700 dark:bg-teal-950/70 dark:text-teal-300',
    icon: CheckCircle2
  },
  task_deleted: {
    label: 'حذف مهمة',
    badgeClass:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
    iconBgClass: 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300',
    icon: Trash2
  }
};

type DateRangeFilter = 'all' | 'today' | '7d' | '30d' | 'custom';

function formatExactDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatRelativeTimeAr(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'الآن';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `منذ ${diffHr} ساعة`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'منذ يوم واحد';
  if (diffDays < 30) return `منذ ${diffDays} أيام`;
  return iso.slice(0, 10);
}

function getInitials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '؟';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] || '') + (parts[1][0] || '');
}

const PAGE_SIZE = 40;

export const AdminActivityLogView: React.FC<Props> = ({
  activityLogs,
  projects,
  users,
  onNavigateTab
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [entityFilter, setEntityFilter] = useState<'all' | ActivityEntityType>('all');
  const [actionFilter, setActionFilter] = useState<'all' | ActivityActionType>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRangeFilter>('all');
  const [customDate, setCustomDate] = useState<string>(getTodayDateStr());
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const todayStr = getTodayDateStr();

  // Unique actors present in logs merged with system users
  const actorOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; role: string }>();
    for (const u of users) {
      map.set(u.id, { id: u.id, name: u.displayName, role: u.role });
    }
    for (const log of activityLogs) {
      if (!map.has(log.actorId)) {
        map.set(log.actorId, {
          id: log.actorId,
          name: log.actorName,
          role: log.actorRole
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [users, activityLogs]);

  // Unique projects present in logs merged with system projects
  const projectOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const p of projects) {
      map.set(p.id, { id: p.id, name: p.name });
    }
    for (const log of activityLogs) {
      if (!map.has(log.projectId)) {
        map.set(log.projectId, { id: log.projectId, name: log.projectName });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [projects, activityLogs]);

  // Summary metrics
  const metrics = useMemo(() => {
    let tasksCount = 0;
    let reportsCount = 0;
    let todayCount = 0;
    const activeActorsToday = new Set<string>();

    for (const log of activityLogs) {
      if (log.entityType === 'task') tasksCount++;
      else if (log.entityType === 'report') reportsCount++;

      const logDay = (log.createdAt || '').slice(0, 10);
      if (logDay === todayStr) {
        todayCount++;
        activeActorsToday.add(log.actorId);
      }
    }

    return {
      total: activityLogs.length,
      tasksCount,
      reportsCount,
      todayCount,
      activeActorsToday: activeActorsToday.size
    };
  }, [activityLogs, todayStr]);

  // Filtered entries
  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const nowMs = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    return activityLogs.filter((log) => {
      if (entityFilter !== 'all' && log.entityType !== entityFilter) return false;
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      if (projectFilter !== 'all' && log.projectId !== projectFilter) return false;
      if (actorFilter !== 'all' && log.actorId !== actorFilter) return false;

      if (dateRange !== 'all') {
        const logDay = (log.createdAt || '').slice(0, 10);
        const logMs = Date.parse(log.createdAt);
        if (dateRange === 'today' && logDay !== todayStr) return false;
        if (dateRange === '7d' && (!Number.isFinite(logMs) || nowMs - logMs > sevenDaysMs)) {
          return false;
        }
        if (dateRange === '30d' && (!Number.isFinite(logMs) || nowMs - logMs > thirtyDaysMs)) {
          return false;
        }
        if (dateRange === 'custom' && customDate && logDay !== customDate) return false;
      }

      if (q) {
        const haystack = [
          log.entityTitle,
          log.projectName,
          log.actorName,
          log.actorEmail || '',
          log.summary,
          log.details || '',
          ACTION_META[log.action]?.label || ''
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [
    activityLogs,
    entityFilter,
    actionFilter,
    projectFilter,
    actorFilter,
    dateRange,
    customDate,
    searchQuery,
    todayStr
  ]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    entityFilter !== 'all' ||
    actionFilter !== 'all' ||
    projectFilter !== 'all' ||
    actorFilter !== 'all' ||
    dateRange !== 'all';

  const handleResetFilters = () => {
    setSearchQuery('');
    setEntityFilter('all');
    setActionFilter('all');
    setProjectFilter('all');
    setActorFilter('all');
    setDateRange('all');
    setVisibleCount(PAGE_SIZE);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const displayedLogs = filteredLogs.slice(0, visibleCount);

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border border-blue-200/70 dark:border-blue-900 flex items-center justify-center shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white leading-snug">
                سجل نشاط النظام (Activity Log)
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                <ShieldCheck className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                <span>للمسؤولين فقط</span>
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
              مراقبة فورية وغير قابلة للتعديل لآخر الحركات والتعديلات على{' '}
              <strong className="text-slate-800 dark:text-slate-200">المهام</strong> و
              <strong className="text-slate-800 dark:text-slate-200">التقارير اليومية</strong> عبر
              جميع المشاريع
            </p>
          </div>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="self-start sm:self-center min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة ضبط الفلاتر</span>
          </button>
        )}
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>إجمالي الحركات المسجلة</span>
            <History className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
            {metrics.total.toLocaleString('en-US')}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            سجل تدقيق محمي ضد التعديل
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>تعديلات التقارير</span>
            <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            {metrics.reportsCount.toLocaleString('en-US')}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            تقديم وتعديل ومراجعة التقارير
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>تعديلات المهام</span>
            <CheckSquare className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold font-mono tabular-nums text-amber-700 dark:text-amber-400">
            {metrics.tasksCount.toLocaleString('en-US')}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            إنشاء وتحديث وإنجاز وحذف المهام
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>نشاط اليوم</span>
            <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold font-mono tabular-nums text-indigo-700 dark:text-indigo-400">
            {metrics.todayCount.toLocaleString('en-US')}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {metrics.activeActorsToday > 0
              ? `${metrics.activeActorsToday} مستخدم نشط اليوم`
              : 'لا توجد حركات مسجلة اليوم بعد'}
          </div>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Entity Scope Segmented Control */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto">
            {(
              [
                { id: 'all', label: 'الكل', count: metrics.total },
                { id: 'report', label: 'التقارير', count: metrics.reportsCount },
                { id: 'task', label: 'المهام', count: metrics.tasksCount }
              ] as const
            ).map((opt) => {
              const active = entityFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setEntityFilter(opt.id);
                    setActionFilter('all');
                    setVisibleCount(PAGE_SIZE);
                  }}
                  className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                    active
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span>{opt.label}</span>
                  <span
                    className={`font-mono text-[11px] ${
                      active ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    ({opt.count})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="relative flex-1 lg:max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="بحث باسم المستخدم، المشروع، عنوان المهمة أو تفاصيل التعديل..."
              className="w-full h-10 pr-9 pl-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Granular Dropdown Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
          {/* Action Type */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Filter className="w-3 h-3" />
              <span>نوع الإجراء</span>
            </label>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value as 'all' | ActivityActionType);
                setVisibleCount(PAGE_SIZE);
              }}
              className="h-9 px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">جميع الإجراءات</option>
              {(entityFilter === 'all' || entityFilter === 'report') && (
                <>
                  <option value="report_created">تقديم تقرير يومي</option>
                  <option value="report_updated">تعديل تقرير يومي</option>
                  <option value="report_reviewed">مراجعة تقرير يومي</option>
                </>
              )}
              {(entityFilter === 'all' || entityFilter === 'task') && (
                <>
                  <option value="task_created">إنشاء مهمة جديدة</option>
                  <option value="task_updated">تعديل مهمة</option>
                  <option value="task_completed">إنجاز مهمة</option>
                  <option value="task_deleted">حذف مهمة</option>
                </>
              )}
            </select>
          </div>

          {/* Project */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              <span>المشروع</span>
            </label>
            <select
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              className="h-9 px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">كل المشاريع</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Actor / User */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <UserIcon className="w-3 h-3" />
              <span>المستخدم</span>
            </label>
            <select
              value={actorFilter}
              onChange={(e) => {
                setActorFilter(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              className="h-9 px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">كل المستخدمين</option>
              {actorOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role === 'admin' ? 'مسؤول' : 'موقع'})
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>الفترة الزمنية</span>
            </label>
            <div className="flex items-center gap-1.5">
              <select
                value={dateRange}
                onChange={(e) => {
                  setDateRange(e.target.value as DateRangeFilter);
                  setVisibleCount(PAGE_SIZE);
                }}
                className="flex-1 h-9 px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">كل الأوقات</option>
                <option value="today">اليوم فقط</option>
                <option value="7d">آخر 7 أيام</option>
                <option value="30d">آخر 30 يوماً</option>
                <option value="custom">تاريخ محدد</option>
              </select>
              {dateRange === 'custom' && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="h-9 px-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Results Count Header */}
      <div className="flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400">
        <span>
          عرض{' '}
          <strong className="font-mono text-slate-800 dark:text-slate-200">
            {displayedLogs.length}
          </strong>{' '}
          من أصل{' '}
          <strong className="font-mono text-slate-800 dark:text-slate-200">
            {filteredLogs.length}
          </strong>{' '}
          حركة مطابقة
        </span>
        <span className="text-[11px]">الترتيب: الأحدث أولاً</span>
      </div>

      {/* Activity Feed List */}
      {displayedLogs.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center space-y-2.5">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <History className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {hasActiveFilters
              ? 'لا توجد حركات مطابقة للفلاتر المحددة'
              : 'لا توجد حركات مسجلة في سجل النشاط بعد'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            {hasActiveFilters
              ? 'جرّب توسيع الفترة الزمنية أو مسح البحث لعرض باقي سجلات النشاط.'
              : 'ستظهر هنا تلقائياً جميع عمليات الإضافة والتعديل والمراجعة والإنجاز التي يقوم بها المستخدمون على المهام والتقارير اليومية.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>عرض جميع السجلات</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {displayedLogs.map((log) => {
            const meta = ACTION_META[log.action] || ACTION_META.report_updated;
            const ActionIcon = meta.icon;
            const isExpanded = Boolean(expandedIds[log.id]);
            const hasLongDetails = Boolean(log.details && log.details.length > 140);

            return (
              <div
                key={log.id}
                className="p-4 sm:px-5 sm:py-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-start gap-3.5">
                  {/* Action Icon */}
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${meta.iconBgClass}`}
                  >
                    <ActionIcon className="w-4 h-4" />
                  </div>

                  {/* Main Entry Body */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${meta.badgeClass}`}
                        >
                          <span>{meta.label}</span>
                        </span>

                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {log.entityType === 'task' ? (
                            <CheckSquare className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          ) : (
                            <FileText className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          )}
                          <span>{log.entityType === 'task' ? 'مهمة' : 'تقرير'}</span>
                        </span>

                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50/80 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">
                          <Building2 className="w-3 h-3" />
                          <span className="truncate max-w-[180px]">{log.projectName}</span>
                        </span>
                      </div>

                      <div
                        className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 shrink-0"
                        title={formatExactDateTime(log.createdAt)}
                      >
                        <Clock className="w-3 h-3" />
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {formatRelativeTimeAr(log.createdAt)}
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">•</span>
                        <span className="font-mono text-[10px]">
                          {formatExactDateTime(log.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Title & Summary */}
                    <div className="space-y-0.5">
                      <div className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                        {log.entityTitle}
                      </div>
                      <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                        {log.summary}
                      </p>
                    </div>

                    {/* Optional Change Details Box */}
                    {log.details && (
                      <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 rounded-xl px-3 py-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        <div className={!isExpanded && hasLongDetails ? 'line-clamp-2' : ''}>
                          {log.details}
                        </div>
                        {hasLongDetails && (
                          <button
                            type="button"
                            onClick={() => toggleExpand(log.id)}
                            className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            {isExpanded ? (
                              <>
                                <span>عرض أقل</span>
                                <ChevronUp className="w-3 h-3" />
                              </>
                            ) : (
                              <>
                                <span>عرض التفاصيل الكاملة</span>
                                <ChevronDown className="w-3 h-3" />
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Footer: Actor & Quick Navigation */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-extrabold flex items-center justify-center shrink-0">
                          {getInitials(log.actorName)}
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {log.actorName}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                            log.actorRole === 'admin'
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {log.actorRole === 'admin' ? 'مسؤول DC' : 'مهندس موقع'}
                        </span>
                        {log.actorEmail && (
                          <span className="hidden sm:inline text-[11px] font-mono text-slate-400 dark:text-slate-500">
                            {log.actorEmail}
                          </span>
                        )}
                      </div>

                      {onNavigateTab && log.action !== 'task_deleted' && (
                        <button
                          type="button"
                          onClick={() =>
                            onNavigateTab(log.entityType === 'task' ? 'tasks' : 'reports')
                          }
                          className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          <span>
                            {log.entityType === 'task' ? 'فتح تبويب المهام' : 'فتح تبويب التقارير'}
                          </span>
                          <ArrowUpLeft className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load More Pagination */}
      {filteredLogs.length > visibleCount && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            className="min-h-[42px] px-5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
          >
            عرض المزيد ({filteredLogs.length - visibleCount} حركة متبقية)
          </button>
        </div>
      )}
    </div>
  );
};
