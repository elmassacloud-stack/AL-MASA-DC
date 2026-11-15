import React, { useState } from 'react';
import {
  Lock,
  Mail,
  LogIn,
  CheckCircle2,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  FolderArchive,
  Sun,
  Moon,
  ShieldCheck,
  Loader2
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
}

export const LoginScreen: React.FC<Props> = ({
  darkMode,
  onToggleDarkMode,
  externalError,
  onClearExternalError
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
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors relative overflow-hidden">
      {/* Subtle Architectural Grid Background */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-[0.35] dark:opacity-[0.15]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgb(148 163 184 / 0.35) 1px, transparent 0)',
          backgroundSize: '28px 28px'
        }}
      />

      {/* Top Corner Theme Toggle */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/20">
            <FolderArchive className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-white block leading-none">
              متابعة المواقع
            </span>
            <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
              إدارة مراقبة الوثائق والمشاريع (DC)
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleDarkMode}
          className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
          aria-label={darkMode ? 'الوضع النهاري' : 'الوضع الليلي'}
          title={darkMode ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
        >
          {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>

      {/* Centered Auth Card */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200 dark:border-slate-800 space-y-6">
          {/* Card Header */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/25">
              <Lock className="w-7 h-7" />
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white pt-1">
              {isForgotMode ? 'استعادة كلمة المرور' : 'تسجيل الدخول إلى المنظومة'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
              {isForgotMode
                ? 'أدخل بريدك الإلكتروني المسجل لاستلام رابط إعادة تعيين كلمة المرور'
                : 'بوابة تقارير الأعمال اليومية ومراقبة الوثائق للمشاريع والمواقع'}
            </p>
          </div>

          {displayedError && (
            <div
              role="alert"
              className="p-3.5 bg-red-50 dark:bg-red-950/80 border border-red-300 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-xs sm:text-sm font-medium flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{displayedError}</span>
            </div>
          )}

          {isForgotMode ? (
            <form onSubmit={handleForgotPassword} className="space-y-4 text-sm">
              {forgotSentMsg ? (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني. يرجى مراجعة صندوق الوارد أو الرسائل غير المرغوب فيها.
                  </span>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    البريد الإلكتروني المسجل
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      dir="ltr"
                      autoComplete="email"
                      placeholder="name@company.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="w-full h-11 pr-10 pl-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-mono text-left text-sm"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotMode(false);
                    setForgotSentMsg(false);
                    setErrorMsg(null);
                  }}
                  className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:underline cursor-pointer"
                >
                  العودة لتسجيل الدخول
                </button>
                {!forgotSentMsg && (
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs sm:text-sm cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-2"
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
                  البريد الإلكتروني
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    dir="ltr"
                    autoComplete="email"
                    placeholder="name@company.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full h-11 pr-10 pl-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-mono text-left text-sm"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    كلمة المرور
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotMode(true);
                      setErrorMsg(null);
                      setForgotEmail(emailInput);
                    }}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
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
                    className="w-full h-11 pr-10 pl-10 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-mono text-left text-sm"
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    className="absolute left-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري التحقق من الحساب...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>تسجيل الدخول</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Institutional Access Notice (No Self-Registration) */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              الدخول مقتصر على الحسابات المعتمدة فقط. يتم إنشاء الحسابات وتعيين المشاريع حصرياً عبر{' '}
              <strong className="text-slate-800 dark:text-slate-200">مسؤول النظام (Admin)</strong>.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
