import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Hammer,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Edit2,
  Trash2,
  X,
  AlertCircle,
  Loader2,
  FileSpreadsheet,
  MapPin,
  Calendar,
  FileText,
  UserCheck,
  ShieldCheck,
  BarChart3,
  Upload,
  Paperclip,
  Image as ImageIcon,
  Eye,
  Download
} from 'lucide-react';
import {
  ExecutedWork,
  Project,
  UserProfile,
  WorkDiscipline,
  ExecutedWorkReviewStatus,
  ReportAttachment
} from '../../types';
import { WORK_DISCIPLINE_CONFIG, MAX_REPORT_ATTACHMENTS } from '../../config';
import {
  dataService,
  formatFirestoreError,
  ReportUploadProgress
} from '../../services/dataService';
import { getTodayDateStr } from '../../seedData';
import { getAccessibleProjects, canAccessProject } from '../../utils/accessControl';
import { exportExecutedWorksToExcel } from '../../utils/exportUtils';
import {
  prepareReportAttachmentFile,
  PreparedReportAttachment,
  getReportAttachmentKind,
  formatFileSize,
  parseExcelPreviewFromBlobUrl,
  ExcelPreviewSheet
} from '../../utils/pdfUtils';

interface Props {
  currentUser: UserProfile;
  projects: Project[];
  executedWorks: ExecutedWork[];
  users?: UserProfile[];
}

export const ExecutedWorksView: React.FC<Props> = ({
  currentUser,
  projects,
  executedWorks,
  users = []
}) => {
  const isAdmin = currentUser.role === 'admin';
  const accessibleProjects = useMemo(
    () => getAccessibleProjects(currentUser, projects),
    [currentUser, projects]
  );

  // Filters & Daily Progress Date
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [filterDiscipline, setFilterDiscipline] = useState<string>('all');
  const [filterAuthorId, setFilterAuthorId] = useState<string>('all');
  const [filterReviewStatus, setFilterReviewStatus] = useState<string>('all');
  const [progressDate, setProgressDate] = useState<string>(() => getTodayDateStr());

  // Create / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingWork, setEditingWork] = useState<ExecutedWork | null>(null);
  const [projectId, setProjectId] = useState<string>(accessibleProjects[0]?.id || '');
  const [workDate, setWorkDate] = useState<string>(getTodayDateStr());
  const [discipline, setDiscipline] = useState<WorkDiscipline>('civil_structural');
  const [workDescription, setWorkDescription] = useState<string>('');
  const [locationArea, setLocationArea] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [unit, setUnit] = useState<string>('');
  const [completionPercent, setCompletionPercent] = useState<number>(100);
  const [relatedSubmittalNumber, setRelatedSubmittalNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [adminNote, setAdminNote] = useState<string>('');
  const [reviewStatus, setReviewStatus] = useState<ExecutedWorkReviewStatus>('pending');

  // Daily report attachments (Image / PDF / Excel)
  const [existingAttachments, setExistingAttachments] = useState<ReportAttachment[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<PreparedReportAttachment[]>([]);
  const [isPreparingFiles, setIsPreparingFiles] = useState<boolean>(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<ReportUploadProgress | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentsSectionRef = useRef<HTMLDivElement | null>(null);

  // Attachment preview & download state
  const [loadingAttachmentKey, setLoadingAttachmentKey] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{
    workId: string;
    attachment: ReportAttachment;
    url: string;
    kind: 'pdf' | 'image' | 'excel' | 'other';
    excelSheets?: ExcelPreviewSheet[];
    activeSheetIndex?: number;
  } | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    if (accessibleProjects.length > 0 && !accessibleProjects.some((p) => p.id === projectId)) {
      setProjectId(accessibleProjects[0].id);
    }
  }, [accessibleProjects, projectId]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Scope executedWorks by project access
  const scopedWorks = useMemo(
    () => executedWorks.filter((w) => canAccessProject(currentUser, w.projectId)),
    [executedWorks, currentUser]
  );

  // Engineer options for Admin filter
  const engineerOptions = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => map.set(u.id, u.displayName));
    scopedWorks.forEach((w) => {
      if (!map.has(w.authorId)) {
        map.set(w.authorId, w.authorName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [users, scopedWorks]);

  const filteredWorks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedWorks.filter((w) => {
      if (filterProjectId !== 'all' && w.projectId !== filterProjectId) return false;
      if (filterDiscipline !== 'all' && w.discipline !== filterDiscipline) return false;
      if (isAdmin && filterAuthorId !== 'all' && w.authorId !== filterAuthorId) return false;
      if (filterReviewStatus !== 'all' && w.reviewStatus !== filterReviewStatus) return false;
      if (q) {
        const hay = [
          w.workDescription,
          w.projectName,
          w.locationArea || '',
          w.relatedSubmittalNumber || '',
          w.notes || '',
          w.authorName,
          ...(w.attachments || []).map((a) => a.name)
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    scopedWorks,
    filterProjectId,
    filterDiscipline,
    isAdmin,
    filterAuthorId,
    filterReviewStatus,
    searchQuery
  ]);

  // KPIs
  const totalCount = scopedWorks.length;
  const completedCount = scopedWorks.filter((w) => w.completionPercent === 100).length;
  const approvedCount = scopedWorks.filter((w) => w.reviewStatus === 'approved').length;
  const pendingCount = scopedWorks.filter((w) => w.reviewStatus === 'pending').length;

  // Daily progress calculation per accessible project based on logged works for progressDate
  const dailyProjectProgress = useMemo(() => {
    const targetProjects =
      filterProjectId === 'all'
        ? accessibleProjects
        : accessibleProjects.filter((p) => p.id === filterProjectId);

    return targetProjects.map((proj) => {
      const dayWorks = scopedWorks.filter(
        (w) => w.projectId === proj.id && w.workDate === progressDate
      );
      const worksCount = dayWorks.length;
      const avgPercent =
        worksCount > 0
          ? Math.round(
              dayWorks.reduce((sum, w) => sum + (Number(w.completionPercent) || 0), 0) / worksCount
            )
          : 0;
      const completedWorksCount = dayWorks.filter((w) => w.completionPercent === 100).length;
      const approvedWorksCount = dayWorks.filter((w) => w.reviewStatus === 'approved').length;

      return {
        project: proj,
        worksCount,
        avgPercent,
        completedWorksCount,
        approvedWorksCount
      };
    });
  }, [accessibleProjects, filterProjectId, scopedWorks, progressDate]);

  const openCreateModal = (prefillDailyReport = false) => {
    const today = getTodayDateStr();
    setEditingWork(null);
    setProjectId(accessibleProjects[0]?.id || '');
    setWorkDate(today);
    setDiscipline('civil_structural');
    setWorkDescription(prefillDailyReport ? `تقرير الأعمال المنفذة اليومي — ${today}` : '');
    setLocationArea('');
    setQuantity('');
    setUnit('');
    setCompletionPercent(100);
    setRelatedSubmittalNumber('');
    setNotes('');
    setAdminNote('');
    setReviewStatus(isAdmin ? 'approved' : 'pending');
    setExistingAttachments([]);
    setPendingAttachments([]);
    setAttachmentError(null);
    setUploadProgress(null);
    setFormError(null);
    setIsModalOpen(true);

    if (prefillDailyReport) {
      setTimeout(() => {
        attachmentsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
    }
  };

  const openEditModal = (work: ExecutedWork) => {
    setEditingWork(work);
    setProjectId(work.projectId);
    setWorkDate(work.workDate);
    setDiscipline(work.discipline);
    setWorkDescription(work.workDescription);
    setLocationArea(work.locationArea || '');
    setQuantity(work.quantity !== undefined ? String(work.quantity) : '');
    setUnit(work.unit || '');
    setCompletionPercent(work.completionPercent);
    setRelatedSubmittalNumber(work.relatedSubmittalNumber || '');
    setNotes(work.notes || '');
    setAdminNote(work.adminNote || '');
    setReviewStatus(work.reviewStatus);
    setExistingAttachments(work.attachments || []);
    setPendingAttachments([]);
    setAttachmentError(null);
    setUploadProgress(null);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFilesSelected = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setAttachmentError(null);
    const currentTotal = existingAttachments.length + pendingAttachments.length;
    const remainingSlots = MAX_REPORT_ATTACHMENTS - currentTotal;

    if (remainingSlots <= 0) {
      setAttachmentError(`الحد الأقصى للمرفقات هو ${MAX_REPORT_ATTACHMENTS} ملفات لكل بند.`);
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      setAttachmentError(
        `تم اختيار ${filesToProcess.length} ملفات فقط لأن الحد الأقصى هو ${MAX_REPORT_ATTACHMENTS} ملفات.`
      );
    }

    setIsPreparingFiles(true);
    const preparedList: PreparedReportAttachment[] = [];
    const errors: string[] = [];

    for (const file of filesToProcess) {
      try {
        const prepared = await prepareReportAttachmentFile(file);
        preparedList.push(prepared);
      } catch (err) {
        errors.push(formatFirestoreError(err, `تعذر تجهيز الملف «${file.name}».`));
      }
    }

    if (preparedList.length > 0) {
      setPendingAttachments((prev) => [...prev, ...preparedList]);
    }
    if (errors.length > 0) {
      setAttachmentError(errors.join(' '));
    }
    setIsPreparingFiles(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveExistingAttachment = (attId?: string, index?: number) => {
    setExistingAttachments((prev) =>
      prev.filter((att, idx) => (attId ? att.id !== attId : idx !== index))
    );
  };

  const handleRemovePendingAttachment = (attachmentId: string) => {
    setPendingAttachments((prev) => prev.filter((item) => item.attachmentId !== attachmentId));
  };

  const handlePreviewAttachment = async (workId: string, attachment: ReportAttachment) => {
    const key = `preview-${workId}-${attachment.id || attachment.name}`;
    setLoadingAttachmentKey(key);
    try {
      const url = await dataService.fetchExecutedWorkAttachmentUrl(workId, attachment);
      const kind = getReportAttachmentKind(attachment);
      let excelSheets: ExcelPreviewSheet[] | undefined;

      if (kind === 'excel') {
        try {
          excelSheets = await parseExcelPreviewFromBlobUrl(url);
        } catch {
          excelSheets = [];
        }
      }

      setPreviewAttachment({
        workId,
        attachment,
        url,
        kind,
        excelSheets,
        activeSheetIndex: 0
      });
    } catch (err) {
      showToast(formatFirestoreError(err, 'تعذر فتح المرفق للمعاينة.'));
    } finally {
      setLoadingAttachmentKey(null);
    }
  };

  const handleDownloadAttachment = async (workId: string, attachment: ReportAttachment) => {
    const key = `download-${workId}-${attachment.id || attachment.name}`;
    setLoadingAttachmentKey(key);
    try {
      const url = await dataService.fetchExecutedWorkAttachmentUrl(workId, attachment);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.name || 'daily-report';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`جاري تحميل الملف: ${attachment.name}`);
    } catch (err) {
      showToast(formatFirestoreError(err, 'تعذر تحميل المرفق.'));
    } finally {
      setLoadingAttachmentKey(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!workDescription.trim()) {
      setFormError('يرجى إدخال وصف العمل المنفذ بالموقع.');
      return;
    }

    const parsedQty = quantity.trim() !== '' ? Number(quantity) : undefined;
    if (parsedQty !== undefined && (!Number.isFinite(parsedQty) || parsedQty < 0)) {
      setFormError('يرجى إدخال كمية رقمية صحيحة أكبر من أو تساوي 0.');
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(null);
    try {
      if (editingWork) {
        await dataService.updateExecutedWork(
          editingWork.id,
          {
            workDate,
            discipline,
            workDescription: workDescription.trim(),
            locationArea: locationArea.trim(),
            quantity: parsedQty,
            unit: unit.trim(),
            completionPercent,
            relatedSubmittalNumber: relatedSubmittalNumber.trim(),
            notes: notes.trim(),
            attachments: existingAttachments,
            ...(isAdmin ? { reviewStatus, adminNote: adminNote.trim() } : {})
          },
          pendingAttachments,
          (progress) => setUploadProgress(progress)
        );
        setIsModalOpen(false);
        showToast('تم تحديث سجل العمل المنفذ ومرفقاته بنجاح.');
      } else {
        const selectedProj = accessibleProjects.find((p) => p.id === projectId);
        if (!selectedProj) {
          setFormError('يرجى اختيار مشروع متاح لك أولاً.');
          setIsSubmitting(false);
          return;
        }
        await dataService.addExecutedWork(
          {
            projectId: selectedProj.id,
            projectName: selectedProj.name,
            workDate,
            workDescription: workDescription.trim(),
            discipline,
            locationArea: locationArea.trim() || undefined,
            quantity: parsedQty,
            unit: unit.trim() || undefined,
            completionPercent,
            relatedSubmittalNumber: relatedSubmittalNumber.trim() || undefined,
            notes: notes.trim() || undefined,
            authorId: currentUser.id,
            authorName: currentUser.displayName,
            reviewStatus: isAdmin ? reviewStatus : 'pending',
            adminNote: isAdmin && adminNote.trim() ? adminNote.trim() : undefined
          },
          pendingAttachments,
          (progress) => setUploadProgress(progress)
        );
        setIsModalOpen(false);
        showToast(
          pendingAttachments.length > 0
            ? 'تم حفظ العمل المنفذ ورفع التقرير اليومي المرفق بنجاح.'
            : 'تم تسجيل العمل المنفذ بالموقع وحفظه بنجاح.'
        );
      }
    } catch (err) {
      setFormError(formatFirestoreError(err));
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  const handleToggleApproval = async (work: ExecutedWork) => {
    if (!isAdmin) return;
    const nextStatus: ExecutedWorkReviewStatus =
      work.reviewStatus === 'approved' ? 'pending' : 'approved';
    try {
      await dataService.updateExecutedWork(work.id, { reviewStatus: nextStatus });
      showToast(
        nextStatus === 'approved'
          ? 'تم اعتماد البند المنفذ بنجاح.'
          : 'تم إعادة البند لحالة قيد المراجعة.'
      );
    } catch (err) {
      showToast(formatFirestoreError(err));
    }
  };

  const handleDelete = async (workId: string) => {
    setIsDeletingId(workId);
    try {
      await dataService.deleteExecutedWork(workId);
      setConfirmDeleteId(null);
      showToast('تم حذف البند بنجاح.');
    } catch (err) {
      showToast(formatFirestoreError(err));
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleExportExcel = () => {
    if (filteredWorks.length === 0) return;
    exportExecutedWorksToExcel(filteredWorks);
    showToast(`تم تصدير ${filteredWorks.length} بند إلى ملف Excel بنجاح.`);
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-16">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
            <Hammer className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              الأعمال المنفذة بالموقع
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium">
              {isAdmin
                ? 'متابعة ومراجعة واعتماد بنود التنفيذ الفعلي اليومية عبر جميع المواقع'
                : 'تسجيل ومتابعة البنود المنفذة فعلياً بالمواقع المسندة لك ونسب الإنجاز'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            disabled={filteredWorks.length === 0}
            onClick={handleExportExcel}
            className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 disabled:opacity-50 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير Excel</span>
          </button>

          <button
            type="button"
            disabled={accessibleProjects.length === 0}
            onClick={() => openCreateModal(true)}
            className="px-3.5 py-2.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 disabled:opacity-50 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>رفع تقرير يومي</span>
          </button>

          <button
            type="button"
            disabled={accessibleProjects.length === 0}
            onClick={() => openCreateModal(false)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة عمل منفذ</span>
          </button>
        </div>
      </div>

      {/* No assigned projects warning */}
      {accessibleProjects.length === 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-2xl text-amber-800 dark:text-amber-200 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>لا توجد مشاريع مسندة إلى حسابك حالياً لتسجيل أعمال منفذة. تواصل مع مدير النظام.</span>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-400">إجمالي البنود</span>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono mt-1">
            {totalCount}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">مكتملة 100%</span>
          <div className="text-2xl font-extrabold text-blue-700 dark:text-blue-300 font-mono mt-1">
            {completedCount}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">معتمدة (DC)</span>
          <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 font-mono mt-1">
            {approvedCount}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
          <span className="text-xs font-bold text-amber-600 dark:text-amber-400">قيد المراجعة</span>
          <div className="text-2xl font-extrabold text-amber-700 dark:text-amber-300 font-mono mt-1">
            {pendingCount}
          </div>
        </div>
      </div>

      {/* Daily Progress Bar Per Project */}
      {accessibleProjects.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  نسبة الإنجاز اليومي لكل مشروع
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                  متوسط إنجاز الأعمال المنفذة المسجلة بتاريخ{' '}
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {progressDate}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <input
                type="date"
                value={progressDate}
                onChange={(e) => setProgressDate(e.target.value || getTodayDateStr())}
                className="h-9 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              />
              {progressDate !== getTodayDateStr() && (
                <button
                  type="button"
                  onClick={() => setProgressDate(getTodayDateStr())}
                  className="h-9 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold cursor-pointer transition-colors"
                >
                  اليوم
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {dailyProjectProgress.map(
              ({ project, worksCount, avgPercent, completedWorksCount, approvedWorksCount }) => {
                const barColorClass =
                  worksCount === 0
                    ? 'bg-slate-300 dark:bg-slate-700'
                    : avgPercent === 100
                    ? 'bg-emerald-500'
                    : avgPercent >= 50
                    ? 'bg-blue-600'
                    : 'bg-amber-500';

                const percentTextClass =
                  worksCount === 0
                    ? 'text-slate-400 dark:text-slate-500'
                    : avgPercent === 100
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : avgPercent >= 50
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-amber-600 dark:text-amber-400';

                return (
                  <div
                    key={project.id}
                    className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                            {project.name}
                          </span>
                          <span
                            dir="ltr"
                            className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                          >
                            {project.code}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 font-medium">
                          {worksCount === 0 ? (
                            <span>لا توجد أعمال مسجلة لهذا اليوم</span>
                          ) : (
                            <span>
                              {worksCount} {worksCount === 1 ? 'بند مسجل' : 'بنود مسجلة'} •{' '}
                              {completedWorksCount} مكتمل 100% • {approvedWorksCount} معتمد
                            </span>
                          )}
                        </div>
                      </div>

                      <span
                        className={`text-sm sm:text-base font-extrabold font-mono tabular-nums shrink-0 ${percentTextClass}`}
                      >
                        {avgPercent}%
                      </span>
                    </div>

                    <div
                      className="w-full h-3 bg-slate-200/80 dark:bg-slate-700/70 rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={avgPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`نسبة الإنجاز اليومي لمشروع ${project.name}`}
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColorClass}`}
                        style={{ width: `${avgPercent}%` }}
                      />
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
        <div className={isAdmin ? 'lg:col-span-1' : 'lg:col-span-2'}>
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">بحث</label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="وصف العمل، الموقع، رقم تقديم..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pr-9 pl-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">المشروع</label>
          <select
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">جميع المشاريع المتاحة</option>
            {accessibleProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">التخصص</label>
          <select
            value={filterDiscipline}
            onChange={(e) => setFilterDiscipline(e.target.value)}
            className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">جميع التخصصات</option>
            {(Object.keys(WORK_DISCIPLINE_CONFIG) as WorkDiscipline[]).map((key) => (
              <option key={key} value={key}>
                {WORK_DISCIPLINE_CONFIG[key].labelAr}
              </option>
            ))}
          </select>
        </div>

        {isAdmin && (
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">المهندس</label>
            <select
              value={filterAuthorId}
              onChange={(e) => setFilterAuthorId(e.target.value)}
              className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">جميع المهندسين</option>
              {engineerOptions.map((eng) => (
                <option key={eng.id} value={eng.id}>
                  {eng.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">حالة الاعتماد</label>
          <select
            value={filterReviewStatus}
            onChange={(e) => setFilterReviewStatus(e.target.value)}
            className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">الكل ({scopedWorks.length})</option>
            <option value="approved">معتمد ({approvedCount})</option>
            <option value="pending">قيد المراجعة ({pendingCount})</option>
          </select>
        </div>
      </div>

      {/* Works List */}
      {filteredWorks.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <Hammer className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            لا توجد أعمال منفذة مسجلة مطابقة للبحث الحالي
          </p>
          {accessibleProjects.length > 0 && (
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => openCreateModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span>رفع تقرير يومي (صورة / PDF / Excel)</span>
              </button>
              <button
                type="button"
                onClick={() => openCreateModal(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل عمل منفذ بالموقع</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredWorks.map((work) => {
            const disciplineMeta = WORK_DISCIPLINE_CONFIG[work.discipline] || WORK_DISCIPLINE_CONFIG.other;
            const isApproved = work.reviewStatus === 'approved';
            const canModify = isAdmin || (work.authorId === currentUser.id && !isApproved);
            const isConfirmingDelete = confirmDeleteId === work.id;
            const isDeleting = isDeletingId === work.id;

            return (
              <div
                key={work.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${disciplineMeta.badgeClass}`}
                      >
                        {disciplineMeta.labelAr}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${
                          isApproved
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800'
                            : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800'
                        }`}
                      >
                        {isApproved ? (
                          <>
                            <ShieldCheck className="w-3 h-3" />
                            <span>معتمد من DC</span>
                          </>
                        ) : (
                          <>
                            <Clock className="w-3 h-3" />
                            <span>قيد المراجعة</span>
                          </>
                        )}
                      </span>

                      <span className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-0.5 rounded-lg">
                        {work.projectName}
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-snug">
                      {work.workDescription}
                    </h3>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleToggleApproval(work)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                          isApproved
                            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isApproved ? 'إلغاء الاعتماد' : 'اعتماد'}</span>
                      </button>
                    )}

                    {canModify && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditModal(work)}
                          title="تعديل البند"
                          className="p-2 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 bg-slate-50 dark:bg-slate-800 rounded-lg cursor-pointer transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(isConfirmingDelete ? null : work.id)}
                          title="حذف البند"
                          className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 bg-slate-50 dark:bg-slate-800 rounded-lg cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Inline Delete Confirmation */}
                {isConfirmingDelete && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-rose-800 dark:text-rose-200">
                      هل تريد حذف هذا البند نهائياً؟
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleDelete(work.id)}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold cursor-pointer flex items-center gap-1"
                      >
                        {isDeleting && <Loader2 className="w-3 h-3 animate-spin" />}
                        <span>تأكيد الحذف</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-semibold cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}

                {/* Progress Bar & Quantity */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center pt-1">
                  <div className="md:col-span-5 space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-600 dark:text-slate-400">نسبة الإنجاز</span>
                      <span className="font-mono text-blue-700 dark:text-blue-400">
                        {work.completionPercent}%
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          work.completionPercent === 100
                            ? 'bg-emerald-500'
                            : work.completionPercent >= 50
                            ? 'bg-blue-600'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${work.completionPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="md:col-span-7 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-mono">{work.workDate}</span>
                    </span>

                    {work.locationArea && (
                      <span className="inline-flex items-center gap-1 font-medium">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{work.locationArea}</span>
                      </span>
                    )}

                    {work.quantity !== undefined && (
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-200 font-mono">
                        الكمية: {work.quantity} {work.unit || ''}
                      </span>
                    )}

                    {work.relatedSubmittalNumber && (
                      <span
                        dir="ltr"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono font-semibold"
                      >
                        <FileText className="w-3 h-3" />
                        {work.relatedSubmittalNumber}
                      </span>
                    )}

                    <span className="inline-flex items-center gap-1 font-medium">
                      <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                      <span>{work.authorName}</span>
                    </span>
                  </div>
                </div>

                {/* Daily Report Attachments (Images / PDF / Excel) */}
                {work.attachments && work.attachments.length > 0 && (
                  <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                      <Paperclip className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>مرفقات التقرير اليومي ({work.attachments.length})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {work.attachments.map((att, attIdx) => {
                        const kind = getReportAttachmentKind(att);
                        const previewKey = `preview-${work.id}-${att.id || att.name}`;
                        const downloadKey = `download-${work.id}-${att.id || att.name}`;
                        const isLoadingPreview = loadingAttachmentKey === previewKey;
                        const isLoadingDownload = loadingAttachmentKey === downloadKey;

                        const badgeStyle =
                          kind === 'pdf'
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                            : kind === 'excel'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800';

                        const kindLabel =
                          kind === 'pdf' ? 'PDF' : kind === 'excel' ? 'Excel' : 'صورة';

                        return (
                          <div
                            key={att.id || `${work.id}-att-${attIdx}`}
                            className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${badgeStyle}`}
                              >
                                {kind === 'pdf' ? (
                                  <FileText className="w-4 h-4" />
                                ) : kind === 'excel' ? (
                                  <FileSpreadsheet className="w-4 h-4" />
                                ) : (
                                  <ImageIcon className="w-4 h-4" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div
                                  className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate"
                                  title={att.name}
                                >
                                  {att.name}
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                                  <span className="font-bold">{kindLabel}</span>
                                  {att.size ? (
                                    <>
                                      <span>•</span>
                                      <span className="font-mono">{formatFileSize(att.size)}</span>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={Boolean(loadingAttachmentKey)}
                                onClick={() => handlePreviewAttachment(work.id, att)}
                                className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
                              >
                                {isLoadingPreview ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                                <span>معاينة</span>
                              </button>
                              <button
                                type="button"
                                disabled={Boolean(loadingAttachmentKey)}
                                onClick={() => handleDownloadAttachment(work.id, att)}
                                title="تحميل الملف"
                                className="p-1.5 rounded-lg bg-white hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200 border border-slate-200 dark:border-slate-600 cursor-pointer disabled:opacity-50 transition-colors"
                              >
                                {isLoadingDownload ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Download className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Notes / Admin Note */}
                {(work.notes || work.adminNote) && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {work.notes && (
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300">
                        <span className="font-bold block text-[11px] text-slate-500 mb-0.5">
                          ملاحظات التنفيذ بالموقع:
                        </span>
                        {work.notes}
                      </div>
                    )}
                    {work.adminNote && (
                      <div className="p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 border border-blue-100 dark:border-blue-900">
                        <span className="font-bold block text-[11px] text-blue-600 dark:text-blue-400 mb-0.5">
                          ملاحظة إدارة DC:
                        </span>
                        {work.adminNote}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* =====================================================================
          CREATE / EDIT EXECUTED WORK MODAL
          ===================================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                  <Hammer className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  {editingWork ? 'تعديل بند عمل منفذ' : 'تسجيل عمل منفذ بالموقع'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-bold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1 dark:text-slate-200">
                    المشروع / الموقع <span className="text-red-500">*</span>
                  </label>
                  <select
                    disabled={Boolean(editingWork)}
                    value={projectId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setProjectId(nextId);
                      const nextProj = accessibleProjects.find((p) => p.id === nextId);
                      if (
                        nextProj?.scopeDisciplines &&
                        nextProj.scopeDisciplines.length > 0 &&
                        !nextProj.scopeDisciplines.includes(discipline)
                      ) {
                        setDiscipline(nextProj.scopeDisciplines[0]);
                      }
                    }}
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold dark:text-white disabled:opacity-60"
                  >
                    {accessibleProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold mb-1 dark:text-slate-200">
                    تاريخ التنفيذ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={workDate}
                    onChange={(e) => setWorkDate(e.target.value)}
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white"
                  />
                </div>
              </div>

              {(() => {
                const selectedProj = accessibleProjects.find((p) => p.id === projectId);
                if (!selectedProj || (!selectedProj.workScope && !selectedProj.scopeDisciplines?.length)) {
                  return null;
                }
                return (
                  <div className="p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/60 text-[11px] text-blue-900 dark:text-blue-200 space-y-1">
                    <div className="font-bold">نطاق عمل المشروع المحدد:</div>
                    {selectedProj.workScope && (
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                        {selectedProj.workScope}
                      </p>
                    )}
                    {selectedProj.scopeDisciplines && selectedProj.scopeDisciplines.length > 0 && (
                      <div className="text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                        التخصصات المعتمدة:{' '}
                        {selectedProj.scopeDisciplines
                          .map((d) => WORK_DISCIPLINE_CONFIG[d]?.labelAr || d)
                          .join(' · ')}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1 dark:text-slate-200">
                    التخصص / التصنيف <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={discipline}
                    onChange={(e) => setDiscipline(e.target.value as WorkDiscipline)}
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold dark:text-white"
                  >
                    {(Object.keys(WORK_DISCIPLINE_CONFIG) as WorkDiscipline[]).map((key) => {
                      const selectedProj = accessibleProjects.find((p) => p.id === projectId);
                      const inScope = selectedProj?.scopeDisciplines?.includes(key);
                      return (
                        <option key={key} value={key}>
                          {WORK_DISCIPLINE_CONFIG[key].labelAr}
                          {inScope ? ' (ضمن نطاق المشروع)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block font-bold mb-1 dark:text-slate-200">
                    نطاق التنفيذ / الدور / المنطقة
                  </label>
                  <input
                    type="text"
                    maxLength={200}
                    value={locationArea}
                    onChange={(e) => setLocationArea(e.target.value)}
                    placeholder="مثال: المبنى الرئيسي - الدور الثاني"
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1 dark:text-slate-200">
                  وصف العمل المنفذ بالموقع <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  maxLength={1000}
                  value={workDescription}
                  onChange={(e) => setWorkDescription(e.target.value)}
                  placeholder="مثال: صب خرسانة مسلحة للسقف أو تركيب دكتات التكييف المركزية..."
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold mb-1 dark:text-slate-200">الكمية المنفذة</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    dir="ltr"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="48"
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 dark:text-slate-200">الوحدة</label>
                  <input
                    type="text"
                    maxLength={40}
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="م³ / م² / م.ط / نقطة"
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 dark:text-slate-200">
                    نسبة الإنجاز ({completionPercent}%)
                  </label>
                  <div className="flex items-center gap-2 h-11">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={completionPercent}
                      onChange={(e) => setCompletionPercent(Number(e.target.value))}
                      className="flex-1 accent-blue-600"
                    />
                    <span className="font-mono font-bold w-10 text-center dark:text-white">
                      {completionPercent}%
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1 dark:text-slate-200">
                  رقم التقديم المرتبط (اختياري)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  maxLength={120}
                  value={relatedSubmittalNumber}
                  onChange={(e) => setRelatedSubmittalNumber(e.target.value)}
                  placeholder="MAS_RAV_IR_STR_0056"
                  className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold mb-1 dark:text-slate-200">ملاحظات إضافية</label>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="أي ملاحظات ميدانية أو تفاصيل فنية..."
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white"
                />
              </div>

              {/* Daily Report File Upload (Image / PDF / Excel) */}
              <div
                ref={attachmentsSectionRef}
                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
                    <Paperclip className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>رفع تقرير يومي (صورة / PDF / Excel)</span>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    {existingAttachments.length + pendingAttachments.length} / {MAX_REPORT_ATTACHMENTS} ملفات
                  </span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.xlsx,.xls,.xlsm,.xlsb,.csv"
                  onChange={(e) => {
                    if (e.target.files) {
                      handleFilesSelected(e.target.files);
                    }
                  }}
                  className="hidden"
                />

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingFiles(true);
                  }}
                  onDragLeave={() => setIsDraggingFiles(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingFiles(false);
                    if (e.dataTransfer.files?.length) {
                      handleFilesSelected(e.dataTransfer.files);
                    }
                  }}
                  onClick={() => {
                    if (
                      !isPreparingFiles &&
                      existingAttachments.length + pendingAttachments.length < MAX_REPORT_ATTACHMENTS
                    ) {
                      fileInputRef.current?.click();
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors cursor-pointer ${
                    isDraggingFiles
                      ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40'
                      : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 bg-white dark:bg-slate-900/60'
                  } ${
                    existingAttachments.length + pendingAttachments.length >= MAX_REPORT_ATTACHMENTS
                      ? 'opacity-50 cursor-not-allowed'
                      : ''
                  }`}
                >
                  {isPreparingFiles ? (
                    <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400 font-bold py-1">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري تجهيز وضغط الملفات...</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Upload className="w-5 h-5 mx-auto text-blue-600 dark:text-blue-400" />
                      <div className="font-bold text-slate-700 dark:text-slate-200">
                        اضغط لاختيار ملفات التقرير اليومي أو اسحبها هنا
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        يدعم الصور (JPG / PNG / WebP)، ملفات PDF، وجداول Excel (.xlsx / .xls / .csv) حتى 5MB لكل ملف
                      </div>
                    </div>
                  )}
                </div>

                {attachmentError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[11px] font-bold flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{attachmentError}</span>
                  </div>
                )}

                {/* Existing + Pending Attachment Chips */}
                {(existingAttachments.length > 0 || pendingAttachments.length > 0) && (
                  <div className="space-y-1.5">
                    {existingAttachments.map((att, idx) => {
                      const kind = getReportAttachmentKind(att);
                      return (
                        <div
                          key={att.id || `existing-${idx}`}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {kind === 'pdf' ? (
                              <FileText className="w-4 h-4 text-rose-600 shrink-0" />
                            ) : kind === 'excel' ? (
                              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                            ) : (
                              <ImageIcon className="w-4 h-4 text-sky-600 shrink-0" />
                            )}
                            <span className="truncate font-bold text-slate-800 dark:text-slate-200">
                              {att.name}
                            </span>
                            {att.size ? (
                              <span className="text-[11px] font-mono text-slate-400 shrink-0">
                                ({formatFileSize(att.size)})
                              </span>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveExistingAttachment(att.id, idx)}
                            title="إزالة المرفق"
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}

                    {pendingAttachments.map((item) => (
                      <div
                        key={item.attachmentId}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {item.kind === 'pdf' ? (
                            <FileText className="w-4 h-4 text-rose-600 shrink-0" />
                          ) : item.kind === 'excel' ? (
                            <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <ImageIcon className="w-4 h-4 text-sky-600 shrink-0" />
                          )}
                          <span className="truncate font-bold text-slate-800 dark:text-slate-100">
                            {item.name}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                            ({formatFileSize(item.size)})
                          </span>
                          <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/60 px-1.5 py-0.5 rounded shrink-0">
                            جديد
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePendingAttachment(item.attachmentId)}
                          title="إزالة المرفق"
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {uploadProgress && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] font-bold text-blue-700 dark:text-blue-300">
                      <span className="truncate">
                        جاري رفع ({uploadProgress.currentFileIndex}/{uploadProgress.totalFiles}):{' '}
                        {uploadProgress.currentFileName}
                      </span>
                      <span className="font-mono">{uploadProgress.percent}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full transition-all duration-200"
                        style={{ width: `${uploadProgress.percent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {isAdmin && (
                <div className="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 space-y-2.5">
                  <div className="font-bold text-blue-900 dark:text-blue-200">مراجعة واعتماد DC:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold mb-1 dark:text-slate-200">حالة الاعتماد</label>
                      <select
                        value={reviewStatus}
                        onChange={(e) => setReviewStatus(e.target.value as ExecutedWorkReviewStatus)}
                        className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold dark:text-white"
                      >
                        <option value="pending">قيد المراجعة</option>
                        <option value="approved">معتمد من DC</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 dark:text-slate-200">ملاحظة الإدارة</label>
                      <input
                        type="text"
                        maxLength={1000}
                        value={adminNote}
                        onChange={(e) => setAdminNote(e.target.value)}
                        placeholder="ملاحظة اعتماد أو تعليق..."
                        className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || isPreparingFiles}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl font-bold cursor-pointer flex items-center justify-center gap-2 transition-colors"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>
                    {isSubmitting && pendingAttachments.length > 0
                      ? 'جاري الرفع والحفظ...'
                      : editingWork
                      ? 'حفظ التعديلات'
                      : 'حفظ العمل المنفذ'}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl font-bold cursor-pointer disabled:opacity-50"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          ATTACHMENT PREVIEW MODAL (IMAGE / PDF / EXCEL)
          ===================================================================== */}
      {previewAttachment && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={() => setPreviewAttachment(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[92vh] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Preview Header */}
            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900">
              <div className="flex items-center gap-2.5 min-w-0">
                {previewAttachment.kind === 'pdf' ? (
                  <FileText className="w-5 h-5 text-rose-600 shrink-0" />
                ) : previewAttachment.kind === 'excel' ? (
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <ImageIcon className="w-5 h-5 text-sky-600 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                    {previewAttachment.attachment.name}
                  </div>
                  {previewAttachment.attachment.size ? (
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {formatFileSize(previewAttachment.attachment.size)}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewAttachment.url}
                  download={previewAttachment.attachment.name || 'daily-report'}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>تحميل الملف</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(null)}
                  className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Preview Body */}
            <div className="flex-1 overflow-auto p-4 sm:p-5 bg-slate-100/70 dark:bg-slate-950/60">
              {previewAttachment.kind === 'image' && (
                <div className="flex items-center justify-center min-h-[40vh]">
                  <img
                    src={previewAttachment.url}
                    alt={previewAttachment.attachment.name}
                    className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-md bg-white dark:bg-slate-900"
                  />
                </div>
              )}

              {previewAttachment.kind === 'pdf' && (
                <iframe
                  src={previewAttachment.url}
                  title={previewAttachment.attachment.name}
                  className="w-full h-[74vh] rounded-xl border border-slate-200 dark:border-slate-700 bg-white"
                />
              )}

              {previewAttachment.kind === 'excel' && (
                <div className="space-y-3">
                  {previewAttachment.excelSheets && previewAttachment.excelSheets.length > 0 ? (
                    <>
                      {previewAttachment.excelSheets.length > 1 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {previewAttachment.excelSheets.map((sheet, sIdx) => (
                            <button
                              key={sheet.name}
                              type="button"
                              onClick={() =>
                                setPreviewAttachment((prev) =>
                                  prev ? { ...prev, activeSheetIndex: sIdx } : prev
                                )
                              }
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                                (previewAttachment.activeSheetIndex ?? 0) === sIdx
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {sheet.name}
                            </button>
                          ))}
                        </div>
                      )}

                      {(() => {
                        const activeSheet =
                          previewAttachment.excelSheets[previewAttachment.activeSheetIndex ?? 0];
                        if (!activeSheet || activeSheet.rows.length === 0) {
                          return (
                            <div className="p-8 text-center text-xs font-bold text-slate-500">
                              ورقة العمل فارغة.
                            </div>
                          );
                        }
                        return (
                          <div className="space-y-2">
                            {activeSheet.truncated && (
                              <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
                                يتم عرض أول {activeSheet.rows.length} صف من إجمالي{' '}
                                {activeSheet.totalRows} صف. يمكنك تحميل الملف لعرض الجدول بالكامل.
                              </div>
                            )}
                            <div className="overflow-auto max-h-[65vh] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                              <table className="w-full text-xs border-collapse">
                                <tbody>
                                  {activeSheet.rows.map((row, rIdx) => (
                                    <tr
                                      key={rIdx}
                                      className={
                                        rIdx === 0
                                          ? 'bg-slate-100 dark:bg-slate-800 font-bold text-slate-900 dark:text-white'
                                          : 'border-t border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                                      }
                                    >
                                      {row.map((cell, cIdx) => (
                                        <td
                                          key={cIdx}
                                          className="px-3 py-2 border-l border-slate-100 dark:border-slate-800 whitespace-nowrap"
                                        >
                                          {cell}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <div className="p-10 text-center space-y-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                      <FileSpreadsheet className="w-10 h-10 mx-auto text-emerald-600" />
                      <div className="text-sm font-bold text-slate-800 dark:text-white">
                        تعذر معاينة هذا الملف مباشرة
                      </div>
                      <p className="text-xs text-slate-500">
                        يمكنك تحميل ملف Excel من الزر بالأعلى وفتحه مباشرة على جهازك.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {previewAttachment.kind === 'other' && (
                <div className="p-10 text-center space-y-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <FileText className="w-10 h-10 mx-auto text-slate-400" />
                  <div className="text-sm font-bold text-slate-800 dark:text-white">
                    هذا النوع من الملفات جاهز للتحميل
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
