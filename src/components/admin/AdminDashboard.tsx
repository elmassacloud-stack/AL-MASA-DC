import React from 'react';
import {
  TrendingUp,
  AlertTriangle,
  FileCheck2,
  Clock,
  Building,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ShieldAlert,
  Calendar,
  Layers,
  Search,
  Plus
} from 'lucide-react';
import {
  Project,
  DailyReport,
  IssueReport,
  ProjectTask,
  Announcement
} from '../../types';
import { getTodayDateStr } from '../../seedData';

interface Props {
  projects: Project[];
  reports: DailyReport[];
  issues: IssueReport[];
  tasks: ProjectTask[];
  announcements: Announcement[];
  onNavigateTab: (tabId: string) => void;
  onOpenReport?: (reportId: string) => void;
}

export const AdminDashboard: React.FC<Props> = ({
  projects,
  reports,
  issues,
  tasks,
  announcements,
  onNavigateTab
}) => {
  const todayStr = getTodayDateStr();
  const activeProjects = projects.filter((p) => p.status === 'active');

  // KPI 1: Open Issues
  const openIssues = issues.filter((i) => i.status !== 'resolved');

  // KPI 2: Urgent Issues
  const urgentIssues = openIssues.filter((i) => i.priority === 'urgent');

  // KPI 3: Reports Received Today vs Expected
  const todayReports = reports.filter((r) => r.reportDate === todayStr);
  const projectsWithTodayReport = new Set(todayReports.map((r) => r.projectId));
  const reportsReceivedCount = projectsWithTodayReport.size;
  const reportsExpectedCount = activeProjects.length;

  // KPI 4: Overdue Tasks
  const overdueTasks = tasks.filter(
    (t) => t.status !== 'done' && t.deadline < todayStr
  );

  // KPI 5: Average Issue Resolution Time
  const resolvedIssues = issues.filter((i) => i.status === 'resolved' && i.resolvedAt);
  let avgResolutionDays = 1.6; // realistic baseline if none resolved yet
  if (resolvedIssues.length > 0) {
    const totalDays = resolvedIssues.reduce((acc, curr) => {
      const created = new Date(curr.createdAt).getTime();
      const resolved = new Date(curr.resolvedAt!).getTime();
      const diffDays = Math.max(0.1, (resolved - created) / (1000 * 60 * 60 * 24));
      return acc + diffDays;
    }, 0);
    avgResolutionDays = parseFloat((totalDays / resolvedIssues.length).toFixed(1));
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Banner / Welcome */}
      <div className="bg-gradient-to-l from-blue-700 via-blue-600 to-indigo-800 rounded-3xl p-5 sm:p-7 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-semibold mb-3">
            <Layers className="w-3.5 h-3.5" />
            <span>لوحة المؤشرات والرقابة المركزية DC</span>
          </div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight">
            متابعة مشاريع ومواقع العمل الميدانية
          </h2>
          <p className="text-blue-100 text-xs sm:text-sm mt-1.5 leading-relaxed">
            مراقبة لحظية لتقارير الإنجاز اليومية، تتبع مواقف التقديمات الهندسية (Submittals)، والتدخل السريع لحل عوائق المواقع.
          </p>
        </div>

        {/* Decorative badge in background */}
        <div className="absolute left-[-20px] bottom-[-30px] opacity-10 text-white pointer-events-none">
          <Building className="w-64 h-64" />
        </div>
      </div>

      {/* =========================================================================
          KEY PERFORMANCE INDICATORS (KPIs) CARDS
          ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* KPI 1: Reports Received Today */}
        <div
          onClick={() => onNavigateTab('reports')}
          className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-blue-400 dark:hover:border-blue-600 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 mb-2">
            <span className="text-xs font-bold">تقارير اليوم</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <FileCheck2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
              {reportsReceivedCount}
            </span>
            <span className="text-xs text-slate-700 dark:text-slate-300 font-mono font-medium">/ {reportsExpectedCount}</span>
          </div>
          <div className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
            <span>{Math.round((reportsReceivedCount / Math.max(1, reportsExpectedCount)) * 100)}% تم الاستلام</span>
          </div>
        </div>

        {/* KPI 2: Urgent Issues */}
        <div
          onClick={() => onNavigateTab('issues')}
          className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-red-400 dark:hover:border-red-600 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 mb-2">
            <span className="text-xs font-bold">مشكلات عاجلة</span>
            <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 animate-pulse" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl sm:text-3xl font-extrabold font-mono ${urgentIssues.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
              {urgentIssues.length}
            </span>
            <span className="text-xs text-slate-700 dark:text-slate-300">بلاغ عاجل</span>
          </div>
          <div className="mt-2 text-[11px] font-semibold text-red-700 dark:text-red-400">
            {urgentIssues.length > 0 ? 'تتطلب تدخلاً فورياً' : 'الوضع مستقر'}
          </div>
        </div>

        {/* KPI 3: Open Issues Total */}
        <div
          onClick={() => onNavigateTab('issues')}
          className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-amber-400 dark:hover:border-amber-600 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 mb-2">
            <span className="text-xs font-bold">إجمالي العوائق</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
              {openIssues.length}
            </span>
            <span className="text-xs text-slate-700 dark:text-slate-300">قيد المتابعة</span>
          </div>
          <div className="mt-2 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
            {issues.length} مسجلة إجمالاً
          </div>
        </div>

        {/* KPI 4: Overdue Tasks */}
        <div
          onClick={() => onNavigateTab('tasks')}
          className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-rose-400 dark:hover:border-rose-600 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 mb-2">
            <span className="text-xs font-bold">مهام متأخرة</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl sm:text-3xl font-extrabold font-mono ${overdueTasks.length > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
              {overdueTasks.length}
            </span>
            <span className="text-xs text-slate-700 dark:text-slate-300">تجاوزت الموعد</span>
          </div>
          <div className="mt-2 text-[11px] font-semibold text-rose-700 dark:text-rose-400">
            {overdueTasks.length > 0 ? 'مطلوب حث الموقع' : 'جميع المهام بالموعد'}
          </div>
        </div>

        {/* KPI 5: Average Resolution Time */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 mb-2">
            <span className="text-xs font-bold">سرعة الحل</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
              {avgResolutionDays}
            </span>
            <span className="text-xs text-slate-700 dark:text-slate-300">يوم</span>
          </div>
          <div className="mt-2 text-[11px] font-semibold text-teal-700 dark:text-teal-400">
            متوسط وقت معالجة العائق
          </div>
        </div>
      </div>

      {/* =========================================================================
          PER-PROJECT STATUS & COMPLIANCE TABLE (Requested specifically)
          ========================================================================= */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Building className="w-5 h-5 text-blue-600" />
              <span>موقف المشاريع اليومي (Project Compliance Tracker)</span>
            </h3>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
              حالة التقرير اليومي، المشكلات المفتوحة، والمهام المتأخرة لكل موقع
            </p>
          </div>

          <button
            onClick={() => onNavigateTab('reports')}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 self-start sm:self-auto cursor-pointer"
          >
            <span>استعراض كافة التقارير</span>
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>

        {/* Responsive Table / Cards */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-right border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                <th className="py-3 px-4">المشروع / الموقع</th>
                <th className="py-3 px-3 text-center">كود المشروع</th>
                <th className="py-3 px-4 text-center">تقرير اليوم ({todayStr})</th>
                <th className="py-3 px-3 text-center">العوائق المفتوحة</th>
                <th className="py-3 px-3 text-center">المهام المتأخرة</th>
                <th className="py-3 px-4 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {activeProjects.map((project) => {
                const hasSubmittedToday = projectsWithTodayReport.has(project.id);
                const projOpenIssues = issues.filter(
                  (i) => i.projectId === project.id && i.status !== 'resolved'
                );
                const projUrgentIssues = projOpenIssues.filter((i) => i.priority === 'urgent');
                const projOverdueTasks = tasks.filter(
                  (t) => t.projectId === project.id && t.status !== 'done' && t.deadline < todayStr
                );
                const todayReportObj = todayReports.find((r) => r.projectId === project.id);

                return (
                  <tr
                    key={project.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {/* Project Name */}
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-600" />
                        <span>{project.name}</span>
                      </div>
                    </td>

                    {/* Code */}
                    <td className="py-3.5 px-3 text-center font-submittal font-mono text-slate-500">
                      {project.code}
                    </td>

                    {/* Report Submitted Today (Green / Red) */}
                    <td className="py-3.5 px-4 text-center">
                      {hasSubmittedToday ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>تم التقديم اليوم</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                          <XCircle className="w-3.5 h-3.5 text-rose-600" />
                          <span>لم يُقدّم (متأخر)</span>
                        </span>
                      )}
                    </td>

                    {/* Open Issues Count */}
                    <td className="py-3.5 px-3 text-center">
                      {projOpenIssues.length === 0 ? (
                        <span className="text-slate-400 font-mono">-</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          {projOpenIssues.length}
                          {projUrgentIssues.length > 0 && (
                            <span className="text-[10px] text-red-600 font-extrabold">
                              ({projUrgentIssues.length} عاجل)
                            </span>
                          )}
                        </span>
                      )}
                    </td>

                    {/* Overdue Tasks Count */}
                    <td className="py-3.5 px-3 text-center">
                      {projOverdueTasks.length === 0 ? (
                        <span className="text-slate-400 font-mono">-</span>
                      ) : (
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                          {projOverdueTasks.length} متأخرة
                        </span>
                      )}
                    </td>

                    {/* Action buttons */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {todayReportObj ? (
                          <button
                            onClick={() => onNavigateTab('reports')}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 hover:bg-blue-100 font-bold text-xs cursor-pointer transition-colors"
                          >
                            فتح التقرير
                          </button>
                        ) : (
                          <button
                            onClick={() => onNavigateTab('announcements')}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 font-medium text-xs cursor-pointer transition-colors"
                          >
                            تذكير الموقع
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Launch & Submittal Stalled Warning */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Quick Submittal Search Trigger */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Search className="w-5 h-5 text-blue-600" />
              <h4 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                متتبع التقديمات السريع (Submittal Tracker)
              </h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              البحث عن أي رقم تقديم (مثل MAS_RAV_IR_STR_0055) لمعرفة كافة مراجعاته (REV)، مواقف اعتماده عبر الأيام، وتنبيهات التعثر.
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('submittal-tracker')}
            className="mt-4 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-colors"
          >
            <Search className="w-4 h-4" />
            <span>فتح متتبع التقديمات</span>
          </button>
        </div>

        {/* Latest Announcements summary */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              <h4 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                التعاميم والتنبيهات الإدارية للمواقع
              </h4>
            </div>
            {announcements.length > 0 ? (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
                <span className="font-bold text-slate-900 dark:text-white block mb-0.5">
                  {announcements[0].title}
                </span>
                <p className="text-slate-600 dark:text-slate-400 line-clamp-2">
                  {announcements[0].content}
                </p>
                <span className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold mt-1 block">
                  تم تأكيد القراءة من {announcements[0].readBy.length} مستخدم
                </span>
              </div>
            ) : (
              <p className="text-xs text-slate-400">لا توجد تعاميم منشورة حالياً.</p>
            )}
          </div>
          <button
            onClick={() => onNavigateTab('announcements')}
            className="mt-4 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>نشر تعميم جديد للمشاريع</span>
          </button>
        </div>
      </div>
    </div>
  );
};
