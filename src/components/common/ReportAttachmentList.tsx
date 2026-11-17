import React, { useState } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Paperclip,
  Eye,
  Download,
  Loader2,
  AlertCircle,
  X
} from 'lucide-react';
import { ReportAttachment } from '../../types';
import { dataService } from '../../services/dataService';
import {
  formatFileSize,
  getReportAttachmentKind,
  parseExcelPreviewFromBlobUrl,
  ExcelPreviewSheet
} from '../../utils/pdfUtils';

interface Props {
  reportId: string;
  attachments?: ReportAttachment[];
  title?: string;
}

export const ReportAttachmentList: React.FC<Props> = ({
  reportId,
  attachments,
  title = 'المرفقات والصور المرفوعة مع التقرير'
}) => {
  const list = (attachments || []).filter(Boolean);
  const [loadingPreviewIdx, setLoadingPreviewIdx] = useState<number | null>(null);
  const [loadingDownloadIdx, setLoadingDownloadIdx] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [previewAttachment, setPreviewAttachment] = useState<ReportAttachment | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<'pdf' | 'image' | 'excel' | 'other'>('pdf');
  const [excelSheets, setExcelSheets] = useState<ExcelPreviewSheet[] | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState<number>(0);

  if (list.length === 0) {
    return null;
  }

  const resolveEffectiveKind = (att: ReportAttachment, resolvedUrl: string) => {
    const baseKind = getReportAttachmentKind(att);
    if (
      resolvedUrl.startsWith('http') &&
      (resolvedUrl.includes('images.unsplash.com') ||
        /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(resolvedUrl))
    ) {
      return 'image';
    }
    return baseKind;
  };

  const handlePreview = async (att: ReportAttachment, idx: number) => {
    setErrorMsg(null);
    setLoadingPreviewIdx(idx);
    try {
      const url = await dataService.fetchReportAttachmentUrl(reportId, att);
      const kind = resolveEffectiveKind(att, url);

      if (kind === 'excel') {
        const sheets = await parseExcelPreviewFromBlobUrl(url);
        setExcelSheets(sheets);
        setActiveSheetIdx(0);
      } else {
        setExcelSheets(null);
      }

      setPreviewKind(kind);
      setPreviewAttachment(att);
      setPreviewUrl(url);
    } catch (err) {
      setExcelSheets(null);
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تحميل المرفق للمعاينة.');
    } finally {
      setLoadingPreviewIdx(null);
    }
  };

  const handleDownload = async (att: ReportAttachment, idx: number) => {
    setErrorMsg(null);
    setLoadingDownloadIdx(idx);
    try {
      const url = await dataService.fetchReportAttachmentUrl(reportId, att);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.name || 'attachment';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تحميل المرفق.');
    } finally {
      setLoadingDownloadIdx(null);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-blue-600 shrink-0" />
          <span>{title}</span>
          <span className="text-[11px] font-mono bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
            {list.length}
          </span>
        </h4>
      </div>

      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-500 hover:text-rose-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {list.map((att, idx) => {
          const kind = getReportAttachmentKind(att);
          const isPreviewing = loadingPreviewIdx === idx;
          const isDownloading = loadingDownloadIdx === idx;
          const isLegacyLocalBlob =
            att.storageMode !== 'firestore_chunks' && att.url?.startsWith('blob:');

          return (
            <div
              key={att.id || `${att.name}-${idx}`}
              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2.5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    kind === 'pdf'
                      ? 'bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400'
                      : kind === 'excel'
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                        : kind === 'image'
                          ? 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {kind === 'pdf' ? (
                    <FileText className="w-4 h-4" />
                  ) : kind === 'excel' ? (
                    <FileSpreadsheet className="w-4 h-4" />
                  ) : kind === 'image' ? (
                    <ImageIcon className="w-4 h-4" />
                  ) : (
                    <Paperclip className="w-4 h-4" />
                  )}
                </div>

                <div className="min-w-0">
                  <p
                    className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate"
                    dir="ltr"
                    title={att.name}
                  >
                    {att.name}
                  </p>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>{att.size ? formatFileSize(att.size) : 'مرفق'}</span>
                    <span>•</span>
                    <span>
                      {kind === 'pdf'
                        ? 'PDF'
                        : kind === 'excel'
                          ? 'Excel'
                          : kind === 'image'
                            ? 'صورة'
                            : 'ملف'}
                    </span>
                    {isLegacyLocalBlob && (
                      <>
                        <span>•</span>
                        <span className="text-amber-600 dark:text-amber-400">محلي قديم</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={isPreviewing || isDownloading}
                  onClick={() => handlePreview(att, idx)}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
                  title="معاينة المرفق"
                >
                  {isPreviewing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                  <span>معاينة</span>
                </button>

                <button
                  type="button"
                  disabled={isPreviewing || isDownloading}
                  onClick={() => handleDownload(att, idx)}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
                  title="تحميل المرفق"
                >
                  {isDownloading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>تحميل</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Attachment Preview Modal */}
      {previewAttachment && previewUrl && (
        <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[88vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
            <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate" dir="ltr">
                  {previewAttachment.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {previewAttachment.size ? formatFileSize(previewAttachment.size) : ''}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={previewUrl}
                  download={previewAttachment.name}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>تحميل الملف</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewAttachment(null);
                    setPreviewUrl(null);
                    setExcelSheets(null);
                  }}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                  aria-label="إغلاق المعاينة"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {previewKind === 'excel' && excelSheets ? (
              <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950">
                <div className="px-3 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto">
                  {excelSheets.map((sheet, idx) => (
                    <button
                      key={`${sheet.name}-${idx}`}
                      type="button"
                      onClick={() => setActiveSheetIdx(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                        activeSheetIdx === idx
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {sheet.name} ({sheet.totalRows})
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-auto p-3">
                  {(() => {
                    const currentSheet = excelSheets[activeSheetIdx];
                    if (!currentSheet || currentSheet.rows.length === 0) {
                      return (
                        <div className="p-8 text-center text-xs font-semibold text-slate-500">
                          ورقة العمل هذه فارغة.
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-2">
                        {currentSheet.truncated && (
                          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-xs font-semibold text-amber-800 dark:text-amber-200">
                            يتم عرض أول 250 صفاً فقط في المعاينة السريعة من أصل {currentSheet.totalRows} صف. لتحميل الملف كاملاً اضغط «تحميل الملف».
                          </div>
                        )}
                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                          <table className="w-full text-xs text-right border-collapse">
                            <tbody>
                              {currentSheet.rows.map((row, rIdx) => (
                                <tr
                                  key={rIdx}
                                  className={
                                    rIdx === 0
                                      ? 'bg-slate-100 dark:bg-slate-800 font-bold text-slate-900 dark:text-white'
                                      : 'border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                  }
                                >
                                  <td className="px-2 py-1.5 text-[10px] font-mono text-slate-400 border-l border-slate-200 dark:border-slate-800 select-none">
                                    {rIdx + 1}
                                  </td>
                                  {row.map((cell, cIdx) => (
                                    <td
                                      key={cIdx}
                                      className="px-2.5 py-1.5 border-l border-slate-100 dark:border-slate-800 whitespace-nowrap max-w-[260px] truncate text-slate-700 dark:text-slate-200"
                                      title={cell}
                                    >
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : previewKind === 'image' ? (
              <div className="flex-1 bg-slate-950/90 flex items-center justify-center p-4 overflow-auto">
                <img
                  src={previewUrl}
                  alt={previewAttachment.name}
                  className="max-w-full max-h-full object-contain rounded-xl shadow-lg"
                />
              </div>
            ) : previewKind === 'pdf' ? (
              <div className="flex-1 bg-slate-100 dark:bg-slate-950">
                <iframe
                  src={previewUrl}
                  title={previewAttachment.name}
                  className="w-full h-full border-0"
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <Paperclip className="w-10 h-10 text-slate-400" />
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  لا تتوفر معاينة مباشرة لهذه الصيغة داخل المتصفح.
                </p>
                <a
                  href={previewUrl}
                  download={previewAttachment.name}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>تحميل الملف على جهازك</span>
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
