import React, { useState, useMemo, useRef } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Search,
  Download,
  SlidersHorizontal,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Eye,
  X,
  Trash2,
  FileCheck2,
  Clock,
  XCircle,
  Layers,
  Plus
} from 'lucide-react';
import { UserProfile, SubmittalStatusCode } from '../../types';
import { SUBMITTAL_STATUS_CONFIG } from '../../config';
import {
  parseDriveExcelWorkbook,
  autoDetectColumnMapping,
  extractLogRowsFromSheet,
  exportExtractedLogsToExcel,
  ParsedWorkbookData,
  LogColumnMapping,
  ExtractedLogRow,
  LogDocumentCategory,
  LOG_CATEGORY_META
} from '../../utils/driveLogParser';
import { formatFileSize, isExcelFile } from '../../utils/pdfUtils';

interface Props {
  currentUser: UserProfile;
}

interface UploadedExcelWorkbook {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  workbook: ParsedWorkbookData;
}

const MAPPING_FIELD_LABELS: { key: keyof LogColumnMapping; label: string }[] = [
  { key: 'submittalNumber', label: 'رقم التقديم / المرجع' },
  { key: 'docType', label: 'النوع (IR / MIR / SD)' },
  { key: 'description', label: 'وصف البند / الموضوع' },
  { key: 'discipline', label: 'التخصص' },
  { key: 'rev', label: 'REV' },
  { key: 'status', label: 'الموقف / كود الاعتماد' },
  { key: 'submissionDate', label: 'تاريخ التقديم' },
  { key: 'replyDate', label: 'تاريخ الرد' },
  { key: 'location', label: 'الموقع / الدور' },
  { key: 'remarks', label: 'ملاحظات' }
];

const ROWS_PER_PAGE = 100;

export const AdminExcelLogsView: React.FC<Props> = ({ currentUser }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Uploaded local workbooks state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedExcelWorkbook[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Active sheet & column mapping state
  const [activeSheetIdx, setActiveSheetIdx] = useState<number>(0);
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(0);
  const [columnMapping, setColumnMapping] = useState<LogColumnMapping>({
    submittalNumber: -1,
    docType: -1,
    description: -1,
    discipline: -1,
    rev: -1,
    status: -1,
    submissionDate: -1,
    replyDate: -1,
    location: -1,
    remarks: -1
  });
  const [showMappingPanel, setShowMappingPanel] = useState<boolean>(false);

  // Table Filters
  const [tableSearch, setTableSearch] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDiscipline, setFilterDiscipline] = useState<string>('all');
  const [visibleCount, setVisibleCount] = useState<number>(ROWS_PER_PAGE);
  const [inspectRow, setInspectRow] = useState<ExtractedLogRow | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 3500);
  };

  if (currentUser.role !== 'admin') {
    return null;
  }

  const applySheetSelection = (wb: ParsedWorkbookData, sheetIndex: number) => {
    const sheet = wb.sheets[sheetIndex];
    if (!sheet) return;
    setActiveSheetIdx(sheetIndex);
    setHeaderRowIndex(sheet.detectedHeaderRowIndex);
    const headers = sheet.rawRows[sheet.detectedHeaderRowIndex] || [];
    setColumnMapping(autoDetectColumnMapping(headers));
    setTableSearch('');
    setFilterCategory('all');
    setFilterStatus('all');
    setFilterDiscipline('all');
    setVisibleCount(ROWS_PER_PAGE);
  };

  const selectWorkbookEntry = (entry: UploadedExcelWorkbook) => {
    setActiveFileId(entry.id);
    const preferredIdx = entry.workbook.sheets.findIndex((s) =>
      /(ir|mir|submittal|log|register|tracker|تقديم)/i.test(s.name)
    );
    applySheetSelection(entry.workbook, preferredIdx >= 0 ? preferredIdx : 0);
  };

  const handleLocalFilesSelected = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setUploadError(null);
    setIsParsing(true);

    const newlyLoaded: UploadedExcelWorkbook[] = [];
    const errors: string[] = [];

    for (const file of files) {
      if (!isExcelFile(file)) {
        errors.push(`الملف «${file.name}» ليس ملف Excel مدعوماً (.xlsx / .xls / .csv).`);
        continue;
      }
      if (file.size <= 0) {
        errors.push(`الملف «${file.name}» فارغ ولا يمكن قراءته.`);
        continue;
      }

      try {
        const buffer = await file.arrayBuffer();
        const parsed = parseDriveExcelWorkbook(buffer, file.name);
        if (parsed.sheets.length === 0) {
          errors.push(`لم يتم العثور على أوراق عمل داخل «${file.name}».`);
          continue;
        }
        newlyLoaded.push({
          id: 'xl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
          fileName: file.name,
          fileSize: file.size,
          uploadedAt: new Date().toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit'
          }),
          workbook: parsed
        });
      } catch {
        errors.push(`تعذر قراءة الملف «${file.name}». تأكد من أنه ملف Excel سليم وغير محمي بكلمة مرور.`);
      }
    }

    if (newlyLoaded.length > 0) {
      setUploadedFiles((prev) => [...newlyLoaded, ...prev]);
      selectWorkbookEntry(newlyLoaded[0]);
      showToast(
        newlyLoaded.length === 1
          ? `تم رفع واستخراج بيانات «${newlyLoaded[0].fileName}» بنجاح.`
          : `تم رفع واستخراج بيانات ${newlyLoaded.length} ملفات Excel بنجاح.`
      );
    }

    if (errors.length > 0) {
      setUploadError(errors.join(' '));
    }

    setIsParsing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveUploadedFile = (id: string) => {
    setUploadedFiles((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (activeFileId === id) {
        if (next.length > 0) {
          selectWorkbookEntry(next[0]);
        } else {
          setActiveFileId(null);
        }
      }
      return next;
    });
  };

  const activeEntry = useMemo(
    () => uploadedFiles.find((f) => f.id === activeFileId) || null,
    [uploadedFiles, activeFileId]
  );
  const workbook = activeEntry?.workbook || null;
  const activeSheet = workbook?.sheets[activeSheetIdx] || null;

  const handleHeaderRowChange = (newRowIdx: number) => {
    if (!activeSheet) return;
    setHeaderRowIndex(newRowIdx);
    const headers = activeSheet.rawRows[newRowIdx] || [];
    setColumnMapping(autoDetectColumnMapping(headers));
  };

  const activeHeaders = useMemo(() => {
    if (!activeSheet) return [];
    return (activeSheet.rawRows[headerRowIndex] || []).map((h, i) => h.trim() || `عمود ${i + 1}`);
  }, [activeSheet, headerRowIndex]);

  const extractedRows = useMemo(() => {
    if (!activeSheet) return [];
    return extractLogRowsFromSheet(activeSheet, headerRowIndex, columnMapping);
  }, [activeSheet, headerRowIndex, columnMapping]);

  const uniqueDisciplines = useMemo(() => {
    const set = new Set<string>();
    for (const row of extractedRows) {
      if (row.discipline) set.add(row.discipline);
    }
    return Array.from(set).sort();
  }, [extractedRows]);

  const filteredRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return extractedRows.filter((row) => {
      if (filterCategory !== 'all' && row.docType !== filterCategory) return false;
      if (filterStatus !== 'all' && row.statusCode !== filterStatus) return false;
      if (filterDiscipline !== 'all' && row.discipline !== filterDiscipline) return false;
      if (q) {
        const hay = [
          row.submittalNumber,
          row.description,
          row.discipline,
          row.location,
          row.remarks,
          row.statusRaw,
          row.docTypeRaw
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [extractedRows, filterCategory, filterStatus, filterDiscipline, tableSearch]);

  const metrics = useMemo(() => {
    let irCount = 0;
    let mirCount = 0;
    let approvedCount = 0;
    let pendingCount = 0;
    let rejectedCount = 0;

    for (const r of extractedRows) {
      if (r.docType === 'IR') irCount += 1;
      else if (r.docType === 'MIR') mirCount += 1;

      if (r.statusCode === 'A' || r.statusCode === 'B') approvedCount += 1;
      else if (r.statusCode === 'W') pendingCount += 1;
      else if (r.statusCode === 'C' || r.statusCode === 'D') rejectedCount += 1;
    }

    const total = extractedRows.length;
    const approvalRate = total > 0 ? Math.round((approvedCount / total) * 100) : 0;

    return { total, irCount, mirCount, approvedCount, pendingCount, rejectedCount, approvalRate };
  }, [extractedRows]);

  const handleExportFiltered = () => {
    if (!workbook || !activeSheet || filteredRows.length === 0) return;
    exportExtractedLogsToExcel(filteredRows, workbook.fileName, activeSheet.name);
    showToast(`تم تصدير ${filteredRows.length} سجل إلى ملف Excel بنجاح.`);
  };

  const renderStatusBadge = (code: SubmittalStatusCode | 'OTHER', raw: string) => {
    if (code !== 'OTHER' && SUBMITTAL_STATUS_CONFIG[code]) {
      const meta = SUBMITTAL_STATUS_CONFIG[code];
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${meta.bgLight} ${meta.textColor} ${meta.borderClass}`}
          title={raw || meta.labelAr}
        >
          <span className="font-mono">{meta.code}</span>
          <span>• {meta.labelAr}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
        {raw || 'غير محدد'}
      </span>
    );
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-16">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".xlsx,.xls,.xlsm,.xlsb,.csv"
        onChange={(e) => {
          if (e.target.files) {
            handleLocalFilesSelected(e.target.files);
          }
        }}
        className="hidden"
      />

      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-xl font-bold text-slate-900 dark:text-white leading-snug">
                استخراج بيانات Logs التقديمات والـ IR / MIR
              </h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                للأدمن فقط
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium mt-1 leading-relaxed">
              ارفع شيتات Excel (.xlsx) مباشرة من جهازك لتحليل التقديمات والـ IR والـ MIR والفلترة وتصدير النتائج
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={isParsing}
          onClick={() => fileInputRef.current?.click()}
          className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors shrink-0 touch-manipulation"
        >
          {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          <span>رفع شيت Excel من الجهاز</span>
        </button>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Error Alert */}
      {uploadError && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-bold flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{uploadError}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="text-rose-500 hover:text-rose-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload Dropzone & Loaded Files Switcher */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files?.length) {
              handleLocalFilesSelected(e.dataTransfer.files);
            }
          }}
          onClick={() => {
            if (!isParsing) fileInputRef.current?.click();
          }}
          className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-colors cursor-pointer ${
            isDragging
              ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40'
              : 'border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 bg-slate-50/70 dark:bg-slate-800/40'
          }`}
        >
          {isParsing ? (
            <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-sm py-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>جاري قراءة واستخراج بيانات شيتات Excel...</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                <Upload className="w-6 h-6" />
              </div>
              <div className="font-bold text-sm text-slate-800 dark:text-white">
                اضغط لاختيار شيتات Excel من جهازك أو اسحب الملفات وأفلتها هنا
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                يدعم رفع ملف واحد أو عدة ملفات معاً بصيغ <span dir="ltr" className="font-mono font-bold">.xlsx / .xls / .xlsm / .csv</span> — المعالجة تتم مباشرة وبسرعة داخل المتصفح
              </div>
            </div>
          )}
        </div>

        {/* Uploaded Files Strip */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
              الشيتات المرفوعة في هذه الجلسة ({uploadedFiles.length}):
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {uploadedFiles.map((item) => {
                const isSelected = activeFileId === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => selectWorkbookEntry(item)}
                    className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-400 dark:border-blue-600 ring-1 ring-blue-400/50'
                        : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div
                          className="text-xs font-bold text-slate-900 dark:text-white truncate"
                          title={item.fileName}
                        >
                          {item.fileName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono">{formatFileSize(item.fileSize)}</span>
                          <span>•</span>
                          <span>{item.workbook.sheets.length} ورقة</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveUploadedFile(item.id);
                      }}
                      title="إزالة الملف"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer shrink-0 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          EXTRACTED SUBMITTALS & IR / MIR LOG WORKBENCH
          ===================================================================== */}
      {workbook && activeSheet && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          {/* Active Workbook Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                  {workbook.fileName}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  الورقة النشطة:{' '}
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {activeSheet.name}
                  </span>{' '}
                  • إجمالي الصفوف المستخرجة:{' '}
                  <span className="font-mono font-bold">{extractedRows.length}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <button
                type="button"
                onClick={() => setShowMappingPanel((prev) => !prev)}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition-colors ${
                  showMappingPanel
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>ضبط الأعمدة</span>
              </button>

              <button
                type="button"
                disabled={filteredRows.length === 0}
                onClick={handleExportFiltered}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تصدير النتائج Excel ({filteredRows.length})</span>
              </button>
            </div>
          </div>

          {/* Sheet Tabs */}
          {workbook.sheets.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 shrink-0 ml-1">
                <Layers className="w-3.5 h-3.5" />
                <span>أوراق الشيت:</span>
              </span>
              {workbook.sheets.map((s, idx) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => applySheetSelection(workbook, idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                    activeSheetIdx === idx
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

          {/* Collapsible Column Mapping Panel */}
          {showMappingPanel && (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-800 dark:text-white">
                  تخصيص صف العناوين وربط أعمدة الشيت (في حال اختلاف مسميات الأعمدة):
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <label className="font-bold text-slate-600 dark:text-slate-300">
                    صف العناوين (Header Row):
                  </label>
                  <select
                    value={headerRowIndex}
                    onChange={(e) => handleHeaderRowChange(Number(e.target.value))}
                    className="h-9 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 font-mono font-bold dark:text-white"
                  >
                    {activeSheet.rawRows.slice(0, 15).map((r, rIdx) => (
                      <option key={rIdx} value={rIdx}>
                        صف {rIdx + 1} —{' '}
                        {r
                          .filter((c) => c.trim())
                          .slice(0, 3)
                          .join(' | ')
                          .slice(0, 40) || '(فارغ)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
                {MAPPING_FIELD_LABELS.map(({ key, label }) => (
                  <div key={key}>
                    <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                      {label}
                    </label>
                    <select
                      value={columnMapping[key]}
                      onChange={(e) =>
                        setColumnMapping((prev) => ({
                          ...prev,
                          [key]: Number(e.target.value)
                        }))
                      }
                      className="w-full h-9 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-xs dark:text-white"
                    >
                      <option value={-1}>— غير مرتبط —</option>
                      {activeHeaders.map((h, colIdx) => (
                        <option key={colIdx} value={colIdx}>
                          {colIdx + 1}. {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                إجمالي البنود
              </span>
              <div className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white mt-0.5">
                {metrics.total}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
              <span className="text-[11px] font-bold text-blue-700 dark:text-blue-400">
                IR / MIR المستخرجة
              </span>
              <div className="text-lg font-extrabold font-mono text-blue-800 dark:text-blue-200 mt-1 flex items-center gap-2">
                <span>IR: {metrics.irCount}</span>
                <span className="text-blue-300 dark:text-blue-700">|</span>
                <span>MIR: {metrics.mirCount}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
              <div className="flex items-center justify-between text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                <span>معتمد (A / B)</span>
                <FileCheck2 className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-extrabold font-mono text-emerald-700 dark:text-emerald-300">
                  {metrics.approvedCount}
                </span>
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  ({metrics.approvalRate}%)
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
              <div className="flex items-center justify-between text-[11px] font-bold text-amber-700 dark:text-amber-400">
                <span>تحت المراجعة (W)</span>
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div className="text-2xl font-extrabold font-mono text-amber-700 dark:text-amber-300 mt-0.5">
                {metrics.pendingCount}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
              <div className="flex items-center justify-between text-[11px] font-bold text-rose-700 dark:text-rose-400">
                <span>مرفوض / تعديل (C / D)</span>
                <XCircle className="w-3.5 h-3.5" />
              </div>
              <div className="text-2xl font-extrabold font-mono text-rose-700 dark:text-rose-300 mt-0.5">
                {metrics.rejectedCount}
              </div>
            </div>
          </div>

          {/* Filters Toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => {
                  setTableSearch(e.target.value);
                  setVisibleCount(ROWS_PER_PAGE);
                }}
                placeholder="بحث برقم التقديم، الوصف، الموقع..."
                className="w-full h-10 pr-9 pl-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={filterCategory}
              onChange={(e) => {
                setFilterCategory(e.target.value);
                setVisibleCount(ROWS_PER_PAGE);
              }}
              className="h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">كل الأنواع (IR / MIR / الكل)</option>
              {(Object.keys(LOG_CATEGORY_META) as LogDocumentCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {LOG_CATEGORY_META[cat].labelAr}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setVisibleCount(ROWS_PER_PAGE);
              }}
              className="h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">كل مواقف الاعتماد</option>
              <option value="A">A — معتمد</option>
              <option value="B">B — معتمد بملاحظات</option>
              <option value="C">C — يُعاد التقديم</option>
              <option value="D">D — مرفوض</option>
              <option value="W">W — تحت المراجعة</option>
              <option value="OTHER">أخرى</option>
            </select>

            <select
              value={filterDiscipline}
              onChange={(e) => {
                setFilterDiscipline(e.target.value);
                setVisibleCount(ROWS_PER_PAGE);
              }}
              className="h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">كل التخصصات ({uniqueDisciplines.length})</option>
              {uniqueDisciplines.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Extracted Data Table */}
          {filteredRows.length === 0 ? (
            <div className="py-10 text-center text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
              لا توجد صفوف مطابقة للفلاتر الحالية. يمكنك تعديل الفلاتر أو الضغط على «ضبط الأعمدة».
            </div>
          ) : (
            <div className="space-y-3">
              <div className="sm:hidden text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>اسحب الجدول أفقياً لعرض باقي الأعمدة</span>
                <span className="font-mono font-bold">{filteredRows.length} سجل</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-xs text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
                      <th className="px-3 py-2.5 whitespace-nowrap">صف</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">رقم التقديم / المرجع</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">النوع</th>
                      <th className="px-3 py-2.5 min-w-[220px]">وصف البند</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">التخصص</th>
                      <th className="px-3 py-2.5 whitespace-nowrap text-center">REV</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">الموقف</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">تاريخ التقديم</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">تاريخ الرد</th>
                      <th className="px-3 py-2.5 whitespace-nowrap text-center">تفاصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {filteredRows.slice(0, visibleCount).map((row) => {
                      const catMeta = LOG_CATEGORY_META[row.docType];
                      return (
                        <tr
                          key={row.rowIndex}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="px-3 py-2.5 font-mono text-slate-400 whitespace-nowrap">
                            {row.rowIndex}
                          </td>
                          <td
                            dir="ltr"
                            className="px-3 py-2.5 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap text-left"
                          >
                            {row.submittalNumber || '—'}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold border ${catMeta.badgeClass}`}
                            >
                              {catMeta.shortLabel}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-800 dark:text-slate-200 max-w-md">
                            <div className="line-clamp-2 font-medium">
                              {row.description || '—'}
                            </div>
                            {row.location && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                الموقع: {row.location}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {row.discipline || '—'}
                          </td>
                          <td className="px-3 py-2.5 font-mono font-bold text-center text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            {row.rev || '—'}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {renderStatusBadge(row.statusCode, row.statusRaw)}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {row.submissionDate || '—'}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {row.replyDate || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setInspectRow(row)}
                              title="عرض كل أعمدة الصف"
                              className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 cursor-pointer transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredRows.length > visibleCount && (
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                  <span>
                    عرض {Math.min(visibleCount, filteredRows.length)} من أصل{' '}
                    {filteredRows.length} سجل
                  </span>
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => prev + ROWS_PER_PAGE)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-bold cursor-pointer"
                  >
                    عرض {ROWS_PER_PAGE} صف إضافي
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Full Row Inspector Modal */}
      {inspectRow && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setInspectRow(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[85vh] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                  تفاصيل الصف رقم {inspectRow.rowIndex} من شيت Excel
                </h3>
                {inspectRow.submittalNumber && (
                  <div
                    dir="ltr"
                    className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 mt-0.5 text-right"
                  >
                    {inspectRow.submittalNumber}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setInspectRow(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-2.5 text-xs">
              {Object.entries(inspectRow.rawCells).map(([colName, val]) => (
                <div
                  key={colName}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-start justify-between gap-1.5"
                >
                  <span className="font-bold text-slate-500 dark:text-slate-400 sm:w-1/3 shrink-0">
                    {colName}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white sm:w-2/3 break-words">
                    {val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
