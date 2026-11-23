import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Save,
  Paperclip,
  AlertCircle,
  MessageSquare,
  Loader2,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon
} from 'lucide-react';
import {
  DailyReport,
  Project,
  ReportAttachment,
  SubmittalItem,
  SubmittalStatusCode,
  UserProfile
} from '../../types';
import {
  SUBMITTAL_STATUS_CONFIG,
  MAX_REPORT_ATTACHMENTS,
  MAX_REPORT_ATTACHMENT_SIZE_BYTES
} from '../../config';
import { getAccessibleProjects } from '../../utils/accessControl';
import {
  dataService,
  formatFirestoreError,
  ReportUploadProgress
} from '../../services/dataService';
import {
  prepareReportAttachmentFile,
  PreparedReportAttachment,
  formatFileSize,
  getReportAttachmentKind
} from '../../utils/pdfUtils';

interface Props {
  report: DailyReport;
  currentUser: UserProfile;
  projects: Project[];
  onClose: () => void;
  onSaved: (updatedTitle: string) => void;
}

const createEmptyRow = (prefix: string, rowNumber: number, status: SubmittalStatusCode): SubmittalItem => ({
  id: `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
  rowNumber,
  itemDescription: '',
  submittalNumber: '',
  rev: 0,
  status
});

export const EditDailyReportModal: React.FC<Props> = ({
  report,
  currentUser,
  projects,
  onClose,
  onSaved
}) => {
  const accessibleProjects = getAccessibleProjects(currentUser, projects);
  const projectOptions =
    accessibleProjects.length > 0
      ? accessibleProjects.some((p) => p.id === report.projectId)
        ? accessibleProjects
        : [
            {
              id: report.projectId,
              name: report.projectName,
              code: '',
              status: 'active' as const,
              createdAt: report.createdAt,
              updatedAt: report.updatedAt
            },
            ...accessibleProjects
          ]
      : [
          {
            id: report.projectId,
            name: report.projectName,
            code: '',
            status: 'active' as const,
            createdAt: report.createdAt,
            updatedAt: report.updatedAt
          }
        ];

  const [selectedProjectId, setSelectedProjectId] = useState<string>(report.projectId);
  const [reportDate, setReportDate] = useState<string>(report.reportDate);
  const [submittedWorks, setSubmittedWorks] = useState<SubmittalItem[]>(() =>
    report.submittedWorks.length > 0
      ? report.submittedWorks.map((item, idx) => ({ ...item, rowNumber: idx + 1 }))
      : [createEmptyRow('sub', 1, 'W')]
  );
  const [receivedWorks, setReceivedWorks] = useState<SubmittalItem[]>(() =>
    report.receivedWorks.length > 0
      ? report.receivedWorks.map((item, idx) => ({ ...item, rowNumber: idx + 1 }))
      : [createEmptyRow('rec', 1, 'A')]
  );
  const [notes, setNotes] = useState<string>(report.notes || '');
  const [attachments, setAttachments] = useState<ReportAttachment[]>(report.attachments || []);
  const [pendingNewAttachments, setPendingNewAttachments] = useState<PreparedReportAttachment[]>([]);
  const [isPreparingAttachments, setIsPreparingAttachments] = useState<boolean>(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<ReportUploadProgress | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const statusOptions: SubmittalStatusCode[] = ['W', 'A', 'B', 'C', 'D'];

  const addSubmittedRow = () => {
    setSubmittedWorks((prev) => [...prev, createEmptyRow('sub', prev.length + 1, 'W')]);
  };

  const updateSubmittedRow = <K extends keyof SubmittalItem>(
    index: number,
    field: K,
    value: SubmittalItem[K]
  ) => {
    setSubmittedWorks((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const removeSubmittedRow = (index: number) => {
    setSubmittedWorks((prev) => {
      const filtered = prev.filter((_, i) => i !== index);
      return filtered.map((item, idx) => ({ ...item, rowNumber: idx + 1 }));
    });
  };

  const addReceivedRow = () => {
    setReceivedWorks((prev) => [...prev, createEmptyRow('rec', prev.length + 1, 'A')]);
  };

  const updateReceivedRow = <K extends keyof SubmittalItem>(
    index: number,
    field: K,
    value: SubmittalItem[K]
  ) => {
    setReceivedWorks((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const removeReceivedRow = (index: number) => {
    setReceivedWorks((prev) => {
      const filtered = prev.filter((_, i) => i !== index);
      return filtered.map((item, idx) => ({ ...item, rowNumber: idx + 1 }));
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setAttachmentError(null);
    const files = Array.from(fileList);
    const currentTotal = attachments.length + pendingNewAttachments.length;
    const remainingSlots = MAX_REPORT_ATTACHMENTS - currentTotal;

    if (remainingSlots <= 0) {
      setAttachmentError(`الحد الأقصى للمرفقات هو ${MAX_REPORT_ATTACHMENTS} ملفات في التقرير الواحد.`);
      e.target.value = '';
      return;
    }

    const toProcess = files.slice(0, remainingSlots);
    const skippedCount = files.length - toProcess.length;

    setIsPreparingAttachments(true);
    try {
      const preparedItems: PreparedReportAttachment[] = [];
      const errors: string[] = [];

      for (const file of toProcess) {
        try {
          const prepared = await prepareReportAttachmentFile(file);
          preparedItems.push(prepared);
        } catch (err) {
          errors.push(formatFirestoreError(err, `تعذر تجهيز الملف «${file.name}».`));
        }
      }

      if (preparedItems.length > 0) {
        setPendingNewAttachments((prev) => [...prev, ...preparedItems].slice(0, MAX_REPORT_ATTACHMENTS));
      }

      if (skippedCount > 0) {
        errors.push(
          `تم تجاهل ${skippedCount} ملف إضافي لأن الحد الأقصى هو ${MAX_REPORT_ATTACHMENTS} مرفقات للتقرير الواحد.`
        );
      }
      if (errors.length > 0) {
        setAttachmentError(errors.join(' '));
      }
    } finally {
      setIsPreparingAttachments(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const project = projectOptions.find((p) => p.id === selectedProjectId);
    if (!project) {
      setValidationError('يرجى اختيار المشروع أولاً.');
      return;
    }

    const validSubmitted = submittedWorks
      .filter((s) => s.itemDescription.trim() || s.submittalNumber.trim())
      .map((s, idx) => ({ ...s, rowNumber: idx + 1 }));
    const validReceived = receivedWorks
      .filter((r) => r.itemDescription.trim() || r.submittalNumber.trim())
      .map((r, idx) => ({ ...r, rowNumber: idx + 1 }));

    if (validSubmitted.length === 0 && validReceived.length === 0) {
      setValidationError('يرجى إضافة بند واحد على الأقل في جدول الأعمال المقدمة أو المستلمة.');
      return;
    }

    const missingSubmittalNo = [...validSubmitted, ...validReceived].some(
      (item) => !item.submittalNumber.trim()
    );
    if (missingSubmittalNo) {
      setValidationError('يرجى إدخال رقم التقديم (Submittal Number) لجميع البنود المسجلة.');
      return;
    }

    setIsSaving(true);
    setUploadProgress(
      pendingNewAttachments.length > 0
        ? {
            percent: 5,
            currentFileIndex: 1,
            totalFiles: pendingNewAttachments.length,
            currentFileName: pendingNewAttachments[0].name,
            uploadedChunks: 0,
            totalChunks: pendingNewAttachments.length,
            uploadedBytes: 0,
            totalBytes: pendingNewAttachments.reduce((sum, a) => sum + a.size, 0),
            stage: 'uploading'
          }
        : null
    );
    try {
      const ok = await dataService.updateDailyReport(
        report.id,
        {
          projectId: project.id,
          projectName: project.name,
          reportDate,
          submittedWorks: validSubmitted,
          receivedWorks: validReceived,
          notes: notes.trim(),
          attachments: attachments.slice(0, MAX_REPORT_ATTACHMENTS)
        },
        pendingNewAttachments,
        (progress) => setUploadProgress(progress)
      );

      if (ok) {
        onSaved(`${project.name} (${reportDate})`);
      } else {
        setValidationError('تعذر العثور على التقرير لتحديثه.');
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'DAILY_REPORT_ALREADY_EXISTS') {
        setValidationError(
          'يوجد بالفعل تقرير يومي آخر لهذا المشروع في نفس التاريخ المحدد. يُسمح بتقرير واحد يومياً فقط لكل مشروع.'
        );
      } else {
        setValidationError(formatFirestoreError(err));
      }
    } finally {
      setIsSaving(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col my-auto overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                تعديل تقرير الأعمال اليومي
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                {report.projectName} — {report.reportDate}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg cursor-pointer disabled:opacity-50"
            aria-label="إغلاق نافذة التعديل"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {report.adminFeedback && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
              <MessageSquare className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">ملاحظات الإدارة السابقة على هذا التقرير:</span>
                <p className="mt-0.5 leading-relaxed">{report.adminFeedback}</p>
              </div>
            </div>
          )}

          {report.status === 'reviewed' && (
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                ملاحظة: بعد حفظ التعديلات ستعود حالة التقرير إلى «قيد المراجعة لدى DC» ليتم اعتماد النسخة المحدثة.
              </span>
            </div>
          )}

          {validationError && (
            <div className="p-3.5 bg-red-50 dark:bg-red-950/70 border border-red-300 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-xs sm:text-sm flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Project & Date Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                المشروع / الموقع <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full h-11 px-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
              >
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.code ? ` (${p.code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                تاريخ التقرير <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="w-full h-11 px-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
              />
            </div>
          </div>

          {/* Submitted Works Editable Table */}
          <div className="rounded-2xl p-4 border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  الأعمال المقدمة (Submitted Works)
                </h4>
              </div>
              <button
                type="button"
                onClick={addSubmittedRow}
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة سطر</span>
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <table className="w-full text-right border-collapse min-w-[680px]">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 text-xs font-bold border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2 px-3 w-10 text-center">م</th>
                    <th className="py-2 px-3 min-w-[200px]">البند (Item Description)</th>
                    <th className="py-2 px-3 w-52 text-left">رقم التقديم (Submittal No.)</th>
                    <th className="py-2 px-3 w-20 text-center">REV</th>
                    <th className="py-2 px-3 w-36 text-center">الموقف</th>
                    <th className="py-2 px-2 w-12 text-center">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs sm:text-sm">
                  {submittedWorks.map((row, index) => (
                    <tr key={row.id}>
                      <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">
                        {index + 1}
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={row.itemDescription}
                          onChange={(e) =>
                            updateSubmittedRow(index, 'itemDescription', e.target.value)
                          }
                          placeholder="وصف البند..."
                          className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={row.submittalNumber}
                          onChange={(e) =>
                            updateSubmittedRow(index, 'submittalNumber', e.target.value)
                          }
                          placeholder="MAS_RAV_IR_STR_0055"
                          className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-submittal font-mono text-left"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="number"
                          min="0"
                          max="99"
                          value={row.rev}
                          onChange={(e) =>
                            updateSubmittedRow(index, 'rev', parseInt(e.target.value) || 0)
                          }
                          className="w-16 px-2 py-1.5 text-xs text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-mono"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <select
                          value={row.status}
                          onChange={(e) =>
                            updateSubmittedRow(
                              index,
                              'status',
                              e.target.value as SubmittalStatusCode
                            )
                          }
                          className={`w-full py-1.5 px-2 text-xs font-semibold rounded-lg border focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                            SUBMITTAL_STATUS_CONFIG[row.status]?.badgeClass || ''
                          }`}
                        >
                          {statusOptions.map((code) => (
                            <option
                              key={code}
                              value={code}
                              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                            >
                              {code} - {SUBMITTAL_STATUS_CONFIG[code].labelAr}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeSubmittedRow(index)}
                          disabled={submittedWorks.length <= 1}
                          className="p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-30 cursor-pointer"
                          title="حذف السطر"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Received Works Editable Table */}
          <div className="rounded-2xl p-4 border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  الأعمال المستلمة (Received Works)
                </h4>
              </div>
              <button
                type="button"
                onClick={addReceivedRow}
                className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة سطر</span>
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <table className="w-full text-right border-collapse min-w-[680px]">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 text-xs font-bold border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2 px-3 w-10 text-center">م</th>
                    <th className="py-2 px-3 min-w-[200px]">البند (Item Description)</th>
                    <th className="py-2 px-3 w-52 text-left">رقم التقديم (Submittal No.)</th>
                    <th className="py-2 px-3 w-20 text-center">REV</th>
                    <th className="py-2 px-3 w-36 text-center">الموقف</th>
                    <th className="py-2 px-2 w-12 text-center">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs sm:text-sm">
                  {receivedWorks.map((row, index) => (
                    <tr key={row.id}>
                      <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">
                        {index + 1}
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={row.itemDescription}
                          onChange={(e) =>
                            updateReceivedRow(index, 'itemDescription', e.target.value)
                          }
                          placeholder="وصف البند..."
                          className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none dark:text-white"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={row.submittalNumber}
                          onChange={(e) =>
                            updateReceivedRow(index, 'submittalNumber', e.target.value)
                          }
                          placeholder="MAS_RAV_SD_STR_0055"
                          className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none dark:text-white font-submittal font-mono text-left"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="number"
                          min="0"
                          max="99"
                          value={row.rev}
                          onChange={(e) =>
                            updateReceivedRow(index, 'rev', parseInt(e.target.value) || 0)
                          }
                          className="w-16 px-2 py-1.5 text-xs text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none dark:text-white font-mono"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <select
                          value={row.status}
                          onChange={(e) =>
                            updateReceivedRow(
                              index,
                              'status',
                              e.target.value as SubmittalStatusCode
                            )
                          }
                          className={`w-full py-1.5 px-2 text-xs font-semibold rounded-lg border focus:ring-2 focus:ring-emerald-500 focus:outline-none ${
                            SUBMITTAL_STATUS_CONFIG[row.status]?.badgeClass || ''
                          }`}
                        >
                          {statusOptions.map((code) => (
                            <option
                              key={code}
                              value={code}
                              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                            >
                              {code} - {SUBMITTAL_STATUS_CONFIG[code].labelAr}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeReceivedRow(index)}
                          disabled={receivedWorks.length <= 1}
                          className="p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-30 cursor-pointer"
                          title="حذف السطر"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes & Attachments */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                ملاحظات عامة وتوضيحات الموقع (اختياري)
              </label>
              <textarea
                rows={3}
                maxLength={4000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="اكتب أي ملاحظات تتعلق بالتقرير..."
                className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
              />
            </div>

            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  المرفقات (PDF أو صور أو Excel)
                </label>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  بحد أقصى {formatFileSize(MAX_REPORT_ATTACHMENT_SIZE_BYTES)} للملف • حتى {MAX_REPORT_ATTACHMENTS} مرفقات ({attachments.length + pendingNewAttachments.length}/{MAX_REPORT_ATTACHMENTS})
                </span>
              </div>

              {attachmentError && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{attachmentError}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5">
                <label
                  className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border transition-colors ${
                    isPreparingAttachments ||
                    isSaving ||
                    attachments.length + pendingNewAttachments.length >= MAX_REPORT_ATTACHMENTS
                      ? 'bg-slate-100 dark:bg-slate-800/50 text-slate-400 border-slate-200 dark:border-slate-800 cursor-not-allowed'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 cursor-pointer'
                  }`}
                >
                  {isPreparingAttachments ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  ) : (
                    <Paperclip className="w-4 h-4" />
                  )}
                  <span>
                    {isPreparingAttachments ? 'جاري تجهيز الملف...' : 'إرفاق PDF أو صورة أو Excel'}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,.xlsx,.xls,.xlsm,.xlsb,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                    multiple
                    disabled={
                      isPreparingAttachments ||
                      isSaving ||
                      attachments.length + pendingNewAttachments.length >= MAX_REPORT_ATTACHMENTS
                    }
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                {attachments.map((att, idx) => {
                  const kind = getReportAttachmentKind(att);
                  return (
                    <div
                      key={att.id || `${att.name}-${idx}`}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-900 dark:text-blue-200"
                    >
                      {kind === 'pdf' ? (
                        <FileText className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      ) : kind === 'excel' ? (
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <ImageIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      )}
                      <span className="max-w-[150px] truncate font-semibold" dir="ltr">
                        {att.name}
                      </span>
                      {att.size && (
                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          ({formatFileSize(att.size)})
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() =>
                          setAttachments((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-slate-400 hover:text-red-500 cursor-pointer disabled:opacity-40"
                        title="إزالة المرفق"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}

                {pendingNewAttachments.map((att, idx) => (
                  <div
                    key={att.attachmentId}
                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-900 dark:text-emerald-200"
                  >
                    {att.kind === 'pdf' ? (
                      <FileText className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    ) : att.kind === 'excel' ? (
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <ImageIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    )}
                    <span className="max-w-[150px] truncate font-semibold" dir="ltr">
                      {att.name}
                    </span>
                    <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-300">
                      ({formatFileSize(att.size)} • جديد)
                    </span>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        setPendingNewAttachments((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-slate-400 hover:text-red-500 cursor-pointer disabled:opacity-40"
                      title="إزالة المرفق"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {isSaving && uploadProgress && (
            <div className="p-3.5 rounded-2xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-2 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-800 dark:text-blue-200 min-w-0">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="truncate">
                    {uploadProgress.stage === 'finalizing'
                      ? 'جاري حفظ تعديلات التقرير...'
                      : `جاري رفع المرفق ${uploadProgress.currentFileIndex} من ${uploadProgress.totalFiles}: ${uploadProgress.currentFileName}`}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-lg bg-blue-600 text-white text-xs font-extrabold font-mono shrink-0">
                  {uploadProgress.percent}%
                </span>
              </div>

              <div
                role="progressbar"
                aria-label="نسبة التقدم في رفع المرفقات الجديدة"
                aria-valuenow={uploadProgress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="w-full h-3 bg-blue-100 dark:bg-slate-800 rounded-full overflow-hidden border border-blue-200/80 dark:border-slate-700"
              >
                <div
                  className="h-full bg-gradient-to-l from-blue-600 via-blue-500 to-cyan-500 transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress.percent}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                <span className="font-mono" dir="ltr">
                  {formatFileSize(uploadProgress.uploadedBytes)} / {formatFileSize(uploadProgress.totalBytes)}
                </span>
                {uploadProgress.totalChunks > 1 && (
                  <span>
                    الأجزاء المرفوعة: <strong className="font-mono">{uploadProgress.uploadedChunks}</strong> من{' '}
                    <strong className="font-mono">{uploadProgress.totalChunks}</strong>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 cursor-pointer disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSaving || isPreparingAttachments}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {uploadProgress
                      ? `جاري الرفع (${uploadProgress.percent}%)...`
                      : 'جاري حفظ التعديلات...'}
                  </span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>حفظ تعديلات التقرير</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
