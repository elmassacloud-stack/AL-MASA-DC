import React, { useState, useMemo } from 'react';
import {
  FileText,
  Calendar,
  Building,
  User,
  Eye,
  FileSpreadsheet,
  FileDown,
  Share2,
  Printer,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
  MessageSquare,
  Search,
  Check,
  Copy,
  Paperclip,
  Pencil,
  History
} from 'lucide-react';
import { DailyReport, Project, UserProfile, SubmittalItem } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { ReportAttachmentList } from '../common/ReportAttachmentList';
import { exportDailyReportToExcel } from '../../utils/exportUtils';
import {
  generateReportsPdfBlob,
  triggerPdfDownload,
  shareOrDownloadPdf,
  printReportsViaHiddenIframe,
  formatArabicMonthLabel,
  PdfExportPeriodMode
} from '../../utils/pdfReportExporter';
import { getReportIdentityAudit } from '../../utils/identityAudit';
import { dataService } from '../../services/dataService';
import { EditDailyReportModal } from '../site/EditDailyReportModal';

interface Props {
  reports: DailyReport[];
  projects: Project[];
  users: UserProfile[];
  currentUser: UserProfile;
}

export const AdminReportsView: React.FC<Props> = ({
  reports,
  projects,
  users,
  currentUser
}) => {
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterSender, setFilterSender] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedReport, setSelectedReport] = useState<DailyReport | null>(null);
  const [editingReport, setEditingReport] = useState<DailyReport | null>(null);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);
  const [adminFeedbackInput, setAdminFeedbackInput] = useState<string>('');
  const [savedFeedbackMsg, setSavedFeedbackMsg] = useState<boolean>(false);
  const [feedbackErrorMsg, setFeedbackErrorMsg] = useState<string | null>(null);
  const [isSavingFeedback, setIsSavingFeedback] = useState<boolean>(false);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);

  // PDF Export Modal & single-report export state
  const latestReportDate = useMemo(() => {
    if (reports.length === 0) return new Date().toISOString().slice(0, 10);
    return [...reports]
      .map((r) => r.reportDate)
      .sort()
      .reverse()[0];
  }, [reports]);

  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false);
  const [pdfMode, setPdfMode] = useState<'daily' | 'monthly' | 'range'>('daily');
  const [pdfDate, setPdfDate] = useState<string>(() => latestReportDate);
  const [pdfMonth, setPdfMonth] = useState<string>(() => latestReportDate.slice(0, 7));
  const [pdfFromDate, setPdfFromDate] = useState<string>(() => `${latestReportDate.slice(0, 7)}-01`);
  const [pdfToDate, setPdfToDate] = useState<string>(() => latestReportDate);
  const [pdfProjectId, setPdfProjectId] = useState<string>('all');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [exportingSinglePdfId, setExportingSinglePdfId] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfSuccessMsg, setPdfSuccessMsg] = useState<string | null>(null);

  const openPdfExportModal = () => {
    setPdfError(null);
    setPdfProjectId(filterProjectId);
    if (filterDate) {
      setPdfMode('daily');
      setPdfDate(filterDate);
      setPdfMonth(filterDate.slice(0, 7));
    } else {
      setPdfDate(latestReportDate);
      setPdfMonth(latestReportDate.slice(0, 7));
      setPdfFromDate(`${latestReportDate.slice(0, 7)}-01`);
      setPdfToDate(latestReportDate);
    }
    setIsPdfModalOpen(true);
  };

  const pdfMatchingReports = useMemo(() => {
    return reports.filter((r) => {
      if (pdfProjectId !== 'all' && r.projectId !== pdfProjectId) return false;
      if (pdfMode === 'daily') {
        return !pdfDate || r.reportDate === pdfDate;
      }
      if (pdfMode === 'monthly') {
        return !pdfMonth || r.reportDate.startsWith(pdfMonth);
      }
      // range
      if (pdfFromDate && r.reportDate < pdfFromDate) return false;
      if (pdfToDate && r.reportDate > pdfToDate) return false;
      return true;
    });
  }, [reports, pdfProjectId, pdfMode, pdfDate, pdfMonth, pdfFromDate, pdfToDate]);

  const pdfStatsPreview = useMemo(() => {
    const projectIds = new Set<string>();
    let submitted = 0;
    let received = 0;
    for (const rep of pdfMatchingReports) {
      projectIds.add(rep.projectId);
      submitted += rep.submittedWorks.length;
      received += rep.receivedWorks.length;
    }
    return {
      reportsCount: pdfMatchingReports.length,
      projectsCount: projectIds.size,
      submitted,
      received
    };
  }, [pdfMatchingReports]);

  const buildPdfExportPayload = () => {
    const projectObj =
      pdfProjectId !== 'all' ? projects.find((p) => p.id === pdfProjectId) : null;
    const projectLabel = projectObj ? `${projectObj.name} (${projectObj.code})` : 'كافة المشاريع';

    let title = 'تقرير الأعمال اليومي';
    let periodLabel = pdfDate || 'كافة التواريخ';
    let mode: PdfExportPeriodMode = pdfMode;

    if (pdfMode === 'monthly') {
      title = 'التقرير الشهري لأعمال المواقع';
      periodLabel = pdfMonth ? formatArabicMonthLabel(pdfMonth) : 'كافة الشهور';
    } else if (pdfMode === 'range') {
      title = 'تقرير أعمال المواقع خلال فترة محددة';
      periodLabel = `من ${pdfFromDate || 'البداية'} إلى ${pdfToDate || 'النهاية'}`;
    } else {
      title = 'تقرير الأعمال اليومي للمواقع';
      periodLabel = pdfDate || latestReportDate;
    }

    return {
      mode,
      title,
      periodLabel,
      projectLabel,
      reports: pdfMatchingReports,
      projects,
      users
    };
  };

  const handleRunBatchPdfExport = async (action: 'download' | 'share' | 'print') => {
    setPdfError(null);
    if (pdfMatchingReports.length === 0) {
      setPdfError('لا توجد تقارير مطابقة للفترة أو المشروع المحدد.');
      return;
    }

    const payload = buildPdfExportPayload();

    if (action === 'print') {
      printReportsViaHiddenIframe(payload);
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const result = await generateReportsPdfBlob(payload);
      if (action === 'share') {
        const outcome = await shareOrDownloadPdf(result.blob, result.fileName, payload.title);
        setPdfSuccessMsg(
          outcome === 'shared'
            ? `تم تجهيز ومشاركة ملف PDF (${result.pageCount} صفحة).`
            : `تم تحميل ملف PDF بنجاح (${result.pageCount} صفحة) ويمكنك مشاركته مباشرة.`
        );
      } else {
        triggerPdfDownload(result.blob, result.fileName);
        setPdfSuccessMsg(
          `تم استخراج وتحميل ملف PDF بنجاح (${pdfMatchingReports.length} تقرير · ${result.pageCount} صفحة).`
        );
      }
      setIsPdfModalOpen(false);
      window.setTimeout(() => setPdfSuccessMsg(null), 4500);
    } catch (err) {
      setPdfError(
        err instanceof Error ? err.message : 'تعذر إنشاء ملف PDF. يرجى المحاولة مرة أخرى.'
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleExportSingleReportPdf = async (
    report: DailyReport,
    action: 'download' | 'share' = 'download'
  ) => {
    if (exportingSinglePdfId) return;
    setExportingSinglePdfId(report.id);
    setPdfError(null);
    try {
      const proj = projects.find((p) => p.id === report.projectId);
      const result = await generateReportsPdfBlob({
        mode: 'single',
        title: `تقرير الأعمال اليومي — ${report.projectName}`,
        periodLabel: report.reportDate,
        projectLabel: proj ? `${report.projectName} (${proj.code})` : report.projectName,
        reports: [report],
        projects,
        users,
        fileName: `تقرير_أعمال_${report.projectName}_${report.reportDate}.pdf`
      });
      if (action === 'share') {
        await shareOrDownloadPdf(result.blob, result.fileName, `تقرير أعمال ${report.projectName} (${report.reportDate})`);
      } else {
        triggerPdfDownload(result.blob, result.fileName);
      }
      setPdfSuccessMsg(`تم تصدير تقرير «${report.projectName}» (${report.reportDate}) إلى PDF بنجاح.`);
      window.setTimeout(() => setPdfSuccessMsg(null), 4000);
    } catch (err) {
      setEditSuccessMsg(null);
      setPdfError(err instanceof Error ? err.message : 'تعذر تصدير التقرير إلى PDF.');
    } finally {
      setExportingSinglePdfId(null);
    }
  };

  const handleCopyReportSummary = (report: DailyReport) => {
    const audit = getReportIdentityAudit(report, users);
    const lines = [
      `تقرير الأعمال اليومي - إدارة مراقبة الوثائق (DC)`,
      `المشروع: ${report.projectName}`,
      `التاريخ: ${report.reportDate}`,
      `المرسل: ${audit.currentName}`,
      `حالة التقرير: ${report.status}`,
      `الأعمال المقدمة (${report.submittedWorks.length}):`,
      ...report.submittedWorks.map(
        (s, i) => `  ${i + 1}. [${s.submittalNumber} REV ${s.rev}] ${s.itemDescription} (${s.status})`
      ),
      `الأعمال المستلمة (${report.receivedWorks.length}):`,
      ...report.receivedWorks.map(
        (r, i) => `  ${i + 1}. [${r.submittalNumber} REV ${r.rev}] ${r.itemDescription} (${r.status})`
      ),
      report.notes ? `ملاحظات: ${report.notes}` : '',
      report.adminFeedback ? `ملاحظات المراجعة: ${report.adminFeedback}` : ''
    ].filter(Boolean);

    const text = lines.join('\n');
    navigator.clipboard?.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  // Apply filters
  const filteredReports = reports.filter((report) => {
    if (filterProjectId !== 'all' && report.projectId !== filterProjectId) return false;
    if (filterDate && report.reportDate !== filterDate) return false;
    if (filterSender !== 'all' && report.senderId !== filterSender) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const audit = getReportIdentityAudit(report, users);
      const inProject = report.projectName.toLowerCase().includes(q);
      const inSender =
        audit.currentName.toLowerCase().includes(q) ||
        audit.currentEmail.toLowerCase().includes(q) ||
        report.senderName.toLowerCase().includes(q) ||
        report.senderEmail.toLowerCase().includes(q) ||
        (report.originalSenderName || '').toLowerCase().includes(q) ||
        (report.originalSenderEmail || '').toLowerCase().includes(q);
      const inNotes = (report.notes || '').toLowerCase().includes(q);
      const inSubmitted = report.submittedWorks.some(
        (s) => s.itemDescription.toLowerCase().includes(q) || s.submittalNumber.toLowerCase().includes(q)
      );
      const inReceived = report.receivedWorks.some(
        (r) => r.itemDescription.toLowerCase().includes(q) || r.submittalNumber.toLowerCase().includes(q)
      );
      if (!inProject && !inSender && !inNotes && !inSubmitted && !inReceived) return false;
    }
    return true;
  });

  const handleOpenReport = (report: DailyReport) => {
    setSelectedReport(report);
    setAdminFeedbackInput(report.adminFeedback || '');
    setSavedFeedbackMsg(false);
    setFeedbackErrorMsg(null);
  };

  const handleSaveFeedback = async (status: DailyReport['status']) => {
    if (!selectedReport || isSavingFeedback) return;
    setIsSavingFeedback(true);
    setSavedFeedbackMsg(false);
    setFeedbackErrorMsg(null);
    const trimmedFeedback = adminFeedbackInput.trim().slice(0, 2000);
    try {
      await dataService.updateReportStatus(selectedReport.id, status, trimmedFeedback);
      setSelectedReport((prev: DailyReport | null) =>
        prev ? { ...prev, status, adminFeedback: trimmedFeedback } : null
      );
      setSavedFeedbackMsg(true);
      setTimeout(() => setSavedFeedbackMsg(false), 2000);
    } catch (err) {
      setFeedbackErrorMsg(
        err instanceof Error
          ? err.message
          : 'تعذر حفظ حالة التقرير في قاعدة البيانات. يرجى المحاولة مرة أخرى.'
      );
    } finally {
      setIsSavingFeedback(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <span>سجل تقارير الأعمال اليومية لجميع المواقع</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium">
            تدقيق ومراجعة تقارير المشاريع، اعتماد الأعمال، وتصدير النماذج المعتمدة
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800 tabular-nums">
            {filteredReports.length} تقرير مطابق للبحث
          </span>
          <button
            type="button"
            onClick={openPdfExportModal}
            disabled={reports.length === 0}
            className="min-h-[38px] px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs whitespace-nowrap"
          >
            <FileDown className="w-4 h-4" />
            <span>تصدير إلى PDF</span>
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        {/* Project Filter */}
        <div>
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">المشروع</label>
          <select
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
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

        {/* Date Filter */}
        <div>
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">تاريخ محدد</label>
          <div className="relative">
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
            />
            {filterDate && (
              <button
                onClick={() => setFilterDate('')}
                className="absolute left-2 top-2.5 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                مسح
              </button>
            )}
          </div>
        </div>

        {/* Sender Filter */}
        <div>
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">المهندس المرسل</label>
          <select
            value={filterSender}
            onChange={(e) => setFilterSender(e.target.value)}
            className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
          >
            <option value="all">كافة المهندسين</option>
            {Array.from(
              new Map(
                [
                  ...users.map((u) => [u.id, { id: u.id, name: u.displayName }] as const),
                  ...reports.map((r) => [r.senderId, { id: r.senderId, name: r.senderName }] as const)
                ]
              ).values()
            ).map((eng) => (
              <option key={eng.id} value={eng.id}>
                {eng.name}
              </option>
            ))}
          </select>
        </div>

        {/* Search Input */}
        <div>
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">بحث برقم التقديم أو البند</label>
          <div className="relative">
            <input
              type="text"
              placeholder="مثال: MAS_RAV أو Columns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pr-9 pl-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
          </div>
        </div>
      </div>

      {editSuccessMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-bold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{editSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setEditSuccessMsg(null)}
            className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
            aria-label="إغلاق الرسالة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {pdfSuccessMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-bold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{pdfSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setPdfSuccessMsg(null)}
            className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {pdfError && !isPdfModalOpen && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs sm:text-sm font-bold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{pdfError}</span>
          </div>
          <button
            type="button"
            onClick={() => setPdfError(null)}
            className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Reports List */}
      <div className="space-y-3">
        {filteredReports.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center border border-slate-200 dark:border-slate-800">
            <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="font-bold text-slate-700 dark:text-slate-300">
              لا توجد تقارير مطابقة لمعايير التصفية الحالية
            </p>
          </div>
        ) : (
          filteredReports.map((report) => {
            const audit = getReportIdentityAudit(report, users);

            return (
            <div
              key={report.id}
              className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-blue-400 dark:hover:border-blue-700 transition-all space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
                    <Building className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-base text-slate-900 dark:text-white">
                      {report.projectName}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{report.reportDate}</span>
                      </span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        <span>
                          المرسل: <strong>{audit.currentName}</strong>{' '}
                          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400" dir="ltr">
                            ({audit.currentEmail})
                          </span>
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  {report.status === 'reviewed' ? (
                    <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>معتمد ومراجع من DC</span>
                    </span>
                  ) : report.status === 'needs_revision' ? (
                    <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                      يتطلب تعديل من الموقع
                    </span>
                  ) : (
                    <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                      جديد بانتظار مراجعة DC
                    </span>
                  )}
                </div>
              </div>

              {/* Rows Count preview */}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-lg">
                  الأعمال المقدمة: <strong className="text-blue-600 dark:text-blue-400 font-mono">{report.submittedWorks.length}</strong>
                </span>
                <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-lg">
                  الأعمال المستلمة: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{report.receivedWorks.length}</strong>
                </span>
                {(report.attachments?.length || 0) > 0 && (
                  <span className="bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800 inline-flex items-center gap-1">
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>المرفقات: <strong className="font-mono">{report.attachments!.length}</strong></span>
                  </span>
                )}
                {report.notes && (
                  <span className="text-slate-700 dark:text-slate-300 font-medium truncate max-w-md">
                    ملاحظات: {report.notes}
                  </span>
                )}
              </div>

              {/* Admin feedback if present */}
              {report.adminFeedback && (
                <div className="p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs text-blue-900 dark:text-blue-200 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    <strong>تعليق الإدارة:</strong> {report.adminFeedback}
                  </span>
                </div>
              )}

              {/* Card Actions */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingReport(report)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:hover:bg-amber-900/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="تعديل بيانات التقرير اليومي"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>تعديل التقرير</span>
                </button>
                <button
                  onClick={() => handleCopyReportSummary(report)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="نسخ ملخص التقرير لمشاركته"
                >
                  <Copy className="w-3.5 h-3.5 text-blue-500" />
                  <span>نسخ الملخص</span>
                </button>
                <button
                  type="button"
                  disabled={exportingSinglePdfId === report.id}
                  onClick={() => handleExportSingleReportPdf(report, 'download')}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/60 disabled:opacity-60 transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="تصدير التقرير بصيغة PDF جاهز للمشاركة"
                >
                  {exportingSinglePdfId === report.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileDown className="w-4 h-4" />
                  )}
                  <span>تصدير PDF</span>
                </button>
                <button
                  onClick={() => exportDailyReportToExcel(report)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="تصدير نموذج إكسل مطابق"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>تصدير Excel (.xlsx)</span>
                </button>
                <button
                  onClick={() => handleOpenReport(report)}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Eye className="w-4 h-4" />
                  <span>فتح وتدقيق التقرير</span>
                </button>
              </div>
            </div>
            );
          })
        )}
      </div>

      {/* =========================================================================
          REPORT INSPECTION & AUDIT MODAL
          ========================================================================= */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col my-auto">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <span>تدقيق تقرير الأعمال اليومي: {selectedReport.projectName}</span>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono">
                    {selectedReport.reportDate}
                  </span>
                </h3>
                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium mt-0.5">
                  المرسل: {getReportIdentityAudit(selectedReport, users).currentName} ({getReportIdentityAudit(selectedReport, users).currentEmail})
                </p>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-sm">
              {/* Quiet Read-Only Administrative Sender Audit (shown only when author metadata changed since submission) */}
              {(() => {
                const modalAudit = getReportIdentityAudit(selectedReport, users);
                if (!modalAudit.hasAuditDifference) return null;
                return (
                  <div className="p-3.5 rounded-xl border bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-xs space-y-2.5">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                      <History className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                      <span>سجل هوية المرسل (التدقيق الإداري)</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700/70">
                        <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">
                          البيانات الأصلية وقت إرسال التقرير
                        </span>
                        <div className="font-bold text-slate-900 dark:text-white">
                          {modalAudit.originalName}
                        </div>
                        <div className="font-mono text-[11px] text-slate-600 dark:text-slate-400" dir="ltr">
                          {modalAudit.originalEmail}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700/70">
                        <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">
                          البيانات الحالية في الملف الشخصي
                        </span>
                        <div className="font-bold text-slate-900 dark:text-white">
                          {modalAudit.currentName}
                        </div>
                        <div className="font-mono text-[11px] text-slate-600 dark:text-slate-400" dir="ltr">
                          {modalAudit.currentEmail}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* TABLE 1: Submitted Works */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    <span>الأعمال المقدمة (Submitted Works)</span>
                    <span className="text-xs font-mono bg-blue-50 dark:bg-blue-950 text-blue-600 px-2 py-0.5 rounded-md">
                      {selectedReport.submittedWorks.length}
                    </span>
                  </h4>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      <tr>
                        <th className="py-2 px-3 w-10 text-center">م</th>
                        <th className="py-2 px-3">البند (Item Description)</th>
                        <th className="py-2 px-3 w-48 text-left">رقم التقديم (Submittal No.)</th>
                        <th className="py-2 px-3 w-16 text-center">REV</th>
                        <th className="py-2 px-3 w-36 text-center">الموقف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {selectedReport.submittedWorks.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-3 text-center text-slate-400">
                            لا توجد تقديمات مسجلة لهذا اليوم
                          </td>
                        </tr>
                      ) : (
                        selectedReport.submittedWorks.map((item: SubmittalItem, idx: number) => (
                          <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3 font-medium">{item.itemDescription}</td>
                            <td className="py-2 px-3 font-submittal font-mono text-left text-blue-600 dark:text-blue-400">
                              {item.submittalNumber}
                            </td>
                            <td className="py-2 px-3 text-center font-mono">{item.rev}</td>
                            <td className="py-2 px-3 text-center">
                              <StatusBadge status={item.status} size="sm" />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* TABLE 2: Received Works */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                    <span>الأعمال المستلمة (Received Works)</span>
                    <span className="text-xs font-mono bg-emerald-50 dark:bg-emerald-950 text-emerald-600 px-2 py-0.5 rounded-md">
                      {selectedReport.receivedWorks.length}
                    </span>
                  </h4>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      <tr>
                        <th className="py-2 px-3 w-10 text-center">م</th>
                        <th className="py-2 px-3">البند (Item Description)</th>
                        <th className="py-2 px-3 w-48 text-left">رقم التقديم (Submittal No.)</th>
                        <th className="py-2 px-3 w-16 text-center">REV</th>
                        <th className="py-2 px-3 w-36 text-center">الموقف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {selectedReport.receivedWorks.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-3 text-center text-slate-400">
                            لا توجد أعمال مستلمة مسجلة لهذا اليوم
                          </td>
                        </tr>
                      ) : (
                        selectedReport.receivedWorks.map((item: SubmittalItem, idx: number) => (
                          <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3 font-medium">{item.itemDescription}</td>
                            <td className="py-2 px-3 font-submittal font-mono text-left text-emerald-600 dark:text-emerald-400">
                              {item.submittalNumber}
                            </td>
                            <td className="py-2 px-3 text-center font-mono">{item.rev}</td>
                            <td className="py-2 px-3 text-center">
                              <StatusBadge status={item.status} size="sm" />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notes & Attachments */}
              {selectedReport.notes && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    ملاحظات مهندس الموقع:
                  </span>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    {selectedReport.notes}
                  </p>
                </div>
              )}

              <ReportAttachmentList
                reportId={selectedReport.id}
                attachments={selectedReport.attachments}
              />

              {/* Admin Feedback Box */}
              <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-2xl space-y-3">
                <label className="block text-xs font-bold text-blue-950 dark:text-blue-200">
                  إضافة ملاحظات وتوجيهات إدارة مراقبة الوثائق (DC Feedback)
                </label>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={adminFeedbackInput}
                  onChange={(e) => setAdminFeedbackInput(e.target.value)}
                  placeholder="اكتب التوجيهات أو الملاحظات التي ستظهر لمهندس الموقع..."
                  className="w-full p-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                />

                {feedbackErrorMsg && (
                  <div className="text-xs text-red-600 dark:text-red-400 font-bold">
                    {feedbackErrorMsg}
                  </div>
                )}

                {savedFeedbackMsg && (
                  <div className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                    <Check className="w-4 h-4" />
                    <span>تم حفظ الملاحظات وتحديث حالة التقرير بنجاح</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    disabled={isSavingFeedback}
                    onClick={() => handleSaveFeedback('reviewed')}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>اعتماد التقرير (Reviewed)</span>
                  </button>
                  <button
                    disabled={isSavingFeedback}
                    onClick={() => handleSaveFeedback('needs_revision')}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-60"
                  >
                    <Clock className="w-4 h-4" />
                    <span>طلب تعديل من الموقع</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={exportingSinglePdfId === selectedReport.id}
                  onClick={() => handleExportSingleReportPdf(selectedReport, 'download')}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition-colors"
                >
                  {exportingSinglePdfId === selectedReport.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileDown className="w-4 h-4" />
                  )}
                  <span>تصدير إلى PDF</span>
                </button>
                <button
                  onClick={() => exportDailyReportToExcel(selectedReport)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>تصدير نموذج إكسل (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = selectedReport;
                    setSelectedReport(null);
                    setEditingReport(target);
                  }}
                  className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:hover:bg-amber-900/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                  <span>تعديل التقرير</span>
                </button>
                <button
                  onClick={() => handleCopyReportSummary(selectedReport)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
                >
                  {copiedSummary ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedSummary ? 'تم نسخ الملخص!' : 'نسخ ملخص التقرير للمشاركة'}</span>
                </button>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PDF EXPORT MODAL (DAILY / MONTHLY / CUSTOM RANGE)
          ========================================================================= */}
      {isPdfModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 my-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 flex items-center justify-center">
                  <FileDown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                    تصدير تقارير الأعمال إلى PDF
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    استخراج تقارير يومية أو شهرية منسقة وجاهزة للطباعة والمشاركة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPdfModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {pdfError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-bold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{pdfError}</span>
              </div>
            )}

            {/* Period Mode Selector */}
            <div className="space-y-1.5 text-xs">
              <label className="block font-bold text-slate-700 dark:text-slate-200">
                نوع التقرير المطلوب
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'daily', label: 'تقرير يومي', sub: 'يوم محدد' },
                    { id: 'monthly', label: 'تقرير شهري', sub: 'ملخص شهر كامل' },
                    { id: 'range', label: 'فترة مخصصة', sub: 'من تاريخ إلى تاريخ' }
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setPdfMode(opt.id);
                      setPdfError(null);
                    }}
                    className={`p-2.5 rounded-xl border text-right cursor-pointer transition-colors ${
                      pdfMode === opt.id
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-slate-50 dark:bg-slate-800/70 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-rose-400'
                    }`}
                  >
                    <div className="font-bold text-xs">{opt.label}</div>
                    <div
                      className={`text-[10px] mt-0.5 ${
                        pdfMode === opt.id ? 'text-rose-100' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {opt.sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Period Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {pdfMode === 'daily' && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    تاريخ التقرير اليومي
                  </label>
                  <input
                    type="date"
                    value={pdfDate}
                    onChange={(e) => setPdfDate(e.target.value)}
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono font-bold dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              )}

              {pdfMode === 'monthly' && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    الشهر والسنة
                  </label>
                  <input
                    type="month"
                    value={pdfMonth}
                    onChange={(e) => setPdfMonth(e.target.value)}
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono font-bold dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              )}

              {pdfMode === 'range' && (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                      من تاريخ
                    </label>
                    <input
                      type="date"
                      value={pdfFromDate}
                      onChange={(e) => setPdfFromDate(e.target.value)}
                      className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono font-bold dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                      إلى تاريخ
                    </label>
                    <input
                      type="date"
                      value={pdfToDate}
                      onChange={(e) => setPdfToDate(e.target.value)}
                      className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono font-bold dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </>
              )}

              <div className={pdfMode === 'range' ? 'sm:col-span-2' : ''}>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  نطاق المشروع
                </label>
                <select
                  value={pdfProjectId}
                  onChange={(e) => setPdfProjectId(e.target.value)}
                  className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="all">كافة المشاريع ({projects.length})</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Live Match Summary Box */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  ملخص المحتوى الذي سيتم استخراجه:
                </span>
                <span
                  className={`font-mono font-extrabold tabular-nums ${
                    pdfStatsPreview.reportsCount > 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {pdfStatsPreview.reportsCount} تقرير مطابق
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-mono tabular-nums">
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700">
                  <div className="text-slate-500 dark:text-slate-400 font-sans">المشاريع</div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                    {pdfStatsPreview.projectsCount}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700">
                  <div className="text-slate-500 dark:text-slate-400 font-sans">الأعمال المقدمة</div>
                  <div className="text-sm font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">
                    {pdfStatsPreview.submitted}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700">
                  <div className="text-slate-500 dark:text-slate-400 font-sans">الأعمال المستلمة</div>
                  <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {pdfStatsPreview.received}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isGeneratingPdf || pdfStatsPreview.reportsCount === 0}
                onClick={() => handleRunBatchPdfExport('download')}
                className="flex-1 min-h-[44px] px-4 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                {isGeneratingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4" />
                )}
                <span>{isGeneratingPdf ? 'جاري إنشاء ملف PDF...' : 'تحميل ملف PDF'}</span>
              </button>

              <button
                type="button"
                disabled={isGeneratingPdf || pdfStatsPreview.reportsCount === 0}
                onClick={() => handleRunBatchPdfExport('share')}
                className="min-h-[44px] px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Share2 className="w-4 h-4" />
                <span>مشاركة</span>
              </button>

              <button
                type="button"
                disabled={isGeneratingPdf || pdfStatsPreview.reportsCount === 0}
                onClick={() => handleRunBatchPdfExport('print')}
                className="min-h-[44px] px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {editingReport && (
        <EditDailyReportModal
          report={editingReport}
          currentUser={currentUser}
          projects={projects}
          onClose={() => setEditingReport(null)}
          onSaved={(updatedTitle) => {
            setEditingReport(null);
            setEditSuccessMsg(`تم تعديل وحفظ التقرير اليومي (${updatedTitle}) بنجاح.`);
            setTimeout(() => setEditSuccessMsg(null), 4000);
          }}
        />
      )}
    </div>
  );
};
