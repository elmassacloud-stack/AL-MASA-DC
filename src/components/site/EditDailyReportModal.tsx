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
  FileSpreadsheet
} from 'lucide-react';
import {
  DailyReport,
  Project,
  ReportAttachment,
  SubmittalItem,
  SubmittalStatusCode,
  UserProfile
} from '../../types';
import { SUBMITTAL_STATUS_CONFIG } from '../../config';
import { getAccessibleProjects } from '../../utils/accessControl';
import { dataService } from '../../services/dataService';

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const fakeUrl = URL.createObjectURL(file);
      setAttachments((prev) => {
        if (prev.length >= 20) return prev;
        return [
          ...prev,
          {
            name: file.name,
            url: fakeUrl,
            size: file.size,
            type: file.type
          }
        ];
      });
    });
    e.target.value = '';
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
    try {
      const ok = await dataService.updateDailyReport(report.id, {
        projectId: project.id,
        projectName: project.name,
        reportDate,
        submittedWorks: validSubmitted,
        receivedWorks: validReceived,
        notes: notes.trim(),
        attachments: attachments.slice(0, 20)
      });

      if (ok) {
        onSaved(`${project.name} (${reportDate})`);
      } else {
        setValidationError('تعذر العثور على التقرير لتحديثه.');
      }
    } catch {
      setValidationError('حدث خطأ أثناء حفظ تعديلات التقرير. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSaving(false);
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

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                المرفقات
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                <label className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl cursor-pointer border border-slate-200 dark:border-slate-700">
                  <Paperclip className="w-4 h-4" />
                  <span>إرفاق ملف أو صورة</span>
                  <input
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                {attachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-800 dark:text-blue-300"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    <span className="max-w-[150px] truncate">{att.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setAttachments((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-slate-400 hover:text-red-500 cursor-pointer"
                      title="إزالة المرفق"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

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
              disabled={isSaving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري حفظ التعديلات...</span>
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
