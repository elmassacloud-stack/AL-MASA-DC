import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Plus,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Pencil,
  Loader2,
  X,
  Upload,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Paperclip,
  Eye,
  Download
} from 'lucide-react';
import { ProjectTask, Project, TaskStatus, UserProfile, TaskAttachment } from '../../types';
import {
  MAX_TASK_ATTACHMENTS,
  MAX_TASK_ATTACHMENT_SIZE_BYTES,
  TASK_ATTACHMENT_RETENTION_HOURS
} from '../../config';
import { dataService, TaskUploadProgress } from '../../services/dataService';
import {
  prepareTaskAttachmentFile,
  PreparedTaskAttachment,
  formatFileSize,
  getRemainingRetentionInfo,
  parseExcelPreviewFromBlobUrl,
  ExcelPreviewSheet
} from '../../utils/pdfUtils';

interface Props {
  tasks: ProjectTask[];
  projects: Project[];
  currentUser: UserProfile;
}

export const AdminTasksView: React.FC<Props> = ({ tasks, projects, currentUser }) => {
  const isAdmin = currentUser.role === 'admin';
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

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

  // Create / Edit modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [projectId, setProjectId] = useState<string>(projects[0]?.id || '');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [deadline, setDeadline] = useState<string>(
    new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [status, setStatus] = useState<TaskStatus>('pending');

  // Admin-only attachments state (up to 25MB per file, max 5 files, 48h auto-delete)
  const [existingAttachments, setExistingAttachments] = useState<TaskAttachment[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<PreparedTaskAttachment[]>([]);
  const [isPreparingFiles, setIsPreparingFiles] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<TaskUploadProgress | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Delete confirmation & feedback state
  const [deletingTask, setDeletingTask] = useState<ProjectTask | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Preview / Download state
  const [previewTarget, setPreviewTarget] = useState<{
    taskId: string;
    attachment: TaskAttachment;
  } | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [excelSheets, setExcelSheets] = useState<ExcelPreviewSheet[] | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState<number>(0);
  const [previewLoadingKey, setPreviewLoadingKey] = useState<string | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

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

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => {
      setFeedbackMsg((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  const openCreateModal = () => {
    setEditingTask(null);
    setProjectId(projects[0]?.id || '');
    setTitle('');
    setDescription('');
    setDeadline(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setPriority('normal');
    setStatus('pending');
    setExistingAttachments([]);
    setPendingAttachments([]);
    setUploadProgress(null);
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (task: ProjectTask) => {
    setEditingTask(task);
    setProjectId(task.projectId);
    setTitle(task.title);
    setDescription(task.description);
    setDeadline(task.deadline);
    setPriority(task.priority);
    setStatus(task.status);
    setExistingAttachments(
      (task.attachments || []).filter((att) => att.expiresAtMs > Date.now())
    );
    setPendingAttachments([]);
    setUploadProgress(null);
    setModalError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving || isPreparingFiles) return;
    setIsModalOpen(false);
    setEditingTask(null);
    setExistingAttachments([]);
    setPendingAttachments([]);
    setUploadProgress(null);
    setModalError(null);
  };

  const handleFileSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) return;
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;

    setModalError(null);
    const totalCurrent = existingAttachments.length + pendingAttachments.length;
    if (totalCurrent + files.length > MAX_TASK_ATTACHMENTS) {
      setModalError(
        `الحد الأقصى للمرفقات في المهمة الواحدة هو ${MAX_TASK_ATTACHMENTS} ملفات (المتبقي المتاح: ${Math.max(0, MAX_TASK_ATTACHMENTS - totalCurrent)}).`
      );
      return;
    }

    setIsPreparingFiles(true);
    try {
      const preparedList: PreparedTaskAttachment[] = [];
      for (const file of files) {
        const prepared = await prepareTaskAttachmentFile(file);
        preparedList.push(prepared);
      }
      setPendingAttachments((prev) => [...prev, ...preparedList]);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'تعذر تجهيز أحد الملفات المحددة.');
    } finally {
      setIsPreparingFiles(false);
    }
  };

  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    const proj = projects.find((p) => p.id === projectId);
    if (!proj || !title.trim()) return;

    setModalError(null);
    setIsSaving(true);
    setUploadProgress(null);

    try {
      if (editingTask) {
        const ok = await dataService.updateTask(
          editingTask.id,
          {
            projectId: proj.id,
            projectName: proj.name,
            title: title.trim(),
            description: description.trim(),
            deadline,
            priority,
            status,
            attachments: existingAttachments
          },
          pendingAttachments,
          (prog) => setUploadProgress(prog)
        );
        if (ok) {
          setIsModalOpen(false);
          setEditingTask(null);
          setExistingAttachments([]);
          setPendingAttachments([]);
          setUploadProgress(null);
          showFeedback('success', 'تم تعديل المهمة وحفظ المرفقات بنجاح.');
        } else {
          setModalError('تعذر تحديث المهمة. تأكد من صحة البيانات.');
        }
        return;
      }

      await dataService.addTask(
        {
          projectId: proj.id,
          projectName: proj.name,
          title: title.trim(),
          description: description.trim(),
          deadline,
          priority,
          createdBy: currentUser.id
        },
        pendingAttachments,
        (prog) => setUploadProgress(prog)
      );

      setIsModalOpen(false);
      setTitle('');
      setDescription('');
      setExistingAttachments([]);
      setPendingAttachments([]);
      setUploadProgress(null);
      showFeedback(
        'success',
        pendingAttachments.length > 0
          ? `تم إسناد المهمة الجديدة مع ${pendingAttachments.length} مرفق${pendingAttachments.length > 1 ? 'ات' : ''} (ستُحذف الملفات تلقائياً بعد ${TASK_ATTACHMENT_RETENTION_HOURS} ساعة).`
          : 'تم إسناد المهمة الجديدة للمشروع بنجاح.'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('Missing or insufficient permissions') || msg.includes('PERMISSION_DENIED')) {
        setModalError('تعذر الرفع لعدم كفاية صلاحيات قاعدة البيانات. يرجى تحديث الصفحة أو التأكد من صلاحية مدير النظام.');
      } else {
        setModalError(msg || 'حدث خطأ أثناء حفظ المهمة أو رفع المرفقات.');
      }
    } finally {
      setIsSaving(false);
      setUploadProgress(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingTask) return;
    setIsDeleting(true);
    try {
      const ok = await dataService.deleteTask(deletingTask.id);
      if (ok) {
        showFeedback('success', `تم حذف المهمة "${deletingTask.title}" ومرفقاتها بنجاح.`);
        setDeletingTask(null);
      } else {
        showFeedback('error', 'تعذر العثور على المهمة لحذفها.');
      }
    } catch {
      showFeedback('error', 'حدث خطأ أثناء حذف المهمة من قاعدة البيانات.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePreviewAttachment = async (taskId: string, attachment: TaskAttachment) => {
    const key = `${taskId}:${attachment.id}`;
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
      showFeedback(
        'error',
        err instanceof Error ? err.message : 'تعذر فتح معاينة المرفق من Firebase.'
      );
    } finally {
      setPreviewLoadingKey(null);
    }
  };

  const handleDownloadAttachment = async (taskId: string, attachment: TaskAttachment) => {
    const key = `${taskId}:${attachment.id}`;
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
      showFeedback(
        'error',
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
            توزيع المهام وإرفاق الملفات حتى 25 ميجابايت من مدير النظام (مع الحذف التلقائي للمرفقات بعد 48 ساعة من Firebase)
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer shadow-xs self-start sm:self-auto transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>إسناد مهمة لمشروع</span>
          </button>
        )}
      </div>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-between gap-2 ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
            aria-label="إغلاق الرسالة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
            تصفية حسب المشروع
          </label>
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
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
            حالة المهمة
          </label>
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
      {filteredTasks.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 border border-slate-200 dark:border-slate-800 text-center text-slate-500 dark:text-slate-400">
          <CheckSquare className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-bold">لا توجد مهام مطابقة للتصفية الحالية</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTasks.map((task) => {
            const isOverdue = task.status !== 'done' && task.deadline < todayStr;
            const activeAttachments = (task.attachments || []).filter(
              (att) => att.expiresAtMs > nowTick
            );
            return (
              <div
                key={task.id}
                className={`bg-white dark:bg-slate-900 rounded-2xl p-5 border transition-all shadow-xs flex flex-col justify-between gap-4 ${
                  isOverdue
                    ? 'border-rose-300 dark:border-rose-900/80 bg-rose-50/15 dark:bg-rose-950/10'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div className="min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="text-xs px-2.5 py-0.5 rounded-md font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {task.projectName}
                        </span>
                        {task.priority === 'urgent' && (
                          <span className="text-xs px-2 py-0.5 rounded-md font-bold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                            عاجل
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-base mt-1.5 break-words">
                        {task.title}
                      </h3>
                    </div>

                    {/* Overdue / Status badge */}
                    <div className="shrink-0">
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

                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
                    {task.description}
                  </p>

                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      تاريخ الاستحقاق: <strong className="font-mono">{task.deadline}</strong>
                    </span>
                  </div>

                  {/* Admin Task Attachments (48-hour auto-expiring) */}
                  {activeAttachments.length > 0 && (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        <span className="flex items-center gap-1.5">
                          <Paperclip className="w-3.5 h-3.5 text-blue-600" />
                          <span>مرفقات الإدارة ({activeAttachments.length})</span>
                        </span>
                        <span className="text-amber-700 dark:text-amber-300">
                          حذف تلقائي بعد {TASK_ATTACHMENT_RETENTION_HOURS} ساعة
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
                                        • {att.pageCount}{' '}
                                        {att.fileFormat === 'excel' ? 'ورقة عمل' : 'صفحة'}
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
                                    className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:hover:bg-blue-900/70 dark:text-blue-300 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                    title="معاينة الملف"
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
                                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  title="تحميل الملف"
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
                  )}

                  {/* Proof Submitted by Site user */}
                  {task.status === 'done' && task.proofNote && (
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200">
                      <span className="font-bold block">إثبات الإنجاز من الموقع:</span>
                      <p className="mt-0.5">{task.proofNote}</p>
                      {task.completedBy && (
                        <span className="text-[11px] opacity-75 block mt-1">
                          المنفذ: {task.completedBy} (
                          {task.completedAt
                            ? new Date(task.completedAt).toLocaleDateString('ar-EG')
                            : ''}
                          )
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Admin Actions Footer */}
                {isAdmin && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(task)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 dark:bg-slate-800 dark:hover:bg-blue-950/60 dark:text-slate-200 dark:hover:text-blue-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingTask(task)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Task Modal */}
      {isModalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl p-5 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white">
                {editingTask ? 'تعديل بيانات المهمة والمرفقات' : 'إسناد مهمة جديدة لأحد المشاريع'}
              </h3>
              <button
                type="button"
                disabled={isSaving}
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 cursor-pointer disabled:opacity-40"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs font-bold text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitTask} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  المشروع المكلف بالمهمة
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  disabled={isSaving}
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
                  disabled={isSaving}
                  maxLength={300}
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
                  disabled={isSaving}
                  maxLength={4000}
                  placeholder="حدد بدقة المطلوب من مهندس الموقع ومستند الإثبات..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                />
              </div>

              <div className={`grid gap-3 ${editingTask ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الموعد النهائي للتسليم
                  </label>
                  <input
                    type="date"
                    required
                    disabled={isSaving}
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
                    disabled={isSaving}
                    onChange={(e) => setPriority(e.target.value as 'normal' | 'urgent')}
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-bold"
                  >
                    <option value="normal">عادي (Normal)</option>
                    <option value="urgent">عاجل (Urgent)</option>
                  </select>
                </div>

                {editingTask && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      حالة المهمة
                    </label>
                    <select
                      value={status}
                      disabled={isSaving}
                      onChange={(e) => setStatus(e.target.value as TaskStatus)}
                      className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-bold"
                    >
                      <option value="pending">قيد الانتظار</option>
                      <option value="in_progress">قيد التنفيذ</option>
                      <option value="done">منجزة</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Admin-Only Task File Attachments (up to 25MB, 48h auto-delete) */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <Paperclip className="w-4 h-4 text-blue-600" />
                    <span>إرفاق ملفات مع المهمة (خاص بمدير النظام فقط)</span>
                  </span>
                  <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                    حتى {formatFileSize(MAX_TASK_ATTACHMENT_SIZE_BYTES)} للملف • حذف تلقائي بعد {TASK_ATTACHMENT_RETENTION_HOURS} ساعة
                  </span>
                </div>

                {existingAttachments.length + pendingAttachments.length < MAX_TASK_ATTACHMENTS && (
                  <label
                    className={`flex flex-col items-center justify-center gap-1.5 p-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                      isPreparingFiles || isSaving
                        ? 'border-slate-300 dark:border-slate-700 opacity-60 pointer-events-none'
                        : 'border-blue-300 dark:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <input
                      type="file"
                      multiple
                      disabled={isPreparingFiles || isSaving}
                      onChange={handleFileSelection}
                      className="hidden"
                    />
                    {isPreparingFiles ? (
                      <>
                        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                        <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                          جاري قراءة وتجهيز الملفات للرفع...
                        </span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 text-blue-600" />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 text-center">
                          اضغط لاختيار ملفات (PDF / Excel / صور / Word / CAD / ZIP) — حتى 25 ميجابايت للملف
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          المرفقات الحالية: {existingAttachments.length + pendingAttachments.length} من {MAX_TASK_ATTACHMENTS} (تُحفظ مؤقتاً وتُحذف من Firebase بعد 48 ساعة)
                        </span>
                      </>
                    )}
                  </label>
                )}

                {/* Existing active attachments (in Edit mode) */}
                {existingAttachments.length > 0 && (
                  <div className="space-y-1.5">
                    {existingAttachments.map((att) => {
                      const retention = getRemainingRetentionInfo(att.expiresAtMs, nowTick);
                      return (
                        <div
                          key={att.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {renderFormatIcon(att.fileFormat)}
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-slate-800 dark:text-slate-100 truncate">
                                {att.name}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {formatFileSize(att.fileSizeBytes)} • {retention.label}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() =>
                              setExistingAttachments((prev) => prev.filter((x) => x.id !== att.id))
                            }
                            className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg cursor-pointer disabled:opacity-40"
                            title="إزالة المرفق"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pending newly added files */}
                {pendingAttachments.length > 0 && (
                  <div className="space-y-1.5">
                    {pendingAttachments.map((att) => (
                      <div
                        key={att.attachmentId}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {renderFormatIcon(att.fileFormat)}
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-slate-800 dark:text-slate-100 truncate">
                              {att.name}
                            </p>
                            <p className="text-[11px] text-blue-700 dark:text-blue-300">
                              {formatFileSize(att.fileSizeBytes)}
                              {att.pageCount
                                ? ` • ${att.pageCount} ${att.fileFormat === 'excel' ? 'ورقة' : 'صفحة'}`
                                : ''}
                              {' • جاهز للرفع (متاح 48 ساعة)'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() =>
                            setPendingAttachments((prev) =>
                              prev.filter((x) => x.attachmentId !== att.attachmentId)
                            )
                          }
                          className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg cursor-pointer disabled:opacity-40"
                          title="إلغاء الملف"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload progress indicator */}
                {isSaving && uploadProgress && (
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between font-bold text-blue-700 dark:text-blue-300">
                      <span className="truncate">
                        {uploadProgress.stage === 'finalizing'
                          ? 'جاري تأكيد حفظ المهمة والمرفقات...'
                          : `جاري رفع (${uploadProgress.currentFileIndex} / ${uploadProgress.totalFiles}): ${uploadProgress.currentFileName}`}
                      </span>
                      <span className="font-mono shrink-0">{uploadProgress.percent}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all duration-200"
                        style={{ width: `${uploadProgress.percent}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        الحزم: {uploadProgress.uploadedChunks} / {uploadProgress.totalChunks}
                      </span>
                      <span>
                        {formatFileSize(uploadProgress.uploadedBytes)} /{' '}
                        {formatFileSize(uploadProgress.totalBytes)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSaving || isPreparingFiles}
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer disabled:opacity-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isPreparingFiles}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl cursor-pointer shadow-xs flex items-center gap-2 disabled:opacity-60"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>
                    {isSaving
                      ? uploadProgress
                        ? `جاري الرفع (${uploadProgress.percent}%)`
                        : 'جاري الحفظ...'
                      : editingTask
                        ? 'حفظ التعديلات'
                        : 'إسناد المهمة'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Task Confirmation Modal */}
      {deletingTask && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-5 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  تأكيد حذف المهمة
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  هل أنت متأكد من حذف المهمة <strong className="text-slate-900 dark:text-white">«{deletingTask.title}»</strong> الخاصة بمشروع <strong>{deletingTask.projectName}</strong>؟ سيتم حذف كافة المرفقات المرتبطة بها من Firebase ولا يمكن التراجع عن هذا الإجراء.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingTask(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري الحذف...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>تأكيد الحذف</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Attachment Modal */}
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
