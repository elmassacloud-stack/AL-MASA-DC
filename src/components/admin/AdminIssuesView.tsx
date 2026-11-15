import React, { useState } from 'react';
import {
  AlertTriangle,
  Building,
  Calendar,
  MessageSquare,
  CheckCircle2,
  Clock,
  Filter,
  Image as ImageIcon,
  X,
  Send,
  Eye
} from 'lucide-react';
import { IssueReport, Project, IssueStatus, IssuePriority, UserProfile } from '../../types';
import { ISSUE_TYPES_CONFIG, ISSUE_PRIORITY_CONFIG } from '../../config';
import { dataService } from '../../services/dataService';

interface Props {
  issues: IssueReport[];
  projects: Project[];
  users?: UserProfile[];
}

export const AdminIssuesView: React.FC<Props> = ({ issues, projects, users = [] }) => {
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterAuthor, setFilterAuthor] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedIssue, setSelectedIssue] = useState<IssueReport | null>(null);
  const [commentInput, setCommentInput] = useState<string>('');
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const engineerOptions = Array.from(
    new Map(
      [
        ...users.map((u) => [u.id, { id: u.id, name: u.displayName }] as const),
        ...issues.map((i) => [i.authorId, { id: i.authorId, name: i.authorName }] as const)
      ]
    ).values()
  );

  const filteredIssues = issues.filter((iss) => {
    if (filterProject !== 'all' && iss.projectId !== filterProject) return false;
    if (filterAuthor !== 'all' && iss.authorId !== filterAuthor) return false;
    if (filterPriority !== 'all' && iss.priority !== filterPriority) return false;
    if (filterStatus !== 'all' && iss.status !== filterStatus) return false;
    return true;
  });

  const handleUpdateStatus = (issueId: string, status: IssueStatus) => {
    dataService.updateIssue(issueId, { status });
    if (selectedIssue && selectedIssue.id === issueId) {
      setSelectedIssue((prev) => (prev ? { ...prev, status } : null));
    }
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIssue || !commentInput.trim()) return;

    dataService.updateIssue(selectedIssue.id, {
      adminComment: commentInput.trim()
    });

    setSelectedIssue((prev) =>
      prev ? { ...prev, adminComment: commentInput.trim() } : null
    );
    setCommentInput('');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <span>إدارة ومتابعة عوائق وبلاغات المواقع</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium">
            توجيه المواقع، تحديث حالات المعالجة، والرد على البلاغات العاجلة
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 font-bold border border-red-200 dark:border-red-800">
            {issues.filter((i) => i.priority === 'urgent' && i.status !== 'resolved').length} بلاغ عاجل مفتوح
          </span>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div>
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">المشروع</label>
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
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

        <div>
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">المهندس المرسل</label>
          <select
            value={filterAuthor}
            onChange={(e) => setFilterAuthor(e.target.value)}
            className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
          >
            <option value="all">كافة المهندسين</option>
            {engineerOptions.map((eng) => (
              <option key={eng.id} value={eng.id}>
                {eng.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">درجة الأهمية</label>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
          >
            <option value="all">الكل</option>
            <option value="urgent">عاجل جداً (Urgent)</option>
            <option value="normal">عادي (Normal)</option>
          </select>
        </div>

        <div>
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">حالة المعالجة</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
          >
            <option value="all">كافة الحالات</option>
            <option value="new">جديد</option>
            <option value="in_progress">جاري المعالجة</option>
            <option value="resolved">تم الحل</option>
          </select>
        </div>
      </div>

      {/* Issues list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredIssues.length === 0 ? (
          <div className="col-span-2 bg-white dark:bg-slate-900 rounded-2xl p-10 text-center border border-slate-200 dark:border-slate-800">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
            <p className="font-bold text-slate-700 dark:text-slate-300">
              لا توجد بلاغات تطابق شروط التصفية
            </p>
          </div>
        ) : (
          filteredIssues.map((issue) => (
            <div
              key={issue.id}
              className={`bg-white dark:bg-slate-900 rounded-2xl p-5 border transition-all shadow-xs flex flex-col justify-between ${
                issue.priority === 'urgent' && issue.status !== 'resolved'
                  ? 'border-red-300 dark:border-red-900/80'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md text-slate-700 dark:text-slate-300">
                        {issue.issueNumber}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-md font-bold ${ISSUE_PRIORITY_CONFIG[issue.priority]?.badgeClass}`}>
                        {ISSUE_PRIORITY_CONFIG[issue.priority]?.labelAr}
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base mt-1.5">
                      {issue.projectName}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                      <span>التصنيف: {ISSUE_TYPES_CONFIG[issue.type]?.labelAr}</span>
                      <span>•</span>
                      <span>المرسل: {issue.authorName}</span>
                    </div>
                  </div>

                  {/* Status Dropdown / Badge */}
                  <select
                    value={issue.status}
                    onChange={(e) => handleUpdateStatus(issue.id, e.target.value as IssueStatus)}
                    className="text-xs font-bold px-2.5 py-1 rounded-lg border bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="new">جديد</option>
                    <option value="in_progress">جاري المعالجة</option>
                    <option value="resolved">تم الحل</option>
                  </select>
                </div>

                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {issue.description}
                </p>

                {/* Photo attachment if present */}
                {issue.photoUrl && (
                  <button
                    onClick={() => setPreviewPhoto(issue.photoUrl!)}
                    className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>معاينة الصورة المرفقة للبلاغ</span>
                  </button>
                )}

                {/* Admin comment section */}
                {issue.adminComment && (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200">
                    <span className="font-bold block">إجراء وتعليق إدارة DC:</span>
                    <p className="mt-0.5">{issue.adminComment}</p>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => {
                    setSelectedIssue(issue);
                    setCommentInput(issue.adminComment || '');
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 hover:bg-blue-100 flex items-center gap-1.5 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{issue.adminComment ? 'تعديل التوجيه' : 'إضافة توجيه إداري'}</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Admin Comment Drawer/Modal */}
      {selectedIssue && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl p-5 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">
                  إضافة توجيه / تعليق إداري
                </h3>
                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                  بلاغ رقم {selectedIssue.issueNumber} ({selectedIssue.projectName})
                </p>
              </div>
              <button
                onClick={() => setSelectedIssue(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddComment} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  التوجيه أو الإجراء المتخذ مع الاستشاري/المشروع
                </label>
                <textarea
                  rows={4}
                  required
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder="مثال: تم إرسال خطاب رسمي للاستشاري بالاعتماد، وسيتم متابعة التوريد غداً..."
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedIssue(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <Send className="w-4 h-4" />
                  <span>حفظ وإشعار الموقع</span>
                </button>
              </div>
            </form>
          </div>
        </div>
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
              alt="Issue Full Proof"
              className="w-full max-h-[85vh] object-contain rounded-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
