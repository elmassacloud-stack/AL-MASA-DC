import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import {
  BarChart3,
  CheckSquare,
  FileCheck2,
  PieChart as PieChartIcon,
  ArrowUpLeft,
  Clock
} from 'lucide-react';
import { DailyReport, Project, ProjectTask, SubmittalStatusCode } from '../../types';
import { getTodayDateStr } from '../../seedData';

interface Props {
  projects: Project[];
  reports: DailyReport[];
  tasks: ProjectTask[];
  onNavigateTab: (tabId: string) => void;
}

interface ProjectTaskChartRow {
  projectId: string;
  projectName: string;
  shortName: string;
  code: string;
  total: number;
  done: number;
  inProgress: number;
  pending: number;
  completionRate: number;
}

interface ProjectSubmittalChartRow {
  projectId: string;
  projectName: string;
  shortName: string;
  code: string;
  approved: number; // A + B
  approvedA: number;
  approvedB: number;
  rejected: number; // C + D
  resubmitC: number;
  rejectedD: number;
  underReview: number; // W
  total: number;
  decidedTotal: number;
  acceptanceRate: number;
}

function shortenLabel(label: string, maxLen = 14): string {
  const clean = (label || '').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1)}…`;
}

function getCompletionBarColor(rate: number, total: number): string {
  if (total === 0) return '#94a3b8';
  if (rate >= 75) return '#10b981';
  if (rate >= 40) return '#2563eb';
  return '#f59e0b';
}

interface CustomTooltipProps<T> {
  active?: boolean;
  payload?: Array<{ payload: T }>;
}

const TaskChartTooltip: React.FC<CustomTooltipProps<ProjectTaskChartRow>> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div
      dir="rtl"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-xl text-xs space-y-1.5 min-w-[190px]"
    >
      <div className="font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-1.5">
        {row.projectName}
        {row.code ? (
          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 mr-1.5">
            ({row.code})
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-600 dark:text-slate-300">نسبة الإنجاز:</span>
        <span className="font-mono tabular-nums font-extrabold text-emerald-600 dark:text-emerald-400">
          {row.completionRate}%
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-600 dark:text-slate-300">مهام منجزة:</span>
        <span className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-300">
          {row.done} / {row.total}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-600 dark:text-slate-300">قيد التنفيذ:</span>
        <span className="font-mono tabular-nums font-bold text-blue-600 dark:text-blue-400">
          {row.inProgress}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-600 dark:text-slate-300">قيد الانتظار:</span>
        <span className="font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">
          {row.pending}
        </span>
      </div>
    </div>
  );
};

const SubmittalChartTooltip: React.FC<CustomTooltipProps<ProjectSubmittalChartRow>> = ({
  active,
  payload
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div
      dir="rtl"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-xl text-xs space-y-1.5 min-w-[215px]"
    >
      <div className="font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-1.5">
        {row.projectName}
        {row.code ? (
          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 mr-1.5">
            ({row.code})
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-600 dark:text-slate-300">مقبولة (A / B):</span>
        <span className="font-mono tabular-nums font-extrabold text-emerald-600 dark:text-emerald-400">
          {row.approved}
          <span className="text-[10px] text-slate-400 font-normal mr-1">
            (A:{row.approvedA} · B:{row.approvedB})
          </span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-600 dark:text-slate-300">مرفوضة / إعادة (C / D):</span>
        <span className="font-mono tabular-nums font-extrabold text-rose-600 dark:text-rose-400">
          {row.rejected}
          <span className="text-[10px] text-slate-400 font-normal mr-1">
            (C:{row.resubmitC} · D:{row.rejectedD})
          </span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-600 dark:text-slate-300">قيد المراجعة (W):</span>
        <span className="font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">
          {row.underReview}
        </span>
      </div>
      <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
        <span className="text-slate-600 dark:text-slate-300 font-semibold">نسبة القبول:</span>
        <span className="font-mono tabular-nums font-extrabold text-blue-600 dark:text-blue-400">
          {row.decidedTotal > 0 ? `${row.acceptanceRate}%` : '—'}
        </span>
      </div>
    </div>
  );
};

interface DonutSlice {
  name: string;
  value: number;
  color: string;
  percent: number;
}

const DonutTooltip: React.FC<CustomTooltipProps<DonutSlice>> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  return (
    <div
      dir="rtl"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-xl text-xs flex items-center gap-3"
    >
      <span className="font-bold text-slate-900 dark:text-white">{item.name}</span>
      <span className="font-mono tabular-nums font-extrabold text-blue-600 dark:text-blue-400">
        {item.value} ({item.percent}%)
      </span>
    </div>
  );
};

interface TaskStatusSlice {
  key: 'done' | 'in_progress' | 'overdue';
  name: string;
  value: number;
  color: string;
  percent: number;
  detail?: string;
}

const TaskStatusPieTooltip: React.FC<CustomTooltipProps<TaskStatusSlice>> = ({
  active,
  payload
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  return (
    <div
      dir="rtl"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 shadow-xl text-xs space-y-1 min-w-[165px]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
          <span
            className="w-2.5 h-2.5 rounded-xs shrink-0"
            style={{ backgroundColor: item.color }}
          />
          <span>{item.name}</span>
        </span>
        <span className="font-mono tabular-nums font-extrabold text-slate-900 dark:text-white">
          {item.value} ({item.percent}%)
        </span>
      </div>
      {item.detail && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">{item.detail}</p>
      )}
    </div>
  );
};

export const AdminAnalyticsCharts: React.FC<Props> = ({
  projects,
  reports,
  tasks,
  onNavigateTab
}) => {
  const [taskChartMode, setTaskChartMode] = useState<'rate' | 'breakdown'>('rate');
  const [submittalChartMode, setSubmittalChartMode] = useState<'byProject' | 'ratio'>('byProject');
  const [statusPieProjectFilter, setStatusPieProjectFilter] = useState<string>('all');
  const todayStr = getTodayDateStr();

  // 0. Daily Task Status Distribution Pie Chart (Completed, In Progress, Overdue)
  const {
    taskStatusSlices,
    filteredPieTotal,
    pieCompletedCount,
    pieInProgressCount,
    pieInProgressActiveOnly,
    piePendingOnTrackOnly,
    pieOverdueCount,
    pieCompletionRate
  } = useMemo(() => {
    const scoped =
      statusPieProjectFilter === 'all'
        ? tasks
        : tasks.filter((t) => t.projectId === statusPieProjectFilter);

    const completed = scoped.filter((t) => t.status === 'done').length;
    const overdue = scoped.filter(
      (t) => t.status !== 'done' && Boolean(t.deadline) && t.deadline < todayStr
    ).length;
    const onTrackOpen = scoped.filter(
      (t) => t.status !== 'done' && (!t.deadline || t.deadline >= todayStr)
    );
    const inProgressTotal = onTrackOpen.length;
    const activeInProgressOnly = onTrackOpen.filter((t) => t.status === 'in_progress').length;
    const pendingOnTrackOnly = onTrackOpen.filter((t) => t.status === 'pending').length;

    const total = scoped.length;
    const pct = (count: number) => (total > 0 ? Math.round((count / total) * 100) : 0);

    const slices: TaskStatusSlice[] = [
      {
        key: 'done',
        name: 'مكتملة',
        value: completed,
        color: '#10b981',
        percent: pct(completed)
      },
      {
        key: 'in_progress',
        name: 'قيد التنفيذ',
        value: inProgressTotal,
        color: '#3b82f6',
        percent: pct(inProgressTotal),
        detail:
          pendingOnTrackOnly > 0
            ? `جارية: ${activeInProgressOnly} · قيد الانتظار: ${pendingOnTrackOnly}`
            : undefined
      },
      {
        key: 'overdue',
        name: 'متأخرة',
        value: overdue,
        color: '#f43f5e',
        percent: pct(overdue),
        detail: overdue > 0 ? 'تجاوزت الموعد النهائي المحدد' : undefined
      }
    ];

    return {
      taskStatusSlices: slices.filter((s) => s.value > 0),
      filteredPieTotal: total,
      pieCompletedCount: completed,
      pieInProgressCount: inProgressTotal,
      pieInProgressActiveOnly: activeInProgressOnly,
      piePendingOnTrackOnly: pendingOnTrackOnly,
      pieOverdueCount: overdue,
      pieCompletionRate: pct(completed)
    };
  }, [tasks, statusPieProjectFilter, todayStr]);

  // 1. Task completion metrics per project
  const { taskChartData, totalTasksCount, totalDoneTasksCount, overallTaskCompletionRate } =
    useMemo(() => {
      const projectMap = new Map<string, { id: string; name: string; code: string }>();
      projects.forEach((p) => {
        projectMap.set(p.id, { id: p.id, name: p.name, code: p.code });
      });
      tasks.forEach((t) => {
        if (!projectMap.has(t.projectId)) {
          projectMap.set(t.projectId, {
            id: t.projectId,
            name: t.projectName || t.projectId,
            code: ''
          });
        }
      });

      const rows: ProjectTaskChartRow[] = Array.from(projectMap.values()).map((proj) => {
        const projTasks = tasks.filter((t) => t.projectId === proj.id);
        const done = projTasks.filter((t) => t.status === 'done').length;
        const inProgress = projTasks.filter((t) => t.status === 'in_progress').length;
        const pending = projTasks.filter((t) => t.status === 'pending').length;
        const total = projTasks.length;
        const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

        return {
          projectId: proj.id,
          projectName: proj.name,
          shortName: shortenLabel(proj.name),
          code: proj.code,
          total,
          done,
          inProgress,
          pending,
          completionRate
        };
      });

      // Keep projects with tasks first, then active projects
      rows.sort((a, b) => b.total - a.total || b.completionRate - a.completionRate);

      const totalCount = tasks.length;
      const doneCount = tasks.filter((t) => t.status === 'done').length;
      const overallRate = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

      return {
        taskChartData: rows,
        totalTasksCount: totalCount,
        totalDoneTasksCount: doneCount,
        overallTaskCompletionRate: overallRate
      };
    }, [projects, tasks]);

  // 2. Approved (A/B) vs Rejected/Resubmit (C/D) submittals across projects
  // Deduplicates by (projectId, submittalNumber) using the latest date & revision so acceptance ratios are accurate
  const {
    submittalChartData,
    totalApproved,
    totalRejected,
    totalUnderReview,
    overallAcceptanceRate,
    donutSlices
  } = useMemo(() => {
    const projectMap = new Map<string, { id: string; name: string; code: string }>();
    projects.forEach((p) => {
      projectMap.set(p.id, { id: p.id, name: p.name, code: p.code });
    });
    reports.forEach((r) => {
      if (!projectMap.has(r.projectId)) {
        projectMap.set(r.projectId, {
          id: r.projectId,
          name: r.projectName || r.projectId,
          code: ''
        });
      }
    });

    interface TrackedSubmittal {
      projectId: string;
      status: SubmittalStatusCode;
      reportDate: string;
      rev: number;
      sourceRank: number; // received (1) overrides submitted (0) on same date & rev
    }

    const latestByKey = new Map<string, TrackedSubmittal>();
    let anonymousCounter = 0;

    reports.forEach((report) => {
      const registerEntry = (
        submittalNumber: string,
        rev: number,
        status: SubmittalStatusCode,
        sourceRank: number
      ) => {
        const cleanNum = (submittalNumber || '').trim().toUpperCase();
        const key = cleanNum
          ? `${report.projectId}::${cleanNum}`
          : `${report.projectId}::anon-${++anonymousCounter}`;
        const candidate: TrackedSubmittal = {
          projectId: report.projectId,
          status,
          reportDate: report.reportDate || '',
          rev: Number.isFinite(Number(rev)) ? Number(rev) : 0,
          sourceRank
        };

        const current = latestByKey.get(key);
        if (!current) {
          latestByKey.set(key, candidate);
          return;
        }
        const dateCmp = candidate.reportDate.localeCompare(current.reportDate);
        if (
          dateCmp > 0 ||
          (dateCmp === 0 && candidate.rev > current.rev) ||
          (dateCmp === 0 && candidate.rev === current.rev && candidate.sourceRank >= current.sourceRank)
        ) {
          latestByKey.set(key, candidate);
        }
      };

      (report.submittedWorks || []).forEach((item) => {
        registerEntry(item.submittalNumber, item.rev, item.status, 0);
      });
      (report.receivedWorks || []).forEach((item) => {
        registerEntry(item.submittalNumber, item.rev, item.status, 1);
      });
    });

    const grouped = new Map<string, TrackedSubmittal[]>();
    latestByKey.forEach((entry) => {
      const arr = grouped.get(entry.projectId) || [];
      arr.push(entry);
      grouped.set(entry.projectId, arr);
    });

    const rows: ProjectSubmittalChartRow[] = Array.from(projectMap.values()).map((proj) => {
      const entries = grouped.get(proj.id) || [];
      const approvedA = entries.filter((e) => e.status === 'A').length;
      const approvedB = entries.filter((e) => e.status === 'B').length;
      const resubmitC = entries.filter((e) => e.status === 'C').length;
      const rejectedD = entries.filter((e) => e.status === 'D').length;
      const underReview = entries.filter((e) => e.status === 'W').length;

      const approved = approvedA + approvedB;
      const rejected = resubmitC + rejectedD;
      const decidedTotal = approved + rejected;
      const total = entries.length;
      const acceptanceRate = decidedTotal > 0 ? Math.round((approved / decidedTotal) * 100) : 0;

      return {
        projectId: proj.id,
        projectName: proj.name,
        shortName: shortenLabel(proj.name),
        code: proj.code,
        approved,
        approvedA,
        approvedB,
        rejected,
        resubmitC,
        rejectedD,
        underReview,
        total,
        decidedTotal,
        acceptanceRate
      };
    });

    rows.sort((a, b) => b.total - a.total || b.approved - a.approved);

    const sumApproved = rows.reduce((acc, r) => acc + r.approved, 0);
    const sumRejected = rows.reduce((acc, r) => acc + r.rejected, 0);
    const sumUnderReview = rows.reduce((acc, r) => acc + r.underReview, 0);
    const sumDecided = sumApproved + sumRejected;
    const sumAll = sumApproved + sumRejected + sumUnderReview;
    const overallAcc = sumDecided > 0 ? Math.round((sumApproved / sumDecided) * 100) : 0;

    const slices: DonutSlice[] = [
      {
        name: 'مقبولة (A / B)',
        value: sumApproved,
        color: '#10b981',
        percent: sumAll > 0 ? Math.round((sumApproved / sumAll) * 100) : 0
      },
      {
        name: 'مرفوضة / إعادة تقديم (C / D)',
        value: sumRejected,
        color: '#f43f5e',
        percent: sumAll > 0 ? Math.round((sumRejected / sumAll) * 100) : 0
      },
      {
        name: 'قيد المراجعة (W)',
        value: sumUnderReview,
        color: '#f59e0b',
        percent: sumAll > 0 ? Math.round((sumUnderReview / sumAll) * 100) : 0
      }
    ].filter((s) => s.value > 0);

    return {
      submittalChartData: rows,
      totalApproved: sumApproved,
      totalRejected: sumRejected,
      totalUnderReview: sumUnderReview,
      overallAcceptanceRate: overallAcc,
      donutSlices: slices
    };
  }, [projects, reports]);

  const totalSubmittalsCount = totalApproved + totalRejected + totalUnderReview;

  return (
    <section aria-label="التحليلات والرسوم البيانية للأداء" className="space-y-4">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/70 dark:border-blue-800/70 shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              تحليلات الأداء والمؤشرات البيانية للمشاريع
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              مقارنة فورية لمعدلات إنجاز المهام ونسب قبول ورفض التقديمات الهندسية عبر جميع المواقع
            </p>
          </div>
        </div>
      </div>

      {/* Row 1: Task Status Pie Chart (5 cols) + Task Completion Per Project (7 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-5">
        {/* =====================================================================
            CHART 0 (NEW): Task Status Distribution Pie Chart (Completed / In Progress / Overdue)
            ===================================================================== */}
        <div className="xl:col-span-5 bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2.5">
              <div>
                <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>توزيع المهام حسب الحالة</span>
                </h4>
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 mt-1 tabular-nums">
                  <span>إجمالي المهام: {filteredPieTotal}</span>
                  {pieOverdueCount > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-rose-600 dark:text-rose-400 font-semibold">
                        {pieOverdueCount} متأخرة
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Project Scope Selector */}
              <select
                value={statusPieProjectFilter}
                onChange={(e) => setStatusPieProjectFilter(e.target.value)}
                aria-label="تصفية المهام حسب المشروع"
                className="h-8 px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer max-w-[165px]"
              >
                <option value="all">جميع المشاريع</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {filteredPieTotal === 0 ? (
              <div className="h-72 flex flex-col items-center justify-center text-center bg-slate-50/70 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6">
                <PieChartIcon className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                  لا توجد مهام في النطاق المحدد
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  سيظهر توزيع الحالات (مكتملة، قيد التنفيذ، متأخرة) تلقائياً عند إضافة مهام.
                </p>
              </div>
            ) : (
              <div className="min-h-72 grid grid-cols-1 sm:grid-cols-12 items-center gap-4 pt-1">
                {/* Donut Pie Chart */}
                <div dir="ltr" className="sm:col-span-6 w-full h-56 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={taskStatusSlices}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={54}
                        outerRadius={84}
                        paddingAngle={3}
                        stroke="none"
                      >
                        {taskStatusSlices.map((slice) => (
                          <Cell key={slice.key} fill={slice.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<TaskStatusPieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                      {pieCompletionRate}%
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      مكتملة
                    </span>
                  </div>
                </div>

                {/* Status Breakdown Cards */}
                <div className="sm:col-span-6 space-y-2.5 text-xs">
                  {/* Completed */}
                  <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/35 border border-emerald-200/70 dark:border-emerald-800/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-200">
                        <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 shrink-0" />
                        <span>مكتملة</span>
                      </span>
                      <span className="font-mono tabular-nums font-extrabold text-emerald-700 dark:text-emerald-300">
                        {pieCompletedCount}
                        <span className="text-[11px] font-semibold text-emerald-600/80 dark:text-emerald-400/80 mr-1">
                          ({filteredPieTotal > 0 ? Math.round((pieCompletedCount / filteredPieTotal) * 100) : 0}%)
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* In Progress */}
                  <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/35 border border-blue-200/70 dark:border-blue-800/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 font-bold text-blue-900 dark:text-blue-200">
                        <span className="w-2.5 h-2.5 rounded-xs bg-blue-500 shrink-0" />
                        <span>قيد التنفيذ</span>
                      </span>
                      <span className="font-mono tabular-nums font-extrabold text-blue-700 dark:text-blue-300">
                        {pieInProgressCount}
                        <span className="text-[11px] font-semibold text-blue-600/80 dark:text-blue-400/80 mr-1">
                          ({filteredPieTotal > 0 ? Math.round((pieInProgressCount / filteredPieTotal) * 100) : 0}%)
                        </span>
                      </span>
                    </div>
                    {piePendingOnTrackOnly > 0 && (
                      <p className="text-[11px] text-blue-800/75 dark:text-blue-300/75 mt-1 tabular-nums">
                        جارية: {pieInProgressActiveOnly} · بانتظار البدء: {piePendingOnTrackOnly}
                      </p>
                    )}
                  </div>

                  {/* Overdue */}
                  <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/35 border border-rose-200/70 dark:border-rose-800/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 font-bold text-rose-900 dark:text-rose-200">
                        <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 shrink-0" />
                        <span>متأخرة</span>
                      </span>
                      <span className="font-mono tabular-nums font-extrabold text-rose-700 dark:text-rose-300">
                        {pieOverdueCount}
                        <span className="text-[11px] font-semibold text-rose-600/80 dark:text-rose-400/80 mr-1">
                          ({filteredPieTotal > 0 ? Math.round((pieOverdueCount / filteredPieTotal) * 100) : 0}%)
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Action */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>تحديث لحظي حسب موعد اليوم ({todayStr})</span>
            </span>

            <button
              type="button"
              onClick={() => onNavigateTab('tasks')}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>متابعة المهام</span>
              <ArrowUpLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* =====================================================================
            CHART 1: Task Completion Rates Across Projects
            ===================================================================== */}
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>معدلات إنجاز المهام عبر المشاريع</span>
                </h4>
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 mt-1">
                  <span>
                    الإنجاز العام:{' '}
                    <strong className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                      {overallTaskCompletionRate}%
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {totalDoneTasksCount} منجزة من أصل {totalTasksCount}
                  </span>
                </div>
              </div>

              {/* Mode Switcher */}
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setTaskChartMode('rate')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                    taskChartMode === 'rate'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  نسبة الإنجاز %
                </button>
                <button
                  type="button"
                  onClick={() => setTaskChartMode('breakdown')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                    taskChartMode === 'breakdown'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  توزيع الحالات
                </button>
              </div>
            </div>

            {/* Chart Area */}
            {taskChartData.length === 0 || totalTasksCount === 0 ? (
              <div className="h-72 flex flex-col items-center justify-center text-center bg-slate-50/70 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6">
                <CheckSquare className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                  لا توجد مهام مسجلة لعرض الرسم البياني بعد
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  سيظهر معدل الإنجاز تلقائياً بمجرد إسناد مهام للمشاريع.
                </p>
              </div>
            ) : (
              <div dir="ltr" className="w-full h-72 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  {taskChartMode === 'rate' ? (
                    <BarChart
                      data={taskChartData}
                      margin={{ top: 10, right: 12, left: -12, bottom: 16 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="rgba(148, 163, 184, 0.25)"
                      />
                      <XAxis
                        dataKey="shortName"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        content={<TaskChartTooltip />}
                        cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                      />
                      <Bar
                        dataKey="completionRate"
                        name="نسبة الإنجاز"
                        radius={[8, 8, 0, 0]}
                        maxBarSize={42}
                      >
                        {taskChartData.map((entry) => (
                          <Cell
                            key={entry.projectId}
                            fill={getCompletionBarColor(entry.completionRate, entry.total)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  ) : (
                    <BarChart
                      data={taskChartData}
                      margin={{ top: 10, right: 12, left: -12, bottom: 16 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="rgba(148, 163, 184, 0.25)"
                      />
                      <XAxis
                        dataKey="shortName"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        content={<TaskChartTooltip />}
                        cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                      />
                      <Bar
                        dataKey="done"
                        stackId="tasks"
                        name="منجزة"
                        fill="#10b981"
                        maxBarSize={42}
                      />
                      <Bar
                        dataKey="inProgress"
                        stackId="tasks"
                        name="قيد التنفيذ"
                        fill="#3b82f6"
                        maxBarSize={42}
                      />
                      <Bar
                        dataKey="pending"
                        stackId="tasks"
                        name="قيد الانتظار"
                        fill="#f59e0b"
                        radius={[8, 8, 0, 0]}
                        maxBarSize={42}
                      />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Legend & Footer Action */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              {taskChartMode === 'rate' ? (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                    <span>ممتاز (≥75%)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-blue-600" />
                    <span>متوسط (40–74%)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" />
                    <span>يحتاج متابعة (&lt;40%)</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                    <span>منجزة</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-blue-500" />
                    <span>قيد التنفيذ</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" />
                    <span>معلقة</span>
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('tasks')}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>إدارة المهام</span>
              <ArrowUpLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* =====================================================================
            CHART 2: Approved (A/B) vs Rejected (C/D) Submittals Across Projects
            ===================================================================== */}
        <div className="xl:col-span-12 bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>التقديمات المقبولة مقابل المرفوضة</span>
                </h4>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400 mt-1">
                  <span>
                    نسبة القبول:{' '}
                    <strong className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                      {totalApproved + totalRejected > 0 ? `${overallAcceptanceRate}%` : '—'}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">
                    {totalApproved} مقبولة
                  </span>
                  <span aria-hidden="true">/</span>
                  <span className="font-mono tabular-nums text-rose-600 dark:text-rose-400 font-semibold">
                    {totalRejected} مرفوضة
                  </span>
                </div>
              </div>

              {/* Mode Switcher */}
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setSubmittalChartMode('byProject')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                    submittalChartMode === 'byProject'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  حسب المشروع
                </button>
                <button
                  type="button"
                  onClick={() => setSubmittalChartMode('ratio')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer inline-flex items-center gap-1 ${
                    submittalChartMode === 'ratio'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <PieChartIcon className="w-3.5 h-3.5" />
                  <span>النسبة الإجمالية</span>
                </button>
              </div>
            </div>

            {/* Chart Area */}
            {totalSubmittalsCount === 0 ? (
              <div className="h-72 flex flex-col items-center justify-center text-center bg-slate-50/70 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6">
                <FileCheck2 className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                  لا توجد تقديمات هندسية مسجلة بعد
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  سيتم احتساب نسب القبول (A/B) والرفض (C/D) تلقائياً من التقارير اليومية.
                </p>
              </div>
            ) : submittalChartMode === 'byProject' ? (
              <div dir="ltr" className="w-full h-72 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={submittalChartData}
                    margin={{ top: 10, right: 12, left: -12, bottom: 16 }}
                    barGap={4}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="rgba(148, 163, 184, 0.25)"
                    />
                    <XAxis
                      dataKey="shortName"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={<SubmittalChartTooltip />}
                      cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                    />
                    <Bar
                      dataKey="approved"
                      name="مقبولة (A/B)"
                      fill="#10b981"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={26}
                    />
                    <Bar
                      dataKey="rejected"
                      name="مرفوضة / إعادة تقديم (C/D)"
                      fill="#f43f5e"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={26}
                    />
                    <Bar
                      dataKey="underReview"
                      name="قيد المراجعة (W)"
                      fill="#f59e0b"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={26}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-72 grid grid-cols-1 sm:grid-cols-2 items-center gap-4 pt-2">
                <div dir="ltr" className="w-full h-60 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutSlices}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={88}
                        paddingAngle={3}
                        stroke="none"
                      >
                        {donutSlices.map((slice) => (
                          <Cell key={slice.name} fill={slice.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<DonutTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                      {totalApproved + totalRejected > 0 ? `${overallAcceptanceRate}%` : '—'}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      معدل القبول
                    </span>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/60 flex items-center justify-between">
                    <span className="font-bold text-emerald-900 dark:text-emerald-200">
                      تقديمات مقبولة (A / B)
                    </span>
                    <span className="font-mono tabular-nums font-extrabold text-emerald-700 dark:text-emerald-300">
                      {totalApproved}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200/70 dark:border-rose-800/60 flex items-center justify-between">
                    <span className="font-bold text-rose-900 dark:text-rose-200">
                      مرفوضة / إعادة (C / D)
                    </span>
                    <span className="font-mono tabular-nums font-extrabold text-rose-700 dark:text-rose-300">
                      {totalRejected}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/60 flex items-center justify-between">
                    <span className="font-bold text-amber-900 dark:text-amber-200">
                      قيد المراجعة (W)
                    </span>
                    <span className="font-mono tabular-nums font-extrabold text-amber-700 dark:text-amber-300">
                      {totalUnderReview}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Legend & Footer Action */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                <span>مقبولة (A/B)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" />
                <span>مرفوضة / إعادة (C/D)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" />
                <span>قيد المراجعة (W)</span>
              </span>
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('submittal-tracker')}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>متتبع التقديمات</span>
              <ArrowUpLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
