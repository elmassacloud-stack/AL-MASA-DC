import React, { useState } from 'react';
import {
  X,
  Share2,
  Copy,
  Check,
  ExternalLink,
  Smartphone,
  Globe,
  Send,
  QrCode
} from 'lucide-react';
import { SHARED_APP_URL, DEV_APP_URL, getAppUrl } from '../../config';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const ShareAppModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [copiedShared, setCopiedShared] = useState(false);
  const [copiedDev, setCopiedDev] = useState(false);
  const [showDevUrl, setShowDevUrl] = useState(false);

  if (!isOpen) return null;

  const currentOriginUrl = getAppUrl();
  const activeUrl = currentOriginUrl || SHARED_APP_URL;

  const handleCopy = async (url: string, type: 'shared' | 'dev') => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      if (type === 'shared') {
        setCopiedShared(true);
        setTimeout(() => setCopiedShared(false), 2500);
      } else {
        setCopiedDev(true);
        setTimeout(() => setCopiedDev(false), 2500);
      }
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const whatsappMessage = encodeURIComponent(
    `السلام عليكم، رابط تطبيق "متابعة المواقع" لإدارة مراقبة الوثائق (DC) لإرسال التقارير اليومية والعوائق:\n${activeUrl}`
  );
  const whatsappUrl = `https://api.whatsapp.com/send?text=${whatsappMessage}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                رابط التطبيق والمشاركة
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                شارك الرابط مع مهندسي المواقع لفتح المنظومة من الهواتف
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Main Shared App URL Box */}
          <div className="p-4 bg-blue-50/70 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-900/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 dark:text-blue-300">
                <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>رابط التطبيق المباشر (المعتمد للمستخدمين)</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-semibold">
                Live URL
              </span>
            </div>

            {/* URL Input Bar */}
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-700 p-1.5 shadow-2xs">
              <input
                type="text"
                readOnly
                value={activeUrl}
                dir="ltr"
                className="w-full bg-transparent px-2.5 text-xs font-mono text-slate-800 dark:text-slate-200 select-all focus:outline-hidden"
              />
              <button
                onClick={() => handleCopy(activeUrl, 'shared')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all ${
                  copiedShared
                    ? 'bg-emerald-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                }`}
              >
                {copiedShared ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>تم النسخ!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>نسخ</span>
                  </>
                )}
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={activeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>فتح في نافذة جديدة</span>
              </a>

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>إرسال عبر واتساب</span>
              </a>
            </div>
          </div>

          {/* Mobile usage guidance */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <Smartphone className="w-4 h-4" />
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <div className="font-bold text-slate-800 dark:text-white">
                تثبيت التطبيق على هواتف مهندسي المواقع:
              </div>
              <p className="leading-relaxed">
                عند فتح الرابط في متصفح الهاتف (Safari على آيفون أو Chrome على أندرويد)، يمكن الضغط على زر المشاركة ثم اختيار{' '}
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  "إضافة إلى الشاشة الرئيسية" (Add to Home Screen)
                </span>{' '}
                ليعمل التطبيق كأنه تطبيق جوال أصيل بدون الحاجة لتحميل من المتجر.
              </p>
            </div>
          </div>

          {/* Developer / Alternative URL */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
            <button
              onClick={() => setShowDevUrl((prev) => !prev)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1"
            >
              <span>{showDevUrl ? 'إخفاء' : 'عرض'} رابط بيئة التطوير (Development URL)</span>
            </button>

            {showDevUrl && (
              <div className="mt-2.5 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg space-y-2">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  الرابط المخصص لبيئة التطوير والاختبار الداخلي:
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={DEV_APP_URL}
                    dir="ltr"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-mono rounded text-slate-700 dark:text-slate-300 select-all"
                  />
                  <button
                    onClick={() => handleCopy(DEV_APP_URL, 'dev')}
                    className="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-xs font-bold rounded text-slate-800 dark:text-slate-200 shrink-0"
                  >
                    {copiedDev ? 'تم!' : 'نسخ'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
