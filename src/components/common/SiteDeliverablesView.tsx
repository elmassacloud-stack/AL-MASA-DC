import React, { useState, useEffect, useMemo } from 'react';
import {
  FileUp,
  FileText,
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
import { dataService } from '../../services/dataService';
import { getAccessibleProjects, canAccessProject } from '../../utils/accessControl';
import {
  preparePdfFromFiles,
  formatFileSize,
  getRemainingRetentionInfo,
  PreparedPdfPayload
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

  // Live tick every 30 seconds so 48h countdown badges stay accurate
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Upload form toggle (always open for site user; toggleable for admin)
  const [showUploadForm, setShowUploadForm] = useState<boolean>(!isAdmin);

  // Upload form state
  const [projectId, setProjectId] = useState<string>(accessibleProjects[0]?.id || '');
  const [deliverableType, setDeliverableType] = useState<SiteDeliverableType>('ir');
  const [title, setTitle] = useState<string>('');
  const [submittalNumber, setSubmittalNumber] = useState<string>('');
  const [rev, setRev] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [preparedPdf, setPreparedPdf] = useState<PreparedPdfPayload | null>(null);
  const [isPreparingFile, setIsPreparingFile] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Filters
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [filterSenderId, setFilterSenderId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // PDF Preview / Loading / Review / Delete modals
  const [previewTarget, setPreviewTarget] = useState<SiteDeliverable | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [reviewTarget, setReviewTarget] = useState<SiteDeliverable | null>(null);
  const [adminNoteInput, setAdminNoteInput] = useState<string>('');
  const [isUpdatingReview, setIsUpdatingReview] = useState<boolean>(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId && accessibleProjects[0]?.id) {
      setProjectId(accessibleProjects[0].id);
    } else if (projectId && !accessibleProjects.some((p) => p.id === projectId)) {
      setProjectId(accessibleProjects[0]?.id || '');
    }
  }, [accessibleProjects, projectId]);

  const showSuccess = (msg: string) => {
    setSuccessBanner(msg);
    setTimeout(() => setSuccessBanner(null), 4000);
  };

  const handleFileSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setFormError(null);
    setIsPreparingFile(true);
    try {
      const files = Array.from(fileList);
      const prepared = await preparePdfFromFiles(files, title.trim() || undefined);
      setPreparedPdf(prepared);
    } catch (err) {
      setPreparedPdf(null);
      setFormError(err instanceof Error ? err.message : 'تعذر تجهيز ملف الـ PDF.');
    } finally {
      setIsPreparingFile(false);
      e.target.value = '';
    }
  };

  const handleSubmitDeliverable = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const project = accessibleProjects.find((p) => p.id === projectId);
    if (!project) {
      setFormError('يرجى اختيار المشروع المصرح به أولاً.');
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
          fileSizeBytes: preparedPdf.fileSizeBytes,
          pageCount: preparedPdf.pageCount,
          senderId: currentUser.id,
          senderName: currentUser.displayName,
          senderEmail: currentUser.email
        },
        preparedPdf.base64,
        (pct) => setUploadProgress(pct)
      );

      setTitle('');
      setSubmittalNumber('');
      setRev(0);
      setNotes('');
      setPreparedPdf(null);
      setUploadProgress(0);
      if (isAdmin) setShowUploadForm(false);
      showSuccess('تم إرسال ملف الـ PDF بنجاح، وسيظل متاحاً في Firebase لمدة 48 ساعة ثم يُحذف تلقائياً.');
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'حدث خطأ أثناء رفع ملف الـ PDF. يرجى التحقق من الاتصال والمحاولة مجدداً.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleOpenPreview = async (item: SiteDeliverable) => {
    setActionError(null);
    setPreviewLoadingId(item.id);
    try {
      const url = await dataService.fetchSiteDeliverablePdfUrl(item);
      setPreviewTarget(item);
      setPreviewBlobUrl(url);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'تعذر تحميل ملف الـ PDF للمعاينة.');
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
      a.download = item.fileName.toLowerCase().endsWith('.pdf') ? item.fileName : `${item.fileName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'تعذر تحميل ملف الـ PDF.');
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

  // Scope visible deliverables by project access & active 48h window
  const scopedDeliverables = useMemo(() => {
    return deliverables
      .filter((d) => d.expiresAtMs > nowTick)
      .filter((d) => isAdmin || canAccessProject(currentUser, d.projectId));
  }, [deliverables, currentUser, isAdmin, nowTick]);

  const filteredDeliverables = useMemo(() => {
    return scopedDeliverables.filter((d) => {
      if (filterProjectId !== 'all' && d.projectId !== filterProjectId) return false;
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
  }, [scopedDeliverables, filterProjectId, filterSenderId, filterStatus, filterType, searchQuery]);

  const uniqueSenders = useMemo(() => {
    const map = new Map<string, string>();
    scopedDeliverables.forEach((d) => {
      if (!map.has(d.senderId)) map.set(d.senderId, d.senderName);
    });
    users.forEach((u) => {
      if (!map.has(u.id)) map.set(u.id, u.displayName);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [scopedDeliverables, users]);

  const counts = useMemo(() => {
    return {
      total: scopedDeliverables.length,
      pending: scopedDeliverables.filter((d) => d.status === 'pending_receipt').length,
      received: scopedDeliverables.filter((d) => d.status === 'received').length,
      revision: scopedDeliverables.filter((d) => d.status === 'needs_revision').length
    };
  }, [scopedDeliverables]);

  const typeEntries = Object.entries(DELIVERABLE_TYPE_CONFIG) as [
    SiteDeliverableType,
    { labelAr: string; badgeClass: string }
  ][];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
            <FileUp className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              تسليمات الموقع (ملفات PDF)
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              {isAdmin
                ? 'استلام ومعاينة وتحميل ملفات الـ PDF المرسلة من المواقع فور استلامها'
                : 'إرسال مستندات وأعمال الاستلام الميدانية إلى الإدارة بصيغة PDF'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setShowUploadForm((prev) => !prev)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer shadow-xs transition-colors whitespace-nowrap"
          >
            {showUploadForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>{showUploadForm ? 'إخفاء نموذج الإرسال' : 'إرسال ملف PDF جديد'}</span>
          </button>
        </div>
      </div>

      {/* 48-Hour Auto Deletion Policy Banner */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex items-start sm:items-center gap-3 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
        <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
        <div className="leading-relaxed">
          <span className="font-bold">سياسة الحذف التلقائي من Firebase بعد 48 ساعة: </span>
          <span>
            تُحفظ ملفات الـ PDF المرسلة مؤقتاً لمدة <strong>48 ساعة</strong> فقط من وقت الإرسال لتسهيل تسليم الشغل للإدارة، ثم يتم حذفها تلقائياً من قاعدة البيانات. يرجى تحميل الملفات المهمة للأرشفة الدائمة قبل انتهاء المهلة.
          </span>
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

      {/* Upload / Send PDF Form */}
      {showUploadForm && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Upload className="w-4 h-4 text-blue-600" />
              <span>إرسال شغل / مستند مستلم بصيغة PDF للإدارة</span>
            </h3>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
              الحد الأقصى: {formatFileSize(MAX_PDF_FILE_SIZE_BYTES)}
            </span>
          </div>

          {accessibleProjects.length === 0 ? (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs sm:text-sm text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>لا توجد مشاريع مسندة إلى حسابك حالياً. يرجى التواصل مع مسؤول النظام.</span>
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
                    {accessibleProjects.map((p) => (
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

              {/* PDF / Image-to-PDF Picker */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  ملف الـ PDF (أو اختر صوراً ليتم دمجها تلقائياً في ملف PDF واحد) <span className="text-red-500">*</span>
                </label>

                <label className="flex flex-col items-center justify-center gap-2 p-5 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer transition-colors text-center">
                  {isPreparingFile ? (
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-xs sm:text-sm">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>جاري تجهيز ملف الـ PDF...</span>
                    </div>
                  ) : preparedPdf ? (
                    <div className="flex flex-col sm:flex-row items-center gap-3 text-emerald-700 dark:text-emerald-300">
                      <FileText className="w-8 h-8 text-emerald-600 shrink-0" />
                      <div className="text-center sm:text-right">
                        <p className="font-bold text-sm" dir="ltr">
                          {preparedPdf.fileName}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          الحجم: {formatFileSize(preparedPdf.fileSizeBytes)} • عدد الصفحات: {preparedPdf.pageCount} • جاهز للإرسال (اضغط لاختيار ملف آخر)
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <FileUp className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm">
                          اضغط لاختيار ملف PDF جاهز أو التقاط/اختيار صور مستند
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          يدعم PDF مباشرة أو صور (JPG / PNG / WebP) وتُحوّل تلقائياً إلى PDF — بحد أقصى 4 ميجابايت
                        </p>
                      </div>
                    </>
                  )}
                  <input
                    type="file"
                    accept="application/pdf,.pdf,image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleFileSelection}
                    className="hidden"
                  />
                </label>
              </div>

              {isUploading && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-blue-700 dark:text-blue-300">
                    <span>جاري رفع ملف الـ PDF إلى Firebase...</span>
                    <span className="font-mono">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
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
                  <span>{isUploading ? 'جاري الإرسال...' : 'إرسال الـ PDF للإدارة الآن'}</span>
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
          value={filterProjectId}
          onChange={(e) => setFilterProjectId(e.target.value)}
          className="h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-semibold"
        >
          <option value="all">جميع المشاريع</option>
          {accessibleProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
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
            لا توجد ملفات PDF مرسلة خلال آخر 48 ساعة مطابقة للبحث
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            الملفات المرسلة من المواقع تظهر هنا فوراً وتُحذف تلقائياً بعد مرور 48 ساعة من الإرسال.
          </p>
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

                  {/* PDF File Info Box */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
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
                          {item.pageCount ? ` • ${item.pageCount} صفحة` : ''} • أُرسل{' '}
                          {new Date(item.createdAt).toLocaleString('ar-EG', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
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
                        تأكيد حذف ملف الـ PDF من Firebase؟
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
                          <span>معاينة PDF</span>
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

      {/* Inline PDF Preview Modal */}
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
                  download={
                    previewTarget.fileName.toLowerCase().endsWith('.pdf')
                      ? previewTarget.fileName
                      : `${previewTarget.fileName}.pdf`
                  }
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>تحميل PDF</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewTarget(null);
                    setPreviewBlobUrl(null);
                  }}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-100 dark:bg-slate-950">
              <iframe
                src={previewBlobUrl}
                title={previewTarget.fileName}
                className="w-full h-full border-0"
              />
            </div>
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
