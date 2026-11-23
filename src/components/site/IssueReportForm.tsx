import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Send,
  Wrench,
  Wifi,
  Zap,
  FolderArchive,
  HelpCircle,
  X
} from 'lucide-react';
import { UserProfile, Project, IssueType, IssuePriority } from '../../types';
import { ISSUE_TYPES_CONFIG, MAX_REPORT_ATTACHMENT_SIZE_BYTES } from '../../config';
import { dataService } from '../../services/dataService';
import { getAccessibleProjects } from '../../utils/accessControl';
import { validateUploadedFile } from '../../utils/pdfUtils';

interface Props {
  currentUser: UserProfile;
  projects: Project[];
  onIssueReported?: () => void;
}

export const IssueReportForm: React.FC<Props> = ({
  currentUser,
  projects,
  onIssueReported
}) => {
  const accessibleProjects = getAccessibleProjects(currentUser, projects);

  const [projectId, setProjectId] = useState<string>(
    accessibleProjects[0]?.id || ''
  );

  useEffect(() => {
    if (accessibleProjects.length === 0) {
      if (projectId !== '') setProjectId('');
      return;
    }
    if (!accessibleProjects.some((p) => p.id === projectId)) {
      setProjectId(accessibleProjects[0].id);
    }
  }, [accessibleProjects, projectId]);
  const [type, setType] = useState<IssueType>('documents_archive');
  const [priority, setPriority] = useState<IssuePriority>('urgent');
  const [description, setDescription] = useState<string>('');
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [photoName, setPhotoName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successNumber, setSuccessNumber] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Icon mapping helper
  const getIcon = (t: IssueType) => {
    switch (t) {
      case 'equipment':
        return Wrench;
      case 'network':
        return Wifi;
      case 'electrical_ac':
        return Zap;
      case 'documents_archive':
        return FolderArchive;
      default:
        return HelpCircle;
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await validateUploadedFile(file, {
        allowedFormats: ['jpeg', 'png', 'webp'],
        maxSizeBytes: MAX_REPORT_ATTACHMENT_SIZE_BYTES
      });
      setErrorMsg(null);
      setPhotoName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'صيغة الصورة غير مدعومة أو حجمها يتجاوز الحد المسموح.'
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      setErrorMsg('يرجى اختيار المشروع.');
      return;
    }

    if (!description.trim()) {
      setErrorMsg('يرجى كتابة تفاصيل المشكلة أو العائق.');
      return;
    }

    setIsSubmitting(true);

    try {
      const created = await dataService.addIssue({
        projectId: project.id,
        projectName: project.name,
        authorId: currentUser.id,
        authorName: currentUser.displayName,
        type,
        priority,
        description: description.trim(),
        photoUrl: photoUrl || undefined
      });

      setSuccessNumber(created.issueNumber);
      setDescription('');
      setPhotoUrl('');
      setPhotoName('');

      setTimeout(() => {
        if (onIssueReported) {
          onIssueReported();
        }
      }, 2000);
    } catch (err) {
      setErrorMsg(
        err instanceof Error && err.message
          ? err.message
          : 'حدث خطأ أثناء حفظ البلاغ، يرجى المحاولة ثانية.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      {/* Title Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              إبلاغ عن عائق أو مشكلة بالموقع
            </h2>
            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium">
              إشعار إدارة مراقبة الوثائق (DC) فوراً بالعوائق الفنية أو الإدارية لسرعة المعالجة
            </p>
          </div>
        </div>
      </div>

      {successNumber && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 rounded-2xl text-emerald-900 dark:text-emerald-200 text-sm flex items-start gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">تم تسجيل البلاغ بنجاح برقم: {successNumber}</p>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
              تم إشعار إدارة مراقبة الوثائق وجاري تحويل البلاغ للمتابعة الفورية.
            </p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
          {/* Project Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              المشروع / الموقع المعني <span className="text-red-500">*</span>
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={accessibleProjects.length === 0}
              className="w-full h-11 px-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white disabled:opacity-60"
            >
              {accessibleProjects.length === 0 ? (
                <option value="">لا توجد مشاريع مسندة لحسابك</option>
              ) : (
                accessibleProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Issue Type (Card selectors) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
              تصنيف المشكلة أو العائق <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {(Object.keys(ISSUE_TYPES_CONFIG) as IssueType[]).map((t) => {
                const Icon = getIcon(t);
                const isSelected = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`p-3 rounded-xl border text-right transition-all flex flex-col justify-between cursor-pointer ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-bold shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <Icon className={`w-5 h-5 mb-2 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                    <span className="text-xs leading-snug">
                      {ISSUE_TYPES_CONFIG[t].labelAr}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority Toggle */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              درجة الأهمية والاستعجال <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPriority('normal')}
                className={`py-3 px-4 rounded-xl border font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  priority === 'normal'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span>عادي (Normal)</span>
              </button>
              <button
                type="button"
                onClick={() => setPriority('urgent')}
                className={`py-3 px-4 rounded-xl border font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  priority === 'urgent'
                    ? 'border-red-600 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>عاجل جداً (Urgent)</span>
              </button>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              وصف المشكلة وتأثيرها على سير الأعمال بالموقع <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اكتب تفاصيل واضحة: البند المتأثر، رقم المخطط أو التقديم، موقف الاستشاري، أو الأجهزة المتعطلة..."
              className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
            />
          </div>

          {/* Photo Attachment (Camera or File) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              صورة من الموقع أو من المستند (اختياري)
            </label>

            {!photoUrl ? (
              <label className="w-full border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-50/50 dark:bg-slate-800/30 transition-all">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                  <Camera className="w-6 h-6" />
                </div>
                <div className="text-center">
                  <span className="text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400">
                    التقط صورة بالكاميرا أو اختر من المعرض
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">PNG, JPG حتى 5 ميجابايت</p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black/5 max-w-sm">
                <img
                  src={photoUrl}
                  alt="Site issue proof"
                  className="w-full h-48 object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    setPhotoUrl('');
                    setPhotoName('');
                  }}
                  className="absolute top-2 left-2 p-1.5 bg-black/70 hover:bg-black text-white rounded-full transition-colors cursor-pointer"
                  title="إزالة الصورة"
                >
                  <X className="w-4 h-4" />
                </button>
                {photoName && (
                  <div className="p-2 text-xs text-slate-600 dark:text-slate-400 truncate">
                    {photoName}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting || accessibleProjects.length === 0}
            className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm sm:text-base rounded-xl shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
            <span>تسجيل وإرسال البلاغ فوراً</span>
          </button>
        </div>
      </form>
    </div>
  );
};
