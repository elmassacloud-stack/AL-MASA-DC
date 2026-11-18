import React, { useState } from 'react';
import {
  FileText,
  AlertTriangle,
  Calendar,
  Building,
  CheckCircle2,
  Clock,
  MessageSquare,
  Eye,
  FileSpreadsheet,
  X,
  Pencil,
  Paperclip
} from 'lucide-react';
import { UserProfile, DailyReport, IssueReport, Project } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { ReportAttachmentList } from '../common/ReportAttachmentList';
import { ISSUE_TYPES_CONFIG, ISSUE_PRIORITY_CONFIG } from '../../config';
import { exportDailyReportToExcel } from '../../utils/exportUtils';
import { canAccessProject } from '../../utils/accessControl';
import { EditDailyReportModal } from './EditDailyReportModal';

interface Props {
  currentUser: UserProfile;
  projects: Project[];
  reports: DailyReport[];
  issues: IssueReport[];
}

export const MySubmissionsView: React.FC<Props> = ({
  currentUser,
  projects,
  reports,
  issues
}) => {
  const [activeTab, setActiveTab] = useState<'reports' | 'issues'>('reports');
  const [selectedReport, setSelectedReport] = useState<DailyReport | null>(null);
  const [editingReport, setEditingReport] = useState<DailyReport | null>(null);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const canEditReport = (report: DailyReport) =>
    currentUser.role === 'admin' ||
    report.senderId === currentUser.id ||
    report.senderEmail.toLowerCase() === currentUser.email.toLowerCase();

  // Filter strictly to user's assigned projects (or all if admin)
  const myReports =
    currentUser.role === 'admin'
      ? reports
      : reports.filter(
          (r) =>
            canAccessProject(currentUser, r.projectId) &&
            (r.senderId === currentUser.id ||
              r.senderEmail.toLowerCase() === currentUser.email.toLowerCase())
        );

  const myIssues =
    currentUser.role === 'admin'
      ? issues
      : issues.filter(
          (i) =>
            canAccessProject(currentUser, i.projectId) &&
            i.authorId === currentUser.id
        );

  const getStatusBadge = (status: DailyReport['status']) => {
    switch (status) {
      case 'reviewed':
        return (
          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>تمت المراجعة والاعتماد</span>
          </span>
        );
      case 'needs_revision':
        return (
          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>يتطلب تعديلات</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>قيد المراجعة لدى DC</span>
          </span>
        );
    }
  };

  const getIssueStatusBadge = (status: IssueReport['status']) => {
    switch (status) {
      case 'resolved':
        return (
          <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            تم الحل
          </span>
        );
      case 'in_progress':
        return (
          <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
            جاري المعالجة
          </span>
        );
      default:
        return (
          <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
            جديد
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Header & Tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
            تقديماتي وسجل المتابعة
          </h2>
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium">
            متابعة حالة التقارير اليومية والبلاغات المرسلة وملاحظات إدارة DC
          </p>
        </div>

        {/* Toggle Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('reports')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'reports'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>التقارير اليومية ({myReports.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('issues')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'issues'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>البلاغات والعوائق ({myIssues.length})</span>
          </button>
        </div>
      </div>

      {/* Edit Success Banner */}
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

      {/* =========================================================================
          REPORTS TAB
          ========================================================================= */}
      {activeTab === 'reports' && (
        <div className="space-y-3">
          {myReports.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center border border-slate-200 dark:border-slate-800">
              <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-base font-bold text-slate-700 dark:text-slate-300">
                لا توجد تقارير يومية مسجلة بعد
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                يمكنك إنشاء تقريرك اليومي الأول من تبويب "تقرير اليوم".
              </p>
            </div>
          ) : (
            myReports.map((report) => (
              <div
                key={report.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-blue-300 dark:hover:border-blue-700 transition-all space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
                      <Building className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                        {report.projectName}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{report.reportDate}</span>
                        <span>•</span>
                        <span>المرسل: {report.senderName}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    {getStatusBadge(report.status)}
                  </div>
                </div>

                {/* Submittal stats summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-700 dark:text-slate-300 block font-medium">الأعمال المقدمة</span>
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                      {report.submittedWorks.length} بند
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-700 dark:text-slate-300 block font-medium">الأعمال المستلمة</span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {report.receivedWorks.length} بند
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 col-span-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-700 dark:text-slate-300 font-medium">الملاحظات</span>
                      {(report.attachments?.length || 0) > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/70 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                          <Paperclip className="w-3 h-3" />
                          <span>{report.attachments!.length} مرفق</span>
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-700 dark:text-slate-300 truncate block mt-0.5">
                      {report.notes || 'لا توجد ملاحظات عامة'}
                    </span>
                  </div>
                </div>

                {/* Admin Feedback Section if present */}
                {report.adminFeedback && (
                  <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">ملاحظات إدارة مراقبة الوثائق (DC):</span>
                      <p className="mt-0.5">{report.adminFeedback}</p>
                    </div>
                  </div>
                )}

                {/* Card Actions */}
                <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                  {canEditReport(report) && (
                    <button
                      type="button"
                      onClick={() => setEditingReport(report)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:hover:bg-amber-900/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="تعديل بيانات التقرير اليومي"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>تعديل التقرير</span>
                    </button>
                  )}
                  <button
                    onClick={() => exportDailyReportToExcel(report)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                    title="تصدير نموذج إكسل مطابق"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>تصدير Excel</span>
                  </button>
                  <button
                    onClick={() => setSelectedReport(report)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Eye className="w-4 h-4" />
                    <span>عرض التفاصيل الكاملة</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* =========================================================================
          ISSUES TAB
          ========================================================================= */}
      {activeTab === 'issues' && (
        <div className="space-y-3">
          {myIssues.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center border border-slate-200 dark:border-slate-800">
              <AlertTriangle className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-base font-bold text-slate-700 dark:text-slate-300">
                لا توجد بلاغات مسجلة
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                يمكنك الإبلاغ عن أي مشكلة أو عائق من تبويب "إبلاغ عن عائق".
              </p>
            </div>
          ) : (
            myIssues.map((issue) => (
              <div
                key={issue.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs sm:text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                        {issue.issueNumber}
                      </span>
                      <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                        {issue.projectName}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 mt-1">
                      <span>التصنيف: {ISSUE_TYPES_CONFIG[issue.type]?.labelAr}</span>
                      <span>•</span>
                      <span>التاريخ: {new Date(issue.createdAt).toLocaleDateString('ar-EG')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <span className={`text-xs px-2.5 py-1 rounded-full border ${ISSUE_PRIORITY_CONFIG[issue.priority]?.badgeClass}`}>
                      {ISSUE_PRIORITY_CONFIG[issue.priority]?.labelAr}
                    </span>
                    {getIssueStatusBadge(issue.status)}
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {issue.description}
                </p>

                {/* Photo thumbnail */}
                {issue.photoUrl && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setPreviewPhoto(issue.photoUrl!)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-blue-500 cursor-pointer"
                    >
                      <img
                        src={issue.photoUrl}
                        alt="Proof"
                        className="w-6 h-6 object-cover rounded-md"
                      />
                      <span>عرض الصورة المرفقة</span>
                    </button>
                  </div>
                )}

                {/* Admin Comment */}
                {issue.adminComment && (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
                    <MessageSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">إجراء وتعليق إدارة مراقبة الوثائق (DC):</span>
                      <p className="mt-0.5">{issue.adminComment}</p>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* =========================================================================
          DETAILED REPORT MODAL
          ========================================================================= */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col my-auto">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                  تفاصيل تقرير الأعمال اليومي
                </h3>
                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                  {selectedReport.projectName} — {selectedReport.reportDate} (المرسل: {selectedReport.senderName})
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
              {/* Submitted Works Table */}
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                  <span>الأعمال المقدمة (Submitted Works)</span>
                </h4>
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
                            لا توجد تقديمات مسجلة
                          </td>
                        </tr>
                      ) : (
                        selectedReport.submittedWorks.map((item, idx) => (
                          <tr key={item.id}>
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

              {/* Received Works Table */}
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                  <span>الأعمال المستلمة (Received Works)</span>
                </h4>
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
                            لا توجد أعمال مستلمة مسجلة
                          </td>
                        </tr>
                      ) : (
                        selectedReport.receivedWorks.map((item, idx) => (
                          <tr key={item.id}>
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

              {/* Notes */}
              {selectedReport.notes && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    ملاحظات الموقع:
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
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportDailyReportToExcel(selectedReport)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>تصدير نموذج إكسل (.xlsx)</span>
                </button>
                {canEditReport(selectedReport) && (
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
                )}
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

      {/* Edit Daily Report Modal */}
      {editingReport && (
        <EditDailyReportModal
          report={editingReport}
          currentUser={currentUser}
          projects={projects}
          onClose={() => setEditingReport(null)}
          onSaved={(updatedTitle) => {
            setEditingReport(null);
            setEditSuccessMsg(`تم تعديل وحفظ التقرير اليومي (${updatedTitle}) وإرساله للمراجعة بنجاح.`);
            setTimeout(() => setEditSuccessMsg(null), 4000);
          }}
        />
      )}

      {/* Photo Preview Modal */}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="relative max-w-2xl w-full">
            <button
              onClick={() => setPreviewPhoto(null)}
              className="absolute top-3 left-3 p-2 bg-black/70 text-white rounded-full hover:bg-black cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewPhoto}
              alt="Proof full"
              className="w-full max-h-[85vh] object-contain rounded-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
