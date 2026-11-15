import React, { useState, useRef } from 'react';
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
  Database
} from 'lucide-react';
import { ADMIN_EMAIL_CONFIG, SHARED_APP_URL, getAppUrl } from '../../config';
import { dataService } from '../../services/dataService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  stalledDays: number;
  onUpdateStalledDays: (days: number) => void;
  cutoffHour: number;
  onUpdateCutoffHour: (hour: number) => void;
  onResetSeedData: () => void;
}

export const SettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const appUrl = getAppUrl() || SHARED_APP_URL;

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

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg">
                إعدادات المنظومة والبيانات المحلية
              </h3>
              <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                إدارة القواعد والمدد الزمنية والنسخ الاحتياطي لإدارة DC
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

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

        {/* Setting 0: Firebase Auth & Firestore Status */}
        <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-emerald-900 dark:text-emerald-200">
              <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>المصادقة والمزامنة: Firebase Auth & Firestore</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold">
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
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold">
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
              onClick={handleCopyUrl}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg shrink-0 flex items-center gap-1 transition-all ${
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
            معرف في أعلى الكود بالثابت <code className="font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">{ADMIN_EMAIL_CONFIG}</code> ويمنح الصلاحيات الإدارية الكاملة.
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
      </div>
    </div>
  );
};
