import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Paperclip,
  Clock,
  Sparkles,
  FileSpreadsheet,
  AlertCircle
} from 'lucide-react';
import {
  UserProfile,
  Project,
  SubmittalItem,
  SubmittalStatusCode,
  ReportAttachment
} from '../../types';
import { SUBMITTAL_STATUS_CONFIG } from '../../config';
import { dataService } from '../../services/dataService';
import { getTodayDateStr } from '../../seedData';

interface Props {
  currentUser: UserProfile;
  projects: Project[];
  onReportSubmitted?: () => void;
}

export const DailyReportForm: React.FC<Props> = ({
  currentUser,
  projects,
  onReportSubmitted
}) => {
  // Filter projects assigned to this user (or all if admin)
  const accessibleProjects =
    currentUser.role === 'admin'
      ? projects
      : projects.filter((p) => currentUser.assignedProjects.includes(p.id));

  // Default to first accessible project or 'proj-ravel-3'
  const defaultProjectId =
    accessibleProjects.find((p) => p.id === 'proj-ravel-3')?.id ||
    accessibleProjects[0]?.id ||
    '';

  const [selectedProjectId, setSelectedProjectId] = useState<string>(defaultProjectId);
  const [reportDate, setReportDate] = useState<string>(getTodayDateStr());
  const [notes, setNotes] = useState<string>('');
  const [attachments, setAttachments] = useState<ReportAttachment[]>([]);

  // Tables state
  const [submittedWorks, setSubmittedWorks] = useState<SubmittalItem[]>([
    {
      id: 'sub-new-1',
      rowNumber: 1,
      itemDescription: '',
      submittalNumber: '',
      rev: 0,
      status: 'W'
    }
  ]);

  const [receivedWorks, setReceivedWorks] = useState<SubmittalItem[]>([
    {
      id: 'rec-new-1',
      rowNumber: 1,
      itemDescription: '',
      submittalNumber: '',
      rev: 0,
      status: 'A'
    }
  ]);

  const [lastAutosave, setLastAutosave] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Load existing draft if present for this project
  useEffect(() => {
    if (!selectedProjectId) return;
    const draft = dataService.getReportDraft(selectedProjectId);
    if (draft && draft.data) {
      if (draft.data.submittedWorks && draft.data.submittedWorks.length > 0) {
        setSubmittedWorks(draft.data.submittedWorks);
      }
      if (draft.data.receivedWorks && draft.data.receivedWorks.length > 0) {
        setReceivedWorks(draft.data.receivedWorks);
      }
      if (draft.data.notes) {
        setNotes(draft.data.notes);
      }
      if (draft.data.reportDate) {
        setReportDate(draft.data.reportDate);
      }
      setLastAutosave(new Date(draft.savedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
    }
  }, [selectedProjectId]);

  // Periodic Local Autosave (every 5 seconds on change)
  useEffect(() => {
    if (!selectedProjectId) return;

    const timer = setTimeout(() => {
      // Only autosave if there is some typed input
      const hasContent =
        notes.trim() ||
        submittedWorks.some((s) => s.itemDescription.trim() || s.submittalNumber.trim()) ||
        receivedWorks.some((r) => r.itemDescription.trim() || r.submittalNumber.trim());

      if (hasContent) {
        dataService.saveReportDraft(selectedProjectId, {
          projectId: selectedProjectId,
          reportDate,
          submittedWorks,
          receivedWorks,
          notes
        });
        const now = new Date();
        setLastAutosave(
          now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [selectedProjectId, reportDate, submittedWorks, receivedWorks, notes]);

  // Handle row mutations for Submitted Works
  const addSubmittedRow = () => {
    setSubmittedWorks((prev) => [
      ...prev,
      {
        id: 'sub-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
        rowNumber: prev.length + 1,
        itemDescription: '',
        submittalNumber: '',
        rev: 0,
        status: 'W'
      }
    ]);
  };

  const updateSubmittedRow = (index: number, field: keyof SubmittalItem, value: any) => {
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

  // Handle row mutations for Received Works
  const addReceivedRow = () => {
    setReceivedWorks((prev) => [
      ...prev,
      {
        id: 'rec-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
        rowNumber: prev.length + 1,
        itemDescription: '',
        submittalNumber: '',
        rev: 0,
        status: 'A'
      }
    ]);
  };

  const updateReceivedRow = (index: number, field: keyof SubmittalItem, value: any) => {
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

  // File attachment handler (simulated or real file reader)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const fakeUrl = URL.createObjectURL(file);
      setAttachments((prev) => [
        ...prev,
        {
          name: file.name,
          url: fakeUrl,
          size: file.size,
          type: file.type
        }
      ]);
    });
  };

  // Quick fill sample data button for demonstration testing
  const loadQuickSample = () => {
    setSelectedProjectId('proj-ravel-3');
    setSubmittedWorks([
      {
        id: 'sub-sample-1',
        rowNumber: 1,
        itemDescription: 'Columns for hydrotherapy (أعمدة مبنى العلاج المائي)',
        submittalNumber: 'MAS_RAV_IR_STR_0055',
        rev: 1,
        status: 'W'
      }
    ]);
    setReceivedWorks([
      {
        id: 'rec-sample-1',
        rowNumber: 1,
        itemDescription: 'Columns for hydrotherapy (أعمدة مبنى العلاج المائي)',
        submittalNumber: 'MAS_RAV_SD_STR_0055',
        rev: 5,
        status: 'B'
      }
    ]);
    setNotes('تم تقديم استلام أعمال حدادة أعمدة العلاج المائي واستلام مخططات الشوب دروينج معتمدة بملاحظات.');
  };

  // Submit Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const project = projects.find((p) => p.id === selectedProjectId);
    if (!project) {
      setValidationError('يرجى اختيار المشروع أولاً.');
      return;
    }

    // Filter valid rows (having at least description or submittal number)
    const validSubmitted = submittedWorks.filter(
      (s) => s.itemDescription.trim() || s.submittalNumber.trim()
    );
    const validReceived = receivedWorks.filter(
      (r) => r.itemDescription.trim() || r.submittalNumber.trim()
    );

    if (validSubmitted.length === 0 && validReceived.length === 0) {
      setValidationError('يرجى إضافة بند واحد على الأقل في جدول الأعمال المقدمة أو المستلمة.');
      return;
    }

    // Check that submittal numbers are provided for entered rows
    const missingSubmittalNo = [...validSubmitted, ...validReceived].some(
      (item) => !item.submittalNumber.trim()
    );
    if (missingSubmittalNo) {
      setValidationError('يرجى إدخال رقم التقديم (Submittal Number) لجميع البنود المسجلة.');
      return;
    }

    // Save report
    dataService.saveReport({
      projectId: project.id,
      projectName: project.name,
      reportDate,
      senderId: currentUser.id,
      senderName: currentUser.displayName,
      senderEmail: currentUser.email,
      submittedWorks: validSubmitted,
      receivedWorks: validReceived,
      notes: notes.trim(),
      attachments,
      status: 'submitted'
    });

    setSubmitSuccess(true);
    setTimeout(() => {
      setSubmitSuccess(false);
      if (onReportSubmitted) {
        onReportSubmitted();
      }
    }, 1800);
  };

  const statusOptions: SubmittalStatusCode[] = ['W', 'A', 'B', 'C', 'D'];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Form Header Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                تقرير الأعمال اليومي (Daily Work Report)
              </h2>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium">
                نموذج إدارة مراقبة الوثائق (DC) لمطابقة وتقديم الأعمال المستلمة والمقدمة
              </p>
            </div>
          </div>

          {/* Quick Demo Fill & Autosave status */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {lastAutosave && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800">
                <Clock className="w-3.5 h-3.5" />
                <span>حفظ تلقائي {lastAutosave}</span>
              </span>
            )}
            <button
              type="button"
              onClick={loadQuickSample}
              className="text-xs px-2.5 py-1 rounded-md font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/80 dark:text-blue-300 dark:hover:bg-blue-900 transition-colors flex items-center gap-1 border border-blue-200 dark:border-blue-800 cursor-pointer"
              title="تعبئة بيانات تجريبية (مستشفى رافيل 3)"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>تعبئة نموذج تجريبي</span>
            </button>
          </div>
        </div>

        {/* Header Metadata Fields (Project, Date, Sender) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Project Dropdown */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              المشروع / الموقع <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full h-11 px-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
            >
              {accessibleProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              تاريخ التقرير <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="w-full h-11 px-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
            />
          </div>

          {/* Sender Name (Auto from login) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              مهندس الموقع / مرسل التقرير
            </label>
            <input
              type="text"
              readOnly
              value={currentUser.displayName}
              className="w-full h-11 px-3 text-sm bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-400 cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      {/* Validation or Success Banner */}
      {validationError && (
        <div className="p-3.5 bg-red-50 dark:bg-red-950/70 border border-red-300 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {submitSuccess && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-300 text-sm flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          <span className="font-bold">
            تم إرسال تقرير الأعمال اليومي بنجاح إلى إدارة مراقبة الوثائق!
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* =========================================================================
            TABLE 1: الأعمال المقدمة (Submitted Works)
            ========================================================================= */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-600" />
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                الأعمال المقدمة (Submitted Works)
              </h3>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full font-mono">
                {submittedWorks.length}
              </span>
            </div>
            <button
              type="button"
              onClick={addSubmittedRow}
              className="text-xs sm:text-sm px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة سطر</span>
            </button>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-right border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 text-xs font-bold border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2.5 px-3 w-12 text-center">م</th>
                  <th className="py-2.5 px-3 min-w-[200px]">البند (Item Description)</th>
                  <th className="py-2.5 px-3 w-56 text-left">
                    رقم التقديم (Submittal No. - LTR)
                  </th>
                  <th className="py-2.5 px-3 w-20 text-center">REV</th>
                  <th className="py-2.5 px-3 w-40 text-center">الموقف (Status)</th>
                  <th className="py-2.5 px-2 w-12 text-center">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {submittedWorks.map((row, index) => (
                  <tr
                    key={row.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {/* م (Auto Number) */}
                    <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">
                      {row.rowNumber}
                    </td>

                    {/* البند (Description) */}
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        placeholder="مثال: Columns for hydrotherapy (أعمدة مبنى العلاج المائي)"
                        value={row.itemDescription}
                        onChange={(e) => updateSubmittedRow(index, 'itemDescription', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                      />
                    </td>

                    {/* رقم التقديم (LTR font-mono) */}
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        placeholder="MAS_RAV_IR_STR_0055"
                        value={row.submittalNumber}
                        onChange={(e) => updateSubmittedRow(index, 'submittalNumber', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-submittal font-mono text-left tracking-wide"
                      />
                    </td>

                    {/* REV (Number) */}
                    <td className="py-2 px-3 text-center">
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={row.rev}
                        onChange={(e) => updateSubmittedRow(index, 'rev', parseInt(e.target.value) || 0)}
                        className="w-16 px-2 py-1.5 text-xs sm:text-sm text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-mono"
                      />
                    </td>

                    {/* الموقف (Status dropdown with color badge) */}
                    <td className="py-2 px-3 text-center">
                      <select
                        value={row.status}
                        onChange={(e) => updateSubmittedRow(index, 'status', e.target.value as SubmittalStatusCode)}
                        className={`w-full py-1.5 px-2 text-xs font-semibold rounded-lg border focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors ${
                          SUBMITTAL_STATUS_CONFIG[row.status]?.badgeClass || ''
                        }`}
                      >
                        {statusOptions.map((code) => (
                          <option key={code} value={code} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white">
                            {code} - {SUBMITTAL_STATUS_CONFIG[code].labelAr}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Delete action */}
                    <td className="py-2 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeSubmittedRow(index)}
                        disabled={submittedWorks.length <= 1}
                        className="p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors cursor-pointer"
                        title="حذف هذا السطر"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addSubmittedRow}
            className="w-full py-2.5 border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 rounded-xl text-xs sm:text-sm font-semibold text-blue-600 dark:text-blue-400 flex items-center justify-center gap-2 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ إضافة سطر في الأعمال المقدمة</span>
          </button>
        </div>

        {/* =========================================================================
            TABLE 2: الأعمال المستلمة (Received Works)
            ========================================================================= */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-600" />
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                الأعمال المستلمة (Received Works)
              </h3>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full font-mono">
                {receivedWorks.length}
              </span>
            </div>
            <button
              type="button"
              onClick={addReceivedRow}
              className="text-xs sm:text-sm px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة سطر</span>
            </button>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-right border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 text-xs font-bold border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2.5 px-3 w-12 text-center">م</th>
                  <th className="py-2.5 px-3 min-w-[200px]">البند (Item Description)</th>
                  <th className="py-2.5 px-3 w-56 text-left">
                    رقم التقديم (Submittal No. - LTR)
                  </th>
                  <th className="py-2.5 px-3 w-20 text-center">REV</th>
                  <th className="py-2.5 px-3 w-40 text-center">الموقف (Status)</th>
                  <th className="py-2.5 px-2 w-12 text-center">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {receivedWorks.map((row, index) => (
                  <tr
                    key={row.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {/* م (Auto Number) */}
                    <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">
                      {row.rowNumber}
                    </td>

                    {/* البند (Description) */}
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        placeholder="مثال: Columns for hydrotherapy (أعمدة مبنى العلاج المائي)"
                        value={row.itemDescription}
                        onChange={(e) => updateReceivedRow(index, 'itemDescription', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none dark:text-white"
                      />
                    </td>

                    {/* رقم التقديم (LTR font-mono) */}
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        placeholder="MAS_RAV_SD_STR_0055"
                        value={row.submittalNumber}
                        onChange={(e) => updateReceivedRow(index, 'submittalNumber', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none dark:text-white font-submittal font-mono text-left tracking-wide"
                      />
                    </td>

                    {/* REV (Number) */}
                    <td className="py-2 px-3 text-center">
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={row.rev}
                        onChange={(e) => updateReceivedRow(index, 'rev', parseInt(e.target.value) || 0)}
                        className="w-16 px-2 py-1.5 text-xs sm:text-sm text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none dark:text-white font-mono"
                      />
                    </td>

                    {/* الموقف (Status dropdown with color badge) */}
                    <td className="py-2 px-3 text-center">
                      <select
                        value={row.status}
                        onChange={(e) => updateReceivedRow(index, 'status', e.target.value as SubmittalStatusCode)}
                        className={`w-full py-1.5 px-2 text-xs font-semibold rounded-lg border focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors ${
                          SUBMITTAL_STATUS_CONFIG[row.status]?.badgeClass || ''
                        }`}
                      >
                        {statusOptions.map((code) => (
                          <option key={code} value={code} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white">
                            {code} - {SUBMITTAL_STATUS_CONFIG[code].labelAr}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Delete action */}
                    <td className="py-2 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeReceivedRow(index)}
                        disabled={receivedWorks.length <= 1}
                        className="p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors cursor-pointer"
                        title="حذف هذا السطر"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addReceivedRow}
            className="w-full py-2.5 border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-600 rounded-xl text-xs sm:text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-2 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ إضافة سطر في الأعمال المستلمة</span>
          </button>
        </div>

        {/* Notes and Attachments Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              ملاحظات عامة وتوضيحات الموقع (اختياري)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="اكتب أي ملاحظات تتعلق بظروف العمل، تأخير الاستشاري، أو تفاصيل خاصة ببنود اليوم..."
              className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
            />
          </div>

          {/* File Attachments */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              مرفقات أو صور إثبات (ملفات Transmittal أو صور الموقع)
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-semibold rounded-xl cursor-pointer border border-slate-200 dark:border-slate-700 transition-colors">
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
                  <span className="max-w-[140px] truncate">{att.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-slate-400 hover:text-red-500 cursor-pointer mr-1"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Submit Actions Button Bar */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm sm:text-base rounded-xl shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all touch-manipulation"
          >
            <Save className="w-5 h-5" />
            <span>إرسال التقرير اليومي للإدارة</span>
          </button>
        </div>
      </form>
    </div>
  );
};
