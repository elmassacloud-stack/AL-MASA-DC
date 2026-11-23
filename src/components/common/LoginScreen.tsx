import React, { useState } from 'react';
import {
  Lock,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  FolderArchive,
  ClipboardCheck,
  ShieldCheck,
  Sun,
  Moon,
  Loader2,
  ArrowLeft
} from 'lucide-react';
import {
  signInWithEmail,
  sendResetPasswordEmail,
  translateFirebaseAuthError
} from '../../services/firebase';

interface Props {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  externalError?: string | null;
  onClearExternalError?: () => void;
  onRetryAuth?: () => void;
}

export const LoginScreen: React.FC<Props> = ({
  darkMode,
  onToggleDarkMode,
  externalError,
  onClearExternalError,
  onRetryAuth
}) => {
  const [emailInput, setEmailInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isForgotMode, setIsForgotMode] = useState<boolean>(false);
  const [forgotEmail, setForgotEmail] = useState<string>('');
  const [forgotSentMsg, setForgotSentMsg] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const displayedError = errorMsg || externalError || null;

  const handleStandardLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (onClearExternalError) onClearExternalError();

    const email = emailInput.trim();
    if (!email) {
      setErrorMsg('يرجى إدخال البريد الإلكتروني.');
      return;
    }
    if (!passwordInput) {
      setErrorMsg('يرجى إدخال كلمة المرور.');
      return;
    }

    setIsLoading(true);
    try {
      await signInWithEmail(email, passwordInput);
      // Auth state listener in App.tsx handles profile resolution & navigation
    } catch (err) {
      setErrorMsg(translateFirebaseAuthError(err));
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (onClearExternalError) onClearExternalError();

    const email = forgotEmail.trim();
    if (!email) {
      setErrorMsg('يرجى إدخال البريد الإلكتروني لإرسال رابط الاستعادة.');
      return;
    }

    setIsLoading(true);
    try {
      await sendResetPasswordEmail(email);
      setForgotSentMsg(true);
    } catch (err) {
      setErrorMsg(translateFirebaseAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#0b233d] via-[#113152] to-[#081a2e] dark:from-[#061322] dark:via-[#0b2139] dark:to-[#040e1a] text-white transition-colors relative overflow-hidden">
      {/* Subtle Ambient Architectural Radial Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.12),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(30,64,175,0.16),transparent_55%)]"
      />

      {/* Top Navigation Bar */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-2 flex items-center justify-between gap-4">
        {/* Company Brand (Right in RTL) */}
        <div className="flex items-center gap-3">
          <div className="h-10 sm:h-11 px-2.5 py-1 rounded-xl bg-white border border-white/25 shadow-[0_0_20px_rgba(56,189,248,0.18)] flex items-center justify-center shrink-0">
            <img
              src="/assets/aistudio/WhatsApp_Image_2026-10-28_at_10.05.14_AM_da55daa3.jpeg"
              alt="شعار شركة الماسة للمقاولات"
              className="h-full w-auto max-w-[125px] sm:max-w-[145px] object-contain"
            />
          </div>
          <div>
            <span className="font-bold text-sm sm:text-base text-white block leading-snug">
              شركة الماسة للمقاولات
            </span>
            <span className="text-[11px] sm:text-xs text-sky-200/80 font-medium block">
              متابعة المواقع — إدارة مراقبة الوثائق (DC)
            </span>
          </div>
        </div>

        {/* Dark / Light Mode Toggle (Left in RTL) */}
        <button
          type="button"
          onClick={onToggleDarkMode}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-slate-100 transition-colors cursor-pointer backdrop-blur-xs"
          aria-label={darkMode ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
          title={darkMode ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
        >
          {darkMode ? (
            <>
              <Sun className="w-4 h-4 text-amber-300" />
              <span>الوضع النهاري</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-sky-200" />
              <span>الوضع الليلي</span>
            </>
          )}
        </button>
      </header>

      {/* Main Split Two-Card Container */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-6 py-6 sm:py-8">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-stretch">
          {/* RIGHT PANEL (RTL first): System Identity & Highlights Glass Card */}
          <section className="lg:col-span-5 rounded-3xl bg-white/[0.07] dark:bg-slate-900/55 border border-white/15 backdrop-blur-md p-6 sm:p-8 flex flex-col justify-between shadow-2xl">
            <div className="space-y-6">
              {/* Top Kicker */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs font-semibold text-sky-200">
                <FolderArchive className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                <span>منظومة إدارة مراقبة الوثائق (DC)</span>
              </div>

              {/* Hero Title & Subtitle */}
              <div className="space-y-3">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight text-balance">
                  منظومة متابعة المواقع والتقارير اليومية
                </h1>
                <p className="text-xs sm:text-sm text-slate-300/95 leading-relaxed font-normal">
                  متابعة فورية لتقارير الأعمال اليومية، تسليمات المواقع، وموقف التقديمات الهندسية (IR / MIR / Shop Drawings)، مع سجل حوكمة ومهام متكامل لكل مشروع وفق أعلى معايير الدقة والأمان.
                </p>
              </div>

              {/* Core Features List */}
              <ul className="space-y-3.5 pt-2">
                <li className="flex items-center gap-3 text-xs sm:text-sm text-slate-100/95">
                  <span className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-sky-300 shrink-0">
                    <ClipboardCheck className="w-4 h-4" />
                  </span>
                  <span>متابعة يومية للأعمال المقدمة والمستلمة وموقف الاستشاري</span>
                </li>
                <li className="flex items-center gap-3 text-xs sm:text-sm text-slate-100/95">
                  <span className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-sky-300 shrink-0">
                    <FolderArchive className="w-4 h-4" />
                  </span>
                  <span>إدارة تسليمات الموقع (PDF / Excel) والمهام والبلاغات العاجلة</span>
                </li>
                <li className="flex items-center gap-3 text-xs sm:text-sm text-slate-100/95">
                  <span className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-sky-300 shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </span>
                  <span>صلاحيات مخصصة لكل مشروع ودخول محصور بالحسابات المعتمدة فقط</span>
                </li>
              </ul>
            </div>

            {/* Panel Footer */}
            <div className="mt-8 pt-4 border-t border-white/10 flex items-center justify-between gap-2 text-xs">
              <span className="text-emerald-400 font-semibold">دخول آمن ومصرح به فقط</span>
              <span className="font-mono text-slate-300/85 tracking-wide" dir="ltr">
                ALMASA DC v2.5
              </span>
            </div>
          </section>

          {/* LEFT PANEL (RTL second): White Login Form Card */}
          <section className="lg:col-span-7 rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8 shadow-2xl flex flex-col justify-between">
            <div className="space-y-5">
              {/* Card Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    <Lock className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                    <span>بوابة الدخول المصرح بها فقط</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-[#0f2942] dark:text-white">
                    {isForgotMode ? 'استعادة كلمة المرور' : 'تسجيل الدخول للنظام'}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                    {isForgotMode
                      ? 'أدخل بريدك الإلكتروني المسجل لاستلام رابط إعادة تعيين كلمة المرور'
                      : 'سجّل الدخول باستخدام بريدك الإلكتروني المضاف من قبل مدير النظام (الأدمن)'}
                  </p>
                </div>

                <div className="w-11 h-11 rounded-2xl bg-[#102d4c] dark:bg-sky-900/60 text-white flex items-center justify-center shadow-md shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
              </div>

              {/* Error Alert */}
              {displayedError && (
                <div
                  role="alert"
                  className="p-3.5 bg-red-50 dark:bg-red-950/80 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-xs sm:text-sm font-medium flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{displayedError}</span>
                  </div>
                  {onRetryAuth && (
                    <button
                      type="button"
                      onClick={onRetryAuth}
                      className="shrink-0 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer transition-colors"
                    >
                      إعادة المحاولة
                    </button>
                  )}
                </div>
              )}

              {/* Admin-Only Provisioning Notice Box */}
              {!isForgotMode && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="space-y-1 text-xs">
                    <p className="font-bold text-slate-800 dark:text-slate-100">
                      الدخول مقصور على الإيميلات المضافة من قبل الأدمن
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                      تم إيقاف التسجيل العام والدخول التجريبي. فقط مدير النظام (الأدمن) يملك صلاحية إضافة المستخدمين وتعيين المشاريع المصرح بها، وأي بريد إلكتروني غير مسجل سيتم رفض دخوله تلقائياً.
                    </p>
                  </div>
                </div>
              )}

              {/* Auth Form */}
              {isForgotMode ? (
                <form onSubmit={handleForgotPassword} className="space-y-4 text-sm pt-1">
                  {forgotSentMsg ? (
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm flex items-start gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <span>
                        تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني. يرجى مراجعة صندوق الوارد أو الرسائل غير المرغوب فيها.
                      </span>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                        البريد الإلكتروني المؤسسي <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="email"
                          required
                          dir="ltr"
                          autoComplete="email"
                          placeholder="user@company.com"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          className="w-full h-11 pr-10 pl-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[#102d4c] dark:focus:ring-sky-500 focus:border-transparent focus:outline-none text-slate-900 dark:text-white font-mono text-left text-sm"
                        />
                        <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotMode(false);
                        setForgotSentMsg(false);
                        setErrorMsg(null);
                      }}
                      className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-[#102d4c] dark:hover:text-white hover:underline cursor-pointer"
                    >
                      العودة لتسجيل الدخول
                    </button>

                    {!forgotSentMsg && (
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="px-5 py-2.5 bg-[#102d4c] hover:bg-[#163d66] dark:bg-sky-600 dark:hover:bg-sky-700 text-white font-bold rounded-xl text-xs sm:text-sm cursor-pointer shadow-sm disabled:opacity-50 flex items-center gap-2 transition-colors"
                      >
                        {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                        <span>إرسال رابط الاستعادة</span>
                      </button>
                    )}
                  </div>
                </form>
              ) : (
                <form onSubmit={handleStandardLogin} className="space-y-4 text-sm">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      البريد الإلكتروني المؤسسي <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        dir="ltr"
                        autoComplete="email"
                        placeholder="user@company.com"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        className="w-full h-11 pr-10 pl-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[#102d4c] dark:focus:ring-sky-500 focus:border-transparent focus:outline-none text-slate-900 dark:text-white font-mono text-left text-sm"
                      />
                      <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        كلمة المرور <span className="text-red-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setIsForgotMode(true);
                          setErrorMsg(null);
                          setForgotEmail(emailInput);
                        }}
                        className="text-xs font-semibold text-[#102d4c] dark:text-sky-400 hover:underline cursor-pointer"
                      >
                        نسيت كلمة المرور؟
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        dir="ltr"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        className="w-full h-11 pr-10 pl-10 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[#102d4c] dark:focus:ring-sky-500 focus:border-transparent focus:outline-none text-slate-900 dark:text-white font-mono text-left text-sm"
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                        className="absolute left-3 top-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-12 bg-[#102d4c] hover:bg-[#173d66] active:bg-[#0c223a] dark:bg-sky-600 dark:hover:bg-sky-700 text-white font-bold rounded-xl shadow-md shadow-[#102d4c]/20 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-60"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>جاري التحقق من الحساب...</span>
                      </>
                    ) : (
                      <>
                        <span>تسجيل الدخول للنظام</span>
                        <ArrowLeft className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>

            {/* White Card Bottom Bar */}
            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>التحقق من الصلاحيات محمي بقواعد الحوكمة</span>
              </span>
              <span className="font-mono font-semibold text-slate-400 dark:text-slate-500" dir="ltr">
                RBAC
              </span>
            </div>
          </section>
        </div>
      </main>

      {/* Bottom Institutional Footer */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 pb-5 pt-2 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>© 2026 شركة الماسة للمقاولات العامة - جميع الحقوق محفوظة</span>
        <span className="inline-flex items-center gap-1.5 text-slate-300/80">
          <ShieldCheck className="w-3.5 h-3.5 text-sky-400/80 shrink-0" />
          <span>سجلات مشفرة ومتوافقة مع الحوكمة</span>
        </span>
      </footer>
    </div>
  );
};
