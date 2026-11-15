import { SubmittalStatusCode, SubmittalStatusMeta, IssueType, IssuePriority, WorkDiscipline } from './types';

/**
 * ============================================================================
 * CONFIGURATION SETTINGS - إعدادات النظام وثوابت الإدارة
 * ============================================================================
 */

// 0. APPLICATION URLS (روابط التطبيق للمشاركة وفرق المواقع)
export const SHARED_APP_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_APP_URL) ||
  'https://ais-pre-itffrlf5j3n7gvtbo6rz45-829466429532.europe-west2.run.app';

export const DEV_APP_URL =
  'https://ais-dev-itffrlf5j3n7gvtbo6rz45-829466429532.europe-west2.run.app';

export function getAppUrl(): string {
  if (
    typeof window !== 'undefined' &&
    window.location.origin &&
    !window.location.origin.includes('localhost') &&
    !window.location.origin.includes('127.0.0.1')
  ) {
    return window.location.origin;
  }
  return SHARED_APP_URL;
}

// 1. PRIMARY SUPER ADMIN EMAIL (البريد الإلكتروني المعتمد للمسؤول الرئيسي)
export const SUPER_ADMIN_EMAIL = 'elmassacloud@gmail.com';
export const ADMIN_EMAIL_CONFIG = SUPER_ADMIN_EMAIL;
export const ALLOWED_ADMIN_EMAILS: string[] = [
  SUPER_ADMIN_EMAIL,
  'admin@dc-manager.com',
  'dc.manager@example.com'
];

// Helper to check if an email is the primary Super Admin
export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

// Helper to check if an email has admin privileges
export function isConfiguredAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ALLOWED_ADMIN_EMAILS.some((adm) => adm.toLowerCase() === email.trim().toLowerCase());
}

// 2. SUBMITTAL STATUS CODES CONFIGURATION (مواقف التقديمات الهندسية)
// Easy to modify in one centralized object
export const SUBMITTAL_STATUS_CONFIG: Record<SubmittalStatusCode, SubmittalStatusMeta> = {
  W: {
    code: 'W',
    labelAr: 'قيد المراجعة (Under Review)',
    labelEn: 'Under Review',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-700',
    bgLight: 'bg-amber-500',
    textColor: 'text-amber-700 dark:text-amber-400',
    borderClass: 'border-amber-400',
    description: 'قيد تدقيق ومراجعة الاستشاري أو إدارة المشروع'
  },
  A: {
    code: 'A',
    labelAr: 'معتمد (Approved)',
    labelEn: 'Approved',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700',
    bgLight: 'bg-emerald-500',
    textColor: 'text-emerald-700 dark:text-emerald-400',
    borderClass: 'border-emerald-400',
    description: 'معتمد بالكامل وبدون أي ملاحظات'
  },
  B: {
    code: 'B',
    labelAr: 'معتمد بملاحظات (Approved w/ comments)',
    labelEn: 'Approved with Comments',
    badgeClass: 'bg-teal-100 text-teal-900 border-teal-300 dark:bg-teal-950/80 dark:text-teal-300 dark:border-teal-700',
    bgLight: 'bg-teal-500',
    textColor: 'text-teal-700 dark:text-teal-400',
    borderClass: 'border-teal-400',
    description: 'معتمد مع مراعاة ملاحظات الاستشاري المدونة'
  },
  C: {
    code: 'C',
    labelAr: 'إعادة تقديم (Resubmit)',
    labelEn: 'Revise & Resubmit',
    badgeClass: 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-700',
    bgLight: 'bg-rose-500',
    textColor: 'text-rose-700 dark:text-rose-400',
    borderClass: 'border-rose-400',
    description: 'يجب تعديل التقديم وإعادة إرساله للمراجعة'
  },
  D: {
    code: 'D',
    labelAr: 'مرفوض (Rejected)',
    labelEn: 'Rejected',
    badgeClass: 'bg-red-200 text-red-950 border-red-400 dark:bg-red-950/90 dark:text-red-300 dark:border-red-800 font-bold',
    bgLight: 'bg-red-600',
    textColor: 'text-red-700 dark:text-red-400',
    borderClass: 'border-red-500',
    description: 'مرفوض كلياً ويتطلب إعداد تقديم جديد'
  }
};

// 3. SUBMITTAL STALLED THRESHOLD (الحد الزمني لتعثر التقديمات قيد المراجعة)
// Submittals stuck in status 'W' for more than N days are flagged
export const DEFAULT_STALLED_DAYS_THRESHOLD = 7;

// 4. DAILY REPORT SUBMISSION CUTOFF TIME (وقت نهاية استلام التقارير اليومية)
// Used to flag missing daily reports for projects (Format: HH:MM in 24h)
export const DEFAULT_DAILY_REPORT_CUTOFF_HOUR = 16; // 4:00 PM
export const DEFAULT_DAILY_REPORT_CUTOFF_MINUTE = 0;

// 5. ISSUE CATEGORIES (أنواع العوائق والمشكلات)
export const ISSUE_TYPES_CONFIG: Record<IssueType, { labelAr: string; icon: string }> = {
  equipment: { labelAr: 'معدات وأجهزة', icon: 'Wrench' },
  network: { labelAr: 'شبكات واتصالات', icon: 'Wifi' },
  electrical_ac: { labelAr: 'كهرباء وتكييف', icon: 'Zap' },
  documents_archive: { labelAr: 'وثائق وأرشفة ومخططات', icon: 'FolderArchive' },
  other: { labelAr: 'أخرى / متفرقات', icon: 'HelpCircle' }
};

export const ISSUE_PRIORITY_CONFIG: Record<IssuePriority, { labelAr: string; badgeClass: string }> = {
  normal: {
    labelAr: 'عادي (Normal)',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
  },
  urgent: {
    labelAr: 'عاجل (Urgent)',
    badgeClass: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950/90 dark:text-red-300 dark:border-red-800 animate-pulse font-bold'
  }
};

// 6. EXECUTED WORKS DISCIPLINES (تصنيفات الأعمال المنفذة بالموقع)
export const WORK_DISCIPLINE_CONFIG: Record<WorkDiscipline, { labelAr: string; badgeClass: string }> = {
  civil_structural: {
    labelAr: 'أعمال مدنية وإنشائية',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800'
  },
  architectural: {
    labelAr: 'أعمال معمارية ومباني',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800'
  },
  electrical: {
    labelAr: 'أعمال كهرباء وتيار خفيف',
    badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950/70 dark:text-yellow-300 dark:border-yellow-800'
  },
  mechanical: {
    labelAr: 'ميكانيكا وسباكة وتكييف (MEP)',
    badgeClass: 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950/70 dark:text-cyan-300 dark:border-cyan-800'
  },
  finishing: {
    labelAr: 'تشطيبات ودهانات وأرضيات',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-800'
  },
  infrastructure: {
    labelAr: 'بنية تحتية وموقع عام',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800'
  },
  other: {
    labelAr: 'أعمال أخرى',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
  }
};
