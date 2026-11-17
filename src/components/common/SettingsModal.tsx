import React, { useState, useRef, useEffect } from 'react';
import {
  SlidersHorizontal,
  X,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  Globe,
  Copy,
  Check,
  Download,
  Upload,
  Database,
  Bell,
  FileCheck2,
  CheckSquare,
  AlertTriangle,
  FileText,
  Hammer,
  BellRing,
  Flame,
  Loader2,
  BellOff
} from 'lucide-react';
import { ADMIN_EMAIL_CONFIG, SHARED_APP_URL, getAppUrl } from '../../config';
import { dataService } from '../../services/dataService';
import { NotificationPreferences, UserProfile } from '../../types';
import {
  NOTIFICATION_PRESETS,
  normalizeNotificationPreferences,
  areNotificationPreferencesEqual
} from '../../utils/notificationPreferences';
import { canAccessExecutedWorksTab, canAccessSiteDeliverablesTab } from '../../utils/accessControl';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onUpdateNotificationPreferences: (prefs: NotificationPreferences) => Promise<boolean>;
  stalledDays: number;
  onUpdateStalledDays: (days: number) => void;
  cutoffHour: number;
  onUpdateCutoffHour: (hour: number) => void;
  onResetSeedData: () => void;
}

export const SettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentUser,
  onUpdateNotificationPreferences,
  stalledDays,
  onUpdateStalledDays,
  cutoffHour,
  onUpdateCutoffHour,
  onResetSeedData
}) => {
  const [resetConfirmMsg, setResetConfirmMsg] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [backupSuccessMsg, setBackupSuccessMsg] = useState<string | null>(null);
  const [backupErrorMsg, setBackupErrorMsg] = useState<string | null>(null);

  const [prefsDraft, setPrefsDraft] = useState<NotificationPreferences>(() =>
    normalizeNotificationPreferences(currentUser.notificationPreferences)
  );
  const [savingPrefs, setSavingPrefs] = useState<boolean>(false);
  const [prefsSavedMsg, setPrefsSavedMsg] = useState<boolean>(false);
  const [prefsErrorMsg, setPrefsErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPrefsDraft(normalizeNotificationPreferences(currentUser.notificationPreferences));
      setPrefsSavedMsg(false);
      setPrefsErrorMsg(null);
    }
  }, [isOpen, currentUser.notificationPreferences]);

  if (!isOpen) return null;

  const isAdmin = currentUser.role === 'admin';
  const showExecutedWorksPref = isAdmin || canAccessExecutedWorksTab(currentUser);
  const showDeliverablesPref = isAdmin || canAccessSiteDeliverablesTab(currentUser);
  const appUrl = getAppUrl() || SHARED_APP_URL;

  const savedPrefs = normalizeNotificationPreferences(currentUser.notificationPreferences);
  const hasPrefChanges = !areNotificationPreferencesEqual(prefsDraft, savedPrefs);

  const allMuted =
    !prefsDraft.dailyReports &&
    !prefsDraft.tasks &&
    !prefsDraft.issues &&
    (!showDeliverablesPref || !prefsDraft.deliverables) &&
    (!showExecutedWorksPref || !prefsDraft.executedWorks) &&
    !prefsDraft.announcements;

  const handleTogglePref = (key: keyof NotificationPreferences) => {
    setPrefsSavedMsg(false);
    setPrefsErrorMsg(null);
    setPrefsDraft((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (key === 'tasks' && !next.tasks) {
        next.urgentTasksOnly = false;
      }
      if (key === 'issues' && !next.issues) {
        next.urgentIssuesOnly = false;
      }
      return next;
    });
  };

  const handleApplyPreset = (presetPrefs: NotificationPreferences) => {
    setPrefsSavedMsg(false);
    setPrefsErrorMsg(null);
    setPrefsDraft({ ...presetPrefs });
  };

  const handleSavePrefs = async () => {
    setSavingPrefs(true);
    setPrefsErrorMsg(null);
    setPrefsSavedMsg(false);
    try {
      const ok = await onUpdateNotificationPreferences(prefsDraft);
      if (ok) {
        setPrefsSavedMsg(true);
        setTimeout(() => setPrefsSavedMsg(false), 3000);
      } else {
        setPrefsErrorMsg('تعذر حفظ تفضيلات الإشعارات، يرجى المحاولة مرة أخرى.');
      }
    } catch {
      setPrefsErrorMsg('حدث خطأ أثناء حفظ التفضيلات في قاعدة البيانات.');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleCopyUrl = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(appUrl);
      }
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleReset = () => {
    onResetSeedData();
    setResetConfirmMsg(true);
    setTimeout(() => {
      setResetConfirmMsg(false);
      onClose();
    }, 1500);
  };

  const handleExportBackup = () => {
    const jsonStr = dataService.exportFullBackup();
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `site_followup_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBackupSuccessMsg('تم تنزيل النسخة الاحتياطية بنجاح بصيغة JSON!');
    setTimeout(() => setBackupSuccessMsg(null), 3000);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupErrorMsg(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content && dataService.importBackup(content)) {
        setBackupSuccessMsg('تم استيراد واستعادة البيانات بالكامل بنجاح!');
        setTimeout(() => {
          setBackupSuccessMsg(null);
          onClose();
        }, 1500);
      } else {
        setBackupErrorMsg('تعذر استيراد الملف. يرجى التأكد من اختيار ملف JSON صحيح.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const renderSwitch = (checked: boolean, onToggle: () => void, label: string) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      dir="ltr"
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
        checked
          ? 'bg-blue-600 border-blue-600'
          : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-xl max-h-[90vh] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Sticky Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg">
                {isAdmin
                  ? 'إعدادات المنظومة وتفضيلات الإشعارات'
                  : 'تفضيلات استقبال الإشعارات'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                {isAdmin
                  ? 'تخصيص تنبيهاتك وإدارة قواعد المنظومة والنسخ الاحتياطي'
                  : 'حدد أنواع الإشعارات التي تفضل استقبالها لتجنب التنبيهات الزائدة'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg cursor-pointer"
            aria-label="إغلاق الإعدادات"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Status Toasts */}
          {resetConfirmMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>تمت إعادة تعيين البيانات النموذجية (مستشفى رافيل 3) بنجاح!</span>
            </div>
          )}

          {backupSuccessMsg && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-300 dark:border-blue-800 rounded-xl text-blue-800 dark:text-blue-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{backupSuccessMsg}</span>
            </div>
          )}

          {backupErrorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-xs font-medium">
              {backupErrorMsg}
            </div>
          )}

          {/* ALL USERS SECTION: Notification Preferences */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 p-4 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    أنواع الإشعارات المفضلة
                  </h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    تنطبق على مركز الإشعارات، التنبيه الصوتي، والإشعارات المنبثقة
                  </p>
                </div>
              </div>
              {hasPrefChanges && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0">
                  تعديلات غير محفوظة
                </span>
              )}
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <span className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                أوضاع سريعة:
              </span>
              <div className="grid grid-cols-2 gap-2">
                {NOTIFICATION_PRESETS.map((preset) => {
                  const isActivePreset = areNotificationPreferencesEqual(
                    prefsDraft,
                    preset.prefs
                  );
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyPreset(preset.prefs)}
                      title={preset.description}
                      className={`text-right px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        isActivePreset
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Individual Toggles */}
            <div className="space-y-2">
              {/* 1. Daily Reports */}
              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <FileCheck2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      التقارير اليومية
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      {isAdmin
                        ? 'إرسال تقارير المواقع اليومية وتنبيهات التأخر عن الموعد'
                        : 'إشعارات مراجعة التقارير اليومية وملاحظات الإدارة'}
                    </p>
                  </div>
                </div>
                {renderSwitch(
                  prefsDraft.dailyReports,
                  () => handleTogglePref('dailyReports'),
                  'تفعيل إشعارات التقارير اليومية'
                )}
              </div>

              {/* 2. Tasks (+ Urgent Tasks Only sub-toggle) */}
              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        المهام والتكليفات
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                        {isAdmin
                          ? 'إشعارات إنجاز المهام وإثباتات التنفيذ من المهندسين'
                          : 'إشعارات المهام الجديدة المسندة إليك ومواعيد التسليم'}
                      </p>
                    </div>
                  </div>
                  {renderSwitch(
                    prefsDraft.tasks,
                    () => handleTogglePref('tasks'),
                    'تفعيل إشعارات المهام'
                  )}
                </div>

                {prefsDraft.tasks && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 pr-6 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                      <Flame className="w-3.5 h-3.5 shrink-0" />
                      <span>استقبال المهام العاجلة فقط</span>
                    </div>
                    {renderSwitch(
                      prefsDraft.urgentTasksOnly,
                      () => handleTogglePref('urgentTasksOnly'),
                      'استقبال المهام العاجلة فقط'
                    )}
                  </div>
                )}
              </div>

              {/* 3. Issues (+ Urgent Issues Only sub-toggle) */}
              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        بلاغات المشاكل والمعوقات
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                        {isAdmin
                          ? 'بلاغات الأعطال والمشاكل المرفوعة من المواقع'
                          : 'تحديثات حالة المشاكل والبلاغات المسجلة'}
                      </p>
                    </div>
                  </div>
                  {renderSwitch(
                    prefsDraft.issues,
                    () => handleTogglePref('issues'),
                    'تفعيل إشعارات المشاكل'
                  )}
                </div>

                {prefsDraft.issues && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 pr-6 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-red-600 dark:text-red-400">
                      <Flame className="w-3.5 h-3.5 shrink-0" />
                      <span>استقبال المشاكل العاجلة فقط</span>
                    </div>
                    {renderSwitch(
                      prefsDraft.urgentIssuesOnly,
                      () => handleTogglePref('urgentIssuesOnly'),
                      'استقبال المشاكل العاجلة فقط'
                    )}
                  </div>
                )}
              </div>

              {/* 4. Site Deliverables (PDF & Excel) */}
              {showDeliverablesPref && (
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        تسليمات الموقع (PDF و Excel)
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                        {isAdmin
                          ? 'تنبيهات رفع ملفات التسليمات الجديدة من المواقع'
                          : 'إشعارات تأكيد استلام ومراجعة ملفات التسليمات'}
                      </p>
                    </div>
                  </div>
                  {renderSwitch(
                    prefsDraft.deliverables,
                    () => handleTogglePref('deliverables'),
                    'تفعيل إشعارات تسليمات الموقع'
                  )}
                </div>
              )}

              {/* 5. Executed Works */}
              {showExecutedWorksPref && (
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Hammer className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        الأعمال المنفذة بالموقع
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                        تنبيهات تسجيل بنود ونسب الإنجاز الميدانية الجديدة
                      </p>
                    </div>
                  </div>
                  {renderSwitch(
                    prefsDraft.executedWorks,
                    () => handleTogglePref('executedWorks'),
                    'تفعيل إشعارات الأعمال المنفذة'
                  )}
                </div>
              )}

              {/* 6. Announcements */}
              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <BellRing className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      التعميمات الإدارية والتنبيهات العامة
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      التعميمات الرسمية والتعليمات الصادرة عن إدارة DC
                    </p>
                  </div>
                </div>
                {renderSwitch(
                  prefsDraft.announcements,
                  () => handleTogglePref('announcements'),
                  'تفعيل إشعارات التعميمات'
                )}
              </div>
            </div>

            {allMuted && (
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-[11px] font-medium flex items-center gap-2">
                <BellOff className="w-4 h-4 shrink-0" />
                <span>تم إيقاف كافة الإشعارات — لن تتلقى أي تنبيهات جديدة حتى تعيد تفعيل نوع واحد على الأقل.</span>
              </div>
            )}

            {prefsSavedMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>تم حفظ تفضيلات الإشعارات وتطبيقها فوراً!</span>
              </div>
            )}

            {prefsErrorMsg && (
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-medium">
                {prefsErrorMsg}
              </div>
            )}

            <button
              type="button"
              disabled={savingPrefs || !hasPrefChanges}
              onClick={handleSavePrefs}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {savingPrefs ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري حفظ التفضيلات...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>حفظ وتطبيق تفضيلات الإشعارات</span>
                </>
              )}
            </button>
          </section>

          {/* ADMIN-ONLY SYSTEM SETTINGS */}
          {isAdmin && (
            <>
              {/* Setting 0: Firebase Auth & Firestore Status */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-900 dark:text-emerald-200">
                    <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>المصادقة والمزامنة: Firebase Auth & Firestore</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold">
                    Cloud Sync
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                  تتم مصادقة المستخدمين عبر Firebase Authentication ومزامنة بيانات المشاريع والتقارير والصلاحيات عبر Firestore مع حفظ المسودات محلياً.
                </p>
              </div>

              {/* Setting 1: Application URL Box */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-900 dark:text-indigo-200">
                    <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>رابط التطبيق المعتمد (App URL):</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold">
                    Shared Live
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={appUrl}
                    dir="ltr"
                    className="w-full bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 px-2.5 py-1.5 text-xs font-mono rounded-lg text-slate-800 dark:text-slate-200 select-all"
                  />
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg shrink-0 flex items-center gap-1 transition-all cursor-pointer ${
                      copiedUrl
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUrl ? 'تم!' : 'نسخ'}</span>
                  </button>
                </div>
              </div>

              {/* Setting 2: Admin Email Configuration Info */}
              <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-blue-900 dark:text-blue-200">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>بريد مدير إدارة مراقبة الوثائق (Admin Email Config):</span>
                </div>
                <p className="text-slate-600 dark:text-slate-400">
                  معرف في أعلى الكود بالثابت{' '}
                  <code className="font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                    {ADMIN_EMAIL_CONFIG}
                  </code>{' '}
                  ويمنح الصلاحيات الإدارية الكاملة.
                </p>
              </div>

              {/* Setting 3: Stalled Submittals Threshold (N Days) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  الحد الزمني لتعثر التقديمات قيد المراجعة (W):
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={stalledDays}
                    onChange={(e) => onUpdateStalledDays(parseInt(e.target.value) || 7)}
                    className="w-20 h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-center font-mono font-bold dark:text-white"
                  />
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    أيام (التقديمات التي تبقى في حالة W لأكثر من هذا الحد يظهر عليها تنبيه تعثر أحمر فوري).
                  </span>
                </div>
              </div>

              {/* Setting 4: Daily Report Submission Cutoff Hour */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  ساعة نهاية استلام تقارير الأعمال اليومية:
                </label>
                <div className="flex items-center gap-3">
                  <select
                    value={cutoffHour}
                    onChange={(e) => onUpdateCutoffHour(parseInt(e.target.value))}
                    className="h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold dark:text-white text-xs"
                  >
                    <option value={14}>02:00 م (الساعة 14:00)</option>
                    <option value={15}>03:00 م (الساعة 15:00)</option>
                    <option value={16}>04:00 م (الساعة 16:00 - الافتراضي)</option>
                    <option value={17}>05:00 م (الساعة 17:00)</option>
                    <option value={18}>06:00 م (الساعة 18:00)</option>
                  </select>
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    يتم تنبيه المدير في شارة الإشعارات في حال تجاوز هذا الوقت دون تقديم تقرير.
                  </span>
                </div>
              </div>

              {/* Setting 5: Data Backup & Restore (Export / Import JSON) */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  النسخ الاحتياطي ونقل البيانات:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    className="py-2.5 px-3 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors border border-blue-200 dark:border-blue-900"
                  >
                    <Download className="w-4 h-4" />
                    <span>تصدير نسخة احتياطية (JSON)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors border border-slate-200 dark:border-slate-700"
                  >
                    <Upload className="w-4 h-4" />
                    <span>استعادة نسخة احتياطية</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={handleImportFile}
                  />
                </div>
              </div>

              {/* Setting 6: Reset Sample Data */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full py-2.5 px-3 bg-red-50 hover:bg-red-100 dark:bg-red-950/60 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors border border-red-200 dark:border-red-900"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>إعادة تعيين البيانات النموذجية الأولية (مستشفى رافيل 3)</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
