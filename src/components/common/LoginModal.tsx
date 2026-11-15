import React, { useState } from 'react';
import {
  Lock,
  Mail,
  X,
  LogIn,
  CheckCircle2,
  Shield,
  HardHat,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle
} from 'lucide-react';
import { UserProfile } from '../../types';
import { isConfiguredAdminEmail } from '../../config';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  users: UserProfile[];
  currentUser: UserProfile;
  onSelectUser: (user: UserProfile) => void;
}

export const LoginModal: React.FC<Props> = ({
  isOpen,
  onClose,
  users,
  currentUser,
  onSelectUser
}) => {
  const [emailInput, setEmailInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isForgotMode, setIsForgotMode] = useState<boolean>(false);
  const [forgotEmail, setForgotEmail] = useState<string>('');
  const [forgotSentMsg, setForgotSentMsg] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStandardLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const email = emailInput.trim().toLowerCase();
    if (!email) {
      setErrorMsg('يرجى إدخال البريد الإلكتروني.');
      return;
    }

    // Match existing registered user in local database
    const matchedUser = users.find((u) => u.email.toLowerCase() === email);
    if (matchedUser) {
      if (matchedUser.status === 'disabled') {
        setErrorMsg('هذا الحساب معطل حالياً من قبل مدير إدارة مراقبة الوثائق.');
        return;
      }
      onSelectUser(matchedUser);
      onClose();
      return;
    }

    // If matches admin configured email but not yet in user list, bootstrap admin
    if (isConfiguredAdminEmail(email)) {
      const newAdmin: UserProfile = {
        id: 'user-admin-' + Date.now().toString(36),
        email,
        displayName: 'مدير إدارة مراقبة الوثائق (DC)',
        role: 'admin',
        assignedProjects: ['proj-ravel-3', 'proj-tahliya-towers', 'proj-metro-station'],
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      onSelectUser(newAdmin);
      onClose();
      return;
    }

    setErrorMsg('البريد الإلكتروني غير مسجل. يرجى التواصل مع مدير إدارة DC لإضافتك أو استخدام أزرار الدخول التجريبي بالأسفل.');
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;

    setForgotSentMsg(true);
    setTimeout(() => {
      setForgotSentMsg(false);
      setIsForgotMode(false);
      setForgotEmail('');
    }, 3000);
  };

  const handleQuickLogin = (user: UserProfile) => {
    onSelectUser(user);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg">
                {isForgotMode ? 'استعادة كلمة المرور' : 'تسجيل الدخول للنظام'}
              </h3>
              <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                تطبيق متابعة المواقع — إدارة مراقبة الوثائق DC
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

        {errorMsg && (
          <div className="p-3 bg-red-50 dark:bg-red-950/80 border border-red-300 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* FORGOT PASSWORD FORM */}
        {isForgotMode ? (
          <form onSubmit={handleForgotPassword} className="space-y-4 text-xs sm:text-sm">
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              أدخل بريدك الإلكتروني المسجل، وسيتم إرسال رابط إعادة تعيين كلمة المرور فوراً عبر خدمة Firebase Auth.
            </p>

            {forgotSentMsg ? (
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني بنجاح!</span>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  البريد الإلكتروني
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="w-full h-11 pr-10 pl-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-mono text-left"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setIsForgotMode(false)}
                className="text-xs text-slate-600 dark:text-slate-400 hover:underline cursor-pointer"
              >
                العودة لتسجيل الدخول
              </button>
              <button
                type="submit"
                disabled={forgotSentMsg}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs sm:text-sm cursor-pointer shadow-xs disabled:opacity-50"
              >
                إرسال الرابط
              </button>
            </div>
          </form>
        ) : (
          /* STANDARD LOGIN FORM */
          <form onSubmit={handleStandardLogin} className="space-y-4 text-xs sm:text-sm">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                البريد الإلكتروني (Email)
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  placeholder="admin@dc-manager.com أو مهندس الموقع"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full h-11 pr-10 pl-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-mono text-left"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  كلمة المرور (Password)
                </label>
                <button
                  type="button"
                  onClick={() => setIsForgotMode(true)}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  نسيت كلمة المرور؟
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full h-11 pr-10 pl-10 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-mono text-left"
                />
                <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>تسجيل الدخول</span>
            </button>
          </form>
        )}

        {/* QUICK DEMO USERS SWITCHER (Essential for rapid review & testing roles) */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block font-medium">
            دخول تجريبي سريع بنقرة واحدة (لاختبار الصلاحيات وعزل البيانات):
          </span>

          <div className="space-y-1.5">
            {/* Admin option */}
            <button
              type="button"
              onClick={() => handleQuickLogin(users[0])}
              className={`w-full p-2.5 rounded-xl border text-right flex items-center justify-between cursor-pointer transition-all ${
                currentUser.role === 'admin'
                  ? 'border-purple-400 bg-purple-50/60 dark:bg-purple-950/40'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>أ/ أحمد المنصور</span>
                    <span className="text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 px-1.5 py-0.2 rounded font-bold">
                      مدير DC (Admin)
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">admin@dc-manager.com</span>
                </div>
              </div>
              <span className="text-xs text-purple-600 dark:text-purple-400 font-bold">دخول</span>
            </button>

            {/* Site Engineer 1 (Ravel Hospital 3) */}
            {users[1] && (
              <button
                type="button"
                onClick={() => handleQuickLogin(users[1])}
                className={`w-full p-2.5 rounded-xl border text-right flex items-center justify-between cursor-pointer transition-all ${
                  currentUser.id === users[1].id
                    ? 'border-blue-400 bg-blue-50/60 dark:bg-blue-950/40'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
                    <HardHat className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>{users[1].displayName}</span>
                      <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 px-1.5 py-0.2 rounded font-bold">
                        مستشفى رافيل 3
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">{users[1].email}</span>
                  </div>
                </div>
                <span className="text-xs text-blue-600 dark:text-blue-400 font-bold">دخول</span>
              </button>
            )}

            {/* Site Engineer 2 (Tahliya Towers) */}
            {users[2] && (
              <button
                type="button"
                onClick={() => handleQuickLogin(users[2])}
                className={`w-full p-2.5 rounded-xl border text-right flex items-center justify-between cursor-pointer transition-all ${
                  currentUser.id === users[2].id
                    ? 'border-teal-400 bg-teal-50/60 dark:bg-teal-950/40'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
                    <HardHat className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>{users[2].displayName}</span>
                      <span className="text-[10px] bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 px-1.5 py-0.2 rounded font-bold">
                        أبراج التحلية
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">{users[2].email}</span>
                  </div>
                </div>
                <span className="text-xs text-teal-600 dark:text-teal-400 font-bold">دخول</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
