import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Plus,
  Clock,
  Calendar,
  AlertCircle,
  Building,
  CheckCircle2,
  Trash2,
  X
} from 'lucide-react';
import { ProjectTask, Project, UserProfile } from '../../types';
import { dataService } from '../../services/dataService';

interface Props {
  tasks: ProjectTask[];
  projects: Project[];
  currentUser: UserProfile;
}

export const AdminTasksView: React.FC<Props> = ({ tasks, projects, currentUser }) => {
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [projectId, setProjectId] = useState<string>(projects[0]?.id || '');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [deadline, setDeadline] = useState<string>(
    new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId]);

  const todayStr = new Date().toISOString().split('T')[0];

  const filteredTasks = tasks.filter((t) => {
    if (filterProject !== 'all' && t.projectId !== filterProject) return false;
    if (filterStatus === 'done' && t.status !== 'done') return false;
    if (filterStatus === 'open' && t.status === 'done') return false;
    if (filterStatus === 'overdue' && !(t.status !== 'done' && t.deadline < todayStr)) return false;
    return true;
  });

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    const proj = projects.find((p) => p.id === projectId);
    if (!proj || !title.trim()) return;

    dataService.addTask({
      projectId: proj.id,
      projectName: proj.name,
      title: title.trim(),
      description: description.trim(),
      deadline,
      priority,
      createdBy: currentUser.id
    });

    setIsCreating(false);
    setTitle('');
    setDescription('');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-blue-600" />
            <span>إسناد ومتابعة مهام المواقع (Project Tasks)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium">
            توزيع متطلبات التدقيق والأرشفة مع المواعيد المحددة ومتابعة إثباتات الإنجاز
          </p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer shadow-xs self-start sm:self-auto transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>إسناد مهمة لمشروع</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">تصفية حسب المشروع</label>
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
          >
            <option value="all">كافة المشاريع</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">حالة المهمة</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
          >
            <option value="all">كافة المهام</option>
            <option value="open">قيد التنفيذ</option>
            <option value="overdue">متأخرة</option>
            <option value="done">منجزة</option>
          </select>
        </div>
      </div>

      {/* Tasks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredTasks.map((task) => {
          const isOverdue = task.status !== 'done' && task.deadline < todayStr;
          return (
            <div
              key={task.id}
              className={`bg-white dark:bg-slate-900 rounded-2xl p-5 border transition-all shadow-xs flex flex-col justify-between ${
                isOverdue
                  ? 'border-rose-300 dark:border-rose-900/80 bg-rose-50/15 dark:bg-rose-950/10'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2.5 py-0.5 rounded-md font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {task.projectName}
                      </span>
                      {task.priority === 'urgent' && (
                        <span className="text-xs px-2 py-0.5 rounded-md font-bold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                          عاجل
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base mt-1.5">
                      {task.title}
                    </h3>
                  </div>

                  {/* Overdue / Status badge */}
                  <div>
                    {task.status === 'done' ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>منجزة</span>
                      </span>
                    ) : isOverdue ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800 animate-pulse">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>متأخرة!</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        <Clock className="w-3.5 h-3.5" />
                        <span>قيد التنفيذ</span>
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {task.description}
                </p>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>تاريخ الاستحقاق: <strong className="font-mono">{task.deadline}</strong></span>
                </div>

                {/* Proof Submitted by Site user */}
                {task.status === 'done' && task.proofNote && (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200">
                    <span className="font-bold block">إثبات الإنجاز من الموقع:</span>
                    <p className="mt-0.5">{task.proofNote}</p>
                    {task.completedBy && (
                      <span className="text-[11px] opacity-75 block mt-1">
                        المنفذ: {task.completedBy} ({task.completedAt ? new Date(task.completedAt).toLocaleDateString('ar-EG') : ''})
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Task Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl p-5 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white">
                إسناد مهمة جديدة لأحد المشاريع
              </h3>
              <button
                onClick={() => setIsCreating(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  المشروع المكلف بالمهمة
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  عنوان المهمة
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: تسليم سجل التقديمات لشهر فبراير..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  تفاصيل المهمة والمخرجات المطلوبة
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="حدد بدقة المطلوب من مهندس الموقع ومستند الإثبات..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الموعد النهائي للتسليم
                  </label>
                  <input
                    type="date"
                    required
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    درجة الأولوية
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-bold"
                  >
                    <option value="normal">عادي (Normal)</option>
                    <option value="urgent">عاجل (Urgent)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl cursor-pointer shadow-xs"
                >
                  إسناد المهمة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
