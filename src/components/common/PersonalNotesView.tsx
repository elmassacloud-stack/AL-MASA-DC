import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  NotebookPen,
  Plus,
  Check,
  Trash2,
  Star,
  Calendar,
  ChevronRight,
  ChevronLeft,
  ArrowLeftRight,
  Pencil,
  X,
  Lock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock3,
  Bell,
  BellRing,
  BellOff
} from 'lucide-react';
import { PersonalNote, UserProfile } from '../../types';
import { dataService } from '../../services/dataService';
import { getTodayDateStr } from '../../seedData';
import {
  playSubtleNotificationChime,
  showBrowserNotification
} from '../../utils/browserNotifications';

interface Props {
  currentUser: UserProfile;
  personalNotes: PersonalNote[];
}

type FilterMode = 'all' | 'pending' | 'completed';

const WEEKDAYS_AR = ['سبت', 'أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'];

function toDateStr(year: number, monthZeroBased: number, day: number): string {
  return `${year}-${String(monthZeroBased + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateParts(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  return {
    year: Number.isFinite(y) ? y : new Date().getFullYear(),
    month: Number.isFinite(m) ? m - 1 : new Date().getMonth(),
    day: Number.isFinite(d) ? d : new Date().getDate()
  };
}

function shiftDateStr(dateStr: string, deltaDays: number): string {
  const { year, month, day } = parseDateParts(dateStr);
  const dt = new Date(year, month, day);
  dt.setDate(dt.getDate() + deltaDays);
  return toDateStr(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function formatArabicFullDate(dateStr: string): string {
  const { year, month, day } = parseDateParts(dateStr);
  const dt = new Date(year, month, day);
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(dt);
  } catch {
    return dateStr;
  }
}

function formatArabicShortDate(dateStr: string): string {
  const { year, month, day } = parseDateParts(dateStr);
  const dt = new Date(year, month, day);
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    }).format(dt);
  } catch {
    return dateStr;
  }
}

function formatArabicMonthYear(year: number, monthZeroBased: number): string {
  const dt = new Date(year, monthZeroBased, 1);
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      month: 'long',
      year: 'numeric'
    }).format(dt);
  } catch {
    return `${year}-${String(monthZeroBased + 1).padStart(2, '0')}`;
  }
}

function formatArabicTime(iso?: string): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

function formatReminderTime24ToAr(hhmm?: string): string {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return '';
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  const dt = new Date(2026, 0, 1, h, m);
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(dt);
  } catch {
    return hhmm;
  }
}

function getCurrentLocalTimeHHMM(now: Date): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function isReminderDue(note: PersonalNote, todayStr: string, nowHHMM: string): boolean {
  if (note.isCompleted || !note.reminderDate) return false;
  if (note.reminderDate < todayStr) return true;
  if (note.reminderDate > todayStr) return false;
  if (!note.reminderTime) return true;
  return note.reminderTime <= nowHHMM;
}

export const PersonalNotesView: React.FC<Props> = ({ currentUser, personalNotes }) => {
  const todayStr = getTodayDateStr();
  const yesterdayStr = useMemo(() => shiftDateStr(todayStr, -1), [todayStr]);
  const tomorrowStr = useMemo(() => shiftDateStr(todayStr, 1), [todayStr]);
  const nextWeekStr = useMemo(() => shiftDateStr(todayStr, 7), [todayStr]);

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const initialParts = parseDateParts(todayStr);
  const [calendarYear, setCalendarYear] = useState<number>(initialParts.year);
  const [calendarMonth, setCalendarMonth] = useState<number>(initialParts.month);

  // Quick-add form state (including optional reminder)
  const [newText, setNewText] = useState<string>('');
  const [newStarred, setNewStarred] = useState<boolean>(false);
  const [showNewReminder, setShowNewReminder] = useState<boolean>(false);
  const [newReminderDate, setNewReminderDate] = useState<string>(todayStr);
  const [newReminderTime, setNewReminderTime] = useState<string>('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');

  // Per-note reminder editor state
  const [reminderEditId, setReminderEditId] = useState<string | null>(null);
  const [reminderEditDate, setReminderEditDate] = useState<string>('');
  const [reminderEditTime, setReminderEditTime] = useState<string>('');

  // Inline confirmation states (avoiding window.confirm)
  const [confirmClearDayPending, setConfirmClearDayPending] = useState<boolean>(false);
  const [confirmClearOverdue, setConfirmClearOverdue] = useState<boolean>(false);
  const [showOverdueDetails, setShowOverdueDetails] = useState<boolean>(false);

  // Live clock tick for timed reminders (updates every 30s)
  const [nowTick, setNowTick] = useState<Date>(() => new Date());
  const alertedReminderKeysRef = useRef<Set<string>>(new Set());

  // Subtle action feedback banner
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let id: number | null = null;
    const start = () => {
      if (id !== null) return;
      id = window.setInterval(() => setNowTick(new Date()), 30000);
    };
    const stop = () => {
      if (id !== null) {
        window.clearInterval(id);
        id = null;
      }
    };
    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        setNowTick(new Date());
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedbackMsg(null);
      feedbackTimerRef.current = null;
    }, 3500);
  };

  // Sync calendar month view when jumping to a date in another month
  const selectDateAndSyncCalendar = (dateStr: string) => {
    setSelectedDate(dateStr);
    setConfirmClearDayPending(false);
    const { year, month } = parseDateParts(dateStr);
    setCalendarYear(year);
    setCalendarMonth(month);
    if (!showNewReminder) {
      setNewReminderDate(dateStr);
    }
  };

  // Strictly filter to current user defensively
  const myNotes = useMemo(
    () => personalNotes.filter((n) => n.userId === currentUser.id),
    [personalNotes, currentUser.id]
  );

  const nowHHMM = getCurrentLocalTimeHHMM(nowTick);

  // Due & undismissed reminders
  const dueReminders = useMemo(
    () =>
      myNotes
        .filter((n) => !n.reminderDismissed && isReminderDue(n, todayStr, nowHHMM))
        .sort((a, b) => {
          const cmpDate = (a.reminderDate || '').localeCompare(b.reminderDate || '');
          if (cmpDate !== 0) return cmpDate;
          return (a.reminderTime || '00:00').localeCompare(b.reminderTime || '00:00');
        }),
    [myNotes, todayStr, nowHHMM]
  );

  // Trigger a gentle chime + browser notification once per newly due timed reminder
  useEffect(() => {
    dueReminders.forEach((item) => {
      if (!item.reminderDate) return;
      const key = `${item.id}:${item.reminderDate}:${item.reminderTime || ''}`;
      if (!alertedReminderKeysRef.current.has(key)) {
        alertedReminderKeysRef.current.add(key);
        if (item.reminderDate === todayStr && item.reminderTime) {
          playSubtleNotificationChime();
          showBrowserNotification(
            'تذكير مهمة شخصية',
            `${item.text}${item.reminderTime ? ` (${formatReminderTime24ToAr(item.reminderTime)})` : ''}`
          );
        }
      }
    });
  }, [dueReminders, todayStr]);

  // All active scheduled reminders (for the side rail)
  const scheduledReminders = useMemo(
    () =>
      myNotes
        .filter((n) => !n.isCompleted && Boolean(n.reminderDate))
        .sort((a, b) => {
          const cmpDate = (a.reminderDate || '').localeCompare(b.reminderDate || '');
          if (cmpDate !== 0) return cmpDate;
          return (a.reminderTime || '23:59').localeCompare(b.reminderTime || '23:59');
        }),
    [myNotes]
  );

  // Notes for the selected date
  const selectedDayNotes = useMemo(() => {
    const items = myNotes.filter((n) => n.noteDate === selectedDate);
    return items.sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
      if (!a.isCompleted && Boolean(a.isStarred) !== Boolean(b.isStarred)) {
        return a.isStarred ? -1 : 1;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [myNotes, selectedDate]);

  // Notes from OTHER dates whose reminder points to selectedDate
  const linkedRemindersOnSelectedDate = useMemo(
    () =>
      myNotes
        .filter((n) => n.reminderDate === selectedDate && n.noteDate !== selectedDate)
        .sort((a, b) => (a.reminderTime || '23:59').localeCompare(b.reminderTime || '23:59')),
    [myNotes, selectedDate]
  );

  const filteredDayNotes = useMemo(() => {
    if (filterMode === 'pending') return selectedDayNotes.filter((n) => !n.isCompleted);
    if (filterMode === 'completed') return selectedDayNotes.filter((n) => n.isCompleted);
    return selectedDayNotes;
  }, [selectedDayNotes, filterMode]);

  const dayTotal = selectedDayNotes.length;
  const dayCompleted = useMemo(
    () => selectedDayNotes.filter((n) => n.isCompleted).length,
    [selectedDayNotes]
  );
  const dayPendingNotes = useMemo(
    () => selectedDayNotes.filter((n) => !n.isCompleted),
    [selectedDayNotes]
  );
  const dayPending = dayPendingNotes.length;
  const dayPercent = dayTotal > 0 ? Math.round((dayCompleted / dayTotal) * 100) : 0;

  // Unfinished notes from previous days (before today)
  const pastIncompleteNotes = useMemo(
    () =>
      myNotes
        .filter((n) => !n.isCompleted && n.noteDate < todayStr)
        .sort((a, b) => b.noteDate.localeCompare(a.noteDate) || b.createdAt.localeCompare(a.createdAt)),
    [myNotes, todayStr]
  );

  // Map date -> calendar indicators (notes count, completed count, active reminders count)
  const calendarDateStats = useMemo(() => {
    const map = new Map<
      string,
      { total: number; done: number; pending: number; reminders: number }
    >();
    const ensure = (d: string) => {
      let entry = map.get(d);
      if (!entry) {
        entry = { total: 0, done: 0, pending: 0, reminders: 0 };
        map.set(d, entry);
      }
      return entry;
    };

    myNotes.forEach((n) => {
      const noteEntry = ensure(n.noteDate);
      noteEntry.total += 1;
      if (n.isCompleted) noteEntry.done += 1;
      else noteEntry.pending += 1;

      if (!n.isCompleted && n.reminderDate) {
        const remEntry = ensure(n.reminderDate);
        remEntry.reminders += 1;
      }
    });

    return map;
  }, [myNotes]);

  // Build Saturday-first monthly calendar grid cells
  const calendarCells = useMemo(() => {
    const firstOfMonth = new Date(calendarYear, calendarMonth, 1);
    // JS getDay(): Sun=0, Mon=1, ..., Sat=6 -> convert to Sat=0, Sun=1, ..., Fri=6
    const startOffset = (firstOfMonth.getDay() + 1) % 7;
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const cells: Array<{ dateStr: string; dayNum: number } | null> = [];

    for (let i = 0; i < startOffset; i++) {
      cells.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        dateStr: toDateStr(calendarYear, calendarMonth, d),
        dayNum: d
      });
    }
    return cells;
  }, [calendarYear, calendarMonth]);

  const nextDayFromSelected = useMemo(() => shiftDateStr(selectedDate, 1), [selectedDate]);

  const getRelativeDateLabel = (dateStr: string): string | null => {
    if (dateStr === todayStr) return 'اليوم';
    if (dateStr === yesterdayStr) return 'أمس';
    if (dateStr === tomorrowStr) return 'غداً';
    return null;
  };

  const handleShiftCalendarMonth = (delta: number) => {
    const dt = new Date(calendarYear, calendarMonth + delta, 1);
    setCalendarYear(dt.getFullYear());
    setCalendarMonth(dt.getMonth());
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newText.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      const reminderPayload =
        showNewReminder && newReminderDate
          ? { date: newReminderDate, time: newReminderTime }
          : undefined;
      await dataService.addPersonalNote(trimmed, selectedDate, newStarred, reminderPayload);
      setNewText('');
      setNewStarred(false);
      if (reminderPayload?.date) {
        showFeedback(
          `تمت إضافة المهمة مع تذكير بتاريخ ${getRelativeDateLabel(reminderPayload.date) || reminderPayload.date}`
        );
      }
      setShowNewReminder(false);
      setNewReminderTime('');
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (note: PersonalNote) => {
    setEditingId(note.id);
    setEditingText(note.text);
    setReminderEditId(null);
  };

  const handleSaveEdit = async (noteId: string) => {
    const trimmed = editingText.trim();
    if (trimmed) {
      await dataService.updatePersonalNoteText(noteId, trimmed);
    }
    setEditingId(null);
    setEditingText('');
  };

  const handleOpenReminderEditor = (note: PersonalNote) => {
    if (reminderEditId === note.id) {
      setReminderEditId(null);
      return;
    }
    setEditingId(null);
    setReminderEditId(note.id);
    setReminderEditDate(note.reminderDate || selectedDate);
    setReminderEditTime(note.reminderTime || '');
  };

  const handleSaveNoteReminder = async (noteId: string) => {
    if (!reminderEditDate) return;
    await dataService.setPersonalNoteReminder(noteId, reminderEditDate, reminderEditTime);
    setReminderEditId(null);
    const label = getRelativeDateLabel(reminderEditDate) || reminderEditDate;
    showFeedback(
      `تم حفظ التذكير ليوم ${label}${reminderEditTime ? ` الساعة ${formatReminderTime24ToAr(reminderEditTime)}` : ''}`
    );
  };

  const handleClearNoteReminder = async (noteId: string) => {
    await dataService.setPersonalNoteReminder(noteId, '', '');
    setReminderEditId(null);
    showFeedback('تم إلغاء التذكير');
  };

  const handleCarryOverSingle = async (note: PersonalNote, targetDate: string) => {
    const count = await dataService.carryOverPersonalNotes([note.id], targetDate);
    if (count > 0) {
      const targetLabel = getRelativeDateLabel(targetDate) || targetDate;
      showFeedback(`تم ترحيل المهمة إلى ${targetLabel}`);
    }
  };

  const handleCarryOverSelectedDayPending = async () => {
    if (dayPendingNotes.length === 0) return;
    const ids = dayPendingNotes.map((n) => n.id);
    const count = await dataService.carryOverPersonalNotes(ids, nextDayFromSelected);
    setConfirmClearDayPending(false);
    if (count > 0) {
      const targetLabel = getRelativeDateLabel(nextDayFromSelected) || nextDayFromSelected;
      showFeedback(`تم ترحيل ${count} مهام غير مكتملة إلى ${targetLabel}`);
    }
  };

  const handleDeleteSelectedDayPending = async () => {
    if (dayPendingNotes.length === 0) return;
    const ids = dayPendingNotes.map((n) => n.id);
    const count = await dataService.deletePersonalNotes(ids);
    setConfirmClearDayPending(false);
    if (count > 0) {
      showFeedback(`تم مسح ${count} مهام غير مكتملة من هذا اليوم`);
    }
  };

  const handleCarryOverAllPastToToday = async () => {
    if (pastIncompleteNotes.length === 0) return;
    const ids = pastIncompleteNotes.map((n) => n.id);
    const count = await dataService.carryOverPersonalNotes(ids, todayStr);
    setConfirmClearOverdue(false);
    setShowOverdueDetails(false);
    if (count > 0) {
      selectDateAndSyncCalendar(todayStr);
      showFeedback(`تم ترحيل ${count} مهام غير مكتملة من الأيام السابقة إلى اليوم`);
    }
  };

  const handleDeleteAllPastIncomplete = async () => {
    if (pastIncompleteNotes.length === 0) return;
    const ids = pastIncompleteNotes.map((n) => n.id);
    const count = await dataService.deletePersonalNotes(ids);
    setConfirmClearOverdue(false);
    setShowOverdueDetails(false);
    if (count > 0) {
      showFeedback(`تم مسح ${count} مهام غير مكتملة من الأيام السابقة`);
    }
  };

  const handleDeleteSingle = async (noteId: string) => {
    await dataService.deletePersonalNotes([noteId]);
  };

  const relativeSelected = getRelativeDateLabel(selectedDate);
  const nextDayLabel = getRelativeDateLabel(nextDayFromSelected) || nextDayFromSelected;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <NotebookPen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-snug">
                مهامي الشخصية اليومية
              </h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
                <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 font-medium">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  مساحة خاصة بك فقط ({currentUser.displayName})
                </span>
                <span aria-hidden="true">·</span>
                <span>لا تظهر لأي مستخدم آخر ولا تدخل في تقارير المشاريع</span>
              </div>
            </div>
          </div>

          {/* Date Switcher Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
              <button
                type="button"
                onClick={() => selectDateAndSyncCalendar(yesterdayStr)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  selectedDate === yesterdayStr
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                أمس
              </button>
              <button
                type="button"
                onClick={() => selectDateAndSyncCalendar(todayStr)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  selectedDate === todayStr
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                اليوم
              </button>
              <button
                type="button"
                onClick={() => selectDateAndSyncCalendar(tomorrowStr)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  selectedDate === tomorrowStr
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                غداً
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => selectDateAndSyncCalendar(shiftDateStr(selectedDate, -1))}
                className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="اليوم السابق"
                title="اليوم السابق"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) {
                    selectDateAndSyncCalendar(e.target.value);
                  }
                }}
                dir="ltr"
                className="h-9 px-2.5 text-xs font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                aria-label="اختيار التاريخ"
              />
              <button
                type="button"
                onClick={() => selectDateAndSyncCalendar(shiftDateStr(selectedDate, 1))}
                className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="اليوم التالي"
                title="اليوم التالي"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Toast Inline */}
      {feedbackMsg && (
        <div
          role="status"
          className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-medium flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-emerald-700/70 hover:text-emerald-900 dark:text-emerald-300/70 dark:hover:text-emerald-100 cursor-pointer"
            aria-label="إغلاق الرسالة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active Due Reminders Banner */}
      {dueReminders.length > 0 && (
        <div className="bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-bold text-blue-900 dark:text-blue-200">
            <BellRing className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>
              تذكيرات مستحقة الآن (
              <span className="tabular-nums">{dueReminders.length}</span>)
            </span>
          </div>

          <div className="divide-y divide-blue-200/70 dark:divide-blue-800/40">
            {dueReminders.map((rem) => {
              const relDate = rem.reminderDate ? getRelativeDateLabel(rem.reminderDate) : null;
              return (
                <div
                  key={rem.id}
                  className="py-2 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white break-words">
                      {rem.text}
                    </p>
                    <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-0.5 tabular-nums">
                      موعد التذكير: {relDate ? `${relDate} (${rem.reminderDate})` : rem.reminderDate}
                      {rem.reminderTime ? ` · ${formatReminderTime24ToAr(rem.reminderTime)}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => dataService.togglePersonalNote(rem.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>تم التنفيذ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => selectDateAndSyncCalendar(rem.noteDate)}
                      className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-400 text-xs font-semibold cursor-pointer"
                    >
                      عرض اليوم
                    </button>
                    <button
                      type="button"
                      onClick={() => dataService.dismissPersonalNoteReminder(rem.id)}
                      className="px-2 py-1.5 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/60 cursor-pointer"
                      title="إخفاء التنبيه"
                    >
                      إخفاء
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Past Incomplete Notes Rollover / Delete Banner */}
      {pastIncompleteNotes.length > 0 && (
        <div className="bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-200">
                <Clock3 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>
                  لديك{' '}
                  <span className="tabular-nums font-extrabold">{pastIncompleteNotes.length}</span>{' '}
                  {pastIncompleteNotes.length === 1 ? 'مهمة غير مكتملة' : 'مهام غير مكتملة'} من
                  أيام سابقة
                </span>
              </div>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                يمكنك ترحيلها لقائمة اليوم لمتابعة تنفيذها أو مسحها نهائياً.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCarryOverAllPastToToday}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>ترحيل الكل لليوم</span>
              </button>

              {!confirmClearOverdue ? (
                <button
                  type="button"
                  onClick={() => setConfirmClearOverdue(true)}
                  className="px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700/70 bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>مسح غير المكتمل</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleDeleteAllPastIncomplete}
                    className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    تأكيد المسح
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearOverdue(false)}
                    className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-xs font-medium cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowOverdueDetails((prev) => !prev)}
                className="px-2.5 py-2 rounded-xl text-xs font-medium text-amber-900 dark:text-amber-200 hover:bg-amber-100/70 dark:hover:bg-amber-900/30 flex items-center gap-1 cursor-pointer"
              >
                <span>{showOverdueDetails ? 'إخفاء' : 'عرض'}</span>
                {showOverdueDetails ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {showOverdueDetails && (
            <div className="mt-3 pt-3 border-t border-amber-200/80 dark:border-amber-800/50 divide-y divide-amber-200/60 dark:divide-amber-800/40">
              {pastIncompleteNotes.map((item) => (
                <div
                  key={item.id}
                  className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {item.text}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 mr-2 tabular-nums">
                      · {formatArabicShortDate(item.noteDate)} ({item.noteDate})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCarryOverSingle(item, todayStr)}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 hover:border-blue-400 font-semibold cursor-pointer"
                    >
                      ترحيل لليوم
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSingle(item.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                      aria-label="حذف المهمة"
                      title="حذف"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Two-Column Desktop Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Primary Checklist Column (8 cols on desktop) */}
        <section className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          {/* Selected Day Title & Quick Add Form */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  {relativeSelected ? `${relativeSelected} — ` : ''}
                  {formatArabicFullDate(selectedDate)}
                </h2>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                  <span>
                    {dayTotal === 0
                      ? 'لا توجد مهام مسجلة بعد'
                      : `${dayCompleted} من ${dayTotal} منجز`}
                  </span>
                  {dayTotal > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        {dayPercent}%
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Filter Segmented Control */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
                {(
                  [
                    { id: 'all', label: `الكل (${dayTotal})` },
                    { id: 'pending', label: `المتبقي (${dayPending})` },
                    { id: 'completed', label: `المنجز (${dayCompleted})` }
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterMode(tab.id)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors tabular-nums cursor-pointer ${
                      filterMode === tab.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Single-Line Quick Add Input + Optional Reminder Controls */}
            <form onSubmit={handleAddNote} className="space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    maxLength={500}
                    placeholder="اكتب مهمة أو ملاحظة سريعة لبداية يومك ثم اضغط Enter..."
                    className="w-full h-11 pr-4 pl-20 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 transition-colors"
                  />
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewReminder((prev) => {
                          const next = !prev;
                          if (next) setNewReminderDate(selectedDate);
                          return next;
                        });
                      }}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                        showNewReminder
                          ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50'
                          : 'text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      aria-label="تعيين تذكير للملاحظة"
                      title="تعيين تذكير بتاريخ محدد"
                    >
                      <Bell className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewStarred((prev) => !prev)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                        newStarred
                          ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/40'
                          : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      aria-label={newStarred ? 'إلغاء تمييز المهمة كهامة' : 'تمييز المهمة كهامة'}
                      title={newStarred ? 'مهمة ذات أولوية' : 'تمييز بنجمة'}
                    >
                      <Star className={`w-4 h-4 ${newStarred ? 'fill-amber-500' : ''}`} />
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!newText.trim() || submitting}
                  className="h-11 px-4 sm:px-5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة</span>
                </button>
              </div>

              {/* Expandable Quick Reminder Strip */}
              {showNewReminder && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2.5 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                    <Bell className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>تذكير بتاريخ:</span>
                  </span>

                  <input
                    type="date"
                    value={newReminderDate}
                    onChange={(e) => setNewReminderDate(e.target.value)}
                    dir="ltr"
                    className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-mono tabular-nums focus:outline-none focus:border-blue-500"
                    aria-label="تاريخ التذكير"
                  />

                  <input
                    type="time"
                    value={newReminderTime}
                    onChange={(e) => setNewReminderTime(e.target.value)}
                    dir="ltr"
                    className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-mono tabular-nums focus:outline-none focus:border-blue-500"
                    aria-label="وقت التذكير الاختياري"
                  />

                  <div className="flex items-center gap-1 mr-auto">
                    <button
                      type="button"
                      onClick={() => setNewReminderDate(todayStr)}
                      className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-blue-400 cursor-pointer"
                    >
                      اليوم
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewReminderDate(tomorrowStr)}
                      className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-blue-400 cursor-pointer"
                    >
                      غداً
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewReminderDate(nextWeekStr)}
                      className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-blue-400 cursor-pointer"
                    >
                      بعد أسبوع
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewReminder(false);
                        setNewReminderTime('');
                      }}
                      className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      aria-label="إغلاق التذكير"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>

          {/* Checklist Items */}
          {filteredDayNotes.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center mb-3">
                <NotebookPen className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {dayTotal === 0
                  ? 'قائمة هذا اليوم فارغة'
                  : filterMode === 'pending'
                    ? 'أحسنت! تم إنجاز جميع مهام هذا اليوم'
                    : 'لا توجد مهام منجزة في هذا اليوم بعد'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                {dayTotal === 0
                  ? 'اكتب نقاطك الصباحية في الحقل أعلاه أو اضغط على زر الجرس لربط تذكير بتاريخ محدد من التقويم.'
                  : 'يمكنك تبديل الفلتر أعلاه لعرض بقية النقاط.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredDayNotes.map((note) => {
                const isEditing = editingId === note.id;
                const isEditingReminder = reminderEditId === note.id;
                const hasReminder = Boolean(note.reminderDate);
                const noteReminderIsDue = hasReminder && isReminderDue(note, todayStr, nowHHMM);

                return (
                  <li
                    key={note.id}
                    className={`group px-4 sm:px-5 py-3.5 transition-colors ${
                      note.isCompleted
                        ? 'bg-slate-50/50 dark:bg-slate-900/40'
                        : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox Button */}
                      <button
                        type="button"
                        onClick={() => dataService.togglePersonalNote(note.id)}
                        className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                          note.isCompleted
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400 bg-white dark:bg-slate-900'
                        }`}
                        aria-label={
                          note.isCompleted ? 'تحديد المهمة كغير مكتملة' : 'تحديد المهمة كمكتملة'
                        }
                      >
                        {note.isCompleted && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>

                      {/* Text / Inline Editor */}
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              maxLength={500}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void handleSaveEdit(note.id);
                                } else if (e.key === 'Escape') {
                                  setEditingId(null);
                                  setEditingText('');
                                }
                              }}
                              className="flex-1 h-9 px-3 rounded-lg border border-blue-500 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => void handleSaveEdit(note.id)}
                              className="px-3 h-9 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer"
                            >
                              حفظ
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(null);
                                setEditingText('');
                              }}
                              className="px-2.5 h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 text-xs cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <>
                            <p
                              onDoubleClick={() => handleStartEdit(note)}
                              className={`text-sm leading-relaxed break-words select-text ${
                                note.isCompleted
                                  ? 'line-through text-slate-400 dark:text-slate-500'
                                  : 'text-slate-800 dark:text-slate-100 font-medium'
                              }`}
                            >
                              {note.text}
                            </p>
                            {(note.carriedOverFrom ||
                              hasReminder ||
                              (note.isCompleted && note.completedAt)) && (
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                                {hasReminder && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReminderEditor(note)}
                                    className={`inline-flex items-center gap-1 hover:underline cursor-pointer ${
                                      note.isCompleted
                                        ? 'text-slate-400 dark:text-slate-500'
                                        : noteReminderIsDue
                                          ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                          : 'text-blue-600 dark:text-blue-400 font-medium'
                                    }`}
                                  >
                                    <Bell className="w-3 h-3 shrink-0" />
                                    <span>
                                      تذكير:{' '}
                                      {getRelativeDateLabel(note.reminderDate!) || note.reminderDate}
                                      {note.reminderTime
                                        ? ` · ${formatReminderTime24ToAr(note.reminderTime)}`
                                        : ''}
                                    </span>
                                  </button>
                                )}
                                {hasReminder &&
                                  (note.carriedOverFrom ||
                                    (note.isCompleted && note.completedAt)) && (
                                    <span aria-hidden="true">·</span>
                                  )}
                                {note.carriedOverFrom && (
                                  <span className="text-amber-600 dark:text-amber-400">
                                    مرحّلة من {note.carriedOverFrom}
                                  </span>
                                )}
                                {note.carriedOverFrom && note.isCompleted && note.completedAt && (
                                  <span aria-hidden="true">·</span>
                                )}
                                {note.isCompleted && note.completedAt && (
                                  <span className="text-emerald-600 dark:text-emerald-400">
                                    أُنجزت {formatArabicTime(note.completedAt)}
                                  </span>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Row Actions */}
                      {!isEditing && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenReminderEditor(note)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                              hasReminder || isEditingReminder
                                ? 'text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-950/40'
                                : 'text-slate-300 dark:text-slate-600 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                            }`}
                            aria-label="تعيين أو تعديل التذكير"
                            title={hasReminder ? 'تعديل التذكير' : 'تعيين تذكير'}
                          >
                            <Bell className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => dataService.togglePersonalNoteStar(note.id)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                              note.isStarred
                                ? 'text-amber-500'
                                : 'text-slate-300 dark:text-slate-600 hover:text-amber-500'
                            }`}
                            aria-label={note.isStarred ? 'إزالة النجمة' : 'تمييز بنجمة'}
                            title={note.isStarred ? 'مهمة مميزة' : 'تمييز بنجمة'}
                          >
                            <Star
                              className={`w-4 h-4 ${note.isStarred ? 'fill-amber-500' : ''}`}
                            />
                          </button>

                          {!note.isCompleted && (
                            <button
                              type="button"
                              onClick={() =>
                                void handleCarryOverSingle(note, nextDayFromSelected)
                              }
                              className="h-8 px-2 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center gap-1 transition-colors cursor-pointer"
                              title={`ترحيل إلى ${nextDayLabel}`}
                            >
                              <ArrowLeftRight className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">للغد</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleStartEdit(note)}
                            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                            aria-label="تعديل النص"
                            title="تعديل"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDeleteSingle(note.id)}
                            className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center justify-center transition-colors cursor-pointer"
                            aria-label="حذف المهمة"
                            title="حذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inline Reminder Editor Row */}
                    {isEditingReminder && (
                      <div className="mt-3 mr-9 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          <span>موعد التذكير:</span>
                        </span>
                        <input
                          type="date"
                          value={reminderEditDate}
                          onChange={(e) => setReminderEditDate(e.target.value)}
                          dir="ltr"
                          className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-mono tabular-nums focus:outline-none focus:border-blue-500"
                          aria-label="تاريخ التذكير"
                        />
                        <input
                          type="time"
                          value={reminderEditTime}
                          onChange={(e) => setReminderEditTime(e.target.value)}
                          dir="ltr"
                          className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-mono tabular-nums focus:outline-none focus:border-blue-500"
                          aria-label="وقت التذكير"
                        />
                        <div className="flex items-center gap-1.5 mr-auto">
                          <button
                            type="button"
                            onClick={() => void handleSaveNoteReminder(note.id)}
                            disabled={!reminderEditDate}
                            className="px-3 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold cursor-pointer"
                          >
                            حفظ التذكير
                          </button>
                          {hasReminder && (
                            <button
                              type="button"
                              onClick={() => void handleClearNoteReminder(note.id)}
                              className="px-2.5 h-8 rounded-lg border border-red-200 dark:border-red-900/70 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 font-medium inline-flex items-center gap-1 cursor-pointer"
                            >
                              <BellOff className="w-3.5 h-3.5" />
                              <span>إزالة</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setReminderEditId(null)}
                            className="px-2 h-8 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Cross-date Reminders linked to the selected calendar date */}
          {linkedRemindersOnSelectedDate.length > 0 && (
            <div className="px-4 sm:px-5 py-3.5 bg-blue-50/40 dark:bg-blue-950/15 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 mb-2">
                <Bell className="w-3.5 h-3.5" />
                <span>تذكيرات مجدولة لهذا التاريخ من أيام أخرى</span>
              </div>
              <div className="space-y-1.5">
                {linkedRemindersOnSelectedDate.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs py-1.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => dataService.togglePersonalNote(item.id)}
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 cursor-pointer ${
                          item.isCompleted
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-blue-400 dark:border-blue-500 bg-white dark:bg-slate-900'
                        }`}
                        aria-label="تحديث حالة التذكير"
                      >
                        {item.isCompleted && <Check className="w-3 h-3 stroke-[3]" />}
                      </button>
                      <span
                        className={`truncate ${
                          item.isCompleted
                            ? 'line-through text-slate-400'
                            : 'text-slate-800 dark:text-slate-100 font-medium'
                        }`}
                      >
                        {item.text}
                      </span>
                      {item.reminderTime && (
                        <span className="text-[11px] text-blue-600 dark:text-blue-400 tabular-nums shrink-0">
                          · {formatReminderTime24ToAr(item.reminderTime)}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => selectDateAndSyncCalendar(item.noteDate)}
                      className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline tabular-nums cursor-pointer shrink-0"
                    >
                      الأصل: {item.noteDate}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* End-of-Day Bulk Bar inside card footer when incomplete items remain */}
          {dayPending > 0 && (
            <div className="px-4 sm:px-5 py-3.5 bg-slate-50/80 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs text-slate-600 dark:text-slate-300">
                مراجعة نهاية اليوم: متبقي{' '}
                <strong className="tabular-nums text-slate-900 dark:text-white">
                  {dayPending}
                </strong>{' '}
                {dayPending === 1 ? 'مهمة غير منفذة' : 'مهام غير منفذة'}
              </span>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCarryOverSelectedDayPending}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>ترحيل غير المكتمل إلى {nextDayLabel}</span>
                </button>

                {!confirmClearDayPending ? (
                  <button
                    type="button"
                    onClick={() => setConfirmClearDayPending(true)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>مسح غير المكتمل</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleDeleteSelectedDayPending}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      تأكيد المسح ({dayPending})
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearDayPending(false)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-xs cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Side Rail: Monthly Calendar, Daily Progress & Upcoming Reminders (4 cols on desktop) */}
        <aside className="lg:col-span-4 space-y-5">
          {/* Interactive Simple Monthly Calendar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-3.5">
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {formatArabicMonthYear(calendarYear, calendarMonth)}
                </h3>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleShiftCalendarMonth(-1)}
                  className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                  aria-label="الشهر السابق"
                  title="الشهر السابق"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => selectDateAndSyncCalendar(todayStr)}
                  className="px-2 h-7 rounded-lg text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                >
                  اليوم
                </button>
                <button
                  type="button"
                  onClick={() => handleShiftCalendarMonth(1)}
                  className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                  aria-label="الشهر التالي"
                  title="الشهر التالي"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Weekday Header */}
            <div className="grid grid-cols-7 gap-1 mb-1.5 text-center">
              {WEEKDAYS_AR.map((dayName) => (
                <div
                  key={dayName}
                  className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 py-1"
                >
                  {dayName}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((cell, idx) => {
                if (!cell) {
                  return <div key={`empty-${idx}`} className="h-9" />;
                }
                const stats = calendarDateStats.get(cell.dateStr);
                const isSelected = cell.dateStr === selectedDate;
                const isToday = cell.dateStr === todayStr;
                const hasNotes = Boolean(stats && stats.total > 0);
                const allDone = Boolean(stats && stats.total > 0 && stats.pending === 0);
                const hasReminders = Boolean(stats && stats.reminders > 0);

                return (
                  <button
                    key={cell.dateStr}
                    type="button"
                    onClick={() => selectDateAndSyncCalendar(cell.dateStr)}
                    title={
                      hasNotes || hasReminders
                        ? `${cell.dateStr}${hasNotes ? ` — ${stats!.done}/${stats!.total} مهام` : ''}${hasReminders ? ` — ${stats!.reminders} تذكير` : ''}`
                        : cell.dateStr
                    }
                    className={`h-9 rounded-xl flex flex-col items-center justify-center relative text-xs tabular-nums transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : isToday
                          ? 'ring-1 ring-blue-500 text-blue-600 dark:text-blue-400 font-bold bg-blue-50/60 dark:bg-blue-950/30'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <span className="leading-none">{cell.dayNum}</span>
                    {(hasNotes || hasReminders) && (
                      <span className="flex items-center gap-0.5 mt-1">
                        {hasNotes && (
                          <span
                            className={`w-1.5 h-1 rounded-full ${
                              isSelected
                                ? 'bg-white/90'
                                : allDone
                                  ? 'bg-emerald-500'
                                  : 'bg-blue-500'
                            }`}
                          />
                        )}
                        {hasReminders && (
                          <span
                            className={`w-1.5 h-1 rounded-full ${
                              isSelected ? 'bg-amber-300' : 'bg-amber-500'
                            }`}
                          />
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Clean Calendar Legend */}
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-1 rounded-full bg-blue-500" />
                <span>مهام</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-1 rounded-full bg-amber-500" />
                <span>تذكير</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-1 rounded-full bg-emerald-500" />
                <span>مكتمل</span>
              </span>
            </div>
          </div>

          {/* Daily Progress Summary Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                ملخص إنجاز {relativeSelected || selectedDate}
              </h3>
              <span className="text-lg font-extrabold tabular-nums text-blue-600 dark:text-blue-400">
                {dayPercent}%
              </span>
            </div>

            <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  dayPercent === 100 && dayTotal > 0 ? 'bg-emerald-500' : 'bg-blue-600'
                }`}
                style={{ width: `${dayPercent}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
              <div>
                <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                  {dayTotal}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">الإجمالي</div>
              </div>
              <div>
                <div className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {dayCompleted}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">تم التنفيذ</div>
              </div>
              <div>
                <div className="text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">
                  {dayPending}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">متبقي</div>
              </div>
            </div>
          </div>

          {/* Scheduled Reminders List */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-500" />
                <span>التذكيرات المجدولة</span>
              </h3>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {scheduledReminders.length}
              </span>
            </div>

            {scheduledReminders.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                لا توجد تذكيرات نشطة حالياً. اضغط على أيقونة الجرس بجانب أي ملاحظة لربطها بتاريخ
                وتذكير محدد.
              </p>
            ) : (
              <div className="space-y-1.5">
                {scheduledReminders.slice(0, 8).map((item) => {
                  const due = isReminderDue(item, todayStr, nowHHMM);
                  const rel = item.reminderDate ? getRelativeDateLabel(item.reminderDate) : null;
                  return (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700/70 transition-colors flex items-start justify-between gap-2"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          selectDateAndSyncCalendar(item.reminderDate || item.noteDate)
                        }
                        className="flex-1 min-w-0 text-right cursor-pointer"
                      >
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {item.text}
                        </p>
                        <p
                          className={`text-[11px] mt-0.5 tabular-nums ${
                            due
                              ? 'text-amber-600 dark:text-amber-400 font-semibold'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {rel ? `${rel} · ` : ''}
                          {item.reminderDate}
                          {item.reminderTime
                            ? ` · ${formatReminderTime24ToAr(item.reminderTime)}`
                            : ''}
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleClearNoteReminder(item.id)}
                        className="p-1 text-slate-400 hover:text-red-500 rounded-md cursor-pointer shrink-0"
                        aria-label="إلغاء التذكير"
                        title="إلغاء التذكير"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
