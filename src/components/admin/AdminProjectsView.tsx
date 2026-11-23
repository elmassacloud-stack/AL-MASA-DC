import React, { useState, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  CheckCircle2,
  Archive,
  AlertCircle,
  Loader2,
  Users,
  FileText,
  AlertTriangle,
  CheckSquare,
  Briefcase,
  MapPin,
  Hammer,
  FileUp,
  Check,
  BarChart3,
  Target
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
  Legend
} from 'recharts';
import {
  Project,
  DailyReport,
  IssueReport,
  ProjectTask,
  UserProfile,
  WorkDiscipline,
  SiteDeliverable,
  ExecutedWork
} from '../../types';
import { WORK_DISCIPLINE_CONFIG } from '../../config';
import { dataService } from '../../services/dataService';

interface Props {
  projects: Project[];
  reports: DailyReport[];
  issues: IssueReport[];
  tasks: ProjectTask[];
  users: UserProfile[];
  siteDeliverables?: SiteDeliverable[];
  executedWorks?: ExecutedWork[];
  onNavigateTab?: (tabId: string) => void;
}

const ALL_DISCIPLINES = Object.keys(WORK_DISCIPLINE_CONFIG) as WorkDiscipline[];

export const AdminProjectsView: React.FC<Props> = ({
  projects,
  reports,
  issues,
  tasks,
  users,
  siteDeliverables = [],
  executedWorks = [],
  onNavigateTab
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [disciplineFilter, setDisciplineFilter] = useState<string>('all');
  const [chartViewMode, setChartViewMode] = useState<'percent' | 'counts'>('percent');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editSelectedSiteUserIds, setEditSelectedSiteUserIds] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [clientName, setClientName] = useState<string>('');
  const [workScope, setWorkScope] = useState<string>('');
  const [scopeDisciplines, setScopeDisciplines] = useState<WorkDiscipline[]>([]);
  const [plannedWorksCountInput, setPlannedWorksCountInput] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [status, setStatus] = useState<'active' | 'completed'>('active');
  const [selectedSiteUserIds, setSelectedSiteUserIds] = useState<string[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState<boolean>(false);

  // Edit form state
  const [editError, setEditError] = useState<string | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  const siteUsers = useMemo(
    () => users.filter((u) => u.role === 'site' && u.status === 'active'),
    [users]
  );

  const showToast = (msg: string) => {
    setActionFeedback(msg);
    window.setTimeout(() => setActionFeedback(null), 3800);
  };

  const resetCreateForm = () => {
    setName('');
    setCode('');
    setLocation('');
    setClientName('');
    setWorkScope('');
    setScopeDisciplines([]);
    setPlannedWorksCountInput('');
    setDescription('');
    setStatus('active');
    setSelectedSiteUserIds([]);
    setCreateError(null);
  };

  const handleOpenCreateModal = () => {
    resetCreateForm();
    setIsCreating(true);
  };

  const handleOpenEditModal = (project: Project) => {
    setEditError(null);
    setEditingProject({
      ...project,
      scopeDisciplines: project.scopeDisciplines ? [...project.scopeDisciplines] : []
    });
    const assignedIds = siteUsers
      .filter((u) => !u.allProjects && u.assignedProjects?.includes(project.id))
      .map((u) => u.id);
    setEditSelectedSiteUserIds(assignedIds);
  };

  const toggleCreateDiscipline = (disc: WorkDiscipline) => {
    setScopeDisciplines((prev) =>
      prev.includes(disc) ? prev.filter((d) => d !== disc) : [...prev, disc]
    );
  };

  const toggleEditDiscipline = (disc: WorkDiscipline) => {
    setEditingProject((prev) => {
      if (!prev) return prev;
      const current = prev.scopeDisciplines || [];
      const next = current.includes(disc)
        ? current.filter((d) => d !== disc)
        : [...current, disc];
      return { ...prev, scopeDisciplines: next };
    });
  };

  const toggleSiteUserSelection = (uid: string) => {
    setSelectedSiteUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const toggleEditSiteUserSelection = (uid: string) => {
    setEditSelectedSiteUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();

    if (!trimmedName || !trimmedCode) {
      setCreateError('يرجى إدخال اسم المشروع وكود المشروع.');
      return;
    }

    if (projects.some((p) => p.code.toUpperCase() === trimmedCode)) {
      setCreateError('يوجد مشروع آخر مسجل بنفس الكود بالفعل.');
      return;
    }

    const parsedPlanned = plannedWorksCountInput.trim()
      ? Math.max(0, Math.min(100000, Math.round(Number(plannedWorksCountInput))))
      : undefined;

    setIsSubmittingCreate(true);
    try {
      const created = await dataService.addProject({
        name: trimmedName,
        code: trimmedCode,
        location: location.trim() || undefined,
        clientName: clientName.trim() || undefined,
        workScope: workScope.trim() || undefined,
        scopeDisciplines: scopeDisciplines.length > 0 ? scopeDisciplines : undefined,
        plannedWorksCount:
          parsedPlanned !== undefined && Number.isFinite(parsedPlanned) && parsedPlanned > 0
            ? parsedPlanned
            : undefined,
        description: description.trim() || undefined,
        status
      });

      // Assign selected site engineers to the newly created project if chosen
      if (selectedSiteUserIds.length > 0) {
        await Promise.all(
          selectedSiteUserIds.map(async (uid) => {
            const targetUser = users.find((u) => u.id === uid);
            if (!targetUser || targetUser.allProjects) return;
            const currentAssigned = targetUser.assignedProjects || [];
            if (!currentAssigned.includes(created.id)) {
              await dataService.updateUser(uid, {
                assignedProjects: [...currentAssigned, created.id]
              });
            }
          })
        );
      }

      setIsCreating(false);
      resetCreateForm();
      showToast(
        `تم إضافة المشروع "${created.name}" وربطه تلقائياً بكافة أقسام النظام وشيتات اللوج.`
      );
    } catch {
      setCreateError('تعذر حفظ المشروع الجديد في قاعدة البيانات. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleSaveEditProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    setEditError(null);

    const trimmedName = editingProject.name.trim();
    const trimmedCode = editingProject.code.trim().toUpperCase();

    if (!trimmedName || !trimmedCode) {
      setEditError('يرجى إدخال اسم المشروع وكود المشروع.');
      return;
    }

    if (
      projects.some(
        (p) => p.id !== editingProject.id && p.code.toUpperCase() === trimmedCode
      )
    ) {
      setEditError('يوجد مشروع آخر مسجل بنفس الكود بالفعل.');
      return;
    }

    setIsSubmittingEdit(true);
    try {
      await dataService.updateProject(editingProject.id, {
        name: trimmedName,
        code: trimmedCode,
        location: editingProject.location || '',
        clientName: editingProject.clientName || '',
        workScope: editingProject.workScope || '',
        scopeDisciplines: editingProject.scopeDisciplines || [],
        plannedWorksCount:
          typeof editingProject.plannedWorksCount === 'number' &&
          Number.isFinite(editingProject.plannedWorksCount)
            ? Math.max(0, Math.min(100000, Math.round(editingProject.plannedWorksCount)))
            : 0,
        description: editingProject.description || '',
        status: editingProject.status
      });

      // Sync site engineer assignments for this project
      const assignmentOps: Promise<unknown>[] = [];
      for (const u of siteUsers) {
        if (u.allProjects) continue;
        const currentAssigned = u.assignedProjects || [];
        const currentlyHas = currentAssigned.includes(editingProject.id);
        const shouldHave = editSelectedSiteUserIds.includes(u.id);
        if (shouldHave && !currentlyHas) {
          assignmentOps.push(
            dataService.updateUser(u.id, {
              assignedProjects: [...currentAssigned, editingProject.id]
            })
          );
        } else if (!shouldHave && currentlyHas) {
          assignmentOps.push(
            dataService.updateUser(u.id, {
              assignedProjects: currentAssigned.filter((id) => id !== editingProject.id)
            })
          );
        }
      }
      if (assignmentOps.length > 0) {
        await Promise.all(assignmentOps);
      }

      setEditingProject(null);
      showToast('تم تحديث بيانات المشروع ونطاق العمل وصلاحيات المهندسين بنجاح.');
    } catch {
      setEditError('تعذر تحديث بيانات المشروع. يرجى المحاولة مجدداً.');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleToggleProjectStatus = async (project: Project) => {
    const nextStatus = project.status === 'active' ? 'completed' : 'active';
    try {
      await dataService.updateProject(project.id, { status: nextStatus });
      showToast(
        nextStatus === 'active'
          ? `تم إعادة تفعيل المشروع "${project.name}".`
          : `تم تحويل المشروع "${project.name}" إلى مكتمل.`
      );
    } catch {
      showToast('تعذر تغيير حالة المشروع.');
    }
  };

  const handleDeleteProject = async (project: Project) => {
    setIsDeletingId(project.id);
    try {
      await dataService.deleteProject(project.id);
      setConfirmDeleteId(null);
      showToast(`تم حذف المشروع "${project.name}" وإزالته من تعيينات المستخدمين.`);
    } catch {
      showToast('تعذر حذف المشروع. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsDeletingId(null);
    }
  };

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects
      .filter((p) => {
        const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
        const matchesDiscipline =
          disciplineFilter === 'all' ||
          Boolean(p.scopeDisciplines?.includes(disciplineFilter as WorkDiscipline));
        const matchesQuery =
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          (p.location || '').toLowerCase().includes(q) ||
          (p.clientName || '').toLowerCase().includes(q) ||
          (p.workScope || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q);
        return matchesStatus && matchesDiscipline && matchesQuery;
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        return a.name.localeCompare(b.name, 'ar');
      });
  }, [projects, searchQuery, statusFilter, disciplineFilter]);

  const activeCount = projects.filter((p) => p.status === 'active').length;
  const completedCount = projects.filter((p) => p.status === 'completed').length;
  const scopedCount = projects.filter(
    (p) => Boolean(p.workScope?.trim()) || Boolean(p.scopeDisciplines?.length)
  ).length;

  // Compute Executed Works vs. Planned Works completion analytics per project
  const projectProgressMap = useMemo(() => {
    const map = new Map<
      string,
      {
        projectId: string;
        projectName: string;
        shortName: string;
        projectCode: string;
        status: Project['status'];
        executedCount: number;
        approvedCount: number;
        plannedCount: number;
        hasExplicitPlan: boolean;
        completionPercent: number;
        remainingCount: number;
      }
    >();

    for (const p of projects) {
      const projWorks = executedWorks.filter((w) => w.projectId === p.id);
      const executedCount = projWorks.length;
      const approvedCount = projWorks.filter((w) => w.reviewStatus === 'approved').length;
      const hasExplicitPlan =
        typeof p.plannedWorksCount === 'number' && p.plannedWorksCount > 0;
      const plannedCount = hasExplicitPlan ? p.plannedWorksCount! : executedCount;

      let completionPercent = 0;
      if (hasExplicitPlan) {
        completionPercent = Math.min(
          100,
          Math.round((executedCount / p.plannedWorksCount!) * 100)
        );
      } else if (executedCount > 0) {
        const avgPct =
          projWorks.reduce(
            (sum, w) => sum + Math.max(0, Math.min(100, Number(w.completionPercent) || 0)),
            0
          ) / executedCount;
        completionPercent = Math.round(avgPct);
      }

      const remainingCount = hasExplicitPlan
        ? Math.max(0, p.plannedWorksCount! - executedCount)
        : 0;

      const shortName = p.name.length > 20 ? `${p.name.slice(0, 19)}…` : p.name;

      map.set(p.id, {
        projectId: p.id,
        projectName: p.name,
        shortName,
        projectCode: p.code,
        status: p.status,
        executedCount,
        approvedCount,
        plannedCount,
        hasExplicitPlan,
        completionPercent,
        remainingCount
      });
    }

    return map;
  }, [projects, executedWorks]);

  const progressChartData = useMemo(() => {
    return filteredProjects.map((p) => {
      const stat = projectProgressMap.get(p.id)!;
      return {
        ...stat,
        remainingPercent: Math.max(0, 100 - stat.completionPercent)
      };
    });
  }, [filteredProjects, projectProgressMap]);

  const overallCompletionStats = useMemo(() => {
    const items = Array.from(projectProgressMap.values());
    const totalExecuted = items.reduce((sum, item) => sum + item.executedCount, 0);
    const totalExplicitPlanned = items.reduce(
      (sum, item) => sum + (item.hasExplicitPlan ? item.plannedCount : 0),
      0
    );
    const plannedProjectsCount = items.filter((item) => item.hasExplicitPlan).length;
    const avgCompletion =
      items.length > 0
        ? Math.round(
            items.reduce((sum, item) => sum + item.completionPercent, 0) / items.length
          )
        : 0;
    return {
      totalExecuted,
      totalExplicitPlanned,
      plannedProjectsCount,
      avgCompletion
    };
  }, [projectProgressMap]);

  const getProgressBarColor = (pct: number): string => {
    if (pct >= 80) return '#059669';
    if (pct >= 40) return 'var(--brand-primary, #2563eb)';
    if (pct > 0) return '#d97706';
    return '#94a3b8';
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-16">
      {/* Header & Main Add Button */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border border-blue-200/70 dark:border-blue-900 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              إدارة المشاريع والمواقع
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-0.5">
              إضافة وتعديل المشاريع، تحديد نطاق العمل والتخصصات، وربطها مباشرة بالتقارير، الأعمال المنفذة، شيتات Logs، وصلاحيات المهندسين
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="min-h-[42px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shrink-0 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة مشروع جديد</span>
        </button>
      </div>

      {/* Feedback Toast */}
      {actionFeedback && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            إجمالي المشاريع المسجلة
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            {projects.length}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {activeCount} نشط · {completedCount} مكتمل
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] font-semibold text-blue-700 dark:text-blue-400">
            مشاريع محددة نطاق العمل
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums text-blue-700 dark:text-blue-300 mt-1">
            {scopedCount}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            من أصل {projects.length} مشروع مسجل
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            مهندسو المواقع النشطون
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
            {siteUsers.length}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            مرتبطون بصلاحيات المواقع
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            إجمالي السجلات المرتبطة
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            {reports.length + executedWorks.length + siteDeliverables.length}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {reports.length} تقرير · {executedWorks.length} عمل منفذ · {siteDeliverables.length} تسليم
          </div>
        </div>
      </div>

      {/* Project Completion Progress Chart (Executed Works vs. Planned Works) */}
      {projects.length > 0 && (
        <section className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border border-blue-200/70 dark:border-blue-900 flex items-center justify-center shrink-0">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  نسبة إنجاز المشاريع (الأعمال المنفذة مقابل المخطط لها)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  متوسط الإنجاز العام:{' '}
                  <strong className="font-mono text-slate-900 dark:text-white">
                    {overallCompletionStats.avgCompletion}%
                  </strong>
                  {' · '}
                  إجمالي المنفذ:{' '}
                  <strong className="font-mono text-blue-700 dark:text-blue-400">
                    {overallCompletionStats.totalExecuted}
                  </strong>{' '}
                  بند
                  {overallCompletionStats.totalExplicitPlanned > 0 && (
                    <>
                      {' · '}
                      إجمالي المخطط:{' '}
                      <strong className="font-mono text-slate-900 dark:text-white">
                        {overallCompletionStats.totalExplicitPlanned}
                      </strong>{' '}
                      بند ({overallCompletionStats.plannedProjectsCount} مشروع محدد المخطط)
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setChartViewMode('percent')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    chartViewMode === 'percent'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  نسبة الإنجاز (%)
                </button>
                <button
                  type="button"
                  onClick={() => setChartViewMode('counts')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    chartViewMode === 'counts'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  المنفذ مقابل المخطط (العدد)
                </button>
              </div>
            </div>
          </div>

          {progressChartData.length === 0 ? (
            <div className="py-10 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
              لا توجد مشاريع مطابقة للفلاتر الحالية لعرضها في الرسم البياني.
            </div>
          ) : (
            <>
              <div className="w-full h-72 sm:h-80" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  {chartViewMode === 'percent' ? (
                    <BarChart
                      data={progressChartData}
                      margin={{ top: 24, right: 16, left: 4, bottom: 16 }}
                      barCategoryGap="24%"
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="rgba(148, 163, 184, 0.25)"
                      />
                      <XAxis
                        dataKey="shortName"
                        tick={{ fontSize: 11, fill: '#64748b', fontWeight: 700 }}
                        axisLine={{ stroke: 'rgba(148, 163, 184, 0.35)' }}
                        tickLine={false}
                        interval={0}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tickFormatter={(val) => `${val}%`}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        width={42}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const item = payload[0].payload as (typeof progressChartData)[number];
                          return (
                            <div
                              dir="rtl"
                              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 text-xs space-y-1.5 min-w-[210px]"
                            >
                              <div className="font-extrabold text-slate-900 dark:text-white">
                                {item.projectName}
                              </div>
                              <div
                                dir="ltr"
                                className="text-[10px] font-mono text-slate-500 dark:text-slate-400 text-right"
                              >
                                {item.projectCode}
                              </div>
                              <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-1">
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-slate-500 dark:text-slate-400">
                                    نسبة الإنجاز:
                                  </span>
                                  <strong className="font-mono text-blue-700 dark:text-blue-400">
                                    {item.completionPercent}%
                                  </strong>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-slate-500 dark:text-slate-400">
                                    الأعمال المنفذة:
                                  </span>
                                  <strong className="font-mono text-slate-900 dark:text-white">
                                    {item.executedCount} بند ({item.approvedCount} معتمد)
                                  </strong>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-slate-500 dark:text-slate-400">
                                    المخطط له:
                                  </span>
                                  <strong className="font-mono text-slate-900 dark:text-white">
                                    {item.hasExplicitPlan
                                      ? `${item.plannedCount} بند`
                                      : 'غير محدد بعد'}
                                  </strong>
                                </div>
                                {item.hasExplicitPlan && (
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-slate-500 dark:text-slate-400">
                                      المتبقي عن المخطط:
                                    </span>
                                    <strong className="font-mono text-amber-700 dark:text-amber-400">
                                      {item.remainingCount} بند
                                    </strong>
                                  </div>
                                )}
                              </div>
                              {!item.hasExplicitPlan && (
                                <div className="text-[10px] text-amber-700 dark:text-amber-400 pt-1">
                                  يُحسب من متوسط نسب البنود المسجلة — اضغط على العمود لتحديد العدد المخطط
                                </div>
                              )}
                            </div>
                          );
                        }}
                      />
                      <Bar
                        dataKey="completionPercent"
                        name="نسبة الإنجاز (%)"
                        radius={[8, 8, 0, 0]}
                        maxBarSize={56}
                        background={{ fill: 'rgba(148, 163, 184, 0.14)', radius: 8 }}
                        className="cursor-pointer"
                        onClick={(barData) => {
                          const clickedProjectId = (
                            barData?.payload as { projectId?: string } | undefined
                          )?.projectId;
                          const targetProj = projects.find(
                            (p) => p.id === clickedProjectId
                          );
                          if (targetProj) handleOpenEditModal(targetProj);
                        }}
                      >
                        {progressChartData.map((entry) => (
                          <Cell
                            key={entry.projectId}
                            fill={getProgressBarColor(entry.completionPercent)}
                          />
                        ))}
                        <LabelList
                          dataKey="completionPercent"
                          position="top"
                          formatter={(val: unknown) => `${val ?? 0}%`}
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            fill: '#475569'
                          }}
                        />
                      </Bar>
                    </BarChart>
                  ) : (
                    <BarChart
                      data={progressChartData}
                      margin={{ top: 20, right: 16, left: 4, bottom: 16 }}
                      barGap={6}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="rgba(148, 163, 184, 0.25)"
                      />
                      <XAxis
                        dataKey="shortName"
                        tick={{ fontSize: 11, fill: '#64748b', fontWeight: 700 }}
                        axisLine={{ stroke: 'rgba(148, 163, 184, 0.35)' }}
                        tickLine={false}
                        interval={0}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const item = payload[0].payload as (typeof progressChartData)[number];
                          return (
                            <div
                              dir="rtl"
                              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 text-xs space-y-1.5 min-w-[200px]"
                            >
                              <div className="font-extrabold text-slate-900 dark:text-white">
                                {item.projectName}
                              </div>
                              <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
                                <span className="text-slate-500 dark:text-slate-400">
                                  الأعمال المنجزة:
                                </span>
                                <strong className="font-mono text-emerald-700 dark:text-emerald-400">
                                  {item.executedCount} بند
                                </strong>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-slate-500 dark:text-slate-400">
                                  الأعمال المخطط لها:
                                </span>
                                <strong className="font-mono text-slate-900 dark:text-white">
                                  {item.hasExplicitPlan
                                    ? `${item.plannedCount} بند`
                                    : `${item.plannedCount} (مرجع مسجل)`}
                                </strong>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-slate-500 dark:text-slate-400">
                                  نسبة الإنجاز:
                                </span>
                                <strong className="font-mono text-blue-700 dark:text-blue-400">
                                  {item.completionPercent}%
                                </strong>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11, fontWeight: 700, paddingTop: 6 }}
                      />
                      <Bar
                        dataKey="plannedCount"
                        name="الأعمال المخطط لها"
                        fill="#cbd5e1"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={32}
                        className="cursor-pointer"
                        onClick={(barData) => {
                          const clickedProjectId = (
                            barData?.payload as { projectId?: string } | undefined
                          )?.projectId;
                          const targetProj = projects.find(
                            (p) => p.id === clickedProjectId
                          );
                          if (targetProj) handleOpenEditModal(targetProj);
                        }}
                      />
                      <Bar
                        dataKey="executedCount"
                        name="الأعمال المنجزة (Executed Works)"
                        fill="var(--brand-primary, #2563eb)"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={32}
                        className="cursor-pointer"
                        onClick={(barData) => {
                          const clickedProjectId = (
                            barData?.payload as { projectId?: string } | undefined
                          )?.projectId;
                          const targetProj = projects.find(
                            (p) => p.id === clickedProjectId
                          );
                          if (targetProj) handleOpenEditModal(targetProj);
                        }}
                      />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" />
                    <span>مرتفع (80% فأكثر)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-sm inline-block"
                      style={{ backgroundColor: 'var(--brand-primary, #2563eb)' }}
                    />
                    <span>جاري التنفيذ (40% - 79%)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-600 inline-block" />
                    <span>مرحلة مبكرة (أقل من 40%)</span>
                  </span>
                </div>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  اضغط على أي عمود لتحديث العدد المخطط للأعمال في المشروع
                </span>
              </div>
            </>
          )}
        </section>
      )}

      {/* Search & Filters */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-6 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="بحث باسم المشروع، الكود، الموقع، المالك، أو نطاق العمل..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pr-10 pl-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="md:col-span-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'completed')}
            className="w-full h-11 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">جميع الحالات ({projects.length})</option>
            <option value="active">مشاريع نشطة ({activeCount})</option>
            <option value="completed">مشاريع مكتملة ({completedCount})</option>
          </select>
        </div>

        <div className="md:col-span-3">
          <select
            value={disciplineFilter}
            onChange={(e) => setDisciplineFilter(e.target.value)}
            className="w-full h-11 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">جميع تخصصات نطاق العمل</option>
            {ALL_DISCIPLINES.map((disc) => (
              <option key={disc} value={disc}>
                {WORK_DISCIPLINE_CONFIG[disc].labelAr}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            لا توجد مشاريع مطابقة لخيارات البحث الحالية
          </p>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة مشروع جديد</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredProjects.map((project) => {
            const isActive = project.status === 'active';
            const projReportsCount = reports.filter((r) => r.projectId === project.id).length;
            const projDeliverablesCount = siteDeliverables.filter(
              (d) => d.projectId === project.id
            ).length;
            const projExecutedCount = executedWorks.filter(
              (w) => w.projectId === project.id
            ).length;
            const projOpenIssuesCount = issues.filter(
              (i) => i.projectId === project.id && i.status !== 'resolved'
            ).length;
            const projOpenTasksCount = tasks.filter(
              (t) => t.projectId === project.id && t.status !== 'done'
            ).length;
            const assignedEngineers = users.filter(
              (u) =>
                u.role === 'site' &&
                u.status === 'active' &&
                (u.allProjects || u.assignedProjects?.includes(project.id))
            );
            const isConfirmingDelete = confirmDeleteId === project.id;
            const isDeleting = isDeletingId === project.id;
            const hasScope =
              Boolean(project.workScope?.trim()) || Boolean(project.scopeDisciplines?.length);

            return (
              <div
                key={project.id}
                className={`bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border transition-colors flex flex-col justify-between gap-4 ${
                  !isActive
                    ? 'border-slate-200 dark:border-slate-800 opacity-85'
                    : 'border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-800'
                }`}
              >
                <div className="space-y-3.5">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-extrabold text-slate-900 dark:text-white text-base leading-snug">
                          {project.name}
                        </h3>
                        <span
                          className={`text-[11px] font-bold ${
                            isActive
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          · {isActive ? 'مشروع نشط' : 'مكتمل'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span
                          dir="ltr"
                          className="font-mono font-bold text-blue-700 dark:text-blue-400"
                        >
                          {project.code}
                        </span>
                        {project.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{project.location}</span>
                          </span>
                        )}
                        {project.clientName && (
                          <span className="inline-flex items-center gap-1">
                            <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{project.clientName}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(project)}
                        title="تعديل بيانات المشروع ونطاق العمل"
                        className="p-2 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 bg-slate-50 dark:bg-slate-800 rounded-lg cursor-pointer transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleProjectStatus(project)}
                        title={isActive ? 'تحديد كمكتمل / أرشفة' : 'إعادة تفعيل المشروع'}
                        className={`p-2 rounded-lg cursor-pointer transition-colors ${
                          isActive
                            ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50 bg-slate-50 dark:bg-slate-800'
                            : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 bg-slate-50 dark:bg-slate-800'
                        }`}
                      >
                        {isActive ? (
                          <Archive className="w-4 h-4" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(isConfirmingDelete ? null : project.id)}
                        title="حذف المشروع"
                        className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 bg-slate-50 dark:bg-slate-800 rounded-lg cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Inline 2-step Delete Confirmation */}
                  {isConfirmingDelete && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="text-rose-800 dark:text-rose-200 font-bold leading-relaxed">
                        هل أنت متأكد من حذف المشروع "{project.name}"؟
                        {projReportsCount > 0 && (
                          <span className="block text-[11px] font-medium text-rose-700 dark:text-rose-300 mt-0.5">
                            تنبيه: يوجد {projReportsCount} تقرير مرتبط بهذا المشروع وسيتم سحبه من قوائم التحديد.
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => handleDeleteProject(project)}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white rounded-lg font-bold cursor-pointer flex items-center gap-1"
                        >
                          {isDeleting && <Loader2 className="w-3 h-3 animate-spin" />}
                          <span>تأكيد الحذف</span>
                        </button>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg font-semibold cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Scope of Work Section */}
                  <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>نطاق العمل (Scope of Work)</span>
                      </span>
                      {!hasScope && (
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(project)}
                          className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          + تحديد نطاق العمل
                        </button>
                      )}
                    </div>

                    {project.scopeDisciplines && project.scopeDisciplines.length > 0 && (
                      <div className="text-[11px] font-semibold text-blue-800 dark:text-blue-300 leading-relaxed">
                        {project.scopeDisciplines
                          .map((d) => WORK_DISCIPLINE_CONFIG[d]?.labelAr || d)
                          .join(' · ')}
                      </div>
                    )}

                    {project.workScope ? (
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                        {project.workScope}
                      </p>
                    ) : !project.scopeDisciplines?.length ? (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">
                        لم يتم تحديد نطاق العمل لهذا المشروع بعد.
                      </p>
                    ) : null}

                    {project.description && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/70 dark:border-slate-700/60 line-clamp-2">
                        {project.description}
                      </p>
                    )}
                  </div>

                  {/* Project Execution Progress Bar (Executed Works vs. Planned) */}
                  {(() => {
                    const prog = projectProgressMap.get(project.id);
                    if (!prog) return null;
                    return (
                      <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-2">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                            <Target className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            <span>نسبة الإنجاز (الأعمال المنفذة)</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-extrabold text-slate-900 dark:text-white">
                              {prog.completionPercent}%
                            </span>
                            {!prog.hasExplicitPlan && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(project)}
                                className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                              >
                                + تحديد المخطط
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${prog.completionPercent}%`,
                              backgroundColor: getProgressBarColor(prog.completionPercent)
                            }}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2 text-[10.5px] text-slate-500 dark:text-slate-400">
                          <span>
                            المنجز:{' '}
                            <strong className="font-mono text-slate-800 dark:text-slate-200">
                              {prog.executedCount}
                            </strong>{' '}
                            بند ({prog.approvedCount} معتمد)
                          </span>
                          <span>
                            {prog.hasExplicitPlan ? (
                              <>
                                المخطط:{' '}
                                <strong className="font-mono text-slate-800 dark:text-slate-200">
                                  {prog.plannedCount}
                                </strong>{' '}
                                بند
                              </>
                            ) : (
                              'مقاس من متوسط نسب البنود المسجلة'
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="space-y-3">
                  {/* Cross-App Live Counters */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <div className="text-[10px] text-slate-500 font-semibold flex items-center justify-center gap-0.5">
                        <FileText className="w-3 h-3 text-blue-600" />
                        <span>تقارير</span>
                      </div>
                      <div className="text-xs font-extrabold text-slate-900 dark:text-white font-mono tabular-nums mt-0.5">
                        {projReportsCount}
                      </div>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <div className="text-[10px] text-slate-500 font-semibold flex items-center justify-center gap-0.5">
                        <FileUp className="w-3 h-3 text-teal-600" />
                        <span>تسليمات</span>
                      </div>
                      <div className="text-xs font-extrabold text-slate-900 dark:text-white font-mono tabular-nums mt-0.5">
                        {projDeliverablesCount}
                      </div>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <div className="text-[10px] text-slate-500 font-semibold flex items-center justify-center gap-0.5">
                        <Hammer className="w-3 h-3 text-indigo-600" />
                        <span>منفذة</span>
                      </div>
                      <div className="text-xs font-extrabold text-slate-900 dark:text-white font-mono tabular-nums mt-0.5">
                        {projExecutedCount}
                      </div>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <div className="text-[10px] text-slate-500 font-semibold flex items-center justify-center gap-0.5">
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        <span>عوائق</span>
                      </div>
                      <div className="text-xs font-extrabold text-slate-900 dark:text-white font-mono tabular-nums mt-0.5">
                        {projOpenIssuesCount}
                      </div>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <div className="text-[10px] text-slate-500 font-semibold flex items-center justify-center gap-0.5">
                        <CheckSquare className="w-3 h-3 text-purple-600" />
                        <span>مهام</span>
                      </div>
                      <div className="text-xs font-extrabold text-slate-900 dark:text-white font-mono tabular-nums mt-0.5">
                        {projOpenTasksCount}
                      </div>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <div className="text-[10px] text-slate-500 font-semibold flex items-center justify-center gap-0.5">
                        <Users className="w-3 h-3 text-emerald-600" />
                        <span>مهندسين</span>
                      </div>
                      <div className="text-xs font-extrabold text-slate-900 dark:text-white font-mono tabular-nums mt-0.5">
                        {assignedEngineers.length}
                      </div>
                    </div>
                  </div>

                  {/* Connected Modules Quick Jumps */}
                  {onNavigateTab && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                      <button
                        type="button"
                        onClick={() => onNavigateTab('reports')}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-300 border border-slate-200 dark:border-slate-700 font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <FileText className="w-3 h-3" />
                        <span>التقارير</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigateTab('executed-works')}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-300 border border-slate-200 dark:border-slate-700 font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Hammer className="w-3 h-3" />
                        <span>الأعمال المنفذة</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigateTab('tasks')}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-300 border border-slate-200 dark:border-slate-700 font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <CheckSquare className="w-3 h-3" />
                        <span>المهام</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =====================================================================
          CREATE PROJECT MODAL
          ===================================================================== */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 my-auto max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  إضافة مشروع / موقع جديد
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-bold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateProject} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold mb-1 dark:text-slate-200">
                    اسم المشروع / الموقع <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={200}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: مشروع مستشفى رافيل التخصصي - المرحلة 4"
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 dark:text-slate-200">
                    كود المشروع <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    dir="ltr"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="MA-050-PROJECT"
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono uppercase dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 dark:text-slate-200">الحالة</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'completed')}
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="active">نشط (يستقبل تقارير)</option>
                    <option value="completed">مكتمل / مؤرشف</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold mb-1 dark:text-slate-200">
                    موقع التنفيذ / المدينة (اختياري)
                  </label>
                  <input
                    type="text"
                    maxLength={200}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="مثال: القاهرة الجديدة / التجمع الخامس"
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 dark:text-slate-200">
                    الجهة المالكة / الاستشاري (اختياري)
                  </label>
                  <input
                    type="text"
                    maxLength={200}
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="مثال: دار الهندسة / المالك"
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold mb-1 dark:text-slate-200">
                    إجمالي عدد الأعمال المخطط لها (Planned Works — اختياري)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      value={plannedWorksCountInput}
                      onChange={(e) => setPlannedWorksCountInput(e.target.value)}
                      placeholder="مثال: 50"
                      className="w-36 h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono font-bold text-center dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      يُستخدم لحساب نسبة إنجاز المشروع بدقة في الرسم البياني بمقارنة عدد الأعمال المنفذة (Executed Works) بالمخطط له.
                    </span>
                  </div>
                </div>
              </div>

              {/* Scope of Work Block */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Briefcase className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>تحديد نطاق العمل (Scope of Work)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setScopeDisciplines(
                        scopeDisciplines.length === ALL_DISCIPLINES.length ? [] : [...ALL_DISCIPLINES]
                      )
                    }
                    className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    {scopeDisciplines.length === ALL_DISCIPLINES.length ? 'إلغاء الكل' : 'تحديد كل التخصصات'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {ALL_DISCIPLINES.map((disc) => {
                    const selected = scopeDisciplines.includes(disc);
                    return (
                      <button
                        key={disc}
                        type="button"
                        onClick={() => toggleCreateDiscipline(disc)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                          selected
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-blue-400'
                        }`}
                      >
                        {selected && <Check className="w-3 h-3" />}
                        <span>{WORK_DISCIPLINE_CONFIG[disc].labelAr}</span>
                      </button>
                    );
                  })}
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-700 dark:text-slate-200">
                    تفاصيل نطاق العمل والبنود التعاقدية
                  </label>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={workScope}
                    onChange={(e) => setWorkScope(e.target.value)}
                    placeholder="اكتب نطاق العمل بالتفصيل: مثال (توريد وتنفيذ أعمال الهيكل الخرساني والمباني والتشطيبات المعمارية وأنظمة التكييف والكهرباء حتى التسليم الابتدائي)..."
                    className="w-full p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1 dark:text-slate-200">
                  ملاحظات عامة / وصف إضافي (اختياري)
                </label>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="ملاحظات إدارية أو تفاصيل إضافية حول المشروع..."
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {siteUsers.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="font-bold dark:text-slate-200">
                    إسناد المشروع لمهندسي المواقع (اختياري):
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {siteUsers.map((u) => {
                      const alreadyAll = Boolean(u.allProjects);
                      const checked = alreadyAll || selectedSiteUserIds.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className={`flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 ${
                            alreadyAll ? 'opacity-75' : 'cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              disabled={alreadyAll}
                              checked={checked}
                              onChange={() => toggleSiteUserSelection(u.id)}
                              className="w-4 h-4 accent-blue-600 rounded"
                            />
                            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {u.displayName}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 shrink-0">
                            {alreadyAll ? 'صلاحية جميع المشاريع' : u.jobTitle || 'مهندس موقع'}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl font-bold cursor-pointer flex items-center justify-center gap-2 transition-colors"
                >
                  {isSubmittingCreate && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>حفظ وإضافة المشروع</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl font-bold cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          EDIT PROJECT MODAL
          ===================================================================== */}
      {editingProject && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 my-auto max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Edit2 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  تعديل بيانات المشروع ونطاق العمل
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingProject(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-bold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditProject} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold mb-1 dark:text-slate-200">
                    اسم المشروع / الموقع <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={200}
                    value={editingProject.name}
                    onChange={(e) =>
                      setEditingProject({ ...editingProject, name: e.target.value })
                    }
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 dark:text-slate-200">
                    كود المشروع <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    dir="ltr"
                    value={editingProject.code}
                    onChange={(e) =>
                      setEditingProject({ ...editingProject, code: e.target.value })
                    }
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono uppercase dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 dark:text-slate-200">الحالة</label>
                  <select
                    value={editingProject.status}
                    onChange={(e) =>
                      setEditingProject({
                        ...editingProject,
                        status: e.target.value as 'active' | 'completed'
                      })
                    }
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="active">نشط</option>
                    <option value="completed">مكتمل</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold mb-1 dark:text-slate-200">
                    موقع التنفيذ / المدينة
                  </label>
                  <input
                    type="text"
                    maxLength={200}
                    value={editingProject.location || ''}
                    onChange={(e) =>
                      setEditingProject({ ...editingProject, location: e.target.value })
                    }
                    placeholder="مثال: القاهرة الجديدة"
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 dark:text-slate-200">
                    الجهة المالكة / الاستشاري
                  </label>
                  <input
                    type="text"
                    maxLength={200}
                    value={editingProject.clientName || ''}
                    onChange={(e) =>
                      setEditingProject({ ...editingProject, clientName: e.target.value })
                    }
                    placeholder="مثال: المالك أو المكتب الاستشاري"
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold mb-1 dark:text-slate-200">
                    إجمالي عدد الأعمال المخطط لها (Planned Works)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      value={
                        editingProject.plannedWorksCount && editingProject.plannedWorksCount > 0
                          ? editingProject.plannedWorksCount
                          : ''
                      }
                      onChange={(e) =>
                        setEditingProject({
                          ...editingProject,
                          plannedWorksCount: e.target.value ? Math.max(0, Number(e.target.value)) : 0
                        })
                      }
                      placeholder="مثال: 50"
                      className="w-36 h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono font-bold text-center dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      يُحدّث نسبة إنجاز المشروع مباشرة في الرسم البياني بمقارنة الأعمال المنفذة بالمخطط له.
                    </span>
                  </div>
                </div>
              </div>

              {/* Scope of Work Editor */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Briefcase className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>نطاق العمل (Scope of Work)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingProject({
                        ...editingProject,
                        scopeDisciplines:
                          (editingProject.scopeDisciplines?.length || 0) === ALL_DISCIPLINES.length
                            ? []
                            : [...ALL_DISCIPLINES]
                      })
                    }
                    className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    {(editingProject.scopeDisciplines?.length || 0) === ALL_DISCIPLINES.length
                      ? 'إلغاء الكل'
                      : 'تحديد كل التخصصات'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {ALL_DISCIPLINES.map((disc) => {
                    const selected = Boolean(editingProject.scopeDisciplines?.includes(disc));
                    return (
                      <button
                        key={disc}
                        type="button"
                        onClick={() => toggleEditDiscipline(disc)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                          selected
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-blue-400'
                        }`}
                      >
                        {selected && <Check className="w-3 h-3" />}
                        <span>{WORK_DISCIPLINE_CONFIG[disc].labelAr}</span>
                      </button>
                    );
                  })}
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-700 dark:text-slate-200">
                    تفاصيل نطاق العمل والبنود التعاقدية
                  </label>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={editingProject.workScope || ''}
                    onChange={(e) =>
                      setEditingProject({ ...editingProject, workScope: e.target.value })
                    }
                    placeholder="تفاصيل نطاق الأعمال المعتمدة لهذا المشروع..."
                    className="w-full p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1 dark:text-slate-200">
                  ملاحظات عامة / وصف إضافي
                </label>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={editingProject.description || ''}
                  onChange={(e) =>
                    setEditingProject({ ...editingProject, description: e.target.value })
                  }
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {siteUsers.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="font-bold dark:text-slate-200">
                    مهندسو المواقع المسند لهم هذا المشروع:
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {siteUsers.map((u) => {
                      const alreadyAll = Boolean(u.allProjects);
                      const checked = alreadyAll || editSelectedSiteUserIds.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className={`flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 ${
                            alreadyAll ? 'opacity-75' : 'cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              disabled={alreadyAll}
                              checked={checked}
                              onChange={() => toggleEditSiteUserSelection(u.id)}
                              className="w-4 h-4 accent-blue-600 rounded"
                            />
                            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {u.displayName}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 shrink-0">
                            {alreadyAll ? 'صلاحية جميع المشاريع' : u.jobTitle || 'مهندس موقع'}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl font-bold cursor-pointer flex items-center justify-center gap-2 transition-colors"
                >
                  {isSubmittingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>حفظ التعديلات</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl font-bold cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
