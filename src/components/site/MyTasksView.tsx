import React, { useState } from 'react';
import {
  CheckSquare,
  Clock,
  AlertCircle,
  CheckCircle2,
  Paperclip,
  Calendar,
  Send,
  X
} from 'lucide-react';
import { UserProfile, ProjectTask } from '../../types';
import { dataService } from '../../services/dataService';
import { canAccessProject } from '../../utils/accessControl';

interface Props {
  currentUser: UserProfile;
  tasks: ProjectTask[];
}

export const MyTasksView: React.FC<Props> = ({ currentUser, tasks }) => {
  const [completingTask, setCompletingTask] = useState<ProjectTask | null>(null);
  const [proofNote, setProofNote] = useState<string>('');
  const [proofAttachment, setProofAttachment] = useState<string>('');

  // Filter tasks belonging to user's assigned projects (or all for admin / allProjects)
  const myTasks = tasks.filter((t) => canAccessProject(currentUser, t.projectId));

  const todayStr = new Date().toISOString().split('T')[0];

  const handleCompleteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingTask) return;

    dataService.completeTask(
      completingTask.id,
      currentUser.displayName,
      proofNote.trim(),
      proofAttachment || undefined
    );

    setCompletingTask(null);
    setProofNote('');
    setProofAttachment('');
  };

  const pendingTasks = myTasks.filter((t) => t.status !== 'done');
  const doneTasks = myTasks.filter((t) => t.status === 'done');

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Header Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
            مهامي المطلوبة بالمشاريع
          </h2>
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium">
            المهام الموكلة لمشاريعك من إدارة مراقبة الوثائق (DC) مع المواعيد المحددة
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-3 py-1 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-bold rounded-full border border-blue-200 dark:border-blue-800">
            {pendingTasks.length} قيد التنفيذ
          </span>
        </div>
      </div>

      {/* Pending Tasks Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600" />
          <span>المهام المطلوب إنجازها ({pendingTasks.length})</span>
        </h3>

        {pendingTasks.length === 0 ? (
          <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">
              رائع! لا توجد مهام متأخرة أو معلقة لمشاريعك حالياً.
            </p>
          </div>
        ) : (
          pendingTasks.map((task) => {
            const isOverdue = task.deadline < todayStr;
            return (
              <div
                key={task.id}
                className={`bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border transition-all shadow-xs ${
                  isOverdue
                    ? 'border-red-300 dark:border-red-900/80 bg-red-50/20 dark:bg-red-950/10'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-md font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {task.projectName}
                      </span>
                      {task.priority === 'urgent' && (
                        <span className="text-xs px-2 py-0.5 rounded-md font-bold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border border-red-200 dark:border-red-800">
                          عاجل
                        </span>
                      )}
                    </div>
                    <h4 className="text-base font-bold text-slate-900 dark:text-white mt-1.5">
                      {task.title}
                    </h4>
                  </div>

                  {/* Deadline badge */}
                  <div className="self-start sm:self-auto">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-bold border ${
                        isOverdue
                          ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950/80 dark:text-red-300 dark:border-red-800'
                          : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>الموعد: {task.deadline}</span>
                      {isOverdue && <span className="mr-1">(متأخرة!)</span>}
                    </span>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                  {task.description}
                </p>

                <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => setCompletingTask(task)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <CheckSquare className="w-4 h-4" />
                    <span>إنجاز المهمة وإرفاق الإثبات</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Completed Tasks History */}
      {doneTasks.length > 0 && (
        <div className="space-y-3 pt-4">
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>المهام المنجزة سابقاً ({doneTasks.length})</span>
          </h3>

          {doneTasks.map((task) => (
            <div
              key={task.id}
              className="bg-white/70 dark:bg-slate-900/60 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 opacity-90 space-y-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {task.title} ({task.projectName})
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-md">
                  تم الإنجاز {task.completedAt ? new Date(task.completedAt).toLocaleDateString('ar-EG') : ''}
                </span>
              </div>
              {task.proofNote && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">
                  <span className="font-bold block">إثبات الإنجاز:</span>
                  <p>{task.proofNote}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Complete Task Modal */}
      {completingTask && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">
                  إثبات إنجاز المهمة
                </h3>
                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">{completingTask.title}</p>
              </div>
              <button
                onClick={() => setCompletingTask(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCompleteSubmit} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  بيان ما تم إنجازه والإجراء المتخذ بالموقع <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={proofNote}
                  onChange={(e) => setProofNote(e.target.value)}
                  placeholder="مثال: تم تسليم السجلات المطلوبة للاستشاري بموجب إشعار تسليم رقم TR-099 وتحديث الأرشيف..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  رابط أو رقم مستند الإثبات (اختياري)
                </label>
                <input
                  type="text"
                  value={proofAttachment}
                  onChange={(e) => setProofAttachment(e.target.value)}
                  placeholder="رقم الإشعار أو رابط صورة المحضر..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCompletingTask(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <Send className="w-4 h-4" />
                  <span>تأكيد الإنجاز</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
