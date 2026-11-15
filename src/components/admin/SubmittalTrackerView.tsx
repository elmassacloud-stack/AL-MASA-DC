import React, { useState, useMemo } from 'react';
import {
  Search,
  AlertTriangle,
  History,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Building,
  Calendar,
  Sparkles
} from 'lucide-react';
import { DailyReport, SubmittalStatusCode } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { DEFAULT_STALLED_DAYS_THRESHOLD, SUBMITTAL_STATUS_CONFIG } from '../../config';

interface Props {
  reports: DailyReport[];
  stalledDaysThreshold?: number;
  onUpdateStalledDays?: (days: number) => void;
}

interface SubmittalHistoryEntry {
  reportId: string;
  reportDate: string;
  projectId: string;
  projectName: string;
  senderName: string;
  sourceType: 'submitted' | 'received';
  itemDescription: string;
  submittalNumber: string;
  rev: number;
  status: SubmittalStatusCode;
}

interface GroupedSubmittal {
  submittalNumber: string;
  itemDescription: string;
  projectName: string;
  projectId: string;
  latestEntry: SubmittalHistoryEntry;
  history: SubmittalHistoryEntry[];
  isStalled: boolean;
  stalledDays: number;
}

export const SubmittalTrackerView: React.FC<Props> = ({
  reports,
  stalledDaysThreshold = DEFAULT_STALLED_DAYS_THRESHOLD,
  onUpdateStalledDays
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [thresholdDays, setThresholdDays] = useState<number>(stalledDaysThreshold);
  const [expandedSubmittals, setExpandedSubmittals] = useState<Set<string>>(new Set());

  // Aggregate all submittal entries across all reports
  const allSubmittals = useMemo(() => {
    const list: SubmittalHistoryEntry[] = [];

    reports.forEach((report) => {
      report.submittedWorks.forEach((item) => {
        if (item.submittalNumber.trim()) {
          list.push({
            reportId: report.id,
            reportDate: report.reportDate,
            projectId: report.projectId,
            projectName: report.projectName,
            senderName: report.senderName,
            sourceType: 'submitted',
            itemDescription: item.itemDescription,
            submittalNumber: item.submittalNumber.trim(),
            rev: item.rev,
            status: item.status
          });
        }
      });

      report.receivedWorks.forEach((item) => {
        if (item.submittalNumber.trim()) {
          list.push({
            reportId: report.id,
            reportDate: report.reportDate,
            projectId: report.projectId,
            projectName: report.projectName,
            senderName: report.senderName,
            sourceType: 'received',
            itemDescription: item.itemDescription,
            submittalNumber: item.submittalNumber.trim(),
            rev: item.rev,
            status: item.status
          });
        }
      });
    });

    return list;
  }, [reports]);

  // Group by submittal number
  const groupedSubmittals = useMemo(() => {
    const map = new Map<string, SubmittalHistoryEntry[]>();

    allSubmittals.forEach((entry) => {
      const key = entry.submittalNumber.toUpperCase();
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(entry);
    });

    const now = new Date().getTime();
    const result: GroupedSubmittal[] = [];

    map.forEach((entries, subNo) => {
      // Sort history descending by date and REV
      entries.sort((a, b) => {
        const dateDiff = new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime();
        if (dateDiff !== 0) return dateDiff;
        return b.rev - a.rev;
      });

      const latest = entries[0];
      const latestDate = new Date(latest.reportDate).getTime();
      const elapsedDays = Math.floor((now - latestDate) / (1000 * 60 * 60 * 24));

      // Stalled if latest status is 'W' (under review) for more than thresholdDays
      const isStalled = latest.status === 'W' && elapsedDays >= thresholdDays;

      result.push({
        submittalNumber: subNo,
        itemDescription: latest.itemDescription,
        projectName: latest.projectName,
        projectId: latest.projectId,
        latestEntry: latest,
        history: entries,
        isStalled,
        stalledDays: elapsedDays
      });
    });

    return result;
  }, [allSubmittals, thresholdDays]);

  // Filtered by search query
  const filteredSubmittals = useMemo(() => {
    if (!searchQuery.trim()) return groupedSubmittals;
    const q = searchQuery.toLowerCase();
    return groupedSubmittals.filter(
      (s) =>
        s.submittalNumber.toLowerCase().includes(q) ||
        s.itemDescription.toLowerCase().includes(q) ||
        s.projectName.toLowerCase().includes(q)
    );
  }, [groupedSubmittals, searchQuery]);

  // Stalled Submittals list
  const stalledSubmittals = useMemo(() => {
    return groupedSubmittals.filter((s) => s.isStalled);
  }, [groupedSubmittals]);

  const toggleExpand = (subNo: string) => {
    setExpandedSubmittals((prev) => {
      const next = new Set(prev);
      if (next.has(subNo)) {
        next.delete(subNo);
      } else {
        next.add(subNo);
      }
      return next;
    });
  };

  const handleThresholdChange = (newVal: number) => {
    const val = Math.max(1, newVal);
    setThresholdDays(val);
    if (onUpdateStalledDays) {
      onUpdateStalledDays(val);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-600" />
            <span>متتبع التقديمات الهندسية الشامل (Submittal Tracker)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium">
            تتبع دورة حياة أي تقديم، تاريخ مراجعاته (REV)، وتنبيهات التعثر قيد المراجعة (W)
          </p>
        </div>

        {/* Stalled days configuration slider / input */}
        <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">
          <Clock className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="font-bold text-slate-700 dark:text-slate-300">حد تعثر المراجعة:</span>
          <input
            type="number"
            min={1}
            max={60}
            value={thresholdDays}
            onChange={(e) => handleThresholdChange(parseInt(e.target.value) || 7)}
            className="w-14 px-2 py-1 bg-white dark:bg-slate-700 text-center font-bold font-mono rounded-lg border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
          />
          <span className="text-slate-700 dark:text-slate-300 font-medium">أيام</span>
        </div>
      </div>

      {/* =========================================================================
          HIGHLIGHTED STALLED SUBMITTALS (W > N days)
          ========================================================================= */}
      {stalledSubmittals.length > 0 && (
        <div className="bg-amber-50/70 dark:bg-amber-950/40 rounded-2xl p-4 sm:p-5 border-2 border-amber-300 dark:border-amber-700 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-amber-900 dark:text-amber-200">
                  تقديمات متعثرة قيد المراجعة (W) لأكثر من {thresholdDays} أيام!
                </h3>
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  يوجد {stalledSubmittals.length} تقديم لم يصدر عليه رد من الاستشاري المشرف، يلزم المتابعة العاجلة
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {stalledSubmittals.map((sub) => (
              <div
                key={sub.submittalNumber}
                className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-amber-200 dark:border-amber-800 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-submittal font-mono font-bold text-sm text-blue-700 dark:text-blue-400">
                      {sub.submittalNumber}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                      متعثر منذ {sub.stalledDays} يوم!
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {sub.itemDescription}
                  </p>
                  <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 font-medium">
                    المشروع: {sub.projectName} • آخر تحديث: {sub.latestEntry.reportDate} (REV {sub.latestEntry.rev})
                  </p>
                </div>

                <div className="flex justify-end mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => {
                      setSearchQuery(sub.submittalNumber);
                      toggleExpand(sub.submittalNumber);
                    }}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>عرض سجل التقديم بالكامل</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="ابحث برقم التقديم، كود المخطط، أو وصف البند (مثال: MAS_RAV_IR_STR_0055)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pr-10 pl-4 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white text-xs sm:text-sm font-submittal"
          />
          <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
        </div>

        {/* Quick sample search pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setSearchQuery('MAS_RAV_IR_STR_0055')}
            className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800 whitespace-nowrap cursor-pointer hover:bg-blue-100"
          >
            IR_STR_0055
          </button>
          <button
            type="button"
            onClick={() => setSearchQuery('MAS_RAV_SD_STR_0055')}
            className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap cursor-pointer hover:bg-emerald-100"
          >
            SD_STR_0055
          </button>
          <button
            type="button"
            onClick={() => setSearchQuery('MAS_RAV_CALC_STR_0019')}
            className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800 whitespace-nowrap cursor-pointer hover:bg-amber-100"
          >
            CALC_STR_0019
          </button>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              مسح
            </button>
          )}
        </div>
      </div>

      {/* Submittals List with History */}
      <div className="space-y-4">
        {filteredSubmittals.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center border border-slate-200 dark:border-slate-800">
            <Search className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="font-bold text-slate-700 dark:text-slate-300">
              لم يتم العثور على أي تقديم مطابق لبحثك: "{searchQuery}"
            </p>
          </div>
        ) : (
          filteredSubmittals.map((sub) => {
            const isExpanded = expandedSubmittals.has(sub.submittalNumber);
            return (
              <div
                key={sub.submittalNumber}
                className={`bg-white dark:bg-slate-900 rounded-2xl border transition-all shadow-xs ${
                  sub.isStalled
                    ? 'border-amber-300 dark:border-amber-800'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                {/* Submittal Card Header */}
                <div
                  onClick={() => toggleExpand(sub.submittalNumber)}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-submittal font-mono font-extrabold text-base sm:text-lg text-blue-700 dark:text-blue-400">
                          {sub.submittalNumber}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-md font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          REV {sub.latestEntry.rev}
                        </span>
                        {sub.isStalled && (
                          <span className="text-xs px-2 py-0.5 rounded-md font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                            متعثر ({sub.stalledDays} يوم)
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 mt-1">
                        {sub.itemDescription}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                        <Building className="w-3.5 h-3.5" />
                        <span>{sub.projectName}</span>
                        <span>•</span>
                        <span>آخر تحديث: {sub.latestEntry.reportDate}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <div className="text-right">
                      <span className="text-[11px] text-slate-700 dark:text-slate-300 block font-medium">الموقف الحالي:</span>
                      <StatusBadge status={sub.latestEntry.status} size="sm" />
                    </div>
                    <div className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>
                </div>

                {/* Submittal History Timeline (Expanded) */}
                {isExpanded && (
                  <div className="border-t border-slate-200 dark:border-slate-800 p-4 sm:p-5 bg-slate-50/60 dark:bg-slate-800/30 space-y-3">
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <History className="w-4 h-4 text-blue-600" />
                      <span>سجل وتاريخ التقديم عبر التقارير ({sub.history.length} مرات ظهور)</span>
                    </h4>

                    <div className="relative border-r-2 border-blue-500 dark:border-blue-600 mr-2 pr-4 space-y-3 text-xs">
                      {sub.history.map((entry, idx) => (
                        <div key={idx} className="relative">
                          {/* Dot on timeline */}
                          <div className="absolute -right-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-white dark:ring-slate-900" />

                          <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 dark:text-white">
                                  {entry.reportDate}
                                </span>
                                <span className="px-2 py-0.5 rounded-md font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                                  REV {entry.rev}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-md font-semibold ${
                                    entry.sourceType === 'submitted'
                                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                  }`}
                                >
                                  {entry.sourceType === 'submitted' ? 'ضمن الأعمال المقدمة' : 'ضمن الأعمال المستلمة'}
                                </span>
                              </div>

                              <StatusBadge status={entry.status} size="sm" />
                            </div>

                            <p className="text-slate-600 dark:text-slate-400">
                              {entry.itemDescription}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              المرسل: {entry.senderName} • المشروع: {entry.projectName}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
