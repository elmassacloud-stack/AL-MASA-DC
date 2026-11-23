import React, { useState, useEffect, useMemo } from 'react';
import {
  FileUp,
  FileText,
  FileSpreadsheet,
  Clock,
  CheckCircle2,
  AlertCircle,
  Download,
  Eye,
  Trash2,
  Search,
  Building2,
  User as UserIcon,
  Upload,
  Loader2,
  X,
  MessageSquare,
  RotateCcw,
  ShieldAlert,
  Plus
} from 'lucide-react';
import {
  UserProfile,
  Project,
  SiteDeliverable,
  SiteDeliverableType,
  SiteDeliverableStatus
} from '../../types';
import {
  DELIVERABLE_TYPE_CONFIG,
  DELIVERABLE_STATUS_CONFIG,
  MAX_PDF_FILE_SIZE_BYTES
} from '../../config';
import { dataService, DeliverableUploadProgress } from '../../services/dataService';
import { getAccessibleProjects, canAccessProject } from '../../utils/accessControl';
import {
  preparePdfFromFiles,
  formatFileSize,
  getRemainingRetentionInfo,
  isExcelFileName,
  parseExcelPreviewFromBlobUrl,
  PreparedPdfPayload,
  ExcelPreviewSheet
} from '../../utils/pdfUtils';

interface Props {
  currentUser: UserProfile;
  projects: Project[];
  deliverables: SiteDeliverable[];
  users?: UserProfile[];
}

export const SiteDeliverablesView: React.FC<Props> = ({
  currentUser,
  projects,
  deliverables,
  users = []
}) => {
  const isAdmin = currentUser.role === 'admin';
  const accessibleProjects = useMemo(
    () => getAccessibleProjects(currentUser, projects),
    [currentUser, projects]
  );

  // All active user emails can upload to any active project (assigned projects listed first)
  const uploadProjects = useMemo(() => {
    if (isAdmin || accessibleProjects.length === 0) {
      return projects.length > 0 ? projects : accessibleProjects;
    }
    const accessibleIds = new Set(accessibleProjects.map((p) => p.id));
    const remaining = projects.filter((p) => !accessibleIds.has(p.id));
    return [...accessibleProjects, ...remaining];
  }, [isAdmin, accessibleProjects, projects]);

  // Live tick every 30 seconds so 48h countdown badges stay accurate
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

  // Upload form toggle (always open for site user; toggleable for admin)
  const [showUploadForm, setShowUploadForm] = useState<boolean>(!isAdmin);

  // Upload form state
  const [projectId, setProjectId] = useState<string>(uploadProjects[0]?.id || '');
  const [deliverableType, setDeliverableType] = useState<SiteDeliverableType>('ir');
  const [title, setTitle] = useState<string>('');
  const [submittalNumber, setSubmittalNumber] = useState<string>('');
  const [rev, setRev] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [preparedPdf, setPreparedPdf] = useState<PreparedPdfPayload | null>(null);
  const [isPreparingFile, setIsPreparingFile] = useState<boolean>(false);
  const [prepareProgress, setPrepareProgress] = useState<number>(0);
  const [prepareStage, setPrepareStage] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadInfo, setUploadInfo] = useState<DeliverableUploadProgress | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Filters
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [filterSenderId, setFilterSenderId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Preview / Loading / Review / Delete modals
  const [previewTarget, setPreviewTarget] = useState<SiteDeliverable | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [excelSheets, setExcelSheets] = useState<ExcelPreviewSheet[] | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState<number>(0);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [reviewTarget, setReviewTarget] = useState<SiteDeliverable | null>(null);
  const [adminNoteInput, setAdminNoteInput] = useState<string>('');
  const [isUpdatingReview, setIsUpdatingReview] = useState<boolean>(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId && uploadProjects[0]?.id) {
      setProjectId(uploadProjects[0].id);
    } else if (projectId && !uploadProjects.some((p) => p.id === projectId)) {
      setProjectId(uploadProjects[0]?.id || '');
    }
    if (
      filterProjectId !== 'all' &&
      uploadProjects.length > 0 &&
      !uploadProjects.some((p) => p.id === filterProjectId)
    ) {
      setFilterProjectId('all');
    }
  }, [uploadProjects, projectId, filterProjectId]);

  const showSuccess = (msg: string) => {
    setSuccessBanner(msg);
    setTimeout(() => setSuccessBanner(null), 4000);
  };

  const handleFileSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setFormError(null);
    setIsPreparingFile(true);
    setPrepareProgress(10);
    setPrepareStage('جاري قراءة الملفات المختارة...');
    try {
      const files = Array.from(fileList);
      const prepared = await preparePdfFromFiles(files, title.trim() || undefined, (pct, label) => {
        setPrepareProgress(pct);
        if (label) setPrepareStage(label);
      });
      setPreparedPdf(prepared);
    } catch (err) {
      setPreparedPdf(null);
      setFormError(err instanceof Error ? err.message : 'تعذر تجهيز ملف الـ PDF.');
    } finally {
      setIsPreparingFile(false);
      setPrepareProgress(0);
      setPrepareStage('');
      e.target.value = '';
    }
  };

  const handleSubmitDeliverable = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const project = uploadProjects.find((p) => p.id === projectId);
    if (!project) {
      setFormError('يرجى اختيار المشروع أولاً.');
      return;
    }
    if (!title.trim()) {
      setFormError('يرجى كتابة عنوان أو وصف الشغل المستلم.');
      return;
    }
    if (!preparedPdf) {
      setFormError('يرجى إرفاق ملف PDF أو صور ليتم تحويلها إلى PDF قبل الإرسال.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(5);
    setUploadInfo({
      percent: 5,
      uploadedChunks: 0,
      totalChunks: 1,
      uploadedBytes: 0,
      totalBytes: preparedPdf.fileSizeBytes,
      stage: 'metadata'
    });
    try {
      await dataService.createSiteDeliverable(
        {
          projectId: project.id,
          projectName: project.name,
          title: title.trim(),
          deliverableType,
          submittalNumber: submittalNumber.trim() || undefined,
          rev: Number.isFinite(rev) && rev >= 0 ? rev : undefined,
          notes: notes.trim() || undefined,
          fileName: preparedPdf.fileName,
          fileFormat: preparedPdf.fileFormat,
          mimeType: preparedPdf.mimeType,
          fileSizeBytes: preparedPdf.fileSizeBytes,
          pageCount: preparedPdf.pageCount,
          senderId: currentUser.id,
          senderName: currentUser.displayName,
          senderEmail: currentUser.email
        },
        preparedPdf.base64,
        (pct, info) => {
          setUploadProgress(pct);
          if (info) setUploadInfo(info);
        }
      );

      setTitle('');
      setSubmittalNumber('');
      setRev(0);
      setNotes('');
      setPreparedPdf(null);
      setUploadProgress(0);
      setUploadInfo(null);
      if (isAdmin) setShowUploadForm(false);
      showSuccess('تم إرسال الملف بنجاح، وسيظل متاحاً في Firebase لمدة 48 ساعة ثم يُحذف تلقائياً.');
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : '';
      if (rawMsg.includes('Missing or insufficient permissions') || rawMsg.includes('PERMISSION_DENIED')) {
        let failedPath = 'siteDeliverables';
        try {
          const parsed = JSON.parse(rawMsg) as { path?: string };
          if (parsed?.path) failedPath = parsed.path;
        } catch {
          // ignore non-JSON errors
        }
        const hasAssigned =
          Boolean(currentUser.allProjects) ||
          (Array.isArray(currentUser.assignedProjects) &&
            currentUser.assignedProjects.includes(project.id));
        const delivAccess = currentUser.canAccessSiteDeliverables !== false;
        setFormError(
          `تعذر إرسال الملف لعدم كفاية الصلاحيات (${failedPath} | مشروع: ${project.id} | إسناد: ${
            hasAssigned ? 'نعم' : 'لا'
          } | تبويب: ${delivAccess ? 'مفعل' : 'معطل'}). يرجى تسجيل الخروج ثم إعادة الدخول أو تحديث صلاحيات الحساب من إدارة المستخدمين.`
        );
      } else {
        setFormError(
          rawMsg || 'حدث خطأ أثناء رفع الملف. يرجى التحقق من الاتصال والمحاولة مجدداً.'
        );
      }
    } finally {
      setIsUploading(false);
      setUploadInfo(null);
    }
  };

  const isDeliverableExcel = (item: Pick<SiteDeliverable, 'fileFormat' | 'fileName'>) =>
    item.fileFormat === 'excel' || isExcelFileName(item.fileName);

  const getDownloadFileName = (item: Pick<SiteDeliverable, 'fileFormat' | 'fileName'>) => {
    if (isDeliverableExcel(item)) return item.fileName;
    return item.fileName.toLowerCase().endsWith('.pdf') ? item.fileName : `${item.fileName}.pdf`;
  };

  const handleOpenPreview = async (item: SiteDeliverable) => {
    setActionError(null);
    setPreviewLoadingId(item.id);
    try {
      const url = await dataService.fetchSiteDeliverablePdfUrl(item);
      if (isDeliverableExcel(item)) {
        const sheets = await parseExcelPreviewFromBlobUrl(url);
        setExcelSheets(sheets);
        setActiveSheetIdx(0);
      } else {
        setExcelSheets(null);
      }
      setPreviewTarget(item);
      setPreviewBlobUrl(url);
    } catch (err) {
      setExcelSheets(null);
      setActionError(err instanceof Error ? err.message : 'تعذر تحميل الملف للمعاينة.');
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const handleDownloadPdf = async (item: SiteDeliverable) => {
    setActionError(null);
    setDownloadingId(item.id);
    try {
      const url = await dataService.fetchSiteDeliverablePdfUrl(item);
      const a = document.createElement('a');
      a.href = url;
      a.download = getDownloadFileName(item);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'تعذر تحميل الملف.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleUpdateReview = async (status: SiteDeliverableStatus) => {
    if (!reviewTarget) return;
    setIsUpdatingReview(true);
    try {
      await dataService.updateSiteDeliverableStatus(reviewTarget.id, status, adminNoteInput);
      setReviewTarget(null);
      setAdminNoteInput('');
      showSuccess(
        status === 'received'
          ? 'تم تأكيد استلام ملف الـ PDF بنجاح.'
          : 'تم تسجيل طلب المراجعة وإشعار مهندس الموقع.'
      );
    } catch {
      setActionError('تعذر تحديث حالة الاستلام. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsUpdatingReview(false);
    }
  };

  const handleDeleteDeliverable = async (id: string) => {
    setActionError(null);
    setIsDeletingId(id);
    try {
      await dataService.deleteSiteDeliverable(id);
      setConfirmDeleteId(null);
      if (previewTarget?.id === id) {
        setPreviewTarget(null);
        setPreviewBlobUrl(null);
      }
      showSuccess('تم حذف ملف الـ PDF نهائياً من قاعدة البيانات.');
    } catch {
      setActionError('تعذر حذف الملف من Firebase.');
    } finally {
      setIsDeletingId(null);
    }
  };

  // Scope visible deliverables by project access or own uploads & active 48h window
  const scopedDeliverables = useMemo(() => {
    return deliverables
      .filter((d) => d.expiresAtMs > nowTick)
      .filter(
        (d) =>
          isAdmin ||
          d.senderId === currentUser.id ||
          canAccessProject(currentUser, d.projectId)
      );
  }, [deliverables, currentUser, isAdmin, nowTick]);

  const projectCountsMap = useMemo(() => {
    const map = new Map<string, number>();
    scopedDeliverables.forEach((d) => {
      map.set(d.projectId, (map.get(d.projectId) || 0) + 1);
    });
    return map;
  }, [scopedDeliverables]);

  const projectScopedDeliverables = useMemo(() => {
    if (filterProjectId === 'all') return scopedDeliverables;
    return scopedDeliverables.filter((d) => d.projectId === filterProjectId);
  }, [scopedDeliverables, filterProjectId]);

  const filteredDeliverables = useMemo(() => {
    return projectScopedDeliverables.filter((d) => {
      if (filterSenderId !== 'all' && d.senderId !== filterSenderId) return false;
      if (filterStatus !== 'all' && d.status !== filterStatus) return false;
      if (filterType !== 'all' && d.deliverableType !== filterType) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hit =
          d.title.toLowerCase().includes(q) ||
          d.fileName.toLowerCase().includes(q) ||
          d.projectName.toLowerCase().includes(q) ||
          d.senderName.toLowerCase().includes(q) ||
          (d.submittalNumber || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [projectScopedDeliverables, filterSenderId, filterStatus, filterType, searchQuery]);

  const uniqueSenders = useMemo(() => {
    const map = new Map<string, string>();
    projectScopedDeliverables.forEach((d) => {
      if (!map.has(d.senderId)) map.set(d.senderId, d.senderName);
    });
    users.forEach((u) => {
      if (!map.has(u.id)) map.set(u.id, u.displayName);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [projectScopedDeliverables, users]);

  const counts = useMemo(() => {
    return {
      total: projectScopedDeliverables.length,
      pending: projectScopedDeliverables.filter((d) => d.status === 'pending_receipt').length,
      received: projectScopedDeliverables.filter((d) => d.status === 'received').length,
      revision: projectScopedDeliverables.filter((d) => d.status === 'needs_revision').length
    };
  }, [projectScopedDeliverables]);

  const filterProjects = useMemo(() => {
    const visibleProjectIds = new Set(scopedDeliverables.map((d) => d.projectId));
    const list = uploadProjects.filter(
      (p) => isAdmin || canAccessProject(currentUser, p.id) || visibleProjectIds.has(p.id)
    );
    return list.length > 0 ? list : uploadProjects;
  }, [uploadProjects, scopedDeliverables, isAdmin, currentUser]);

  const selectedFilterProject = useMemo(
    () => filterProjects.find((p) => p.id === filterProjectId) || null,
    [filterProjects, filterProjectId]
  );

  const typeEntries = Object.entries(DELIVERABLE_TYPE_CONFIG) as [
    SiteDeliverableType,
    { labelAr: string; badgeClass: string }
  ][];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
            <FileUp className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              تسليمات الموقع (ملفات PDF و Excel)
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              {isAdmin
                ? 'استلام ومعاينة وتحميل ملفات الـ PDF و Excel المرسلة من المواقع فور استلامها'
                : 'إرسال مستندات وأعمال الاستلام وجداول الكميات الميدانية إلى الإدارة بصيغة PDF أو Excel'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-stretch lg:self-auto">
          {/* Prominent Project Filter Dropdown */}
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl px-3 h-10 flex-1 sm:flex-initial min-w-[220px]">
            <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <label
              htmlFor="site-deliverables-project-filter"
              className="text-xs font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap"
            >
              المشروع:
            </label>
            <select
              id="site-deliverables-project-filter"
              aria-label="تصفية الملفات حسب المشروع"
              value={filterProjectId}
              onChange={(e) => setFilterProjectId(e.target.value)}
              className="bg-transparent text-xs sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none w-full cursor-pointer"
            >
              <option value="all" className="dark:bg-slate-900">
                جميع المشاريع ({scopedDeliverables.length})
              </option>
              {filterProjects.map((p) => (
                <option key={p.id} value={p.id} className="dark:bg-slate-900">
                  {p.name} ({p.code}) — {projectCountsMap.get(p.id) || 0}
                </option>
              ))}
            </select>
            {filterProjectId !== 'all' && (
              <button
                type="button"
                onClick={() => setFilterProjectId('all')}
                title="عرض جميع المشاريع"
                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 cursor-pointer shrink-0 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowUploadForm((prev) => !prev)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-colors whitespace-nowrap"
          >
            {showUploadForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>{showUploadForm ? 'إخفاء نموذج الإرسال' : 'إرسال ملف جديد'}</span>
          </button>
        </div>
      </div>

      {successBanner && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 rounded-xl text-rose-800 dark:text-rose-200 text-xs sm:text-sm font-bold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-500 hover:text-rose-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload / Send File Form */}
      {showUploadForm && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Upload className="w-4 h-4 text-blue-600" />
              <span>إرسال شغل / مستند مستلم (PDF أو Excel) للإدارة</span>
            </h3>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
              الحد الأقصى: {formatFileSize(MAX_PDF_FILE_SIZE_BYTES)}
            </span>
          </div>

          {uploadProjects.length === 0 ? (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs sm:text-sm text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>لا توجد مشاريع مسجلة في النظام حالياً. يرجى التواصل مع مسؤول النظام لإضافة مشروع.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmitDeliverable} className="space-y-4 text-xs sm:text-sm">
              {formError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    المشروع / الموقع <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    required
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-semibold"
                  >
                    {uploadProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    نوع المستند / الاستلام <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={deliverableType}
                    onChange={(e) => setDeliverableType(e.target.value as SiteDeliverableType)}
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-semibold"
                  >
                    {typeEntries.map(([key, meta]) => (
                      <option key={key} value={key}>
                        {meta.labelAr}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 lg:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    وصف / عنوان الشغل المستلم <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={300}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: استلام نجارة وحدادة سقف الدور الأول - مبنى A"
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    رقم التقديم / الـ IR المرجعي (اختياري - LTR)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    maxLength={120}
                    value={submittalNumber}
                    onChange={(e) => setSubmittalNumber(e.target.value)}
                    placeholder="MAS_RAV_IR_STR_0088"
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-mono text-left"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    رقم المراجعة (REV)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={rev}
                    onChange={(e) => setRev(parseInt(e.target.value, 10) || 0)}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-mono text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ملاحظات للمرسل إليه (اختياري)
                </label>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="أضف أي تفاصيل حول المرفق أو الاستلام الموقعي..."
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                />
              </div>

              {/* PDF / Excel / Image-to-PDF Picker */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  ملف PDF أو Excel (أو اختر صوراً ليتم دمجها تلقائياً في ملف PDF واحد){' '}
                  <span className="text-red-500">*</span>
                </label>

                <label
                  className={`flex flex-col items-center justify-center gap-2 p-5 border-2 border-dashed rounded-2xl transition-colors text-center ${
                    isUploading
                      ? 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 opacity-75 cursor-not-allowed'
                      : 'border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer'
                  }`}
                >
                  {isPreparingFile ? (
                    <div className="w-full max-w-md space-y-2">
                      <div className="flex items-center justify-between gap-2 text-blue-600 dark:text-blue-400 font-bold text-xs sm:text-sm">
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                          <span>{prepareStage || 'جاري تجهيز الملف...'}</span>
                        </span>
                        <span className="font-mono">{prepareProgress}%</span>
                      </div>
                      <div
                        role="progressbar"
                        aria-valuenow={prepareProgress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="w-full h-2.5 bg-blue-100 dark:bg-slate-800 rounded-full overflow-hidden"
                      >
                        <div
                          className="h-full bg-blue-600 transition-all duration-200 rounded-full"
                          style={{ width: `${prepareProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : preparedPdf ? (
                    <div className="flex flex-col sm:flex-row items-center gap-3 text-emerald-700 dark:text-emerald-300">
                      {preparedPdf.fileFormat === 'excel' ? (
                        <FileSpreadsheet className="w-8 h-8 text-emerald-600 shrink-0" />
                      ) : (
                        <FileText className="w-8 h-8 text-emerald-600 shrink-0" />
                      )}
                      <div className="text-center sm:text-right">
                        <p className="font-bold text-sm" dir="ltr">
                          {preparedPdf.fileName}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          الحجم:{' '}
                          <span dir="ltr" className="inline-block font-mono font-semibold">
                            {formatFileSize(preparedPdf.fileSizeBytes)}
                          </span>{' '}
                          •{' '}
                          {preparedPdf.fileFormat === 'excel' ? (
                            <>
                              <span dir="ltr" className="inline-block font-mono font-semibold">
                                {preparedPdf.pageCount}
                              </span>{' '}
                              ورقة عمل (Excel)
                            </>
                          ) : (
                            <>
                              <span dir="ltr" className="inline-block font-mono font-semibold">
                                {preparedPdf.pageCount}
                              </span>{' '}
                              صفحة (PDF)
                            </>
                          )}{' '}
                          • جاهز للإرسال (اضغط لاختيار ملف آخر)
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <FileUp className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm">
                          اضغط لاختيار ملف PDF أو Excel (.xlsx / .xls / .csv) أو التقاط صور مستند
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          يدعم PDF و Excel مباشرة أو صور (JPG / PNG / WebP) وتُحوّل الصور تلقائياً إلى PDF — بحد أقصى 25 ميجابايت
                        </p>
                      </div>
                    </>
                  )}
                  <input
                    type="file"
                    accept="application/pdf,.pdf,.xlsx,.xls,.xlsm,.xlsb,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.ms-excel.sheet.binary.spreadsheetml.sheet,text/csv,image/jpeg,image/png,image/webp"
                    multiple
                    disabled={isUploading || isPreparingFile}
                    onChange={handleFileSelection}
                    className="hidden"
                  />
                </label>
              </div>

              {isUploading && (
                <div className="p-4 rounded-2xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-2.5 shadow-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-blue-800 dark:text-blue-200">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
                      <span>
                        {uploadInfo?.stage === 'metadata'
                          ? 'جاري تسجيل بيانات المستند...'
                          : uploadInfo?.stage === 'finalizing'
                            ? 'جاري تأكيد الحفظ وإرسال الإشعار للإدارة...'
                            : 'جاري رفع الملف إلى Firebase...'}
                      </span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-lg bg-blue-600 text-white text-xs font-extrabold font-mono shrink-0">
                      {uploadProgress}%
                    </span>
                  </div>

                  <div
                    role="progressbar"
                    aria-label="نسبة التقدم في رفع الملف"
                    aria-valuenow={uploadProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="w-full h-3.5 bg-blue-100 dark:bg-slate-800 rounded-full overflow-hidden border border-blue-200/80 dark:border-slate-700"
                  >
                    <div
                      className="h-full bg-gradient-to-l from-blue-600 via-blue-500 to-cyan-500 transition-all duration-300 rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>

                  {uploadInfo && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      <span className="font-mono" dir="ltr">
                        {formatFileSize(uploadInfo.uploadedBytes)} / {formatFileSize(uploadInfo.totalBytes)}
                      </span>
                      {uploadInfo.totalChunks > 1 && (
                        <span>
                          الأجزاء المرفوعة: <strong className="font-mono">{uploadInfo.uploadedChunks}</strong> من{' '}
                          <strong className="font-mono">{uploadInfo.totalChunks}</strong>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={isUploading || isPreparingFile || !preparedPdf}
                  className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileUp className="w-4 h-4" />
                  )}
                  <span>
                    {isUploading ? `جاري الرفع (${uploadProgress}%)...` : 'إرسال الملف للإدارة الآن'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
            الملفات النشطة (آخر 48 ساعة)
          </span>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono mt-1">
            {counts.total}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
            في انتظار الاستلام
          </span>
          <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 font-mono mt-1">
            {counts.pending}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
            تم الاستلام والأرشفة
          </span>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono mt-1">
            {counts.received}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-bold text-rose-700 dark:text-rose-400">
            يحتاج مراجعة / إعادة إرسال
          </span>
          <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 font-mono mt-1">
            {counts.revision}
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative lg:col-span-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالعنوان، اسم الملف، رقم الـ IR، أو المهندس..."
            className="w-full h-10 pr-9 pl-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
        </div>

        <select
          aria-label="تصفية حسب المشروع"
          value={filterProjectId}
          onChange={(e) => setFilterProjectId(e.target.value)}
          className="h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-semibold"
        >
          <option value="all">جميع المشاريع ({scopedDeliverables.length})</option>
          {filterProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.code}) — {projectCountsMap.get(p.id) || 0}
            </option>
          ))}
        </select>

        {isAdmin ? (
          <select
            value={filterSenderId}
            onChange={(e) => setFilterSenderId(e.target.value)}
            className="h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-semibold"
          >
            <option value="all">كل المرسلين (المهندسين)</option>
            {uniqueSenders.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-semibold"
          >
            <option value="all">كل أنواع المستندات</option>
            {typeEntries.map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.labelAr}
              </option>
            ))}
          </select>
        )}

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-semibold"
        >
          <option value="all">كل الحالات</option>
          <option value="pending_receipt">في انتظار الاستلام</option>
          <option value="received">تم الاستلام والأرشفة</option>
          <option value="needs_revision">يحتاج مراجعة</option>
        </select>
      </div>

      {/* Deliverables List */}
      {filteredDeliverables.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 border border-slate-200 dark:border-slate-800 text-center space-y-2">
          <FileText className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            {selectedFilterProject
              ? `لا توجد ملفات PDF مرسلة لمشروع «${selectedFilterProject.name}» مطابقة للتصفية`
              : 'لا توجد ملفات PDF مرسلة خلال آخر 48 ساعة مطابقة للبحث'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            الملفات المرسلة من المواقع تظهر هنا فوراً وتُحذف تلقائياً بعد مرور 48 ساعة من الإرسال.
          </p>
          {filterProjectId !== 'all' && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setFilterProjectId('all')}
                className="px-4 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                عرض ملفات جميع المشاريع
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDeliverables.map((item) => {
            const typeMeta = DELIVERABLE_TYPE_CONFIG[item.deliverableType] || DELIVERABLE_TYPE_CONFIG.other;
            const statusMeta =
              DELIVERABLE_STATUS_CONFIG[item.status] || DELIVERABLE_STATUS_CONFIG.pending_receipt;
            const retention = getRemainingRetentionInfo(item.expiresAtMs, nowTick);
            const canDelete = isAdmin || item.senderId === currentUser.id;
            const isConfirmingDel = confirmDeleteId === item.id;

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  {/* Top Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full border font-bold ${typeMeta.badgeClass}`}
                      >
                        {typeMeta.labelAr}
                      </span>
                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full border font-bold ${statusMeta.badgeClass}`}
                      >
                        {statusMeta.labelAr}
                      </span>
                    </div>

                    <span
                      className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1 border ${
                        retention.isUrgent
                          ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800'
                          : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                      }`}
                      title={`يُحذف تلقائياً في: ${new Date(item.expiresAtMs).toLocaleString('ar-EG')}`}
                    >
                      <Clock className="w-3 h-3" />
                      <span>{retention.label}</span>
                    </span>
                  </div>

                  {/* Title & Submittal Info */}
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                      {item.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400 mt-1.5">
                      <span className="inline-flex items-center gap-1 font-semibold text-blue-700 dark:text-blue-400">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>{item.projectName}</span>
                      </span>

                      <span className="inline-flex items-center gap-1">
                        <UserIcon className="w-3.5 h-3.5" />
                        <span>{item.senderName}</span>
                      </span>

                      {item.submittalNumber && (
                        <span
                          dir="ltr"
                          className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold"
                        >
                          {item.submittalNumber}
                          {item.rev !== undefined ? ` (Rev.${item.rev})` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* File Info Box */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          isDeliverableExcel(item)
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isDeliverableExcel(item) ? (
                          <FileSpreadsheet className="w-5 h-5" />
                        ) : (
                          <FileText className="w-5 h-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p
                          className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate"
                          dir="ltr"
                        >
                          {item.fileName}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {formatFileSize(item.fileSizeBytes)}
                          {item.pageCount
                            ? isDeliverableExcel(item)
                              ? ` • ${item.pageCount} ورقة عمل`
                              : ` • ${item.pageCount} صفحة`
                            : ''}{' '}
                          • أُرسل{' '}
                          {new Date(item.createdAt).toLocaleString('ar-EG', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border shrink-0 ${
                        isDeliverableExcel(item)
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                          : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                      }`}
                    >
                      {isDeliverableExcel(item) ? 'EXCEL' : 'PDF'}
                    </span>
                  </div>

                  {item.notes && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50/60 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                      {item.notes}
                    </p>
                  )}

                  {item.adminNote && (
                    <div className="p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-xs text-blue-900 dark:text-blue-200">
                      <span className="font-bold">ملاحظة الإدارة: </span>
                      <span>{item.adminNote}</span>
                    </div>
                  )}
                </div>

                {/* Action Footer */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  {isConfirmingDel ? (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs">
                      <span className="font-bold text-rose-800 dark:text-rose-200">
                        تأكيد حذف الملف من Firebase؟
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isDeletingId === item.id}
                          onClick={() => handleDeleteDeliverable(item.id)}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold cursor-pointer disabled:opacity-50"
                        >
                          {isDeletingId === item.id ? 'جاري الحذف...' : 'نعم، احذف'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={previewLoadingId === item.id}
                          onClick={() => handleOpenPreview(item)}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                        >
                          {previewLoadingId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                          <span>{isDeliverableExcel(item) ? 'معاينة Excel' : 'معاينة PDF'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={downloadingId === item.id}
                          onClick={() => handleDownloadPdf(item)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                        >
                          {downloadingId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span>تحميل</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setReviewTarget(item);
                              setAdminNoteInput(item.adminNote || '');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                            <span>استلام / ملاحظات</span>
                          </button>
                        )}

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(item.id)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 cursor-pointer transition-colors"
                            title="حذف الملف من Firebase"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inline PDF / Excel Preview Modal */}
      {previewTarget && previewBlobUrl && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
            <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                  {previewTarget.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate" dir="ltr">
                  {previewTarget.fileName} • {formatFileSize(previewTarget.fileSizeBytes)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewBlobUrl}
                  download={getDownloadFileName(previewTarget)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>{isDeliverableExcel(previewTarget) ? 'تحميل Excel' : 'تحميل PDF'}</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewTarget(null);
                    setPreviewBlobUrl(null);
                    setExcelSheets(null);
                  }}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {excelSheets ? (
              <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950">
                {/* Sheet tabs */}
                <div className="px-3 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto">
                  {excelSheets.map((sheet, idx) => (
                    <button
                      key={`${sheet.name}-${idx}`}
                      type="button"
                      onClick={() => setActiveSheetIdx(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                        activeSheetIdx === idx
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {sheet.name} ({sheet.totalRows})
                    </button>
                  ))}
                </div>

                {/* Sheet table */}
                <div className="flex-1 overflow-auto p-3">
                  {(() => {
                    const currentSheet = excelSheets[activeSheetIdx];
                    if (!currentSheet || currentSheet.rows.length === 0) {
                      return (
                        <div className="p-8 text-center text-xs font-semibold text-slate-500">
                          ورقة العمل هذه فارغة.
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-2">
                        {currentSheet.truncated && (
                          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-xs font-semibold text-amber-800 dark:text-amber-200">
                            يتم عرض أول 250 صفاً فقط في المعاينة السريعة من أصل {currentSheet.totalRows} صف. لتحميل الملف كاملاً اضغط «تحميل Excel».
                          </div>
                        )}
                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                          <table className="w-full text-xs text-right border-collapse">
                            <tbody>
                              {currentSheet.rows.map((row, rIdx) => (
                                <tr
                                  key={rIdx}
                                  className={
                                    rIdx === 0
                                      ? 'bg-slate-100 dark:bg-slate-800 font-bold text-slate-900 dark:text-white'
                                      : 'border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                  }
                                >
                                  <td className="px-2 py-1.5 text-[10px] font-mono text-slate-400 border-l border-slate-200 dark:border-slate-800 select-none">
                                    {rIdx + 1}
                                  </td>
                                  {row.map((cell, cIdx) => (
                                    <td
                                      key={cIdx}
                                      className="px-2.5 py-1.5 border-l border-slate-100 dark:border-slate-800 whitespace-nowrap max-w-[260px] truncate text-slate-700 dark:text-slate-200"
                                      title={cell}
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
                </div>
              </div>
            ) : (
              <div className="flex-1 bg-slate-100 dark:bg-slate-950">
                <iframe
                  src={previewBlobUrl}
                  title={previewTarget.fileName}
                  className="w-full h-full border-0"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin Receipt / Review Modal */}
      {reviewTarget && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-5 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                  تحديث حالة استلام الـ PDF
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-xs">
                  {reviewTarget.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                ملاحظات إدارة مراقبة الوثائق (اختياري)
              </label>
              <textarea
                rows={3}
                maxLength={1000}
                value={adminNoteInput}
                onChange={(e) => setAdminNoteInput(e.target.value)}
                placeholder="مثال: تم استلام الملف وحفظه بالأرشيف، أو يرجى إعادة المسح الضوئي لصفحة التوقيع..."
                className="w-full p-3 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isUpdatingReview}
                onClick={() => handleUpdateReview('needs_revision')}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                <span>طلب مراجعة / إعادة إرسال</span>
              </button>
              <button
                type="button"
                disabled={isUpdatingReview}
                onClick={() => handleUpdateReview('received')}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>تأكيد الاستلام</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
