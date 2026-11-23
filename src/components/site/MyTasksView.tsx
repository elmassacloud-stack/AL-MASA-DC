import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Clock,
  CheckCircle2,
  Paperclip,
  Calendar,
  Send,
  X,
  Eye,
  Download,
  Loader2,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  AlertCircle
} from 'lucide-react';
import { UserProfile, ProjectTask, TaskAttachment } from '../../types';
import { TASK_ATTACHMENT_RETENTION_HOURS } from '../../config';
import { dataService } from '../../services/dataService';
import { canAccessProject } from '../../utils/accessControl';
import {
  formatFileSize,
  getRemainingRetentionInfo,
  parseExcelPreviewFromBlobUrl,
  ExcelPreviewSheet
} from '../../utils/pdfUtils';

interface Props {
  currentUser: UserProfile;
  tasks: ProjectTask[];
}

export const MyTasksView: React.FC<Props> = ({ currentUser, tasks }) => {
  const [completingTask, setCompletingTask] = useState<ProjectTask | null>(null);
  const [proofNote, setProofNote] = useState<string>('');
  const [proofAttachment, setProofAttachment] = useState<string>('');

  // Live 30s tick for 48-hour retention countdown badges
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => setNowTick(Date.now()), 30000);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        setNowTick(Date.now());
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Read-only attachment preview / download state for site engineers
  const [previewTarget, setPreviewTarget] = useState<{
    taskId: string;
    attachment: TaskAttachment;
  } | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [excelSheets, setExcelSheets] = useState<ExcelPreviewSheet[] | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState<number>(0);
  const [previewLoadingKey, setPreviewLoadingKey] = useState<string | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

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

  const handlePreviewAttachment = async (taskId: string, attachment: TaskAttachment) => {
    const key = `${taskId}:${attachment.id}`;
    setAttachmentError(null);
    setPreviewLoadingKey(key);
    try {
      const blobUrl = await dataService.fetchTaskAttachmentUrl(taskId, attachment);
      setExcelSheets(null);
      setActiveSheetIdx(0);
      if (attachment.fileFormat === 'excel') {
        const sheets = await parseExcelPreviewFromBlobUrl(blobUrl);
        setExcelSheets(sheets);
      }
      setPreviewBlobUrl(blobUrl);
      setPreviewTarget({ taskId, attachment });
    } catch (err) {
      setAttachmentError(
        err instanceof Error ? err.message : 'تعذر فتح معاينة المرفق من Firebase.'
      );
    } finally {
      setPreviewLoadingKey(null);
    }
  };

  const handleDownloadAttachment = async (taskId: string, attachment: TaskAttachment) => {
    const key = `${taskId}:${attachment.id}`;
    setAttachmentError(null);
    setDownloadingKey(key);
    try {
      const blobUrl = await dataService.fetchTaskAttachmentUrl(taskId, attachment);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = attachment.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setAttachmentError(
        err instanceof Error ? err.message : 'تعذر تحميل المرفق من Firebase.'
      );
    } finally {
      setDownloadingKey(null);
    }
  };

  const renderFormatIcon = (format: TaskAttachment['fileFormat']) => {
    if (format === 'pdf') return <FileText className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />;
    if (format === 'excel') return <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />;
    if (format === 'image') return <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />;
    return <Paperclip className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />;
  };

  const renderTaskAttachmentsBlock = (task: ProjectTask) => {
    const activeAttachments = (task.attachments || []).filter(
      (att) => att.expiresAtMs > nowTick
    );
    if (activeAttachments.length === 0) return null;

    return (
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2 mb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] font-bold text-slate-700 dark:text-slate-300">
          <span className="flex items-center gap-1.5">
            <Paperclip className="w-3.5 h-3.5 text-blue-600" />
            <span>مرفقات المهمة من الإدارة ({activeAttachments.length})</span>
          </span>
          <span className="text-amber-700 dark:text-amber-300">
            متاحة {TASK_ATTACHMENT_RETENTION_HOURS} ساعة فقط قبل الحذف التلقائي
          </span>
        </div>

        <div className="space-y-1.5">
          {activeAttachments.map((att) => {
            const retention = getRemainingRetentionInfo(att.expiresAtMs, nowTick);
            const itemKey = `${task.id}:${att.id}`;
            const canPreview =
              att.fileFormat === 'pdf' ||
              att.fileFormat === 'excel' ||
              att.fileFormat === 'image';
            return (
              <div
                key={att.id}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {renderFormatIcon(att.fileFormat)}
                  <div className="min-w-0 flex-1">
                    <p
                      className="font-bold text-slate-800 dark:text-slate-100 truncate"
                      title={att.name}
                    >
                      {att.name}
                    </p>
                    <div className="flex items-center flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{formatFileSize(att.fileSizeBytes)}</span>
                      {att.pageCount && (
                        <span>
                          • {att.pageCount} {att.fileFormat === 'excel' ? 'ورقة عمل' : 'صفحة'}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 font-bold ${
                          retention.isUrgent
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-blue-600 dark:text-blue-400'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        <span>{retention.label}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {canPreview && (
                    <button
                      type="button"
                      disabled={previewLoadingKey === itemKey}
                      onClick={() => handlePreviewAttachment(task.id, att)}
                      className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:hover:bg-blue-900/70 dark:text-blue-300 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      {previewLoadingKey === itemKey ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                      <span>معاينة</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={downloadingKey === itemKey}
                    onClick={() => handleDownloadAttachment(task.id, att)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    {downloadingKey === itemKey ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>تحميل</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
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
            المهام الموكلة لمشاريعك من إدارة مراقبة الوثائق (DC) مع المواعيد المحددة والمرفقات المؤقتة
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-3 py-1 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-bold rounded-full border border-blue-200 dark:border-blue-800">
            {pendingTasks.length} قيد التنفيذ
          </span>
        </div>
      </div>

      {attachmentError && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs sm:text-sm font-bold text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{attachmentError}</span>
          </div>
          <button
            type="button"
            onClick={() => setAttachmentError(null)}
            className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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

                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4 whitespace-pre-line">
                  {task.description}
                </p>

                {renderTaskAttachmentsBlock(task)}

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
              {renderTaskAttachmentsBlock(task)}
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

      {/* Read-Only Attachment Preview Modal */}
      {previewTarget && previewBlobUrl && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 min-w-0">
                {renderFormatIcon(previewTarget.attachment.fileFormat)}
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                    {previewTarget.attachment.name}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {formatFileSize(previewTarget.attachment.fileSizeBytes)} •{' '}
                    {getRemainingRetentionInfo(previewTarget.attachment.expiresAtMs, nowTick).label}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewBlobUrl}
                  download={previewTarget.attachment.name}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تحميل</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewTarget(null);
                    setPreviewBlobUrl(null);
                    setExcelSheets(null);
                  }}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  aria-label="إغلاق المعاينة"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-950 p-3">
              {previewTarget.attachment.fileFormat === 'pdf' && (
                <iframe
                  src={previewBlobUrl}
                  title={previewTarget.attachment.name}
                  className="w-full h-[75vh] rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
                />
              )}

              {previewTarget.attachment.fileFormat === 'image' && (
                <div className="flex items-center justify-center min-h-[50vh]">
                  <img
                    src={previewBlobUrl}
                    alt={previewTarget.attachment.name}
                    className="max-w-full max-h-[75vh] rounded-xl object-contain shadow-md"
                  />
                </div>
              )}

              {previewTarget.attachment.fileFormat === 'excel' && excelSheets && (
                <div className="space-y-3 bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                  {excelSheets.length > 1 && (
                    <div className="flex items-center gap-1.5 flex-wrap border-b border-slate-200 dark:border-slate-800 pb-2">
                      {excelSheets.map((sheet, sIdx) => (
                        <button
                          key={sheet.name}
                          type="button"
                          onClick={() => setActiveSheetIdx(sIdx)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                            activeSheetIdx === sIdx
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {sheet.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {excelSheets[activeSheetIdx] && (
                    <div className="overflow-auto max-h-[65vh]">
                      <table className="w-full text-xs border-collapse">
                        <tbody>
                          {excelSheets[activeSheetIdx].rows.map((row, rIdx) => (
                            <tr
                              key={rIdx}
                              className={
                                rIdx === 0
                                  ? 'bg-slate-100 dark:bg-slate-800 font-bold'
                                  : 'border-t border-slate-100 dark:border-slate-800'
                              }
                            >
                              {row.map((cell, cIdx) => (
                                <td
                                  key={cIdx}
                                  className="px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 whitespace-nowrap text-slate-800 dark:text-slate-200"
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {excelSheets[activeSheetIdx].truncated && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-300 font-bold mt-2">
                          يتم عرض أول 250 صفاً فقط في المعاينة؛ قم بتحميل الملف لعرض كامل البيانات ({excelSheets[activeSheetIdx].totalRows} صف).
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
