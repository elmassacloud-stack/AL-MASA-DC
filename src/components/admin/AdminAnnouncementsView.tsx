import React, { useState } from 'react';
import {
  BellRing,
  Plus,
  Users,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  X,
  Send,
  Eye
} from 'lucide-react';
import { Announcement, Project, UserProfile } from '../../types';
import { dataService } from '../../services/dataService';

interface Props {
  announcements: Announcement[];
  projects: Project[];
  users: UserProfile[];
  currentUser: UserProfile;
}

export const AdminAnnouncementsView: React.FC<Props> = ({
  announcements,
  projects,
  users,
  currentUser
}) => {
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [targetProjects, setTargetProjects] = useState<string[]>([]);
  const [isUrgent, setIsUrgent] = useState<boolean>(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  const handleCreateAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    dataService.addAnnouncement({
      title: title.trim(),
      content: content.trim(),
      targetProjects,
      isUrgent,
      createdBy: currentUser.id,
      authorName: currentUser.displayName
    });

    setIsCreating(false);
    setTitle('');
    setContent('');
    setTargetProjects([]);
    setIsUrgent(false);
  };

  const toggleProjectSelection = (projId: string) => {
    setTargetProjects((prev) =>
      prev.includes(projId) ? prev.filter((id) => id !== projId) : [...prev, projId]
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BellRing className="w-5 h-5 text-blue-600" />
            <span>التعاميم والتنبيهات الإدارية للمواقع</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium">
            إصدار التوجيهات الرسمية للمشاريع مع تتبع تأكيد القراءة لكل مهندس ومستخدم
          </p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer shadow-xs self-start sm:self-auto transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>نشر تعميم جديد</span>
        </button>
      </div>

      {/* Announcements List */}
      <div className="space-y-4">
        {announcements.map((ann) => {
          const siteUsers = users.filter((u) => u.role === 'site');
          const readCount = ann.readBy.length;

          return (
            <div
              key={ann.id}
              className={`bg-white dark:bg-slate-900 rounded-2xl p-5 border transition-all shadow-xs space-y-3 ${
                ann.isUrgent
                  ? 'border-amber-300 dark:border-amber-800 bg-amber-50/15 dark:bg-amber-950/10'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  {ann.isUrgent ? (
                    <span className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950 text-red-600 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4" />
                    </span>
                  ) : (
                    <span className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 flex items-center justify-center shrink-0">
                      <BellRing className="w-4 h-4" />
                    </span>
                  )}
                  <div>
                    <h3 className="font-bold text-base text-slate-900 dark:text-white">
                      {ann.title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{new Date(ann.createdAt).toLocaleDateString('ar-EG')}</span>
                      <span>•</span>
                      <span>بواسطة: {ann.authorName}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {ann.targetProjects.length === 0
                      ? 'موجه لكافة المشاريع'
                      : `موجه لـ ${ann.targetProjects.length} مشاريع`}
                  </span>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {ann.content}
              </p>

              {/* Read receipts tracking bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>
                    تم تأكيد القراءة من قبل: <strong>{readCount}</strong> من <strong>{siteUsers.length}</strong> مهندسين
                  </span>
                </div>

                <button
                  onClick={() => setSelectedAnnouncement(ann)}
                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>قائمة من قاموا بالقراءة</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Read Receipts Inspector Modal */}
      {selectedAnnouncement && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-5 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">
                  سجل قراءة التعميم
                </h3>
                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">{selectedAnnouncement.title}</p>
              </div>
              <button
                onClick={() => setSelectedAnnouncement(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto text-xs">
              {users
                .filter((u) => u.role === 'site')
                .map((user) => {
                  const hasRead =
                    selectedAnnouncement.readBy.includes(user.id) ||
                    selectedAnnouncement.readBy.includes(user.email);
                  return (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60"
                    >
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">
                          {user.displayName}
                        </span>
                        <span className="text-[11px] text-slate-400">{user.email}</span>
                      </div>
                      {hasRead ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-md">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>تمت القراءة</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                          لم يقرأ بعد
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedAnnouncement(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Announcement Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl p-5 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white">
                نشر تعميم أو تنبيه إداري
              </h3>
              <button
                onClick={() => setIsCreating(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAnnouncement} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  عنوان التعميم
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: تنبيه بخصوص موعد إرسال تقرير الأعمال اليومي..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  نص التعميم والتوجيهات
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="اكتب التوجيه الإداري الواضح..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                />
              </div>

              {/* Target Projects */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  المشاريع المستهدفة (اتركها فارغة لكافة المشاريع)
                </label>
                <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 max-h-36 overflow-y-auto">
                  {projects.map((p) => {
                    const isChecked = targetProjects.includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-2 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleProjectSelection(p.id)}
                          className="w-4 h-4 rounded-md text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-800 dark:text-slate-200">{p.name} ({p.code})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Urgent Toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="urgentToggle"
                  checked={isUrgent}
                  onChange={(e) => setIsUrgent(e.target.checked)}
                  className="w-4 h-4 rounded-md text-red-600 focus:ring-red-500"
                />
                <label htmlFor="urgentToggle" className="text-xs font-bold text-red-600 dark:text-red-400 cursor-pointer">
                  تحديد كتعميم عاجل ومهم جداً
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl cursor-pointer shadow-xs"
                >
                  نشر التعميم
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
