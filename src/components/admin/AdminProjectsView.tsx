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
  CheckSquare
} from 'lucide-react';
import {
  Project,
  DailyReport,
  IssueReport,
  ProjectTask,
  UserProfile
} from '../../types';
import { dataService } from '../../services/dataService';

interface Props {
  projects: Project[];
  reports: DailyReport[];
  issues: IssueReport[];
  tasks: ProjectTask[];
  users: UserProfile[];
}

export const AdminProjectsView: React.FC<Props> = ({
  projects,
  reports,
  issues,
  tasks,
  users
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState<string>('');
  const [code, setCode] = useState<string>('');
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
    setTimeout(() => setActionFeedback(null), 3500);
  };

  const resetCreateForm = () => {
    setName('');
    setCode('');
    setDescription('');
    setStatus('active');
    setSelectedSiteUserIds([]);
    setCreateError(null);
  };

  const handleOpenCreateModal = () => {
    resetCreateForm();
    setIsCreating(true);
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

    setIsSubmittingCreate(true);
    try {
      const created = await dataService.addProject({
        name: trimmedName,
        code: trimmedCode,
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
      showToast(`تم إضافة المشروع "${created.name}" بنجاح.`);
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
        description: editingProject.description || '',
        status: editingProject.status
      });
      setEditingProject(null);
      showToast('تم تحديث بيانات المشروع بنجاح.');
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

  const toggleSiteUserSelection = (uid: string) => {
    setSelectedSiteUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects.filter((p) => {
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [projects, searchQuery, statusFilter]);

  const activeCount = projects.filter((p) => p.status === 'active').length;
  const completedCount = projects.filter((p) => p.status === 'completed').length;

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-16">
      {/* Header & Main Add Button */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              إدارة المشاريع والمواقع
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              إضافة مشاريع جديدة، تعديل الأكواد والحالة، أو حذف المشاريع وتحديث صلاحيات المهندسين
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors shrink-0"
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

      {/* Search, Filter & Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-6 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="بحث باسم المشروع أو الكود أو الوصف..."
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

        <div className="md:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 flex items-center justify-around text-center">
          <div>
            <div className="text-[11px] text-slate-500 font-semibold">الكل</div>
            <div className="text-sm font-extrabold text-slate-900 dark:text-white font-mono">
              {projects.length}
            </div>
          </div>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />
          <div>
            <div className="text-[11px] text-emerald-600 font-semibold">نشط</div>
            <div className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400 font-mono">
              {activeCount}
            </div>
          </div>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />
          <div>
            <div className="text-[11px] text-slate-500 font-semibold">مكتمل</div>
            <div className="text-sm font-extrabold text-slate-700 dark:text-slate-300 font-mono">
              {completedCount}
            </div>
          </div>
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
            <span>إضافة أول مشروع</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProjects.map((project) => {
            const isActive = project.status === 'active';
            const projReportsCount = reports.filter((r) => r.projectId === project.id).length;
            const projOpenIssuesCount = issues.filter(
              (i) => i.projectId === project.id && i.status !== 'resolved'
            ).length;
            const projOpenTasksCount = tasks.filter(
              (t) => t.projectId === project.id && t.status !== 'done'
            ).length;
            const assignedEngineers = users.filter(
              (u) =>
                u.role === 'site' &&
                (u.allProjects || u.assignedProjects?.includes(project.id))
            );
            const isConfirmingDelete = confirmDeleteId === project.id;
            const isDeleting = isDeletingId === project.id;

            return (
              <div
                key={project.id}
                className={`bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border transition-all space-y-3.5 ${
                  !isActive
                    ? 'border-slate-200 dark:border-slate-800 opacity-85'
                    : 'border-slate-200 dark:border-slate-800 shadow-xs'
                }`}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-900 dark:text-white text-base">
                        {project.name}
                      </h3>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          isActive
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {isActive ? 'نشط' : 'مكتمل'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span
                        dir="ltr"
                        className="font-mono font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                      >
                        {project.code}
                      </span>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingProject({ ...project })}
                      title="تعديل بيانات المشروع"
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
                      {isActive ? <Archive className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
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

                {/* Description */}
                {project.description ? (
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
                    {project.description}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 italic">لا يوجد وصف مضاف للمشروع.</p>
                )}

                {/* Stats Badges */}
                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 font-semibold">
                      <FileText className="w-3 h-3 text-blue-600" />
                      <span>التقارير</span>
                    </div>
                    <div className="text-xs font-extrabold text-slate-900 dark:text-white font-mono mt-0.5">
                      {projReportsCount}
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 font-semibold">
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      <span>عوائق</span>
                    </div>
                    <div className="text-xs font-extrabold text-slate-900 dark:text-white font-mono mt-0.5">
                      {projOpenIssuesCount}
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 font-semibold">
                      <CheckSquare className="w-3 h-3 text-indigo-600" />
                      <span>مهام</span>
                    </div>
                    <div className="text-xs font-extrabold text-slate-900 dark:text-white font-mono mt-0.5">
                      {projOpenTasksCount}
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 font-semibold">
                      <Users className="w-3 h-3 text-emerald-600" />
                      <span>المهندسين</span>
                    </div>
                    <div className="text-xs font-extrabold text-slate-900 dark:text-white font-mono mt-0.5">
                      {assignedEngineers.length}
                    </div>
                  </div>
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
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 my-auto">
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

            <form onSubmit={handleCreateProject} className="space-y-3.5 text-xs">
              <div>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    placeholder="PRJ-RAV-04"
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
              </div>

              <div>
                <label className="block font-bold mb-1 dark:text-slate-200">الوصف (اختياري)</label>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="وصف موجز لنطاق الأعمال أو موقع التنفيذ..."
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {siteUsers.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="font-bold dark:text-slate-200">
                    إسناد سريع للمهندسين (اختياري):
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
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Edit2 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  تعديل بيانات المشروع
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

            <form onSubmit={handleSaveEditProject} className="space-y-3.5 text-xs">
              <div>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              </div>

              <div>
                <label className="block font-bold mb-1 dark:text-slate-200">الوصف</label>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={editingProject.description || ''}
                  onChange={(e) =>
                    setEditingProject({ ...editingProject, description: e.target.value })
                  }
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

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
