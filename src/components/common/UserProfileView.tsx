import React, { useState, useEffect, useRef } from 'react';
import {
  UserCircle2,
  Camera,
  Trash2,
  Save,
  Mail,
  Phone,
  Briefcase,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Building2,
  UserCheck,
  Info
} from 'lucide-react';
import { UserProfile, Project } from '../../types';
import { dataService } from '../../services/dataService';
import {
  changeCurrentUserEmail,
  changeCurrentUserPassword,
  translateFirebaseAuthError
} from '../../services/firebase';
import { isSuperAdminEmail } from '../../config';

interface Props {
  currentUser: UserProfile;
  projects: Project[];
}

const AVATAR_SIZE_PX = 256;
const MAX_AVATAR_DATA_URL_LENGTH = 300000;

/**
 * Center-crops and compresses an uploaded image file to a crisp square JPEG data URL
 * so it loads instantaneously across Header, Profile, and Admin views.
 */
async function compressProfilePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('يرجى اختيار ملف صورة صالح (JPG أو PNG أو WEBP).');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('حجم الصورة كبير جداً. يرجى اختيار صورة أقل من 10 ميجابايت.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('تعذر قراءة الصورة المختارة.'));
      image.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE_PX;
    canvas.height = AVATAR_SIZE_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('تعذر معالجة الصورة على هذا المتصفح.');
    }

    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = Math.max(0, Math.floor((img.naturalWidth - side) / 2));
    const sy = Math.max(0, Math.floor((img.naturalHeight - side) / 2));

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, AVATAR_SIZE_PX, AVATAR_SIZE_PX);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE_PX, AVATAR_SIZE_PX);

    let quality = 0.84;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > MAX_AVATAR_DATA_URL_LENGTH && quality > 0.4) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    if (dataUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
      throw new Error('تعذر ضغط الصورة بالحجم المناسب. يرجى اختيار صورة أخرى.');
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const UserProfileView: React.FC<Props> = ({ currentUser, projects }) => {
  const isAdmin = currentUser.role === 'admin';
  const isSuper = isSuperAdminEmail(currentUser.email);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Personal info state
  const [displayName, setDisplayName] = useState<string>(currentUser.displayName || '');
  const [jobTitle, setJobTitle] = useState<string>(currentUser.jobTitle || '');
  const [phone, setPhone] = useState<string>(currentUser.phone || '');
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const [profileFeedback, setProfileFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Avatar state
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState<boolean>(false);
  const [photoFeedback, setPhotoFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Email change state
  const [newEmail, setNewEmail] = useState<string>(currentUser.email || '');
  const [emailCurrentPassword, setEmailCurrentPassword] = useState<string>('');
  const [showEmailPassword, setShowEmailPassword] = useState<boolean>(false);
  const [isSavingEmail, setIsSavingEmail] = useState<boolean>(false);
  const [emailFeedback, setEmailFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showCurrentPassword, setShowCurrentPassword] = useState<boolean>(false);
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [isSavingPassword, setIsSavingPassword] = useState<boolean>(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Keep form synced when currentUser updates from Firestore
  useEffect(() => {
    setDisplayName(currentUser.displayName || '');
    setJobTitle(currentUser.jobTitle || '');
    setPhone(currentUser.phone || '');
    setNewEmail(currentUser.email || '');
  }, [currentUser.id, currentUser.displayName, currentUser.jobTitle, currentUser.phone, currentUser.email]);

  const assignedProjectsList = projects.filter((p) =>
    (currentUser.assignedProjects || []).includes(p.id)
  );
  const hasAllProjects = isAdmin || isSuper || currentUser.allProjects === true;

  const userInitials = (currentUser.displayName || currentUser.email || 'م')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase();

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPhotoFeedback(null);
    setIsUpdatingPhoto(true);
    try {
      const compressedDataUrl = await compressProfilePhoto(file);
      await dataService.updateMyProfile({ photoUrl: compressedDataUrl });
      setPhotoFeedback({ type: 'success', text: 'تم تحديث صورتك الشخصية بنجاح.' });
    } catch (err) {
      setPhotoFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'تعذر رفع الصورة الشخصية. يرجى المحاولة مرة أخرى.'
      });
    } finally {
      setIsUpdatingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!currentUser.photoUrl) return;
    setPhotoFeedback(null);
    setIsUpdatingPhoto(true);
    try {
      await dataService.updateMyProfile({ photoUrl: null });
      setPhotoFeedback({ type: 'success', text: 'تم إزالة الصورة الشخصية.' });
    } catch {
      setPhotoFeedback({
        type: 'error',
        text: 'تعذر إزالة الصورة الشخصية. يرجى المحاولة مرة أخرى.'
      });
    } finally {
      setIsUpdatingPhoto(false);
    }
  };

  const handleSaveProfileInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileFeedback(null);

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setProfileFeedback({ type: 'error', text: 'الاسم الكامل مطلوب ولا يمكن تركه فارغاً.' });
      return;
    }

    setIsSavingProfile(true);
    try {
      await dataService.updateMyProfile({
        displayName: trimmedName,
        jobTitle: jobTitle.trim(),
        phone: phone.trim()
      });
      setProfileFeedback({ type: 'success', text: 'تم حفظ بياناتك الشخصية بنجاح.' });
    } catch (err) {
      setProfileFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'تعذر حفظ البيانات. يرجى المحاولة مرة أخرى.'
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailFeedback(null);

    if (isSuper) {
      setEmailFeedback({
        type: 'error',
        text: 'بريد المسؤول الرئيسي للنظام محمي ولا يمكن تغييره من هذه الصفحة.'
      });
      return;
    }

    const normalizedNewEmail = newEmail.trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!normalizedNewEmail || !emailPattern.test(normalizedNewEmail)) {
      setEmailFeedback({ type: 'error', text: 'يرجى إدخال بريد إلكتروني صحيح.' });
      return;
    }

    if (normalizedNewEmail === currentUser.email.trim().toLowerCase()) {
      setEmailFeedback({
        type: 'error',
        text: 'البريد الإلكتروني الجديد مطابق لبريدك المسجل حالياً.'
      });
      return;
    }

    if (isSuperAdminEmail(normalizedNewEmail)) {
      setEmailFeedback({ type: 'error', text: 'لا يمكن استخدام هذا البريد الإلكتروني.' });
      return;
    }

    if (!emailCurrentPassword) {
      setEmailFeedback({
        type: 'error',
        text: 'يرجى إدخال كلمة المرور الحالية لتأكيد تغيير البريد الإلكتروني.'
      });
      return;
    }

    setIsSavingEmail(true);
    try {
      const result = await changeCurrentUserEmail(emailCurrentPassword, normalizedNewEmail);
      setEmailCurrentPassword('');

      if (result.status === 'updated') {
        await dataService.updateMyProfile({ email: result.email });
        setEmailFeedback({
          type: 'success',
          text: `تم تحديث بريدك الإلكتروني بنجاح إلى ${result.email}. استخدم البريد الجديد عند تسجيل الدخول مستقبلاً.`
        });
      } else {
        setEmailFeedback({
          type: 'info',
          text: `تم إرسال رابط تأكيد إلى بريدك الجديد (${result.email}). افتح الرابط من بريدك الإلكتروني لإتمام التغيير، وسيتم تحديث حسابك تلقائياً فور تسجيل الدخول بالبريد الجديد.`
        });
      }
    } catch (err) {
      setEmailFeedback({
        type: 'error',
        text: translateFirebaseAuthError(err)
      });
    } finally {
      setIsSavingEmail(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);

    if (!currentPassword) {
      setPasswordFeedback({ type: 'error', text: 'يرجى إدخال كلمة المرور الحالية.' });
      return;
    }

    if (newPassword.length < 6) {
      setPasswordFeedback({
        type: 'error',
        text: 'كلمة المرور الجديدة يجب أن تتكون من 6 أحرف على الأقل.'
      });
      return;
    }

    if (newPassword === currentPassword) {
      setPasswordFeedback({
        type: 'error',
        text: 'كلمة المرور الجديدة يجب أن تكون مختلفة عن كلمة المرور الحالية.'
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordFeedback({
        type: 'error',
        text: 'تأكيد كلمة المرور غير مطابق لكلمة المرور الجديدة.'
      });
      return;
    }

    setIsSavingPassword(true);
    try {
      await changeCurrentUserPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordFeedback({
        type: 'success',
        text: 'تم تغيير كلمة المرور بنجاح. يمكنك استخدام كلمة المرور الجديدة من الآن.'
      });
    } catch (err) {
      setPasswordFeedback({
        type: 'error',
        text: translateFirebaseAuthError(err)
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  // Password strength indicator
  const passwordStrength = (() => {
    if (!newPassword) return null;
    let score = 0;
    if (newPassword.length >= 6) score += 1;
    if (newPassword.length >= 10) score += 1;
    if (/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword)) score += 1;
    if (/\d/.test(newPassword)) score += 1;
    if (/[^A-Za-z0-9]/.test(newPassword)) score += 1;

    if (score <= 2) {
      return { label: 'ضعيفة', width: 'w-1/3', barClass: 'bg-rose-500', textClass: 'text-rose-600 dark:text-rose-400' };
    }
    if (score <= 3) {
      return { label: 'متوسطة', width: 'w-2/3', barClass: 'bg-amber-500', textClass: 'text-amber-600 dark:text-amber-400' };
    }
    return { label: 'قوية', width: 'w-full', barClass: 'bg-emerald-500', textClass: 'text-emerald-600 dark:text-emerald-400' };
  })();

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5">
            <UserCircle2 className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>ملفي الشخصي وإعدادات الحساب</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            تحكم في بياناتك الشخصية، صورتك، بريدك الإلكتروني، وكلمة المرور الخاصة بحسابك
          </p>
        </div>
      </div>

      {/* Hero Profile Card & Photo Upload */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="h-20 sm:h-24 bg-gradient-to-l from-blue-700 via-blue-600 to-indigo-700 relative" />
        <div className="px-4 sm:px-6 pb-5 sm:pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-12 sm:-mt-14">
            {/* Avatar + Identity */}
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-3.5 text-center sm:text-right">
              <div className="relative shrink-0">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-white dark:border-slate-900 bg-slate-100 dark:bg-slate-800 shadow-md overflow-hidden flex items-center justify-center">
                  {currentUser.photoUrl ? (
                    <img
                      src={currentUser.photoUrl}
                      alt={currentUser.displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center text-2xl sm:text-3xl font-extrabold select-none">
                      {userInitials || <UserCheck className="w-10 h-10" />}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isUpdatingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0.5 left-0.5 w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white border-2 border-white dark:border-slate-900 shadow-md flex items-center justify-center transition-colors disabled:opacity-60 cursor-pointer touch-manipulation"
                  title="تغيير الصورة الشخصية"
                  aria-label="تغيير الصورة الشخصية"
                >
                  {isUpdatingPhoto ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelected}
                  className="hidden"
                />
              </div>

              <div className="sm:pb-1 space-y-1">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                    {currentUser.displayName}
                  </h3>
                  <span
                    className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1 ${
                      isAdmin
                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{isSuper ? 'المسؤول الرئيسي (Admin)' : isAdmin ? 'مسؤول نظام (Admin)' : 'مهندس موقع'}</span>
                  </span>
                </div>

                <p className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {currentUser.jobTitle || (isAdmin ? 'إدارة مراقبة الوثائق (DC)' : 'مهندس موقع')}
                </p>

                <p className="text-xs font-mono text-slate-500 dark:text-slate-400" dir="ltr">
                  {currentUser.email}
                </p>
              </div>
            </div>

            {/* Avatar Actions */}
            <div className="flex items-center justify-center sm:justify-end gap-2">
              <button
                type="button"
                disabled={isUpdatingPhoto}
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-60 cursor-pointer touch-manipulation"
              >
                {isUpdatingPhoto ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                <span>{currentUser.photoUrl ? 'تغيير الصورة' : 'إضافة صورة شخصية'}</span>
              </button>

              {currentUser.photoUrl && (
                <button
                  type="button"
                  disabled={isUpdatingPhoto}
                  onClick={handleRemovePhoto}
                  className="px-3 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/70 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-60 cursor-pointer touch-manipulation"
                  title="حذف الصورة الشخصية"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>حذف</span>
                </button>
              )}
            </div>
          </div>

          {photoFeedback && (
            <div
              className={`mt-4 p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                photoFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              }`}
            >
              {photoFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{photoFeedback.text}</span>
            </div>
          )}

          {/* Assigned Projects Read-Only Summary */}
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-bold shrink-0">
              <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>نطاق المشاريع المخصصة:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {hasAllProjects ? (
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold">
                  جميع المشاريع ({projects.length})
                </span>
              ) : assignedProjectsList.length > 0 ? (
                assignedProjectsList.map((proj) => (
                  <span
                    key={proj.id}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                  >
                    {proj.name}
                  </span>
                ))
              ) : (
                <span className="text-slate-500 dark:text-slate-400">لم يتم تعيين مشاريع محددة بعد</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Forms Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Section 1: Personal Details */}
        <form
          onSubmit={handleSaveProfileInfo}
          className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  البيانات الشخصية
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  الاسم والمسمى الوظيفي ورقم التواصل الظاهر في التقارير
                </p>
              </div>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  الاسم الكامل <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={150}
                  required
                  placeholder="مثال: م. أحمد محمد"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  المسمى الوظيفي
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    maxLength={150}
                    placeholder="مثال: مهندس موقع — مراقبة وثائق"
                    className="w-full h-11 pr-10 pl-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <Briefcase className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  رقم الهاتف / الواتساب
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={40}
                    placeholder="+20 100 000 0000"
                    className="w-full h-11 pr-10 pl-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-mono text-right text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <Phone className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                </div>
              </div>
            </div>

            {profileFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                  profileFeedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                }`}
              >
                {profileFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{profileFeedback.text}</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isSavingProfile}
            className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm shadow-blue-600/20 transition-colors disabled:opacity-60 cursor-pointer touch-manipulation"
          >
            {isSavingProfile ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>حفظ البيانات الشخصية</span>
          </button>
        </form>

        {/* Section 2: Update Email */}
        <form
          onSubmit={handleUpdateEmail}
          className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  البريد الإلكتروني للحساب
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  البريد المستخدم لتسجيل الدخول واستعادة كلمة المرور
                </p>
              </div>
            </div>

            {isSuper ? (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 space-y-2">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-xs sm:text-sm">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>بريد المسؤول الرئيسي محمي</span>
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  البريد الحالي (<span className="font-mono font-bold" dir="ltr">{currentUser.email}</span>) مرتبط بصلاحيات المسؤول الرئيسي للنظام، لذلك تم قفل تعديله لضمان عدم فقدان الوصول الإداري. يمكنك تعديل الاسم والصورة والهاتف وكلمة المرور بحرية.
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500 dark:text-slate-400 font-semibold">البريد الحالي:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate" dir="ltr">
                    {currentUser.email}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    البريد الإلكتروني الجديد <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      dir="ltr"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      required
                      placeholder="name@company.com"
                      className="w-full h-11 pr-10 pl-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-mono text-right text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    كلمة المرور الحالية (للتحقق الأمني) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showEmailPassword ? 'text' : 'password'}
                      dir="ltr"
                      value={emailCurrentPassword}
                      onChange={(e) => setEmailCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="w-full h-11 pr-10 pl-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-right text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                    <button
                      type="button"
                      onClick={() => setShowEmailPassword((prev) => !prev)}
                      className="absolute left-2.5 top-2.5 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      aria-label={showEmailPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    >
                      {showEmailPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {emailFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-bold flex items-start gap-2 border leading-relaxed ${
                  emailFeedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : emailFeedback.type === 'info'
                      ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
                      : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                }`}
              >
                {emailFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : emailFeedback.type === 'info' ? (
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{emailFeedback.text}</span>
              </div>
            )}
          </div>

          {!isSuper && (
            <button
              type="submit"
              disabled={isSavingEmail}
              className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm shadow-indigo-600/20 transition-colors disabled:opacity-60 cursor-pointer touch-manipulation"
            >
              {isSavingEmail ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
              <span>تحديث البريد الإلكتروني</span>
            </button>
          )}
        </form>
      </div>

      {/* Section 3: Change Password */}
      <form
        onSubmit={handleUpdatePassword}
        className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4"
      >
        <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              تغيير كلمة المرور
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              أدخل كلمة المرور الحالية ثم اختر كلمة مرور جديدة قوية لحماية حسابك
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Current Password */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              كلمة المرور الحالية <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                dir="ltr"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full h-11 pr-10 pl-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-right text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((prev) => !prev)}
                className="absolute left-2.5 top-2.5 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label={showCurrentPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              كلمة المرور الجديدة <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                dir="ltr"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="6 أحرف على الأقل"
                className="w-full h-11 pr-10 pl-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-right text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <KeyRound className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="absolute left-2.5 top-2.5 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label={showNewPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {passwordStrength && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${passwordStrength.width} ${passwordStrength.barClass}`} />
                </div>
                <span className={`text-[11px] font-bold ${passwordStrength.textClass}`}>
                  {passwordStrength.label}
                </span>
              </div>
            )}
          </div>

          {/* Confirm New Password */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              تأكيد كلمة المرور الجديدة <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                dir="ltr"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="أعد كتابة كلمة المرور"
                className="w-full h-11 pr-10 pl-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-right text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <KeyRound className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute left-2.5 top-2.5 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label={showConfirmPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {passwordFeedback && (
          <div
            className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
              passwordFeedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
            }`}
          >
            {passwordFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{passwordFeedback.text}</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSavingPassword}
            className="w-full sm:w-auto px-6 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm shadow-emerald-600/20 transition-colors disabled:opacity-60 cursor-pointer touch-manipulation"
          >
            {isSavingPassword ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <KeyRound className="w-4 h-4" />
            )}
            <span>تحديث كلمة المرور</span>
          </button>
        </div>
      </form>
    </div>
  );
};
