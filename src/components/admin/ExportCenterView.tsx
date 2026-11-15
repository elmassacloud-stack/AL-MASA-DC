import React, { useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Layers,
  AlertTriangle,
  Building,
  Calendar,
  CheckCircle2
} from 'lucide-react';
import { DailyReport, IssueReport, Project } from '../../types';
import {
  exportDailyReportToExcel,
  exportSubmittalsLogToCSV,
  exportIssuesLogToCSV
} from '../../utils/exportUtils';

interface Props {
  reports: DailyReport[];
  issues: IssueReport[];
  projects: Project[];
}

export const ExportCenterView: React.FC<Props> = ({
  reports,
  issues,
  projects
}) => {
  const [selectedReportId, setSelectedReportId] = useState<string>(reports[0]?.id || '');
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const selectedReport = reports.find((r) => r.id === selectedReportId) || reports[0];

  const handleExportExcel = () => {
    if (!selectedReport) return;
    exportDailyReportToExcel(selectedReport);
    setDownloadSuccess(`تم تصدير ملف إكسل لتقرير: ${selectedReport.projectName} (${selectedReport.reportDate})`);
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  const handleExportSubmittalsCSV = () => {
    exportSubmittalsLogToCSV(reports);
    setDownloadSuccess('تم تصدير سجل التقديمات الهندسية الشامل (CSV) بنجاح');
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  const handleExportIssuesCSV = () => {
    exportIssuesLogToCSV(issues);
    setDownloadSuccess('تم تصدير سجل بلاغات المواقع (CSV) بنجاح');
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-600" />
            <span>مركز التصدير واستخراج التقارير (Export Center)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium">
            تصدير نماذج إكسل الرسمية (.xlsx) المعتمدة لإدارة DC وتصدير سجلات البيانات بصيغة CSV
          </p>
        </div>
      </div>

      {downloadSuccess && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 rounded-2xl text-emerald-900 dark:text-emerald-200 text-xs sm:text-sm flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-bold">{downloadSuccess}</span>
        </div>
      )}

      {/* =========================================================================
          SECTION 1: DAILY REPORT TO EXCEL (.XLSX)
          ========================================================================= */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              تصدير تقرير أعمال يومي إلى Excel (.xlsx) بالنموذج الأصلي
            </h3>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
              يحتوي الملف المصدر على ترويسة إدارة مراقبة الوثائق وجدولي الأعمال المقدمة والمستلمة والملاحظات
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              اختر التقرير المراد تصديره:
            </label>
            <select
              value={selectedReportId}
              onChange={(e) => setSelectedReportId(e.target.value)}
              className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none dark:text-white text-xs sm:text-sm"
            >
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.projectName} — {r.reportDate} (المرسل: {r.senderName})
                </option>
              ))}
            </select>
          </div>

          {selectedReport && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs flex flex-col justify-between">
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">
                  {selectedReport.projectName}
                </span>
                <span className="text-slate-700 dark:text-slate-300 block mt-0.5 font-medium">
                  التاريخ: {selectedReport.reportDate} • {selectedReport.submittedWorks.length} تقديمات • {selectedReport.receivedWorks.length} مستلمات
                </span>
              </div>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold mt-1">
                صيغة الملف: تقرير_أعمال_{selectedReport.projectName}_{selectedReport.reportDate}.xlsx
              </span>
            </div>
          )}
        </div>

        <div className="pt-2">
          <button
            onClick={handleExportExcel}
            className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-600/20 transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير هذا التقرير إلى Excel (.xlsx) الآن</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          SECTION 2: CSV BULK EXPORTS
          ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Export All Submittals CSV */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-blue-600">
              <Layers className="w-5 h-5" />
              <h4 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                سجل التقديمات الهندسية الشامل (CSV)
              </h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              تصدير ملف جدول بيانات مجمع لكافة بنود التقديمات المقدمة والمستلمة عبر كافة التقارير والمشاريع مع تفاصيل أرقام المراجعات (REV) والمواقف (Status).
            </p>
          </div>

          <button
            onClick={handleExportSubmittalsCSV}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>تصدير سجل التقديمات الشامل (CSV)</span>
          </button>
        </div>

        {/* Export All Issues CSV */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
              <h4 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                سجل بلاغات وعوائق المواقع (CSV)
              </h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              تصدير قائمة كاملة بكافة البلاغات المسجلة من مهندسي المواقع مع الأولوية (عاجل/عادي)، حالة المعالجة، والتعليق الإداري لفرق DC.
            </p>
          </div>

          <button
            onClick={handleExportIssuesCSV}
            className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>تصدير سجل البلاغات (CSV)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
