import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Search,
  Download,
  SlidersHorizontal,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Eye,
  X,
  Trash2,
  Layers,
  Plus,
  Copy,
  Check,
  Hash,
  ArrowLeft,
  BarChart3,
  PieChart as PieChartIcon,
  LayoutGrid,
  Calendar,
  GitBranch,
  RotateCcw,
  Building2,
  CloudDownload
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import {
  UserProfile,
  SubmittalStatusCode,
  Project,
  SiteDeliverable,
  DailyReport,
  ReportAttachment,
  SharedExcelLogFile
} from '../../types';
import { SUBMITTAL_STATUS_CONFIG } from '../../config';
import { dataService } from '../../services/dataService';
import {
  parseDriveExcelWorkbook,
  autoDetectColumnMapping,
  analyzeWorkbook,
  buildWorkbookDateSummary,
  isDateFilterActive,
  describeDateFilter,
  exportExtractedLogsToExcel,
  exportWorkbookSummaryToExcel,
  ARABIC_MONTH_NAMES,
  ParsedWorkbookData,
  LogColumnMapping,
  ExtractedLogRow,
  SheetOverrideConfig,
  SheetAnalytics,
  DateFilterConfig,
  DateFilterMode
} from '../../utils/driveLogParser';
import { formatFileSize, isExcelFile, isExcelFileName } from '../../utils/pdfUtils';
import {
  loadAllStoredExcelFiles,
  saveStoredExcelFile,
  deleteStoredExcelFile
} from '../../utils/excelLogsStorage';
import { getAccessibleProjects, canAccessProject } from '../../utils/accessControl';

interface Props {
  currentUser: UserProfile;
  projects: Project[];
  siteDeliverables?: SiteDeliverable[];
  reports?: DailyReport[];
  sharedExcelLogs?: SharedExcelLogFile[];
}

interface UploadedExcelWorkbook {
  id: string;
  projectId: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  savedAtMs: number;
  buffer?: ArrayBuffer;
  sourceLabel?: string;
  remoteKey?: string;
  uploadedBy?: string;
  uploaderName?: string;
  isCloudSynced?: boolean;
  workbook: ParsedWorkbookData;
  sheetOverrides: Record<number, SheetOverrideConfig>;
  excludedSheetIndices: number[];
}

interface RemoteProjectExcelSource {
  key: string;
  projectId: string;
  fileName: string;
  fileSize?: number;
  sourceType: 'deliverable' | 'report';
  sourceLabel: string;
  dateLabel: string;
  senderName: string;
  deliverable?: SiteDeliverable;
  reportId?: string;
  attachment?: ReportAttachment;
}

const MAPPING_FIELD_LABELS: { key: keyof LogColumnMapping; label: string }[] = [
  { key: 'submittalNumber', label: 'الكود / رقم التقديم' },
  { key: 'lastCode', label: 'Last Code (آخر كود)' },
  { key: 'description', label: 'وصف البند / الموضوع' },
  { key: 'status', label: 'الموقف / كود الاعتماد' },
  { key: 'rev', label: 'المراجعة (REV)' },
  { key: 'discipline', label: 'التخصص' },
  { key: 'docType', label: 'النوع' },
  { key: 'submissionDate', label: 'تاريخ التقديم' },
  { key: 'replyDate', label: 'تاريخ الرد' },
  { key: 'location', label: 'الموقع / الدور' },
  { key: 'remarks', label: 'ملاحظات' }
];

const ROWS_PER_PAGE = 100;

const DEFAULT_DATE_FILTER: DateFilterConfig = {
  mode: 'all',
  field: 'submissionDate',
  year: '',
  month: '',
  quarter: '1',
  fromDate: '',
  toDate: ''
};

const ARABIC_MONTH_OPTIONS: { value: string; label: string }[] = [
  { value: '01', label: '01 — يناير' },
  { value: '02', label: '02 — فبراير' },
  { value: '03', label: '03 — مارس' },
  { value: '04', label: '04 — أبريل' },
  { value: '05', label: '05 — مايو' },
  { value: '06', label: '06 — يونيو' },
  { value: '07', label: '07 — يوليو' },
  { value: '08', label: '08 — أغسطس' },
  { value: '09', label: '09 — سبتمبر' },
  { value: '10', label: '10 — أكتوبر' },
  { value: '11', label: '11 — نوفمبر' },
  { value: '12', label: '12 — ديسمبر' }
];

const STATUS_CHART_META: {
  key: SubmittalStatusCode | 'OTHER';
  label: string;
  shortLabel: string;
  color: string;
}[] = [
  { key: 'A', label: 'A — معتمد', shortLabel: 'معتمد (A)', color: '#16a34a' },
  { key: 'B', label: 'B — معتمد بملاحظات', shortLabel: 'بملاحظات (B)', color: '#0d9488' },
  { key: 'W', label: 'W — تحت المراجعة', shortLabel: 'مراجعة (W)', color: '#d97706' },
  { key: 'C', label: 'C — يُعاد التقديم', shortLabel: 'إعادة تقديم (C)', color: '#ea580c' },
  { key: 'D', label: 'D — مرفوض', shortLabel: 'مرفوض (D)', color: '#dc2626' },
  { key: 'OTHER', label: 'أخرى / غير مصنف', shortLabel: 'أخرى', color: '#64748b' }
];

const SHEET_SHARE_COLORS = [
  '#2563eb',
  '#0d9488',
  '#4f46e5',
  '#d97706',
  '#0284c7',
  '#059669',
  '#dc2626',
  '#64748b'
];

interface ChartTooltipItem {
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: {
    fullName?: string;
    name?: string;
    percent?: number;
    fill?: string;
    [key: string]: unknown;
  };
}

const ExcelChartTooltip: React.FC<{
  active?: boolean;
  payload?: ChartTooltipItem[];
  label?: string | number;
  unit?: string;
}> = ({ active, payload, label, unit = 'بند' }) => {
  if (!active || !payload || payload.length === 0) return null;
  const visibleItems = payload.filter((item) => Number(item.value || 0) > 0);
  const itemsToShow = visibleItems.length > 0 ? visibleItems : payload;
  const title =
    itemsToShow[0]?.payload?.fullName ||
    (label !== undefined && label !== '' ? String(label) : String(itemsToShow[0]?.name || ''));
  const totalValue =
    itemsToShow.length > 1
      ? itemsToShow.reduce((acc, item) => acc + (Number(item.value) || 0), 0)
      : null;

  return (
    <div
      dir="rtl"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg px-3.5 py-2.5 text-xs min-w-[165px]"
    >
      {title && (
        <div className="font-bold text-slate-900 dark:text-white pb-1.5 mb-1.5 border-b border-slate-100 dark:border-slate-800 truncate max-w-[240px]">
          {title}
        </div>
      )}
      <div className="space-y-1">
        {itemsToShow.map((item, idx) => {
          const swatchColor =
            item.color || (typeof item.payload?.fill === 'string' ? item.payload.fill : '#2563eb');
          return (
            <div key={`${item.name}-${idx}`} className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                <span
                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                  style={{ backgroundColor: swatchColor }}
                />
                <span>{String(item.name || '')}</span>
              </span>
              <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                {Number(item.value || 0).toLocaleString('en-US')}
                {typeof item.payload?.percent === 'number'
                  ? ` (${item.payload.percent}%)`
                  : ` ${unit}`}
              </span>
            </div>
          );
        })}
      </div>
      {totalValue !== null && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 font-bold text-slate-800 dark:text-slate-200">
          <span>الإجمالي</span>
          <span className="font-mono tabular-nums">
            {totalValue.toLocaleString('en-US')} {unit}
          </span>
        </div>
      )}
    </div>
  );
};

export const AdminExcelLogsView: React.FC<Props> = ({
  currentUser,
  projects,
  siteDeliverables = [],
  reports = [],
  sharedExcelLogs = []
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetProjectIdRef = useRef<string | null>(null);
  const uploadedFilesRef = useRef<UploadedExcelWorkbook[]>([]);
  const inFlightCloudFetchIdsRef = useRef<Set<string>>(new Set());

  const isAdmin = currentUser.role === 'admin';

  // Projects strictly scoped to the user's authorized projects (active first, then completed)
  const sortedProjects = useMemo(() => {
    const accessible = getAccessibleProjects(currentUser, projects);
    return [...accessible].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [currentUser, projects]);

  // Selected project tab: 'all' (accessible sites overview) or a specific authorized Project ID
  const [selectedProjectTab, setSelectedProjectTab] = useState<string>(() =>
    sortedProjects.length > 0 ? sortedProjects[0].id : 'all'
  );
  const [projectTabSearch, setProjectTabSearch] = useState<string>('');
  const [activeFileByProject, setActiveFileByProject] = useState<Record<string, string>>({});

  // Uploaded workbooks state (persisted in Cloud Firestore + cached per project in IndexedDB)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedExcelWorkbook[]>([]);
  const [isHydratingSaved, setIsHydratingSaved] = useState<boolean>(true);
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [loadingRemoteKey, setLoadingRemoteKey] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  // View mode: 'overview' (all sheets dashboard), 'dates' (date filter & timeline), or sheet index
  const [activeView, setActiveView] = useState<'overview' | 'dates' | number>('overview');
  const [showMappingPanel, setShowMappingPanel] = useState<boolean>(false);

  // Overview Recharts controls
  const [overviewBarScope, setOverviewBarScope] = useState<'sheets' | 'files'>('sheets');
  const [overviewBarStyle, setOverviewBarStyle] = useState<'status' | 'total'>('status');

  // Global workbook Date Filter & Timeline state
  const [dateFilter, setDateFilter] = useState<DateFilterConfig>(DEFAULT_DATE_FILTER);
  const [timelineGranularity, setTimelineGranularity] = useState<'month' | 'year'>('month');

  // Table Filters for individual sheet view
  const [revisionViewMode, setRevisionViewMode] = useState<'latest' | 'all'>('latest');
  const [tableSearch, setTableSearch] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDiscipline, setFilterDiscipline] = useState<string>('all');
  const [visibleCount, setVisibleCount] = useState<number>(ROWS_PER_PAGE);

  // Row inspector & copy feedback
  const [inspectRow, setInspectRow] = useState<ExtractedLogRow | null>(null);
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 3500);
  };

  const handleCopyCode = (value: string, key: string) => {
    if (!value) return;
    navigator.clipboard?.writeText(value);
    setCopiedCodeKey(key);
    window.setTimeout(() => {
      setCopiedCodeKey((prev) => (prev === key ? null : prev));
    }, 1800);
  };

  // Ensure selectedProjectTab stays valid if projects or user permissions change dynamically
  useEffect(() => {
    if (sortedProjects.length === 0) {
      if (selectedProjectTab !== 'all') setSelectedProjectTab('all');
      return;
    }
    if (!isAdmin && sortedProjects.length === 1 && selectedProjectTab === 'all') {
      setSelectedProjectTab(sortedProjects[0].id);
      return;
    }
    if (
      selectedProjectTab !== 'all' &&
      !sortedProjects.some((p) => p.id === selectedProjectTab)
    ) {
      setSelectedProjectTab(sortedProjects[0].id);
    }
  }, [sortedProjects, selectedProjectTab, isAdmin]);

  // Hydrate previously uploaded project Excel workbooks from IndexedDB on mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await loadAllStoredExcelFiles();
        if (!active || stored.length === 0) return;

        const restored: UploadedExcelWorkbook[] = [];
        for (const rec of stored) {
          if (!canAccessProject(currentUser, rec.projectId)) continue;
          try {
            const parsed = parseDriveExcelWorkbook(rec.buffer, rec.fileName);
            if (parsed.sheets.length === 0) continue;
            restored.push({
              id: rec.id,
              projectId: rec.projectId,
              fileName: rec.fileName,
              fileSize: rec.fileSize,
              uploadedAt: rec.uploadedAt,
              savedAtMs: rec.savedAtMs,
              buffer: rec.buffer,
              sourceLabel: rec.sourceLabel,
              uploadedBy: rec.uploadedBy,
              uploaderName: rec.uploaderName,
              isCloudSynced: rec.isCloudSynced,
              workbook: parsed,
              sheetOverrides: rec.sheetOverrides || {},
              excludedSheetIndices: rec.excludedSheetIndices || []
            });
          } catch {
            // Skip corrupted cached entry silently
          }
        }

        if (!active || restored.length === 0) return;
        setUploadedFiles(restored);
        const firstByProject: Record<string, string> = {};
        for (const item of restored) {
          if (!firstByProject[item.projectId]) {
            firstByProject[item.projectId] = item.id;
          }
        }
        setActiveFileByProject(firstByProject);
        setSelectedProjectTab((currentTab) => {
          const match = restored.find((r) => r.projectId === currentTab);
          if (match) {
            setActiveFileId(match.id);
            const visibleIndices = match.workbook.sheets
              .map((_, i) => i)
              .filter((i) => !match.excludedSheetIndices.includes(i));
            setActiveView(visibleIndices.length === 1 ? visibleIndices[0] : 'overview');
          }
          return currentTab;
        });
      } finally {
        if (active) setIsHydratingSaved(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Automatically sync cloud-stored Excel logs (uploaded by any authorized user/admin) in real time
  useEffect(() => {
    if (isHydratingSaved) return;
    let active = true;

    const authorizedCloudLogs = sharedExcelLogs.filter((log) =>
      canAccessProject(currentUser, log.projectId)
    );
    const cloudById = new Map<string, SharedExcelLogFile>(
      authorizedCloudLogs.map((log) => [log.id, log])
    );

    // 1. Remove locally cached cloud entries that were deleted from Firestore, and sync remote metadata edits
    setUploadedFiles((prev) => {
      let changed = false;
      const next: UploadedExcelWorkbook[] = [];

      for (const item of prev) {
        const cloudMatch = cloudById.get(item.id);
        if (item.isCloudSynced && !cloudMatch) {
          changed = true;
          void deleteStoredExcelFile(item.id);
          continue;
        }
        if (cloudMatch) {
          let nextOverrides = item.sheetOverrides;
          if (cloudMatch.sheetOverridesJson) {
            try {
              const parsedOverrides = JSON.parse(cloudMatch.sheetOverridesJson);
              if (
                parsedOverrides &&
                typeof parsedOverrides === 'object' &&
                JSON.stringify(parsedOverrides) !== JSON.stringify(item.sheetOverrides)
              ) {
                nextOverrides = parsedOverrides as Record<number, SheetOverrideConfig>;
                changed = true;
              }
            } catch {
              // ignore malformed override json
            }
          }
          const nextExcluded = Array.isArray(cloudMatch.excludedSheetIndices)
            ? cloudMatch.excludedSheetIndices
            : item.excludedSheetIndices;
          if (JSON.stringify(nextExcluded) !== JSON.stringify(item.excludedSheetIndices)) {
            changed = true;
          }
          const nextUploaderName = cloudMatch.uploaderName || item.uploaderName;
          const nextUploadedBy = cloudMatch.uploadedBy || item.uploadedBy;
          if (
            !item.isCloudSynced ||
            nextUploaderName !== item.uploaderName ||
            nextUploadedBy !== item.uploadedBy
          ) {
            changed = true;
          }
          next.push({
            ...item,
            isCloudSynced: true,
            uploadedBy: nextUploadedBy,
            uploaderName: nextUploaderName,
            sheetOverrides: nextOverrides,
            excludedSheetIndices: nextExcluded
          });
        } else {
          next.push(item);
        }
      }

      return changed ? next : prev;
    });

    // 2. Download & parse any new cloud Excel logs not yet in local state
    const existingIds = new Set(uploadedFilesRef.current.map((f) => f.id));
    const missingCloudLogs = authorizedCloudLogs.filter(
      (log) => !existingIds.has(log.id) && !inFlightCloudFetchIdsRef.current.has(log.id)
    );

    if (missingCloudLogs.length === 0) return;

    missingCloudLogs.forEach((log) => inFlightCloudFetchIdsRef.current.add(log.id));
    setIsSyncingCloud(true);

    (async () => {
      const downloadedEntries: UploadedExcelWorkbook[] = [];
      for (const cloudLog of missingCloudLogs) {
        if (!active) break;
        try {
          const buffer = await dataService.fetchSharedExcelLogBuffer(cloudLog);
          const parsed = parseDriveExcelWorkbook(buffer, cloudLog.fileName);
          if (parsed.sheets.length === 0) continue;

          let parsedOverrides: Record<number, SheetOverrideConfig> = {};
          if (cloudLog.sheetOverridesJson) {
            try {
              const obj = JSON.parse(cloudLog.sheetOverridesJson);
              if (obj && typeof obj === 'object') {
                parsedOverrides = obj as Record<number, SheetOverrideConfig>;
              }
            } catch {
              parsedOverrides = {};
            }
          }
          const excludedIndices = Array.isArray(cloudLog.excludedSheetIndices)
            ? cloudLog.excludedSheetIndices
            : [];

          const savedAtMs = Date.parse(cloudLog.createdAt) || Date.now();
          const entry: UploadedExcelWorkbook = {
            id: cloudLog.id,
            projectId: cloudLog.projectId,
            fileName: cloudLog.fileName,
            fileSize: cloudLog.fileSizeBytes || buffer.byteLength,
            uploadedAt: new Date(savedAtMs).toLocaleTimeString('ar-EG', {
              hour: '2-digit',
              minute: '2-digit'
            }),
            savedAtMs,
            buffer,
            sourceLabel: cloudLog.sourceLabel,
            uploadedBy: cloudLog.uploadedBy,
            uploaderName: cloudLog.uploaderName,
            isCloudSynced: true,
            workbook: parsed,
            sheetOverrides: parsedOverrides,
            excludedSheetIndices: excludedIndices
          };

          downloadedEntries.push(entry);
          void saveStoredExcelFile({
            id: entry.id,
            projectId: entry.projectId,
            fileName: entry.fileName,
            fileSize: entry.fileSize,
            uploadedAt: entry.uploadedAt,
            savedAtMs: entry.savedAtMs,
            buffer,
            sheetOverrides: entry.sheetOverrides,
            excludedSheetIndices: entry.excludedSheetIndices,
            sourceLabel: entry.sourceLabel,
            uploadedBy: entry.uploadedBy,
            uploaderName: entry.uploaderName,
            isCloudSynced: true
          });
        } catch {
          // Keep UI resilient if one cloud file fails to load
        } finally {
          inFlightCloudFetchIdsRef.current.delete(cloudLog.id);
        }
      }

      if (!active) return;
      if (downloadedEntries.length > 0) {
        setUploadedFiles((prev) => {
          const prevIds = new Set(prev.map((p) => p.id));
          const uniqueNew = downloadedEntries.filter((d) => !prevIds.has(d.id));
          if (uniqueNew.length === 0) return prev;
          return [...uniqueNew, ...prev].sort((a, b) => (b.savedAtMs || 0) - (a.savedAtMs || 0));
        });

        setActiveFileByProject((prev) => {
          const next = { ...prev };
          for (const entry of downloadedEntries) {
            if (!next[entry.projectId]) {
              next[entry.projectId] = entry.id;
            }
          }
          return next;
        });

        setSelectedProjectTab((currentTab) => {
          if (currentTab !== 'all') {
            const match = downloadedEntries.find((d) => d.projectId === currentTab);
            if (match && !uploadedFilesRef.current.some((f) => f.projectId === currentTab)) {
              setActiveFileId(match.id);
              const visibleIndices = match.workbook.sheets
                .map((_, i) => i)
                .filter((i) => !match.excludedSheetIndices.includes(i));
              setActiveView(visibleIndices.length === 1 ? visibleIndices[0] : 'overview');
            }
          }
          return currentTab;
        });
      }
      setIsSyncingCloud(false);
    })();

    return () => {
      active = false;
    };
  }, [sharedExcelLogs, isHydratingSaved, currentUser]);

  const persistEntryToStorage = (entry: UploadedExcelWorkbook) => {
    if (entry.buffer) {
      void saveStoredExcelFile({
        id: entry.id,
        projectId: entry.projectId,
        fileName: entry.fileName,
        fileSize: entry.fileSize,
        uploadedAt: entry.uploadedAt,
        savedAtMs: entry.savedAtMs,
        buffer: entry.buffer,
        sheetOverrides: entry.sheetOverrides,
        excludedSheetIndices: entry.excludedSheetIndices,
        sourceLabel: entry.sourceLabel,
        uploadedBy: entry.uploadedBy,
        uploaderName: entry.uploaderName,
        isCloudSynced: entry.isCloudSynced
      });
    }
    if (entry.isCloudSynced) {
      void dataService.updateSharedExcelLogMeta(
        entry.id,
        entry.sheetOverrides,
        entry.excludedSheetIndices
      );
    }
  };

  const resetSheetFilters = () => {
    setRevisionViewMode('latest');
    setTableSearch('');
    setFilterStatus('all');
    setFilterDiscipline('all');
    setVisibleCount(ROWS_PER_PAGE);
    setShowMappingPanel(false);
  };

  const openSheetTab = (sheetIndex: number) => {
    setActiveView(sheetIndex);
    resetSheetFilters();
  };

  const selectWorkbookEntry = (entry: UploadedExcelWorkbook) => {
    setActiveFileId(entry.id);
    setActiveFileByProject((prev) => ({ ...prev, [entry.projectId]: entry.id }));
    resetSheetFilters();
    setOverviewBarScope('sheets');
    const visibleIndices = entry.workbook.sheets
      .map((_, i) => i)
      .filter((i) => !entry.excludedSheetIndices.includes(i));
    // If workbook has multiple visible internal sheets (or 0), land on the Overview;
    // if exactly 1 visible sheet, jump straight into that sheet.
    setActiveView(visibleIndices.length === 1 ? visibleIndices[0] : 'overview');
  };

  const selectProjectTab = (projectId: string) => {
    setSelectedProjectTab(projectId);
    setUploadError(null);
    resetSheetFilters();
    setOverviewBarScope('sheets');
    setInspectRow(null);

    if (projectId === 'all') {
      setActiveFileId(null);
      setActiveView('overview');
      return;
    }

    const projectFiles = uploadedFiles.filter((f) => f.projectId === projectId);
    if (projectFiles.length === 0) {
      setActiveFileId(null);
      setActiveView('overview');
      return;
    }

    const preferredId = activeFileByProject[projectId];
    const targetEntry = projectFiles.find((f) => f.id === preferredId) || projectFiles[0];
    selectWorkbookEntry(targetEntry);
  };

  const triggerUploadForProject = (projectId?: string) => {
    if (sortedProjects.length === 0) {
      setUploadError('لا توجد مشاريع مصرح لك بالوصول إليها حالياً لرفع شيتات اللوج.');
      return;
    }
    const resolvedTarget =
      projectId ||
      (selectedProjectTab !== 'all'
        ? selectedProjectTab
        : sortedProjects[0]?.id || '');
    if (!resolvedTarget || !canAccessProject(currentUser, resolvedTarget)) {
      setUploadError('ليس لديك صلاحية رفع شيتات على هذا المشروع.');
      return;
    }
    uploadTargetProjectIdRef.current = resolvedTarget;
    fileInputRef.current?.click();
  };

  // Discover Excel files already uploaded on the website (Deliverables & Daily Report Attachments) per authorized project
  const remoteExcelSourcesByProject = useMemo(() => {
    const map: Record<string, RemoteProjectExcelSource[]> = {};
    const addSource = (src: RemoteProjectExcelSource) => {
      if (!canAccessProject(currentUser, src.projectId)) return;
      if (!map[src.projectId]) map[src.projectId] = [];
      map[src.projectId].push(src);
    };

    for (const deliv of siteDeliverables) {
      if (!canAccessProject(currentUser, deliv.projectId)) continue;
      if (deliv.fileFormat === 'excel' || isExcelFileName(deliv.fileName)) {
        addSource({
          key: `deliv:${deliv.id}`,
          projectId: deliv.projectId,
          fileName: deliv.fileName,
          fileSize: deliv.fileSizeBytes,
          sourceType: 'deliverable',
          sourceLabel: 'تسليمات الموقع',
          dateLabel: (deliv.createdAt || '').slice(0, 10),
          senderName: deliv.senderName,
          deliverable: deliv
        });
      }
    }

    for (const rep of reports) {
      if (!canAccessProject(currentUser, rep.projectId)) continue;
      if (!rep.attachments || rep.attachments.length === 0) continue;
      for (let i = 0; i < rep.attachments.length; i++) {
        const att = rep.attachments[i];
        if (!isExcelFileName(att.name)) continue;
        addSource({
          key: `rep:${rep.id}:${att.id || i}`,
          projectId: rep.projectId,
          fileName: att.name,
          fileSize: att.size,
          sourceType: 'report',
          sourceLabel: `تقرير يومي (${rep.reportDate})`,
          dateLabel: rep.reportDate,
          senderName: rep.senderName,
          reportId: rep.id,
          attachment: att
        });
      }
    }

    return map;
  }, [siteDeliverables, reports, currentUser]);

  // Uploaded files strictly restricted to projects the current user can access
  const accessibleUploadedFiles = useMemo(() => {
    return uploadedFiles.filter((f) => canAccessProject(currentUser, f.projectId));
  }, [uploadedFiles, currentUser]);

  const activeProject = useMemo(
    () =>
      selectedProjectTab !== 'all'
        ? sortedProjects.find((p) => p.id === selectedProjectTab) || null
        : null,
    [sortedProjects, selectedProjectTab]
  );

  // Files belonging ONLY to the currently selected project tab (within accessible scope)
  const projectUploadedFiles = useMemo(() => {
    if (selectedProjectTab === 'all') return accessibleUploadedFiles;
    return accessibleUploadedFiles.filter((f) => f.projectId === selectedProjectTab);
  }, [accessibleUploadedFiles, selectedProjectTab]);

  // Visible projects in tab bar (filtered by optional quick search when many projects exist)
  const visibleProjectTabs = useMemo(() => {
    const q = projectTabSearch.trim().toLowerCase();
    if (!q) return sortedProjects;
    return sortedProjects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q)
    );
  }, [sortedProjects, projectTabSearch]);

  // Files count map per project
  const fileCountByProject = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of accessibleUploadedFiles) {
      counts[f.projectId] = (counts[f.projectId] || 0) + 1;
    }
    return counts;
  }, [accessibleUploadedFiles]);

  const dateFilterActive = useMemo(() => isDateFilterActive(dateFilter), [dateFilter]);
  const activeDateFilterLabel = useMemo(() => describeDateFilter(dateFilter), [dateFilter]);

  // Unfiltered sheets across all accessible uploaded project workbooks for discovering available years/dates
  const allProjectsUnfilteredSheets = useMemo(() => {
    const sheets: SheetAnalytics[] = [];
    for (const file of accessibleUploadedFiles) {
      const analysis = analyzeWorkbook(
        file.workbook,
        file.sheetOverrides,
        file.excludedSheetIndices
      );
      sheets.push(...analysis.sheets);
    }
    return sheets;
  }, [accessibleUploadedFiles]);

  // Date metadata across all projects (available years, earliest/latest date, reply dates)
  const allProjectsDateMeta = useMemo(() => {
    return buildWorkbookDateSummary(allProjectsUnfilteredSheets, 'year', dateFilter.field);
  }, [allProjectsUnfilteredSheets, dateFilter.field]);

  // Cross-project summary for the 'كل المشاريع' overview tab (respects active dateFilter)
  const allProjectsOverview = useMemo(() => {
    const activeFilterArg = dateFilterActive ? dateFilter : undefined;

    const perProject = sortedProjects.map((project) => {
      const files = accessibleUploadedFiles.filter((f) => f.projectId === project.id);
      const remoteCount = (remoteExcelSourcesByProject[project.id] || []).length;
      let sheetsCount = 0;
      let totalRows = 0;
      let approvedCount = 0;
      let pendingCount = 0;
      let rejectedCount = 0;
      let otherCount = 0;

      for (const file of files) {
        const analysis = analyzeWorkbook(
          file.workbook,
          file.sheetOverrides,
          file.excludedSheetIndices,
          activeFilterArg
        );
        sheetsCount += analysis.totals.sheetsCount;
        totalRows += analysis.totals.totalRows;
        approvedCount += analysis.totals.approvedCount;
        pendingCount += analysis.totals.pendingCount;
        rejectedCount += analysis.totals.rejectedCount;
        otherCount += analysis.totals.statusCounts.OTHER;
      }

      const statusBase = approvedCount + pendingCount + rejectedCount;
      const approvalRate = statusBase > 0 ? Math.round((approvedCount / statusBase) * 100) : 0;

      return {
        project,
        filesCount: files.length,
        remoteCount,
        sheetsCount,
        totalRows,
        approvedCount,
        pendingCount,
        rejectedCount,
        otherCount,
        approvalRate,
        latestFileName: files[0]?.fileName || ''
      };
    });

    const chartData = perProject
      .filter((p) => p.totalRows > 0)
      .map((p) => ({
        projectId: p.project.id,
        name:
          p.project.name.length > 18 ? p.project.name.slice(0, 17) + '…' : p.project.name,
        fullName: p.project.name,
        معتمد: p.approvedCount,
        'تحت المراجعة': p.pendingCount,
        'تعديل / مرفوض': p.rejectedCount,
        أخرى: p.otherCount
      }));

    const totals = {
      projectsCount: sortedProjects.length,
      projectsWithLogs: perProject.filter((p) => p.filesCount > 0).length,
      filesCount: accessibleUploadedFiles.length,
      sheetsCount: perProject.reduce((acc, p) => acc + p.sheetsCount, 0),
      totalRows: perProject.reduce((acc, p) => acc + p.totalRows, 0),
      approvedCount: perProject.reduce((acc, p) => acc + p.approvedCount, 0),
      pendingCount: perProject.reduce((acc, p) => acc + p.pendingCount, 0),
      rejectedCount: perProject.reduce((acc, p) => acc + p.rejectedCount, 0)
    };

    return { perProject, chartData, totals };
  }, [sortedProjects, accessibleUploadedFiles, remoteExcelSourcesByProject, dateFilter, dateFilterActive]);

  const handleLocalFilesSelected = async (fileList: FileList | File[], explicitProjectId?: string) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const targetProjectId =
      explicitProjectId ||
      uploadTargetProjectIdRef.current ||
      (selectedProjectTab !== 'all'
        ? selectedProjectTab
        : sortedProjects[0]?.id || '');
    uploadTargetProjectIdRef.current = null;

    if (!targetProjectId || !canAccessProject(currentUser, targetProjectId)) {
      setUploadError('ليس لديك صلاحية رفع شيتات على هذا المشروع. يرجى اختيار أحد مشاريعك المصرح بها.');
      return;
    }

    const targetProjectName =
      sortedProjects.find((p) => p.id === targetProjectId)?.name || 'المشروع';

    setUploadError(null);
    setIsParsing(true);

    const newlyLoaded: UploadedExcelWorkbook[] = [];
    const errors: string[] = [];

    for (const file of files) {
      if (!isExcelFile(file)) {
        errors.push(`الملف «${file.name}» ليس ملف Excel مدعوماً (.xlsx / .xls / .csv).`);
        continue;
      }
      if (file.size <= 0) {
        errors.push(`الملف «${file.name}» فارغ ولا يمكن قراءته.`);
        continue;
      }

      try {
        // Yield briefly so the loading indicator paints before parsing large multi-sheet files
        await new Promise((resolve) => window.setTimeout(resolve, 16));
        const buffer = await file.arrayBuffer();
        const parsed = parseDriveExcelWorkbook(buffer, file.name);
        if (parsed.sheets.length === 0) {
          errors.push(`لم يتم العثور على أوراق عمل داخل «${file.name}».`);
          continue;
        }
        const nowMs = Date.now();
        const entryId = 'xl-' + nowMs.toString(36) + '-' + Math.random().toString(36).slice(2, 6);

        // Persist to Cloud Firestore so Admin and all authorized project members see it automatically
        let cloudSynced = false;
        try {
          await dataService.uploadSharedExcelLog({
            id: entryId,
            projectId: targetProjectId,
            projectName: targetProjectName,
            fileName: file.name,
            buffer
          });
          cloudSynced = true;
        } catch (cloudErr) {
          const cloudMsg =
            cloudErr instanceof Error
              ? cloudErr.message
              : 'تعذرت المزامنة السحابية لملف اللوج.';
          errors.push(`تم فتح «${file.name}» محلياً ولكن تعذر حفظه سحابياً: ${cloudMsg}`);
        }

        const entry: UploadedExcelWorkbook = {
          id: entryId,
          projectId: targetProjectId,
          fileName: file.name,
          fileSize: file.size,
          uploadedAt: new Date(nowMs).toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit'
          }),
          savedAtMs: nowMs,
          buffer,
          uploadedBy: currentUser.id,
          uploaderName: currentUser.displayName,
          isCloudSynced: cloudSynced,
          workbook: parsed,
          sheetOverrides: {},
          excludedSheetIndices: []
        };
        newlyLoaded.push(entry);
        persistEntryToStorage(entry);
      } catch (err) {
        const detail = err instanceof Error ? err.message : '';
        if (/password|encrypt/i.test(detail)) {
          errors.push(
            `الملف «${file.name}» محمي بكلمة مرور ولا يمكن قراءته تلقائياً. يرجى فتحه في Excel وإلغاء كلمة المرور ثم إعادة رفعه.`
          );
        } else {
          errors.push(
            `تعذر قراءة الملف «${file.name}»${detail ? ` (${detail})` : ''}. تأكد من أنه ملف Excel سليم وغير محمي بكلمة مرور.`
          );
        }
      }
    }

    if (newlyLoaded.length > 0) {
      setUploadedFiles((prev) => {
        const prevIds = new Set(prev.map((p) => p.id));
        const uniqueNew = newlyLoaded.filter((item) => !prevIds.has(item.id));
        return [...uniqueNew, ...prev];
      });
      if (selectedProjectTab !== targetProjectId && sortedProjects.some((p) => p.id === targetProjectId)) {
        setSelectedProjectTab(targetProjectId);
      }
      selectWorkbookEntry(newlyLoaded[0]);
      const firstSheetsCount = newlyLoaded[0].workbook.sheets.length;
      const syncedCount = newlyLoaded.filter((n) => n.isCloudSynced).length;
      showToast(
        newlyLoaded.length === 1
          ? syncedCount > 0
            ? `تم رفع ومزامنة «${newlyLoaded[0].fileName}» (${firstSheetsCount} ورقة) لموقع «${targetProjectName}» — يظهر تلقائياً للأدمن.`
            : `تم قراءة وتحليل ${firstSheetsCount} ورقة داخلية من «${newlyLoaded[0].fileName}» لموقع «${targetProjectName}».`
          : syncedCount > 0
            ? `تم رفع ومزامنة ${newlyLoaded.length} ملفات Excel لموقع «${targetProjectName}» سحابياً تلقائياً.`
            : `تم رفع وتحليل ${newlyLoaded.length} ملفات Excel لموقع «${targetProjectName}».`
      );
    }

    if (errors.length > 0) {
      setUploadError(errors.join(' '));
    }

    setIsParsing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Load & parse an Excel file already uploaded on the website (Site Deliverables or Daily Report)
  const handleLoadRemoteProjectExcel = async (source: RemoteProjectExcelSource) => {
    const existing = uploadedFiles.find(
      (f) => f.projectId === source.projectId && f.remoteKey === source.key
    );
    if (existing) {
      selectWorkbookEntry(existing);
      return;
    }

    setUploadError(null);
    setLoadingRemoteKey(source.key);
    try {
      let url = '';
      if (source.sourceType === 'deliverable' && source.deliverable) {
        url = await dataService.fetchSiteDeliverablePdfUrl(source.deliverable);
      } else if (source.sourceType === 'report' && source.reportId && source.attachment) {
        url = await dataService.fetchReportAttachmentUrl(source.reportId, source.attachment);
      }
      if (!url) {
        throw new Error('تعذر جلب رابط الملف من قاعدة البيانات.');
      }

      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error('تعذر تحميل بيانات ملف Excel.');
      }
      const buffer = await resp.arrayBuffer();
      const parsed = parseDriveExcelWorkbook(buffer, source.fileName);
      if (parsed.sheets.length === 0) {
        throw new Error(`لم يتم العثور على أوراق عمل داخل «${source.fileName}».`);
      }

      const nowMs = Date.now();
      const entryId = 'xl-' + nowMs.toString(36) + '-' + Math.random().toString(36).slice(2, 6);
      const targetProjectName =
        sortedProjects.find((p) => p.id === source.projectId)?.name || 'المشروع';

      let cloudSynced = false;
      try {
        await dataService.uploadSharedExcelLog({
          id: entryId,
          projectId: source.projectId,
          projectName: targetProjectName,
          fileName: source.fileName,
          buffer,
          sourceLabel: source.sourceLabel
        });
        cloudSynced = true;
      } catch {
        cloudSynced = false;
      }

      const entry: UploadedExcelWorkbook = {
        id: entryId,
        projectId: source.projectId,
        fileName: source.fileName,
        fileSize: source.fileSize || buffer.byteLength,
        uploadedAt: new Date(nowMs).toLocaleTimeString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        savedAtMs: nowMs,
        buffer,
        sourceLabel: source.sourceLabel,
        remoteKey: source.key,
        uploadedBy: currentUser.id,
        uploaderName: currentUser.displayName,
        isCloudSynced: cloudSynced,
        workbook: parsed,
        sheetOverrides: {},
        excludedSheetIndices: []
      };

      setUploadedFiles((prev) => [entry, ...prev]);
      persistEntryToStorage(entry);
      selectWorkbookEntry(entry);
      showToast(
        `تم استيراد وتحليل «${source.fileName}» (${parsed.sheets.length} ورقة) من ${source.sourceLabel}.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر فتح ملف Excel المرفوع على الموقع.';
      setUploadError(msg);
    } finally {
      setLoadingRemoteKey(null);
    }
  };

  const handleRemoveUploadedFile = async (id: string) => {
    const target = uploadedFilesRef.current.find((item) => item.id === id);
    if (target?.isCloudSynced) {
      try {
        await dataService.deleteSharedExcelLog(id);
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : 'تعذر حذف شيت اللوج من قاعدة البيانات.'
        );
        return;
      }
    }

    void deleteStoredExcelFile(id);
    setUploadedFiles((prev) => {
      const removed = prev.find((item) => item.id === id);
      const next = prev.filter((item) => item.id !== id);
      if (activeFileId === id) {
        const sameProjectFiles = removed
          ? next.filter((item) => item.projectId === removed.projectId)
          : next;
        if (sameProjectFiles.length > 0) {
          selectWorkbookEntry(sameProjectFiles[0]);
        } else {
          setActiveFileId(null);
          setActiveView('overview');
        }
      }
      return next;
    });
  };

  const activeEntry = useMemo(() => {
    if (selectedProjectTab === 'all') return null;
    const found = projectUploadedFiles.find((f) => f.id === activeFileId);
    return found || projectUploadedFiles[0] || null;
  }, [selectedProjectTab, projectUploadedFiles, activeFileId]);

  // Unfiltered analysis used to discover all available years/dates across the workbook
  const unfilteredWorkbookAnalysis = useMemo(() => {
    if (!activeEntry) return null;
    return analyzeWorkbook(
      activeEntry.workbook,
      activeEntry.sheetOverrides,
      activeEntry.excludedSheetIndices
    );
  }, [activeEntry]);

  // Full multi-sheet analysis across all active (non-deleted) internal sheets with active date filter
  const workbookAnalysis = useMemo(() => {
    if (!activeEntry) return null;
    if (!dateFilterActive) return unfilteredWorkbookAnalysis;
    return analyzeWorkbook(
      activeEntry.workbook,
      activeEntry.sheetOverrides,
      activeEntry.excludedSheetIndices,
      dateFilter
    );
  }, [activeEntry, dateFilter, dateFilterActive, unfilteredWorkbookAnalysis]);

  // Full date metadata (available years, earliest/latest date, reply dates availability)
  const fullDateMeta = useMemo(() => {
    if (!unfilteredWorkbookAnalysis) return null;
    return buildWorkbookDateSummary(
      unfilteredWorkbookAnalysis.sheets,
      'year',
      dateFilter.field
    );
  }, [unfilteredWorkbookAnalysis, dateFilter.field]);

  // Filtered timeline summary (monthly or yearly) for the Date Analytics tab
  const dateTimelineSummary = useMemo(() => {
    if (!workbookAnalysis) return null;
    return buildWorkbookDateSummary(
      workbookAnalysis.sheets,
      timelineGranularity,
      dateFilter.field
    );
  }, [workbookAnalysis, timelineGranularity, dateFilter.field]);

  const activeSheetAnalytics: SheetAnalytics | null = useMemo(() => {
    if (!workbookAnalysis || typeof activeView !== 'number') return null;
    return workbookAnalysis.sheets.find((s) => s.sheetIndex === activeView) || null;
  }, [workbookAnalysis, activeView]);

  const activeRawSheet = useMemo(() => {
    if (!activeEntry || typeof activeView !== 'number') return null;
    if (activeEntry.excludedSheetIndices.includes(activeView)) return null;
    return activeEntry.workbook.sheets[activeView] || null;
  }, [activeEntry, activeView]);

  const effectiveDateMeta = selectedProjectTab === 'all' ? allProjectsDateMeta : fullDateMeta;

  const applyQuickRangePreset = (preset: 'last7' | 'last30' | 'last90' | 'thisMonth' | 'thisYear') => {
    const baseStr = effectiveDateMeta?.latestDate || new Date().toISOString().slice(0, 10);
    const [y, m, d] = baseStr.split('-').map(Number);
    const endDate = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    const toISO = (dt: Date) => dt.toISOString().slice(0, 10);

    if (preset === 'thisMonth') {
      const yr = String(endDate.getUTCFullYear());
      const mo = String(endDate.getUTCMonth() + 1).padStart(2, '0');
      setDateFilter((prev) => ({ ...prev, mode: 'month', year: yr, month: mo }));
      return;
    }
    if (preset === 'thisYear') {
      const yr = String(endDate.getUTCFullYear());
      setDateFilter((prev) => ({ ...prev, mode: 'year', year: yr }));
      return;
    }

    const daysBack = preset === 'last7' ? 6 : preset === 'last30' ? 29 : 89;
    const startDate = new Date(endDate.getTime() - daysBack * 86400 * 1000);
    setDateFilter((prev) => ({
      ...prev,
      mode: 'range',
      fromDate: toISO(startDate),
      toDate: toISO(endDate)
    }));
  };

  const handleDateModeChange = (mode: DateFilterMode) => {
    const defaultYear =
      dateFilter.year || effectiveDateMeta?.availableYears[0] || String(new Date().getFullYear());
    const defaultMonth =
      dateFilter.month ||
      (effectiveDateMeta?.latestDate
        ? effectiveDateMeta.latestDate.slice(5, 7)
        : String(new Date().getMonth() + 1).padStart(2, '0'));

    if (mode === 'all') {
      setDateFilter((prev) => ({ ...DEFAULT_DATE_FILTER, field: prev.field }));
    } else if (mode === 'year') {
      setDateFilter((prev) => ({ ...prev, mode: 'year', year: defaultYear }));
    } else if (mode === 'month') {
      setDateFilter((prev) => ({ ...prev, mode: 'month', year: defaultYear, month: defaultMonth }));
    } else if (mode === 'quarter') {
      setDateFilter((prev) => ({ ...prev, mode: 'quarter', year: defaultYear }));
    } else {
      setDateFilter((prev) => ({
        ...prev,
        mode: 'range',
        fromDate: prev.fromDate || effectiveDateMeta?.earliestDate || '',
        toDate: prev.toDate || effectiveDateMeta?.latestDate || ''
      }));
    }
  };

  const deletedSheetsList = useMemo(() => {
    if (!activeEntry || activeEntry.excludedSheetIndices.length === 0) return [];
    return activeEntry.excludedSheetIndices
      .map((idx) => ({
        sheetIndex: idx,
        sheetName: activeEntry.workbook.sheets[idx]?.name || `Sheet ${idx + 1}`
      }))
      .sort((a, b) => a.sheetIndex - b.sheetIndex);
  }, [activeEntry]);

  const handleDeleteInternalSheet = (sheetIndex: number, sheetName: string) => {
    if (!activeEntry) return;
    setUploadedFiles((prev) =>
      prev.map((entry) => {
        if (entry.id !== activeEntry.id) return entry;
        if (entry.excludedSheetIndices.includes(sheetIndex)) return entry;
        const updated = {
          ...entry,
          excludedSheetIndices: [...entry.excludedSheetIndices, sheetIndex]
        };
        persistEntryToStorage(updated);
        return updated;
      })
    );
    if (activeView === sheetIndex) {
      setActiveView('overview');
      resetSheetFilters();
      setInspectRow(null);
    }
    showToast(`تم حذف الورقة الداخلية «${sheetName}» من التحليل.`);
  };

  const handleRestoreInternalSheet = (sheetIndex: number, sheetName: string) => {
    if (!activeEntry) return;
    setUploadedFiles((prev) =>
      prev.map((entry) => {
        if (entry.id !== activeEntry.id) return entry;
        const updated = {
          ...entry,
          excludedSheetIndices: entry.excludedSheetIndices.filter((i) => i !== sheetIndex)
        };
        persistEntryToStorage(updated);
        return updated;
      })
    );
    showToast(`تمت استعادة الورقة الداخلية «${sheetName}» إلى التحليل.`);
  };

  const handleRestoreAllInternalSheets = () => {
    if (!activeEntry || activeEntry.excludedSheetIndices.length === 0) return;
    const count = activeEntry.excludedSheetIndices.length;
    setUploadedFiles((prev) =>
      prev.map((entry) => {
        if (entry.id !== activeEntry.id) return entry;
        const updated = { ...entry, excludedSheetIndices: [] };
        persistEntryToStorage(updated);
        return updated;
      })
    );
    showToast(`تمت استعادة جميع الأوراق المحذوفة (${count}).`);
  };

  // Update per-sheet header row or column mapping override (live-updates both sheet & overview)
  const updateActiveSheetOverride = (nextConfig: SheetOverrideConfig) => {
    if (!activeEntry || typeof activeView !== 'number') return;
    const sheetIdx = activeView;
    setUploadedFiles((prev) =>
      prev.map((entry) => {
        if (entry.id !== activeEntry.id) return entry;
        const updated = {
          ...entry,
          sheetOverrides: {
            ...entry.sheetOverrides,
            [sheetIdx]: nextConfig
          }
        };
        persistEntryToStorage(updated);
        return updated;
      })
    );
  };

  const resetActiveSheetOverride = () => {
    if (!activeEntry || typeof activeView !== 'number') return;
    const sheetIdx = activeView;
    setUploadedFiles((prev) =>
      prev.map((entry) => {
        if (entry.id !== activeEntry.id) return entry;
        const copy = { ...entry.sheetOverrides };
        delete copy[sheetIdx];
        const updated = { ...entry, sheetOverrides: copy };
        persistEntryToStorage(updated);
        return updated;
      })
    );
  };

  const handleHeaderRowChange = (newRowIdx: number) => {
    if (!activeRawSheet) return;
    const headers = activeRawSheet.rawRows[newRowIdx] || [];
    const samples = activeRawSheet.rawRows.slice(newRowIdx + 1, newRowIdx + 36);
    updateActiveSheetOverride({
      headerRowIndex: newRowIdx,
      mapping: autoDetectColumnMapping(headers, samples)
    });
  };

  const handleColumnMappingChange = (key: keyof LogColumnMapping, colIdx: number) => {
    if (!activeSheetAnalytics) return;
    updateActiveSheetOverride({
      headerRowIndex: activeSheetAnalytics.headerRowIndex,
      mapping: {
        ...activeSheetAnalytics.mapping,
        [key]: colIdx
      }
    });
  };

  // Filtered rows for the active individual sheet (defaults strictly to latest revision per code)
  const filteredRows = useMemo(() => {
    if (!activeSheetAnalytics) return [];
    const sourceRows =
      revisionViewMode === 'latest'
        ? activeSheetAnalytics.latestRows
        : activeSheetAnalytics.allRows;
    const q = tableSearch.trim().toLowerCase();
    return sourceRows.filter((row) => {
      if (filterStatus !== 'all' && row.statusCode !== filterStatus) return false;
      if (filterDiscipline !== 'all' && row.discipline !== filterDiscipline) return false;
      if (q) {
        const rawText = Object.values(row.rawCells).join(' ').toLowerCase();
        if (!rawText.includes(q)) return false;
      }
      return true;
    });
  }, [activeSheetAnalytics, revisionViewMode, filterStatus, filterDiscipline, tableSearch]);

  // All revisions belonging to the currently inspected code (e.g. REV 00 -> REV 01 -> REV 02)
  const inspectedCodeRevisions = useMemo(() => {
    if (!inspectRow || !activeSheetAnalytics || !inspectRow.baseCode) return [];
    return activeSheetAnalytics.allRows
      .filter((r) => r.baseCode === inspectRow.baseCode)
      .sort((a, b) => {
        if (a.revNumber !== b.revNumber) return a.revNumber - b.revNumber;
        return a.rowIndex - b.rowIndex;
      });
  }, [inspectRow, activeSheetAnalytics]);

  // Determine which structured columns actually contain real data in this sheet
  const tableColFlags = useMemo(() => {
    if (!activeSheetAnalytics) {
      return {
        code: false,
        description: false,
        discipline: false,
        rev: false,
        lastCode: false,
        status: false,
        submissionDate: false,
        replyDate: false
      };
    }
    const rows = activeSheetAnalytics.allRows;
    const m = activeSheetAnalytics.mapping;
    return {
      code: m.submittalNumber >= 0 || rows.some((r) => Boolean(r.submittalNumber)),
      description: rows.some((r) => Boolean(r.description || r.location)),
      discipline: m.discipline >= 0 && rows.some((r) => Boolean(r.discipline)),
      rev:
        activeSheetAnalytics.supersededCount > 0 || rows.some((r) => Boolean(r.rev)),
      lastCode: m.lastCode >= 0 && rows.some((r) => Boolean(r.lastCode)),
      status:
        activeSheetAnalytics.hasStatusColumn &&
        m.status >= 0 &&
        rows.some((r) => Boolean(r.statusRaw || r.statusCode !== 'OTHER')),
      submissionDate: m.submissionDate >= 0 && rows.some((r) => Boolean(r.submissionDate)),
      replyDate: m.replyDate >= 0 && rows.some((r) => Boolean(r.replyDate))
    };
  }, [activeSheetAnalytics]);

  // Column dropdown options containing ONLY columns with real headers or real data
  const populatedMappingOptions = useMemo(() => {
    if (!activeSheetAnalytics || !activeRawSheet) return [];
    const headerRow = activeRawSheet.rawRows[activeSheetAnalytics.headerRowIndex] || [];
    const dataRows = activeRawSheet.rawRows.slice(
      activeSheetAnalytics.headerRowIndex + 1,
      activeSheetAnalytics.headerRowIndex + 200
    );
    const mappedSet = new Set<number>(Object.values(activeSheetAnalytics.mapping));
    return activeSheetAnalytics.headers
      .map((label, colIdx) => {
        const hasRealHeader = Boolean((headerRow[colIdx] || '').trim());
        const hasData = dataRows.some((r) => Boolean((r[colIdx] || '').trim()));
        return { colIdx, label, keep: hasRealHeader || hasData || mappedSet.has(colIdx) };
      })
      .filter((item) => item.keep);
  }, [activeSheetAnalytics, activeRawSheet]);

  // Determine whether the active sheet uses standard DC columns or custom raw columns
  const useCustomColumnsTable = useMemo(() => {
    if (!activeSheetAnalytics) return false;
    const m = activeSheetAnalytics.mapping;
    return m.submittalNumber === -1 && m.lastCode === -1 && m.description === -1 && m.status === -1;
  }, [activeSheetAnalytics]);

  const customVisibleHeaders = useMemo(() => {
    if (!activeSheetAnalytics) return [];
    return activeSheetAnalytics.headers
      .filter(
        (h) =>
          h.trim().length > 0 &&
          activeSheetAnalytics.allRows.some((r) => Boolean(r.rawCells[h]))
      )
      .slice(0, 8);
  }, [activeSheetAnalytics]);

  // Chart data for comparing all non-empty internal sheets
  const overviewChartData = useMemo(() => {
    if (!workbookAnalysis) return [];
    return workbookAnalysis.sheets
      .filter((s) => s.totalRows > 0)
      .map((s) => ({
        sheetIndex: s.sheetIndex,
        name: s.sheetName.length > 16 ? s.sheetName.slice(0, 15) + '…' : s.sheetName,
        fullName: s.sheetName,
        معتمد: s.approvedCount,
        'تحت المراجعة': s.pendingCount,
        'تعديل / مرفوض': s.rejectedCount,
        أخرى: s.statusCounts.OTHER,
        الإجمالي: s.totalRows
      }));
  }, [workbookAnalysis]);

  // Submittals status distribution Donut data across the active workbook
  const overviewStatusDonutData = useMemo(() => {
    if (!workbookAnalysis) return { items: [], hasStatuses: false, total: 0 };
    const counts = workbookAnalysis.totals.statusCounts;
    const classifiedTotal = counts.A + counts.B + counts.W + counts.C + counts.D;
    const hasStatuses = classifiedTotal > 0;
    const total = workbookAnalysis.totals.totalRows;

    if (hasStatuses) {
      const items = STATUS_CHART_META.map((meta) => {
        const value = counts[meta.key];
        return {
          statusKey: meta.key,
          name: meta.label,
          shortLabel: meta.shortLabel,
          fullName: meta.label,
          value,
          fill: meta.color,
          percent: total > 0 ? Math.round((value / total) * 100) : 0
        };
      }).filter((item) => item.value > 0);
      return { items, hasStatuses: true, total };
    }

    // Fallback: share of rows per internal sheet when workbook has no status column
    const items = workbookAnalysis.sheets
      .filter((s) => s.totalRows > 0)
      .slice(0, 8)
      .map((s, idx) => ({
        statusKey: 'OTHER' as const,
        sheetIndex: s.sheetIndex,
        name: s.sheetName,
        shortLabel: s.sheetName,
        fullName: s.sheetName,
        value: s.totalRows,
        fill: SHEET_SHARE_COLORS[idx % SHEET_SHARE_COLORS.length],
        percent: total > 0 ? Math.round((s.totalRows / total) * 100) : 0
      }));
    return { items, hasStatuses: false, total };
  }, [workbookAnalysis]);

  // Multi-file comparison chart data (sheet counts & submittals per uploaded file in active project)
  const filesComparisonChartData = useMemo(() => {
    if (projectUploadedFiles.length < 2) return [];
    return projectUploadedFiles.map((entry) => {
      const analysis = analyzeWorkbook(
        entry.workbook,
        entry.sheetOverrides,
        entry.excludedSheetIndices,
        dateFilterActive ? dateFilter : undefined
      );
      const shortName =
        entry.fileName.replace(/\.[^/.]+$/, '').length > 16
          ? entry.fileName.replace(/\.[^/.]+$/, '').slice(0, 15) + '…'
          : entry.fileName.replace(/\.[^/.]+$/, '');
      return {
        fileId: entry.id,
        name: shortName,
        fullName: entry.fileName,
        'عدد الشيتات': analysis.totals.sheetsCount,
        'إجمالي البنود': analysis.totals.totalRows,
        معتمد: analysis.totals.approvedCount,
        'تحت المراجعة': analysis.totals.pendingCount,
        'تعديل / مرفوض': analysis.totals.rejectedCount
      };
    });
  }, [projectUploadedFiles, dateFilter, dateFilterActive]);

  // Individual Sheet Donut & Secondary Bar chart data
  const activeSheetStatusDonutData = useMemo(() => {
    if (!activeSheetAnalytics || activeSheetAnalytics.totalRows === 0) return [];
    const counts = activeSheetAnalytics.statusCounts;
    const total = activeSheetAnalytics.totalRows;
    return STATUS_CHART_META.map((meta) => {
      const value = counts[meta.key];
      return {
        statusKey: meta.key,
        name: meta.label,
        shortLabel: meta.shortLabel,
        fullName: meta.label,
        value,
        fill: meta.color,
        percent: total > 0 ? Math.round((value / total) * 100) : 0
      };
    }).filter((item) => item.value > 0);
  }, [activeSheetAnalytics]);

  const activeSheetSecondaryBarData = useMemo(() => {
    if (!activeSheetAnalytics) return { mode: 'none' as const, items: [] };
    if (activeSheetAnalytics.disciplines.length > 0) {
      return {
        mode: 'disciplines' as const,
        items: activeSheetAnalytics.disciplines.slice(0, 10).map((d) => ({
          key: d.name,
          name: d.name.length > 14 ? d.name.slice(0, 13) + '…' : d.name,
          fullName: d.name,
          البنود: d.count
        }))
      };
    }
    if (activeSheetAnalytics.prefixBreakdown.length > 1) {
      return {
        mode: 'prefixes' as const,
        items: activeSheetAnalytics.prefixBreakdown.slice(0, 10).map((p) => ({
          key: p.prefix,
          name: p.prefix.length > 14 ? p.prefix.slice(0, 13) + '…' : p.prefix,
          fullName: p.prefix,
          البنود: p.count
        }))
      };
    }
    return { mode: 'none' as const, items: [] };
  }, [activeSheetAnalytics]);

  const handleExportActiveSheet = () => {
    if (!activeEntry || !activeSheetAnalytics || filteredRows.length === 0) return;
    exportExtractedLogsToExcel(filteredRows, activeEntry.fileName, activeSheetAnalytics.sheetName);
    showToast(
      `تم تصدير ${filteredRows.length} سجل من ورقة «${activeSheetAnalytics.sheetName}» بنجاح.`
    );
  };

  const handleExportWorkbookSummary = () => {
    if (!activeEntry || !workbookAnalysis) return;
    exportWorkbookSummaryToExcel(activeEntry.fileName, workbookAnalysis.sheets);
    showToast(
      `تم تصدير تقرير التحليل الشامل لـ ${workbookAnalysis.sheets.length} ورقة داخلية بنجاح.`
    );
  };

  const renderStatusText = (code: SubmittalStatusCode | 'OTHER', raw: string) => {
    if (code !== 'OTHER' && SUBMITTAL_STATUS_CONFIG[code]) {
      const meta = SUBMITTAL_STATUS_CONFIG[code];
      return (
        <span
          className={`inline-flex items-center gap-1 font-bold text-xs ${meta.textColor}`}
          title={raw || meta.labelAr}
        >
          <span className="font-mono tabular-nums">{meta.code}</span>
          <span className="text-slate-400 dark:text-slate-600">·</span>
          <span>{meta.labelAr}</span>
        </span>
      );
    }
    return (
      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
        {raw || '—'}
      </span>
    );
  };

  if (!isAdmin && sortedProjects.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            لا توجد مشاريع مصرح لك بالوصول إليها حالياً
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
            تظهر في تبويب <strong className="font-mono">logs</strong> المشاريع المسندة لحسابك فقط.
            يرجى التواصل مع مسؤول النظام لمنحك صلاحية الوصول للمشروع المطلوب.
          </p>
        </div>
      </div>
    );
  }

  const activeProjectRemoteSources = activeProject
    ? remoteExcelSourcesByProject[activeProject.id] || []
    : [];

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-16">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".xlsx,.xls,.xlsm,.xlsb,.xltx,.xltm,.ods,.csv,.tsv"
        onChange={(e) => {
          if (e.target.files) {
            handleLocalFilesSelected(e.target.files);
          }
        }}
        className="hidden"
      />

      {/* Page Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-900 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug flex flex-wrap items-center gap-2">
              <span>شيتات اللوج حسب المواقع والمشاريع (Excel Logs)</span>
              {isSyncingCloud && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>جاري مزامنة الشيتات...</span>
                </span>
              )}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
              {isAdmin
                ? 'تبويب داخلي مستقل لكل موقع مسجل على النظام لقراءة أوراق اللوج وتحليل آخر كود وحالات التقديمات على آخر Revision فقط'
                : 'تظهر هنا المشاريع المصرح لك بالوصول إليها فقط لرفع وقراءة شيتات اللوج وتحليل التقديمات على آخر Revision'}
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={isParsing || sortedProjects.length === 0}
          onClick={() => triggerUploadForProject()}
          className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shrink-0 whitespace-nowrap touch-manipulation"
        >
          {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          <span>
            {activeProject
              ? `رفع Excel لـ «${activeProject.name.length > 22 ? activeProject.name.slice(0, 21) + '…' : activeProject.name}»`
              : 'رفع ملف Excel من الجهاز'}
          </span>
        </button>
      </div>

      {/* =====================================================================
          INTERNAL PROJECTS / SITES TABS BAR (Scoped to User's Authorized Projects)
          ===================================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-4 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
            <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>
              {isAdmin
                ? `مواقع ومشاريع النظام (${sortedProjects.length})`
                : `المشاريع المصرح لك بها (${sortedProjects.length})`}
            </span>
            {activeProject && (
              <>
                <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                  /
                </span>
                <span className="text-blue-600 dark:text-blue-400 truncate max-w-[260px]">
                  {activeProject.name}
                </span>
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {activeProject.code}
                </span>
              </>
            )}
          </div>

          {sortedProjects.length > 6 && (
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={projectTabSearch}
                onChange={(e) => setProjectTabSearch(e.target.value)}
                placeholder="بحث في المواقع..."
                className="w-full h-8 pr-8 pl-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">
          {/* All Accessible Projects Summary Tab (shown for Admins or Site Users with 2+ assigned projects) */}
          {(isAdmin || sortedProjects.length > 1) && (
            <>
              <button
                type="button"
                onClick={() => selectProjectTab('all')}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
                  selectedProjectTab === 'all'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                    : 'bg-slate-100/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-transparent hover:bg-slate-200/80 dark:hover:bg-slate-700'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                <span>{isAdmin ? 'كل المشاريع' : 'كل مشاريعي'}</span>
                <span
                  className={`font-mono tabular-nums text-[11px] ${
                    selectedProjectTab === 'all'
                      ? 'text-slate-300 dark:text-slate-600'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  ({sortedProjects.length})
                </span>
              </button>

              {sortedProjects.length > 0 && (
                <span className="h-5 w-px bg-slate-200 dark:bg-slate-700 shrink-0 mx-0.5" />
              )}
            </>
          )}

          {/* Dedicated Internal Tab for Every Project Registered on the Website */}
          {visibleProjectTabs.map((project) => {
            const isSelected = selectedProjectTab === project.id;
            const localFilesCount = fileCountByProject[project.id] || 0;
            const remoteFilesCount = (remoteExcelSourcesByProject[project.id] || []).length;
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => selectProjectTab(project.id)}
                title={`${project.name} (${project.code}) — ${localFilesCount} ملف لوج محمّل`}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600'
                }`}
              >
                <span className="max-w-[200px] truncate">{project.name}</span>
                <span
                  className={`font-mono tabular-nums text-[11px] ${
                    isSelected ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {localFilesCount > 0
                    ? `${localFilesCount} ملف`
                    : remoteFilesCount > 0
                      ? `${remoteFilesCount} بالموقع`
                      : project.code}
                </span>
              </button>
            );
          })}

          {sortedProjects.length === 0 && (
            <span className="text-xs text-slate-500 dark:text-slate-400 px-2">
              لا توجد مشاريع مضافة على الموقع بعد — يمكنك إضافتها من تبويب «المشاريع».
            </span>
          )}
        </div>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Error Alert */}
      {uploadError && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-bold flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{uploadError}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="text-rose-500 hover:text-rose-700 cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =====================================================================
          ALL PROJECTS OVERVIEW TAB (selectedProjectTab === 'all')
          ===================================================================== */}
      {selectedProjectTab === 'all' && (
        <div className="space-y-5">
          {/* Cross-Projects Date Filter Panel */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  فلتر التاريخ والفترات عبر كل المشاريع
                </h3>
                {allProjectsDateMeta.earliestDate && allProjectsDateMeta.latestDate && (
                  <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    ({allProjectsDateMeta.earliestDate} ← {allProjectsDateMeta.latestDate} ·{' '}
                    {allProjectsDateMeta.datedCount} بند مؤرخ)
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {allProjectsDateMeta.hasReplyDates && (
                  <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setDateFilter((prev) => ({ ...prev, field: 'submissionDate' }))}
                      className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                        dateFilter.field === 'submissionDate'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      تاريخ التقديم
                    </button>
                    <button
                      type="button"
                      onClick={() => setDateFilter((prev) => ({ ...prev, field: 'replyDate' }))}
                      className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                        dateFilter.field === 'replyDate'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      تاريخ الرد
                    </button>
                  </div>
                )}

                {dateFilterActive && (
                  <button
                    type="button"
                    onClick={() =>
                      setDateFilter((prev) => ({ ...DEFAULT_DATE_FILTER, field: prev.field }))
                    }
                    className="min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>إلغاء الفلتر</span>
                  </button>
                )}
              </div>
            </div>

            {/* Mode Selector Buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: 'كل الفترات' },
                  { id: 'year', label: 'حسب السنة' },
                  { id: 'month', label: 'حسب الشهر' },
                  { id: 'quarter', label: 'حسب الربع (Q1–Q4)' },
                  { id: 'range', label: 'فترة مخصصة (من – إلى)' }
                ] as { id: DateFilterMode; label: string }[]
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleDateModeChange(m.id)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                    dateFilter.mode === m.id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Mode: By Year */}
            {dateFilter.mode === 'year' && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  اختر السنة:
                </span>
                {allProjectsDateMeta.availableYears.length > 0 ? (
                  allProjectsDateMeta.availableYears.map((yr) => (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => setDateFilter((prev) => ({ ...prev, year: yr }))}
                      className={`px-3.5 py-1.5 rounded-lg font-mono tabular-nums text-xs font-bold border transition-colors cursor-pointer ${
                        dateFilter.year === yr
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-indigo-400'
                      }`}
                    >
                      {yr}
                    </button>
                  ))
                ) : (
                  <input
                    type="number"
                    min={2000}
                    max={2099}
                    value={dateFilter.year}
                    onChange={(e) =>
                      setDateFilter((prev) => ({ ...prev, year: e.target.value }))
                    }
                    placeholder="2026"
                    className="h-9 w-28 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-xs dark:text-white"
                  />
                )}
              </div>
            )}

            {/* Mode: By Month */}
            {dateFilter.mode === 'month' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1 text-xs">
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                    السنة
                  </label>
                  <select
                    value={dateFilter.year}
                    onChange={(e) =>
                      setDateFilter((prev) => ({ ...prev, year: e.target.value }))
                    }
                    className="w-full h-10 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">كل السنوات</option>
                    {allProjectsDateMeta.availableYears.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                    الشهر
                  </label>
                  <select
                    value={dateFilter.month}
                    onChange={(e) =>
                      setDateFilter((prev) => ({ ...prev, month: e.target.value }))
                    }
                    className="w-full h-10 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">كل الشهور</option>
                    {ARABIC_MONTH_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Mode: By Quarter */}
            {dateFilter.mode === 'quarter' && (
              <div className="space-y-2.5 pt-1 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-600 dark:text-slate-300">السنة:</span>
                  <select
                    value={dateFilter.year}
                    onChange={(e) =>
                      setDateFilter((prev) => ({ ...prev, year: e.target.value }))
                    }
                    className="h-9 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold dark:text-white"
                  >
                    <option value="">كل السنوات</option>
                    {allProjectsDateMeta.availableYears.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      { id: '1', label: 'الربع الأول Q1', sub: 'يناير – مارس' },
                      { id: '2', label: 'الربع الثاني Q2', sub: 'أبريل – يونيو' },
                      { id: '3', label: 'الربع الثالث Q3', sub: 'يوليو – سبتمبر' },
                      { id: '4', label: 'الربع الرابع Q4', sub: 'أكتوبر – ديسمبر' }
                    ] as { id: '1' | '2' | '3' | '4'; label: string; sub: string }[]
                  ).map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setDateFilter((prev) => ({ ...prev, quarter: q.id }))}
                      className={`p-2.5 rounded-xl border text-right transition-colors cursor-pointer ${
                        dateFilter.quarter === q.id
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                      }`}
                    >
                      <div className="font-bold text-xs">{q.label}</div>
                      <div
                        className={`text-[11px] mt-0.5 ${
                          dateFilter.quarter === q.id
                            ? 'text-indigo-100'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {q.sub}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Mode: Custom Date Range */}
            {dateFilter.mode === 'range' && (
              <div className="space-y-3 pt-1 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                      من تاريخ
                    </label>
                    <input
                      type="date"
                      value={dateFilter.fromDate}
                      onChange={(e) =>
                        setDateFilter((prev) => ({ ...prev, fromDate: e.target.value }))
                      }
                      className="w-full h-10 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                      إلى تاريخ
                    </label>
                    <input
                      type="date"
                      value={dateFilter.toDate}
                      onChange={(e) =>
                        setDateFilter((prev) => ({ ...prev, toDate: e.target.value }))
                      }
                      className="w-full h-10 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 ml-1">
                    اختصارات سريعة:
                  </span>
                  {(
                    [
                      { id: 'last7', label: 'آخر 7 أيام' },
                      { id: 'last30', label: 'آخر 30 يوماً' },
                      { id: 'last90', label: 'آخر 90 يوماً' },
                      { id: 'thisMonth', label: 'آخر شهر بالملفات' },
                      { id: 'thisYear', label: 'آخر سنة بالملفات' }
                    ] as {
                      id: 'last7' | 'last30' | 'last90' | 'thisMonth' | 'thisYear';
                      label: string;
                    }[]
                  ).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyQuickRangePreset(preset.id)}
                      className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-700 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-300 border border-slate-200 dark:border-slate-700 text-[11px] font-bold cursor-pointer transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Active Filter Footer */}
            {(dateFilterActive || allProjectsDateMeta.undatedCount > 0) && (
              <div className="pt-2.5 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="text-slate-600 dark:text-slate-300 tabular-nums">
                  الفترة المعروضة:{' '}
                  <strong className="text-indigo-700 dark:text-indigo-300">
                    {activeDateFilterLabel}
                  </strong>
                  {allProjectsDateMeta.undatedCount > 0 && !dateFilterActive && (
                    <span className="text-slate-400 dark:text-slate-500 mr-2">
                      (يوجد {allProjectsDateMeta.undatedCount} بند بدون تاريخ)
                    </span>
                  )}
                </div>
                {dateFilterActive && (
                  <button
                    type="button"
                    onClick={() =>
                      setDateFilter((prev) => ({ ...DEFAULT_DATE_FILTER, field: prev.field }))
                    }
                    className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>إلغاء فلتر التاريخ (عرض الكل)</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Global Cross-Projects KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                المشاريع والمواقع المسجلة
              </div>
              <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                {allProjectsOverview.totals.projectsCount}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                {allProjectsOverview.totals.projectsWithLogs} موقع بها شيتات لوج محمّلة
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                ملفات اللوج والأوراق الداخلية
              </div>
              <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                {allProjectsOverview.totals.filesCount}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                {allProjectsOverview.totals.sheetsCount} ورقة داخلية إجمالاً
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                إجمالي البنود المعتمدة (A / B)
              </div>
              <div className="text-2xl font-extrabold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                {allProjectsOverview.totals.approvedCount}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                من أصل {allProjectsOverview.totals.totalRows} بند (آخر REV)
                {dateFilterActive ? ' · ضمن الفترة' : ''}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                تحت المراجعة / إعادة تقديم
              </div>
              <div className="flex items-baseline gap-2.5 mt-1 font-mono tabular-nums">
                <span className="text-2xl font-extrabold text-amber-700 dark:text-amber-300">
                  {allProjectsOverview.totals.pendingCount}
                </span>
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                  / {allProjectsOverview.totals.rejectedCount} مرفوض
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {dateFilterActive ? `ضمن: ${activeDateFilterLabel}` : 'عبر جميع المواقع المحلّلة'}
              </div>
            </div>
          </div>

          {/* Cross-Project Recharts Comparison Chart */}
          {allProjectsOverview.chartData.length > 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>
                    مقارنة حالة التقديمات عبر المشاريع
                    {dateFilterActive ? ` — ${activeDateFilterLabel}` : ''}
                  </span>
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  اضغط على أي مشروع في الرسم البياني لفتح تبويبه الداخلي
                </span>
              </div>
              <div className="h-64 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={allProjectsOverview.chartData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.25} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                    <Tooltip content={<ExcelChartTooltip />} />
                    <Bar
                      dataKey="معتمد"
                      stackId="proj"
                      fill="#16a34a"
                      maxBarSize={48}
                      className="cursor-pointer"
                      onClick={(barData: { payload?: { projectId?: string } }) => {
                        const pid = barData?.payload?.projectId;
                        if (pid) selectProjectTab(pid);
                      }}
                    />
                    <Bar
                      dataKey="تحت المراجعة"
                      stackId="proj"
                      fill="#d97706"
                      maxBarSize={48}
                      className="cursor-pointer"
                      onClick={(barData: { payload?: { projectId?: string } }) => {
                        const pid = barData?.payload?.projectId;
                        if (pid) selectProjectTab(pid);
                      }}
                    />
                    <Bar
                      dataKey="تعديل / مرفوض"
                      stackId="proj"
                      fill="#dc2626"
                      maxBarSize={48}
                      className="cursor-pointer"
                      onClick={(barData: { payload?: { projectId?: string } }) => {
                        const pid = barData?.payload?.projectId;
                        if (pid) selectProjectTab(pid);
                      }}
                    />
                    <Bar
                      dataKey="أخرى"
                      stackId="proj"
                      fill="#64748b"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={48}
                      className="cursor-pointer"
                      onClick={(barData: { payload?: { projectId?: string } }) => {
                        const pid = barData?.payload?.projectId;
                        if (pid) selectProjectTab(pid);
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            accessibleUploadedFiles.length > 0 &&
            dateFilterActive && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2.5">
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  لا توجد بنود مطابقة للفترة الزمنية المحددة ({activeDateFilterLabel}) عبر المشاريع المحمّلة.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setDateFilter((prev) => ({ ...DEFAULT_DATE_FILTER, field: prev.field }))
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>عرض كل الفترات</span>
                </button>
              </div>
            )
          )}

          {/* Directory Cards of All Website Projects */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>دليل تبويبات المواقع ({allProjectsOverview.perProject.length})</span>
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                اختر أي موقع للدخول إلى تبويب شيتات اللوج الخاص به
              </span>
            </div>

            {allProjectsOverview.perProject.length === 0 ? (
              <div className="py-10 text-center text-xs font-bold text-slate-500 dark:text-slate-400 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                لا توجد مشاريع مسجلة على الموقع حالياً. أضف مشاريعك من تبويب «المشاريع» لتظهر هنا تلقائياً.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {allProjectsOverview.perProject.map((item) => (
                  <div
                    key={item.project.id}
                    onClick={() => selectProjectTab(item.project.id)}
                    className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 hover:border-blue-400 dark:hover:border-blue-600 transition-colors p-4 flex flex-col justify-between gap-3 cursor-pointer"
                  >
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug">
                          {item.project.name}
                        </h4>
                        <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                          {item.project.code}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5 tabular-nums">
                        <span>{item.project.status === 'active' ? 'مشروع نشط' : 'مكتمل'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.filesCount} ملف لوج</span>
                        {item.sheetsCount > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{item.sheetsCount} ورقة</span>
                          </>
                        )}
                        {item.remoteCount > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-blue-600 dark:text-blue-400 font-semibold">
                              {item.remoteCount} Excel مرفوع بالموقع
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {item.totalRows > 0 ? (
                      <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between text-xs font-mono tabular-nums">
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {item.totalRows} بند
                          </span>
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                            معتمد: {item.approvedCount}
                          </span>
                          <span className="text-amber-700 dark:text-amber-400 font-bold">
                            W: {item.pendingCount}
                          </span>
                        </div>
                        <span className="font-extrabold text-slate-900 dark:text-white">
                          {item.approvalRate}%
                        </span>
                      </div>
                    ) : (
                      <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                        {item.filesCount > 0 && dateFilterActive
                          ? 'لا توجد بنود في الفترة الزمنية المحددة'
                          : 'لم يتم رفع شيتات لوج لهذا الموقع بعد'}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectProjectTab(item.project.id);
                        }}
                        className="flex-1 min-h-[36px] px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-800 dark:text-slate-200 hover:text-blue-700 dark:hover:text-blue-300 border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <span>فتح التبويب</span>
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerUploadForProject(item.project.id);
                        }}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors shrink-0 whitespace-nowrap"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>رفع Excel</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SINGLE PROJECT WORKSPACE (selectedProjectTab === project.id)
          ===================================================================== */}
      {selectedProjectTab !== 'all' && (
        <>
          {/* Site-Uploaded Excel Files Available on the Website for This Project */}
          {activeProjectRemoteSources.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-4 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <CloudDownload className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    ملفات Excel مرفوعة على الموقع لمشروع «{activeProject?.name}» (
                    {activeProjectRemoteSources.length})
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
                  اضغط لفتحها وتحليلها مباشرة داخل هذا التبويب
                </span>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {activeProjectRemoteSources.map((src) => {
                  const isLoadingThis = loadingRemoteKey === src.key;
                  const alreadyImported = projectUploadedFiles.some(
                    (f) => f.remoteKey === src.key
                  );
                  return (
                    <button
                      key={src.key}
                      type="button"
                      disabled={isLoadingThis}
                      onClick={() => handleLoadRemoteProjectExcel(src)}
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 hover:border-emerald-400 dark:hover:border-emerald-600 transition-colors flex items-center gap-2.5 cursor-pointer shrink-0 max-w-[300px] text-right disabled:opacity-60"
                    >
                      {isLoadingThis ? (
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />
                      ) : (
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div
                          className="text-xs font-bold text-slate-900 dark:text-white truncate"
                          title={src.fileName}
                        >
                          {src.fileName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {src.sourceLabel} · {src.senderName}
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 shrink-0 whitespace-nowrap">
                        {alreadyImported ? 'مفتوح' : 'تحليل'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty State Dropzone OR Compact Uploaded Workbooks Bar for This Project */}
          {isHydratingSaved && projectUploadedFiles.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 flex items-center justify-center gap-2.5 text-xs font-bold text-slate-500 dark:text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>جاري تحميل شيتات اللوج المحفوظة للموقع...</span>
            </div>
          ) : projectUploadedFiles.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files?.length) {
                    handleLocalFilesSelected(e.dataTransfer.files, selectedProjectTab);
                  }
                }}
                onClick={() => {
                  if (!isParsing) triggerUploadForProject(selectedProjectTab);
                }}
                className={`border-2 border-dashed rounded-xl p-8 sm:p-12 text-center transition-colors cursor-pointer ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40'
                    : 'border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 bg-slate-50/60 dark:bg-slate-800/30'
                }`}
              >
                {isParsing ? (
                  <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-sm py-4">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>جاري قراءة جميع الأوراق الداخلية وتحليل البيانات...</span>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-w-lg mx-auto">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                      {activeProject
                        ? `ارفع شيت اللوج الخاص بموقع «${activeProject.name}» هنا`
                        : 'اختر ملف Excel من جهازك أو اسحبه وأفلته هنا'}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      سيتم ربط الملف وحفظه داخل تبويب هذا الموقع، وقراءة كل شيت داخلي باسمه الحقيقي
                      وتحليل آخر كود وحالات الاعتماد على آخر Revision فقط.
                    </p>
                    <div
                      className="text-[11px] font-mono text-slate-500 dark:text-slate-400 pt-1"
                      dir="ltr"
                    >
                      .xlsx · .xls · .xlsm · .csv
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Compact Uploaded Files Bar + Drag-and-Drop Support (Scoped to Active Project) */
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files?.length) {
                  handleLocalFilesSelected(e.dataTransfer.files, selectedProjectTab);
                }
              }}
              className={`bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-4 border transition-colors ${
                isDragging
                  ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/30'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  ملفات لوج «{activeProject?.name || 'الموقع'}» ({projectUploadedFiles.length})
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
                  اسحب وأفلت ملفات إضافية هنا لإضافتها لهذا الموقع
                </span>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {projectUploadedFiles.map((item) => {
                  const isSelected = activeEntry?.id === item.id;
                  const canDeleteItem =
                    isAdmin || !item.isCloudSynced || item.uploadedBy === currentUser.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => selectWorkbookEntry(item)}
                      className={`px-3 py-2 rounded-xl border transition-colors flex items-center gap-2.5 cursor-pointer shrink-0 max-w-[300px] ${
                        isSelected
                          ? 'bg-blue-50/90 dark:bg-blue-950/50 border-blue-500 dark:border-blue-600'
                          : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <FileSpreadsheet
                        className={`w-4 h-4 shrink-0 ${
                          isSelected
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <div
                          className="text-xs font-bold text-slate-900 dark:text-white truncate"
                          title={item.fileName}
                        >
                          {item.fileName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums whitespace-nowrap">
                          {item.workbook.sheets.length - item.excludedSheetIndices.length} ورقة ·{' '}
                          {formatFileSize(item.fileSize)}
                        </div>
                        {item.uploaderName && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            بواسطة: {item.uploaderName}
                          </div>
                        )}
                      </div>
                      {canDeleteItem && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleRemoveUploadedFile(item.id);
                          }}
                          title="إزالة الملف"
                          className="p-1 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer shrink-0 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* =====================================================================
          MULTI-SHEET WORKBOOK ANALYTICS WORKBENCH
          ===================================================================== */}
      {selectedProjectTab !== 'all' && activeEntry && workbookAnalysis && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          {/* Workbook Top Bar + Internal Sheet Tabs */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 space-y-3.5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                  {activeEntry.fileName}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                  <span>
                    <strong className="font-mono text-slate-800 dark:text-slate-200">
                      {workbookAnalysis.totals.sheetsCount}
                    </strong>{' '}
                    ورقة داخلية
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    <strong className="font-mono text-slate-800 dark:text-slate-200">
                      {workbookAnalysis.totals.totalRows}
                    </strong>{' '}
                    بند (آخر REV فقط)
                  </span>
                  {workbookAnalysis.totals.totalSupersededRevisions > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        مستبعد{' '}
                        <strong className="font-mono text-slate-700 dark:text-slate-300">
                          {workbookAnalysis.totals.totalSupersededRevisions}
                        </strong>{' '}
                        مراجعة سابقة (من{' '}
                        <span className="font-mono">{workbookAnalysis.totals.totalRawRows}</span> صف)
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                {typeof activeView === 'number' && activeSheetAnalytics && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowMappingPanel((prev) => !prev)}
                      className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition-colors whitespace-nowrap ${
                        showMappingPanel
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>ضبط أعمدة الورقة</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteInternalSheet(
                          activeSheetAnalytics.sheetIndex,
                          activeSheetAnalytics.sheetName
                        )
                      }
                      className="min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border border-rose-200 dark:border-rose-900/70 bg-rose-50/70 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-950/60 text-rose-700 dark:text-rose-300 transition-colors whitespace-nowrap"
                      title="حذف هذه الورقة الداخلية من التحليل"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف الورقة</span>
                    </button>
                  </>
                )}

                {typeof activeView !== 'number' ? (
                  <button
                    type="button"
                    disabled={workbookAnalysis.sheets.length === 0}
                    onClick={handleExportWorkbookSummary}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تصدير التحليل الشامل (Excel)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={filteredRows.length === 0}
                    onClick={handleExportActiveSheet}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تصدير الورقة ({filteredRows.length})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Interactive Internal Sheet Tabs Bar (Named by Exact Internal Sheet Name) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              <button
                type="button"
                onClick={() => {
                  setActiveView('overview');
                  setShowMappingPanel(false);
                }}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
                  activeView === 'overview'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                    : 'bg-slate-100/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-transparent hover:bg-slate-200/80 dark:hover:bg-slate-700'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                <span>تحليل كل الأوراق ({workbookAnalysis.sheets.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveView('dates');
                  setShowMappingPanel(false);
                }}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
                  activeView === 'dates'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : dateFilterActive
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700'
                      : 'bg-slate-100/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-transparent hover:bg-slate-200/80 dark:hover:bg-slate-700'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>التاريخ والفترات</span>
                {dateFilterActive && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      activeView === 'dates' ? 'bg-white' : 'bg-indigo-600 dark:bg-indigo-400'
                    }`}
                  />
                )}
              </button>

              <span className="h-5 w-px bg-slate-200 dark:bg-slate-700 shrink-0 mx-0.5" />

              {workbookAnalysis.sheets.map((s) => {
                const isActive = activeView === s.sheetIndex;
                return (
                  <div
                    key={`${s.sheetIndex}-${s.sheetName}`}
                    className={`min-h-[38px] rounded-lg text-xs font-bold flex items-center whitespace-nowrap shrink-0 transition-colors border ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openSheetTab(s.sheetIndex)}
                      className="h-full pr-3 pl-1.5 py-1.5 flex items-center gap-1.5 cursor-pointer"
                      title={`${s.sheetName} (${s.totalRows} بند)`}
                    >
                      <span>{s.sheetName}</span>
                      <span
                        className={`font-mono tabular-nums text-[11px] ${
                          isActive ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        ({s.totalRows})
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteInternalSheet(s.sheetIndex, s.sheetName);
                      }}
                      title={`حذف الورقة «${s.sheetName}»`}
                      aria-label={`حذف الورقة ${s.sheetName}`}
                      className={`p-1.5 ml-1 rounded-md cursor-pointer transition-colors ${
                        isActive
                          ? 'text-blue-100 hover:text-white hover:bg-blue-700'
                          : 'text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Restore Deleted Internal Sheets Strip (Only shown if user deleted sheets) */}
            {deletedSheetsList.length > 0 && (
              <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    أوراق محذوفة ({deletedSheetsList.length}):
                  </span>
                  {deletedSheetsList.map((item) => (
                    <button
                      key={`deleted-${item.sheetIndex}`}
                      type="button"
                      onClick={() => handleRestoreInternalSheet(item.sheetIndex, item.sheetName)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950/50 text-slate-600 hover:text-blue-700 dark:text-slate-300 dark:hover:text-blue-300 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold cursor-pointer transition-colors"
                      title={`استعادة الورقة «${item.sheetName}»`}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{item.sheetName}</span>
                    </button>
                  ))}
                </div>
                {deletedSheetsList.length > 1 && (
                  <button
                    type="button"
                    onClick={handleRestoreAllInternalSheets}
                    className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>استعادة الكل</span>
                  </button>
                )}
              </div>
            )}

            {/* Active Date Filter Strip (Visible on Overview & Individual Sheet views when filtered) */}
            {dateFilterActive && activeView !== 'dates' && (
              <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    فلتر التاريخ النشط: {activeDateFilterLabel}{' '}
                    <span className="font-normal text-slate-500 dark:text-slate-400">
                      ({dateFilter.field === 'replyDate' ? 'تاريخ الرد' : 'تاريخ التقديم'})
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveView('dates')}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold cursor-pointer transition-colors"
                  >
                    تعديل الفترة
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDateFilter((prev) => ({ ...DEFAULT_DATE_FILTER, field: prev.field }))
                    }
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold cursor-pointer transition-colors"
                  >
                    إلغاء الفلتر
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* =================================================================
              VIEW D: DATE FILTERING & TIMELINE ANALYTICS TAB (التاريخ والفترات)
              ================================================================= */}
          {activeView === 'dates' && dateTimelineSummary && fullDateMeta && (
            <div className="p-4 sm:p-6 space-y-6">
              {/* Date Filter Controls Card */}
              <div className="p-4 sm:p-5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span>فلترة وتحليل البيانات حسب التاريخ والفترة الزمنية</span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                      {fullDateMeta.earliestDate && fullDateMeta.latestDate
                        ? `نطاق التواريخ بالملف: من ${fullDateMeta.earliestDate} إلى ${fullDateMeta.latestDate} · ${fullDateMeta.datedCount} بند مؤرخ`
                        : 'لم يتم العثور على تواريخ مقروءة في الأوراق — يمكنك ضبط عمود «تاريخ التقديم» من داخل أي ورقة.'}
                    </p>
                  </div>

                  {fullDateMeta.hasReplyDates && (
                    <div className="inline-flex items-center p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 w-fit shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setDateFilter((prev) => ({ ...prev, field: 'submissionDate' }))
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                          dateFilter.field === 'submissionDate'
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        تاريخ التقديم
                      </button>
                      <button
                        type="button"
                        onClick={() => setDateFilter((prev) => ({ ...prev, field: 'replyDate' }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                          dateFilter.field === 'replyDate'
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        تاريخ الرد
                      </button>
                    </div>
                  )}
                </div>

                {/* Mode Selector Tabs */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'all', label: 'كل الفترات' },
                      { id: 'year', label: 'حسب السنة' },
                      { id: 'month', label: 'حسب الشهر' },
                      { id: 'quarter', label: 'حسب الربع (Q1–Q4)' },
                      { id: 'range', label: 'فترة مخصصة (من – إلى)' }
                    ] as { id: DateFilterMode; label: string }[]
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleDateModeChange(m.id)}
                      className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                        dateFilter.mode === m.id
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Dynamic Inputs Based on Selected Mode */}
                {dateFilter.mode === 'year' && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      اختر السنة:
                    </span>
                    {fullDateMeta.availableYears.length > 0 ? (
                      fullDateMeta.availableYears.map((yr) => (
                        <button
                          key={yr}
                          type="button"
                          onClick={() => setDateFilter((prev) => ({ ...prev, year: yr }))}
                          className={`px-3.5 py-1.5 rounded-lg font-mono tabular-nums text-xs font-bold border transition-colors cursor-pointer ${
                            dateFilter.year === yr
                              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-indigo-400'
                          }`}
                        >
                          {yr}
                        </button>
                      ))
                    ) : (
                      <input
                        type="number"
                        min={2000}
                        max={2099}
                        value={dateFilter.year}
                        onChange={(e) =>
                          setDateFilter((prev) => ({ ...prev, year: e.target.value }))
                        }
                        placeholder="2026"
                        className="h-9 w-28 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-xs dark:text-white"
                      />
                    )}
                  </div>
                )}

                {dateFilter.mode === 'month' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1 text-xs">
                    <div>
                      <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                        السنة
                      </label>
                      <select
                        value={dateFilter.year}
                        onChange={(e) =>
                          setDateFilter((prev) => ({ ...prev, year: e.target.value }))
                        }
                        className="w-full h-10 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">كل السنوات</option>
                        {fullDateMeta.availableYears.map((yr) => (
                          <option key={yr} value={yr}>
                            {yr}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                        الشهر
                      </label>
                      <select
                        value={dateFilter.month}
                        onChange={(e) =>
                          setDateFilter((prev) => ({ ...prev, month: e.target.value }))
                        }
                        className="w-full h-10 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">كل الشهور</option>
                        {ARABIC_MONTH_OPTIONS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {dateFilter.mode === 'quarter' && (
                  <div className="space-y-2.5 pt-1 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-600 dark:text-slate-300">السنة:</span>
                      <select
                        value={dateFilter.year}
                        onChange={(e) =>
                          setDateFilter((prev) => ({ ...prev, year: e.target.value }))
                        }
                        className="h-9 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold dark:text-white"
                      >
                        <option value="">كل السنوات</option>
                        {fullDateMeta.availableYears.map((yr) => (
                          <option key={yr} value={yr}>
                            {yr}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(
                        [
                          { id: '1', label: 'الربع الأول Q1', sub: 'يناير – مارس' },
                          { id: '2', label: 'الربع الثاني Q2', sub: 'أبريل – يونيو' },
                          { id: '3', label: 'الربع الثالث Q3', sub: 'يوليو – سبتمبر' },
                          { id: '4', label: 'الربع الرابع Q4', sub: 'أكتوبر – ديسمبر' }
                        ] as { id: '1' | '2' | '3' | '4'; label: string; sub: string }[]
                      ).map((q) => (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => setDateFilter((prev) => ({ ...prev, quarter: q.id }))}
                          className={`p-2.5 rounded-xl border text-right transition-colors cursor-pointer ${
                            dateFilter.quarter === q.id
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                          }`}
                        >
                          <div className="font-bold text-xs">{q.label}</div>
                          <div
                            className={`text-[11px] mt-0.5 ${
                              dateFilter.quarter === q.id
                                ? 'text-indigo-100'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {q.sub}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {dateFilter.mode === 'range' && (
                  <div className="space-y-3 pt-1 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                          من تاريخ
                        </label>
                        <input
                          type="date"
                          value={dateFilter.fromDate}
                          onChange={(e) =>
                            setDateFilter((prev) => ({ ...prev, fromDate: e.target.value }))
                          }
                          className="w-full h-10 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                          إلى تاريخ
                        </label>
                        <input
                          type="date"
                          value={dateFilter.toDate}
                          onChange={(e) =>
                            setDateFilter((prev) => ({ ...prev, toDate: e.target.value }))
                          }
                          className="w-full h-10 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 ml-1">
                        اختصارات سريعة:
                      </span>
                      {(
                        [
                          { id: 'last7', label: 'آخر 7 أيام' },
                          { id: 'last30', label: 'آخر 30 يوماً' },
                          { id: 'last90', label: 'آخر 90 يوماً' },
                          { id: 'thisMonth', label: 'آخر شهر بالملف' },
                          { id: 'thisYear', label: 'آخر سنة بالملف' }
                        ] as {
                          id: 'last7' | 'last30' | 'last90' | 'thisMonth' | 'thisYear';
                          label: string;
                        }[]
                      ).map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyQuickRangePreset(preset.id)}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-700 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-300 border border-slate-200 dark:border-slate-700 text-[11px] font-bold cursor-pointer transition-colors"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Active Filter Status & Reset Footer */}
                <div className="pt-2.5 border-t border-slate-200/80 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="text-slate-600 dark:text-slate-300 tabular-nums">
                    الفترة المعروضة:{' '}
                    <strong className="text-indigo-700 dark:text-indigo-300">
                      {activeDateFilterLabel}
                    </strong>
                    {dateTimelineSummary.undatedCount > 0 && !dateFilterActive && (
                      <span className="text-slate-400 dark:text-slate-500 mr-2">
                        (يوجد {dateTimelineSummary.undatedCount} بند بدون تاريخ)
                      </span>
                    )}
                  </div>
                  {dateFilterActive && (
                    <button
                      type="button"
                      onClick={() =>
                        setDateFilter((prev) => ({ ...DEFAULT_DATE_FILTER, field: prev.field }))
                      }
                      className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>إلغاء فلتر التاريخ (عرض الكل)</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Period KPI Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    إجمالي البنود في الفترة (آخر REV)
                  </div>
                  <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                    {workbookAnalysis.totals.totalRows}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                    عبر {workbookAnalysis.totals.nonEmptySheetsCount} ورقة بها بيانات
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/60">
                  <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    معتمد (A / B)
                  </div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-extrabold font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                      {workbookAnalysis.totals.approvedCount}
                    </span>
                    <span className="text-xs font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                      {workbookAnalysis.totals.approvalRate}%
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5 font-mono tabular-nums">
                    A: {workbookAnalysis.totals.statusCounts.A} · B:{' '}
                    {workbookAnalysis.totals.statusCounts.B}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/60">
                  <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                    تحت المراجعة (W)
                  </div>
                  <div className="text-2xl font-extrabold font-mono tabular-nums text-amber-700 dark:text-amber-300 mt-1">
                    {workbookAnalysis.totals.pendingCount}
                  </div>
                  <div className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                    بانتظار رد الاستشاري
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/60">
                  <div className="text-[11px] font-semibold text-rose-700 dark:text-rose-400">
                    إعادة تقديم / مرفوض (C / D)
                  </div>
                  <div className="text-2xl font-extrabold font-mono tabular-nums text-rose-700 dark:text-rose-300 mt-1">
                    {workbookAnalysis.totals.rejectedCount}
                  </div>
                  <div className="text-[11px] text-rose-700/80 dark:text-rose-400/80 mt-0.5 font-mono tabular-nums">
                    C: {workbookAnalysis.totals.statusCounts.C} · D:{' '}
                    {workbookAnalysis.totals.statusCounts.D}
                  </div>
                </div>
              </div>

              {/* Timeline Chart + Period Breakdown Table */}
              {dateTimelineSummary.buckets.length === 0 ? (
                <div className="py-10 px-4 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 text-xs font-bold text-slate-500 dark:text-slate-400">
                  لا توجد بنود مطابقة للفترة الزمنية المحددة. جرّب توسيع الفترة أو الضغط على «كل الفترات».
                </div>
              ) : (
                <>
                  {/* Timeline Chart */}
                  <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span>
                          التوزيع الزمني للتقديمات ({timelineGranularity === 'month' ? 'شهري' : 'سنوي'})
                        </span>
                      </h4>
                      <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-fit">
                        <button
                          type="button"
                          onClick={() => setTimelineGranularity('month')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                            timelineGranularity === 'month'
                              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          حسب الشهر
                        </button>
                        <button
                          type="button"
                          onClick={() => setTimelineGranularity('year')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                            timelineGranularity === 'year'
                              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          حسب السنة
                        </button>
                      </div>
                    </div>

                    <div className="h-64 w-full" dir="ltr">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={dateTimelineSummary.buckets.map((b) => ({
                            name:
                              timelineGranularity === 'month' && b.month
                                ? `${ARABIC_MONTH_NAMES[b.month] || b.month} ${b.year.slice(2)}`
                                : b.label,
                            fullName: b.label,
                            معتمد: b.approved,
                            'تحت المراجعة': b.pending,
                            'تعديل / مرفوض': b.rejected,
                            أخرى: b.other
                          }))}
                          margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            interval="preserveStartEnd"
                          />
                          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                          <Tooltip content={<ExcelChartTooltip />} />
                          <Bar dataKey="معتمد" stackId="t" fill="#10b981" />
                          <Bar dataKey="تحت المراجعة" stackId="t" fill="#f59e0b" />
                          <Bar dataKey="تعديل / مرفوض" stackId="t" fill="#f43f5e" />
                          <Bar dataKey="أخرى" stackId="t" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Period-by-Period Summary Table */}
                  <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      جدول التحليل {timelineGranularity === 'month' ? 'الشهري' : 'السنوي'} (
                      {dateTimelineSummary.buckets.length} فترة)
                    </h4>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-xs text-right border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                            <th className="px-3 py-2.5 whitespace-nowrap">الفترة</th>
                            <th className="px-3 py-2.5 whitespace-nowrap text-center">الإجمالي</th>
                            <th className="px-3 py-2.5 whitespace-nowrap text-center">A</th>
                            <th className="px-3 py-2.5 whitespace-nowrap text-center">B</th>
                            <th className="px-3 py-2.5 whitespace-nowrap text-center">W</th>
                            <th className="px-3 py-2.5 whitespace-nowrap text-center">C / D</th>
                            <th className="px-3 py-2.5 whitespace-nowrap text-center">الاعتماد</th>
                            <th className="px-3 py-2.5 whitespace-nowrap text-center">فلترة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {dateTimelineSummary.buckets.map((b) => (
                            <tr
                              key={b.key}
                              className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                            >
                              <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                {b.label}
                              </td>
                              <td className="px-3 py-2.5 font-mono tabular-nums font-bold text-center text-slate-900 dark:text-white">
                                {b.total}
                              </td>
                              <td className="px-3 py-2.5 font-mono tabular-nums text-center text-emerald-700 dark:text-emerald-400 font-semibold">
                                {b.statusCounts.A}
                              </td>
                              <td className="px-3 py-2.5 font-mono tabular-nums text-center text-teal-700 dark:text-teal-400 font-semibold">
                                {b.statusCounts.B}
                              </td>
                              <td className="px-3 py-2.5 font-mono tabular-nums text-center text-amber-700 dark:text-amber-400 font-semibold">
                                {b.statusCounts.W}
                              </td>
                              <td className="px-3 py-2.5 font-mono tabular-nums text-center text-rose-700 dark:text-rose-400 font-semibold">
                                {b.rejected}
                              </td>
                              <td className="px-3 py-2.5 font-mono tabular-nums text-center font-bold text-slate-800 dark:text-slate-200">
                                {b.approvalRate}%
                              </td>
                              <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (timelineGranularity === 'year') {
                                      setDateFilter((prev) => ({
                                        ...prev,
                                        mode: 'year',
                                        year: b.year
                                      }));
                                    } else {
                                      setDateFilter((prev) => ({
                                        ...prev,
                                        mode: 'month',
                                        year: b.year,
                                        month: b.month || ''
                                      }));
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold cursor-pointer transition-colors"
                                >
                                  تطبيق
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Per-Sheet Breakdown Inside Selected Period */}
                  <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      نتائج الأوراق الداخلية ضمن «{activeDateFilterLabel}»
                    </h4>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-xs text-right border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                            <th className="px-3 py-2.5 whitespace-nowrap">اسم الورقة</th>
                            <th className="px-3 py-2.5 whitespace-nowrap text-center">
                              العدد في الفترة
                            </th>
                            <th className="px-3 py-2.5 whitespace-nowrap">آخر كود بالفترة</th>
                            <th className="px-3 py-2.5 whitespace-nowrap text-center">A</th>
                            <th className="px-3 py-2.5 whitespace-nowrap text-center">B</th>
                            <th className="px-3 py-2.5 whitespace-nowrap text-center">W</th>
                            <th className="px-3 py-2.5 whitespace-nowrap text-center">C / D</th>
                            <th className="px-3 py-2.5 whitespace-nowrap text-center">الاعتماد</th>
                            <th className="px-3 py-2.5 whitespace-nowrap text-center">عرض</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {workbookAnalysis.sheets.map((s) => (
                            <tr
                              key={`date-sheet-${s.sheetIndex}`}
                              className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                            >
                              <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                {s.sheetName}
                              </td>
                              <td className="px-3 py-2.5 font-mono tabular-nums font-bold text-center text-slate-900 dark:text-white">
                                {s.totalRows}
                              </td>
                              <td
                                dir="ltr"
                                className="px-3 py-2.5 font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap text-right"
                              >
                                {s.lastCode || '—'}
                              </td>
                              <td className="px-3 py-2.5 font-mono tabular-nums text-center text-emerald-700 dark:text-emerald-400 font-semibold">
                                {s.hasStatusColumn ? s.statusCounts.A : '—'}
                              </td>
                              <td className="px-3 py-2.5 font-mono tabular-nums text-center text-teal-700 dark:text-teal-400 font-semibold">
                                {s.hasStatusColumn ? s.statusCounts.B : '—'}
                              </td>
                              <td className="px-3 py-2.5 font-mono tabular-nums text-center text-amber-700 dark:text-amber-400 font-semibold">
                                {s.hasStatusColumn ? s.statusCounts.W : '—'}
                              </td>
                              <td className="px-3 py-2.5 font-mono tabular-nums text-center text-rose-700 dark:text-rose-400 font-semibold">
                                {s.hasStatusColumn ? s.rejectedCount : '—'}
                              </td>
                              <td className="px-3 py-2.5 font-mono tabular-nums text-center font-bold text-slate-800 dark:text-slate-200">
                                {s.hasStatusColumn ? `${s.approvalRate}%` : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => openSheetTab(s.sheetIndex)}
                                  className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold cursor-pointer transition-colors"
                                >
                                  فتح الورقة
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* =================================================================
              VIEW A: ALL INTERNAL SHEETS OVERVIEW DASHBOARD
              ================================================================= */}
          {activeView === 'overview' && (
            <div className="p-4 sm:p-6 space-y-6">
              {workbookAnalysis.sheets.length === 0 ? (
                <div className="py-12 px-4 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 space-y-3">
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    تم حذف جميع الأوراق الداخلية من هذا الملف
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    يمكنك استعادة أي ورقة من الشريط العلوي أو استعادة جميع الأوراق دفعة واحدة.
                  </p>
                  <button
                    type="button"
                    onClick={handleRestoreAllInternalSheets}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>استعادة جميع الأوراق المحذوفة</span>
                  </button>
                </div>
              ) : (
                <>
                  {/* Global Workbook KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    الأوراق الداخلية بالملف
                  </div>
                  <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                    {workbookAnalysis.totals.sheetsCount}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                    {workbookAnalysis.totals.nonEmptySheetsCount} ورقة بها بيانات
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    إجمالي البنود (آخر REV)
                  </div>
                  <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                    {workbookAnalysis.totals.totalRows}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                    {workbookAnalysis.totals.totalSupersededRevisions > 0
                      ? `من ${workbookAnalysis.totals.totalRawRows} صف · مستبعد ${workbookAnalysis.totals.totalSupersededRevisions} مراجعة قديمة`
                      : `${workbookAnalysis.totals.totalUniqueCodes} كود فريد · ${workbookAnalysis.totals.totalRevisions} بند به مراجعات`}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/60">
                  <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    معتمد (A / B)
                  </div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-extrabold font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                      {workbookAnalysis.totals.approvedCount}
                    </span>
                    <span className="text-xs font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                      {workbookAnalysis.totals.approvalRate}%
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5 font-mono tabular-nums">
                    A: {workbookAnalysis.totals.statusCounts.A} · B: {workbookAnalysis.totals.statusCounts.B}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/60">
                  <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                    تحت المراجعة (W)
                  </div>
                  <div className="text-2xl font-extrabold font-mono tabular-nums text-amber-700 dark:text-amber-300 mt-1">
                    {workbookAnalysis.totals.pendingCount}
                  </div>
                  <div className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                    بانتظار رد الاستشاري
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/60 col-span-2 sm:col-span-1">
                  <div className="text-[11px] font-semibold text-rose-700 dark:text-rose-400">
                    إعادة تقديم / مرفوض (C / D)
                  </div>
                  <div className="text-2xl font-extrabold font-mono tabular-nums text-rose-700 dark:text-rose-300 mt-1">
                    {workbookAnalysis.totals.rejectedCount}
                  </div>
                  <div className="text-[11px] text-rose-700/80 dark:text-rose-400/80 mt-0.5 font-mono tabular-nums">
                    C: {workbookAnalysis.totals.statusCounts.C} · D: {workbookAnalysis.totals.statusCounts.D}
                  </div>
                </div>
              </div>

              {/* Interactive Recharts Visual Analytics: Status Distribution Donut + Sheets/Files Bar Chart */}
              {(overviewStatusDonutData.items.length > 0 || overviewChartData.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch pt-1">
                  {/* Donut Chart: Submittals Status Distribution (or Sheet Share fallback) */}
                  <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 p-4 flex flex-col justify-between gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <PieChartIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>
                          {overviewStatusDonutData.hasStatuses
                            ? 'توزيع حالات التقديمات (Submittals)'
                            : 'توزيع البنود عبر الأوراق الداخلية'}
                        </span>
                      </h3>
                      <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                        {overviewStatusDonutData.total} بند
                      </span>
                    </div>

                    <div className="relative h-52 w-full" dir="ltr">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={overviewStatusDonutData.items}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={56}
                            outerRadius={84}
                            paddingAngle={2}
                            strokeWidth={0}
                          >
                            {overviewStatusDonutData.items.map((entry, idx) => (
                              <Cell key={`donut-${entry.name}-${idx}`} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip content={<ExcelChartTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Center Summary Metric */}
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="text-xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                          {overviewStatusDonutData.hasStatuses
                            ? `${workbookAnalysis.totals.approvalRate}%`
                            : workbookAnalysis.totals.nonEmptySheetsCount}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          {overviewStatusDonutData.hasStatuses ? 'نسبة الاعتماد' : 'ورقة نشطة'}
                        </span>
                      </div>
                    </div>

                    {/* Clean Tabular Legend */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2 border-t border-slate-200/80 dark:border-slate-800 text-xs">
                      {overviewStatusDonutData.items.map((item, idx) => (
                        <div
                          key={`lg-${item.name}-${idx}`}
                          className="flex items-center justify-between gap-2 min-w-0"
                        >
                          <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 truncate">
                            <span
                              className="w-2.5 h-2.5 rounded-xs shrink-0"
                              style={{ backgroundColor: item.fill }}
                            />
                            <span className="truncate">{item.shortLabel}</span>
                          </span>
                          <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white shrink-0">
                            {item.value}
                            <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500 mr-1">
                              ({item.percent}%)
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bar Chart: Internal Sheets Distribution OR Uploaded Files Comparison */}
                  <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 p-4 flex flex-col justify-between gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>
                          {overviewBarScope === 'files' && filesComparisonChartData.length >= 2
                            ? 'مقارنة الملفات المرفوعة (عدد الشيتات والبنود)'
                            : 'توزيع عدد التقديمات ومواقفها حسب الأوراق'}
                        </span>
                      </h3>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {filesComparisonChartData.length >= 2 && (
                          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold">
                            <button
                              type="button"
                              onClick={() => setOverviewBarScope('sheets')}
                              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                                overviewBarScope === 'sheets'
                                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                                  : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              الأوراق الداخلية
                            </button>
                            <button
                              type="button"
                              onClick={() => setOverviewBarScope('files')}
                              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                                overviewBarScope === 'files'
                                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                                  : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              الملفات ({projectUploadedFiles.length})
                            </button>
                          </div>
                        )}

                        {overviewBarScope === 'sheets' && overviewStatusDonutData.hasStatuses && (
                          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold">
                            <button
                              type="button"
                              onClick={() => setOverviewBarStyle('status')}
                              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                                overviewBarStyle === 'status'
                                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                                  : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              حسب الحالة
                            </button>
                            <button
                              type="button"
                              onClick={() => setOverviewBarStyle('total')}
                              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                                overviewBarStyle === 'total'
                                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                                  : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              الإجمالي
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="h-60 w-full" dir="ltr">
                      <ResponsiveContainer width="100%" height="100%">
                        {overviewBarScope === 'files' && filesComparisonChartData.length >= 2 ? (
                          <BarChart
                            data={filesComparisonChartData}
                            margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.25} />
                            <XAxis
                              dataKey="name"
                              tick={{ fontSize: 11, fill: '#64748b' }}
                              interval={0}
                            />
                            <YAxis
                              tick={{ fontSize: 11, fill: '#64748b' }}
                              allowDecimals={false}
                            />
                            <Tooltip content={<ExcelChartTooltip unit="" />} />
                            <Bar
                              dataKey="عدد الشيتات"
                              fill="#2563eb"
                              radius={[4, 4, 0, 0]}
                              className="cursor-pointer"
                              onClick={(barData: { payload?: { fileId?: string } }) => {
                                const fid = barData?.payload?.fileId;
                                const found = projectUploadedFiles.find((f) => f.id === fid);
                                if (found) selectWorkbookEntry(found);
                              }}
                            />
                            <Bar
                              dataKey="إجمالي البنود"
                              fill="#16a34a"
                              radius={[4, 4, 0, 0]}
                              className="cursor-pointer"
                              onClick={(barData: { payload?: { fileId?: string } }) => {
                                const fid = barData?.payload?.fileId;
                                const found = projectUploadedFiles.find((f) => f.id === fid);
                                if (found) selectWorkbookEntry(found);
                              }}
                            />
                          </BarChart>
                        ) : (
                          <BarChart
                            data={overviewChartData}
                            margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.25} />
                            <XAxis
                              dataKey="name"
                              tick={{ fontSize: 11, fill: '#64748b' }}
                              interval="preserveStartEnd"
                            />
                            <YAxis
                              tick={{ fontSize: 11, fill: '#64748b' }}
                              allowDecimals={false}
                            />
                            <Tooltip content={<ExcelChartTooltip />} />
                            {overviewBarStyle === 'total' || !overviewStatusDonutData.hasStatuses ? (
                              <Bar
                                dataKey="الإجمالي"
                                fill="#2563eb"
                                radius={[6, 6, 0, 0]}
                                maxBarSize={48}
                                className="cursor-pointer"
                                onClick={(barData: { payload?: { sheetIndex?: number }; sheetIndex?: number }) => {
                                  const idx = barData?.payload?.sheetIndex ?? barData?.sheetIndex;
                                  if (typeof idx === 'number') openSheetTab(idx);
                                }}
                              />
                            ) : (
                              <>
                                <Bar
                                  dataKey="معتمد"
                                  stackId="a"
                                  fill="#16a34a"
                                  maxBarSize={48}
                                  className="cursor-pointer"
                                  onClick={(barData: { payload?: { sheetIndex?: number }; sheetIndex?: number }) => {
                                    const idx = barData?.payload?.sheetIndex ?? barData?.sheetIndex;
                                    if (typeof idx === 'number') openSheetTab(idx);
                                  }}
                                />
                                <Bar
                                  dataKey="تحت المراجعة"
                                  stackId="a"
                                  fill="#d97706"
                                  maxBarSize={48}
                                  className="cursor-pointer"
                                  onClick={(barData: { payload?: { sheetIndex?: number }; sheetIndex?: number }) => {
                                    const idx = barData?.payload?.sheetIndex ?? barData?.sheetIndex;
                                    if (typeof idx === 'number') openSheetTab(idx);
                                  }}
                                />
                                <Bar
                                  dataKey="تعديل / مرفوض"
                                  stackId="a"
                                  fill="#dc2626"
                                  maxBarSize={48}
                                  className="cursor-pointer"
                                  onClick={(barData: { payload?: { sheetIndex?: number }; sheetIndex?: number }) => {
                                    const idx = barData?.payload?.sheetIndex ?? barData?.sheetIndex;
                                    if (typeof idx === 'number') openSheetTab(idx);
                                  }}
                                />
                                <Bar
                                  dataKey="أخرى"
                                  stackId="a"
                                  fill="#64748b"
                                  radius={[4, 4, 0, 0]}
                                  maxBarSize={48}
                                  className="cursor-pointer"
                                  onClick={(barData: { payload?: { sheetIndex?: number }; sheetIndex?: number }) => {
                                    const idx = barData?.payload?.sheetIndex ?? barData?.sheetIndex;
                                    if (typeof idx === 'number') openSheetTab(idx);
                                  }}
                                />
                              </>
                            )}
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
                      {overviewBarScope === 'files' && filesComparisonChartData.length >= 2 ? (
                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-xs bg-blue-600" />
                            عدد الشيتات
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600" />
                            إجمالي البنود
                          </span>
                        </div>
                      ) : overviewBarStyle === 'status' && overviewStatusDonutData.hasStatuses ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600" />
                            معتمد (A/B)
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-xs bg-amber-600" />
                            تحت المراجعة (W)
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-xs bg-rose-600" />
                            تعديل/مرفوض (C/D)
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-xs bg-slate-500" />
                            أخرى
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-xs bg-blue-600" />
                          إجمالي البنود بكل ورقة
                        </span>
                      )}
                      <span className="text-slate-500 dark:text-slate-400">
                        {overviewBarScope === 'files' && filesComparisonChartData.length >= 2
                          ? 'اضغط على أي عمود للتبديل إلى الملف'
                          : 'اضغط على أي عمود لفتح الورقة مباشرة'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Per-Sheet Analytical Cards Grid (Each Named by Its Internal Sheet Name) */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>تحليل الأوراق الداخلية حسب الاسم وآخر كود (آخر Revision لكل كود فقط)</span>
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    اضغط على أي ورقة لفتح جدولها التفصيلي
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                  {workbookAnalysis.sheets.map((sheet) => {
                    const statusBase =
                      sheet.approvedCount + sheet.pendingCount + sheet.rejectedCount;
                    const approvedPct =
                      statusBase > 0 ? Math.round((sheet.approvedCount / statusBase) * 100) : 0;
                    const pendingPct =
                      statusBase > 0 ? Math.round((sheet.pendingCount / statusBase) * 100) : 0;
                    const rejectedPct =
                      statusBase > 0 ? Math.max(0, 100 - approvedPct - pendingPct) : 0;

                    const copyLastKey = `card-last-${sheet.sheetIndex}`;
                    const copyNextKey = `card-next-${sheet.sheetIndex}`;

                    return (
                      <div
                        key={`${sheet.sheetIndex}-${sheet.sheetName}`}
                        onClick={() => openSheetTab(sheet.sheetIndex)}
                        className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 dark:hover:border-blue-600 transition-colors p-4 flex flex-col justify-between gap-3.5 cursor-pointer"
                      >
                        {/* Top: Exact Internal Sheet Name & Count */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4
                              className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
                              title={sheet.sheetName}
                            >
                              {sheet.sheetName}
                            </h4>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums flex flex-wrap items-center gap-x-1.5">
                              <span>
                                العدد (آخر REV):{' '}
                                <strong className="font-mono text-slate-800 dark:text-slate-200">
                                  {sheet.totalRows}
                                </strong>
                              </span>
                              {sheet.supersededCount > 0 ? (
                                <>
                                  <span>·</span>
                                  <span title={`إجمالي الصفوف الخام بالشيت: ${sheet.totalRawRows}`}>
                                    مستبعد{' '}
                                    <strong className="font-mono text-slate-700 dark:text-slate-300">
                                      {sheet.supersededCount}
                                    </strong>{' '}
                                    مراجعة قديمة
                                  </span>
                                </>
                              ) : (
                                sheet.revisionsCount > 0 && (
                                  <>
                                    <span>·</span>
                                    <span>
                                      مراجعات:{' '}
                                      <strong className="font-mono text-slate-800 dark:text-slate-200">
                                        {sheet.revisionsCount}
                                      </strong>
                                    </span>
                                  </>
                                )
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteInternalSheet(sheet.sheetIndex, sheet.sheetName);
                              }}
                              title={`حذف الورقة «${sheet.sheetName}»`}
                              aria-label={`حذف الورقة ${sheet.sheetName}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/50 cursor-pointer transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 inline-flex items-center gap-1">
                              <span>فتح</span>
                              <ArrowLeft className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        </div>

                        {/* Middle: Last Code & Next Suggested Code */}
                        <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                              آخر كود
                            </span>
                            {sheet.lastCode ? (
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  dir="ltr"
                                  className="font-mono tabular-nums text-xs font-bold text-slate-900 dark:text-white truncate"
                                  title={sheet.lastCode}
                                >
                                  {sheet.lastCode}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyCode(sheet.lastCode, copyLastKey);
                                  }}
                                  className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer shrink-0 transition-colors"
                                  title="نسخ آخر كود"
                                >
                                  {copiedCodeKey === copyLastKey ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">لا يوجد عمود كود</span>
                            )}
                          </div>

                          {sheet.nextSuggestedCode && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                                الكود التالي
                              </span>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  dir="ltr"
                                  className="font-mono tabular-nums text-xs font-bold text-blue-600 dark:text-blue-400 truncate"
                                  title={sheet.nextSuggestedCode}
                                >
                                  {sheet.nextSuggestedCode}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyCode(sheet.nextSuggestedCode, copyNextKey);
                                  }}
                                  className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer shrink-0 transition-colors"
                                  title="نسخ الكود التالي المقترح"
                                >
                                  {copiedCodeKey === copyNextKey ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          )}

                          {sheet.prefixBreakdown.length > 1 && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                              <span>سلاسل الأكواد داخل الورقة</span>
                              <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300">
                                {sheet.prefixBreakdown.length} سلسلة
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Bottom: Status Progress Bar & Data Breakdown */}
                        <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
                          {sheet.hasStatusColumn && statusBase > 0 ? (
                            <>
                              <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                                {approvedPct > 0 && (
                                  <div
                                    style={{ width: `${approvedPct}%` }}
                                    className="bg-emerald-500 h-full"
                                    title={`معتمد: ${sheet.approvedCount}`}
                                  />
                                )}
                                {pendingPct > 0 && (
                                  <div
                                    style={{ width: `${pendingPct}%` }}
                                    className="bg-amber-400 h-full"
                                    title={`تحت المراجعة: ${sheet.pendingCount}`}
                                  />
                                )}
                                {rejectedPct > 0 && (
                                  <div
                                    style={{ width: `${rejectedPct}%` }}
                                    className="bg-rose-500 h-full"
                                    title={`مرفوض/تعديل: ${sheet.rejectedCount}`}
                                  />
                                )}
                              </div>
                              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                  <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                                    A:{sheet.statusCounts.A}
                                  </span>
                                  <span className="text-teal-700 dark:text-teal-400 font-bold">
                                    B:{sheet.statusCounts.B}
                                  </span>
                                  <span className="text-amber-700 dark:text-amber-400 font-bold">
                                    W:{sheet.statusCounts.W}
                                  </span>
                                  <span className="text-rose-700 dark:text-rose-400 font-bold">
                                    C/D:{sheet.rejectedCount}
                                  </span>
                                </div>
                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                  {sheet.approvalRate}%
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              <span>
                                الأعمدة المقروءة: <strong className="font-mono">{sheet.headers.length}</strong>
                              </span>
                              <span>
                                {sheet.latestSubmissionDate
                                  ? `آخر تاريخ: ${sheet.latestSubmissionDate}`
                                  : sheet.totalRows === 0
                                    ? 'ورقة فارغة'
                                    : 'بيانات بدون عمود موقف'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Master Summary Table of All Internal Sheets */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  جدول الملخص التنفيذي لجميع الأوراق الداخلية
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-xs text-right border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                        <th className="px-3 py-2.5 whitespace-nowrap">اسم الورقة الداخلية</th>
                        <th className="px-3 py-2.5 whitespace-nowrap text-center">العدد (آخر REV)</th>
                        <th className="px-3 py-2.5 whitespace-nowrap text-center">صفوف الشيت</th>
                        <th className="px-3 py-2.5 whitespace-nowrap">آخر كود</th>
                        <th className="px-3 py-2.5 whitespace-nowrap">الكود التالي</th>
                        <th className="px-3 py-2.5 whitespace-nowrap text-center">A</th>
                        <th className="px-3 py-2.5 whitespace-nowrap text-center">B</th>
                        <th className="px-3 py-2.5 whitespace-nowrap text-center">W</th>
                        <th className="px-3 py-2.5 whitespace-nowrap text-center">C / D</th>
                        <th className="px-3 py-2.5 whitespace-nowrap text-center">الاعتماد</th>
                        <th className="px-3 py-2.5 whitespace-nowrap">آخر تاريخ</th>
                        <th className="px-3 py-2.5 whitespace-nowrap text-center">عرض</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {workbookAnalysis.sheets.map((s) => (
                        <tr
                          key={`row-${s.sheetIndex}-${s.sheetName}`}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            {s.sheetName}
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums font-bold text-center text-slate-900 dark:text-white">
                            {s.totalRows}
                          </td>
                          <td
                            className="px-3 py-2.5 font-mono tabular-nums text-center text-slate-600 dark:text-slate-400 whitespace-nowrap"
                            title={
                              s.supersededCount > 0
                                ? `تم استبعاد ${s.supersededCount} مراجعة قديمة من التحليل`
                                : 'لا توجد مراجعات مكررة مستبعدة'
                            }
                          >
                            <span>{s.totalRawRows}</span>
                            {s.supersededCount > 0 && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 mr-1">
                                (-{s.supersededCount})
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {s.lastCode ? (
                              <div className="inline-flex items-center gap-1.5">
                                <span
                                  dir="ltr"
                                  className="font-mono tabular-nums font-bold text-slate-900 dark:text-white"
                                >
                                  {s.lastCode}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyCode(s.lastCode, `tbl-last-${s.sheetIndex}`)}
                                  className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                                  title="نسخ آخر كود"
                                >
                                  {copiedCodeKey === `tbl-last-${s.sheetIndex}` ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {s.nextSuggestedCode ? (
                              <div className="inline-flex items-center gap-1.5">
                                <span
                                  dir="ltr"
                                  className="font-mono tabular-nums font-bold text-blue-600 dark:text-blue-400"
                                >
                                  {s.nextSuggestedCode}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopyCode(s.nextSuggestedCode, `tbl-next-${s.sheetIndex}`)
                                  }
                                  className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                                  title="نسخ الكود التالي"
                                >
                                  {copiedCodeKey === `tbl-next-${s.sheetIndex}` ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums text-center text-emerald-700 dark:text-emerald-400 font-semibold">
                            {s.hasStatusColumn ? s.statusCounts.A : '—'}
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums text-center text-teal-700 dark:text-teal-400 font-semibold">
                            {s.hasStatusColumn ? s.statusCounts.B : '—'}
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums text-center text-amber-700 dark:text-amber-400 font-semibold">
                            {s.hasStatusColumn ? s.statusCounts.W : '—'}
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums text-center text-rose-700 dark:text-rose-400 font-semibold">
                            {s.hasStatusColumn ? s.rejectedCount : '—'}
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums text-center font-bold text-slate-800 dark:text-slate-200">
                            {s.hasStatusColumn ? `${s.approvalRate}%` : '—'}
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {s.latestSubmissionDate || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openSheetTab(s.sheetIndex)}
                                className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold cursor-pointer transition-colors"
                              >
                                التفاصيل
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteInternalSheet(s.sheetIndex, s.sheetName)}
                                title={`حذف الورقة «${s.sheetName}»`}
                                aria-label={`حذف الورقة ${s.sheetName}`}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/50 cursor-pointer transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
                </>
              )}
            </div>
          )}

          {/* =================================================================
              VIEW B: INDIVIDUAL INTERNAL SHEET DEEP ANALYSIS & DATA TABLE
              ================================================================= */}
          {typeof activeView === 'number' && activeSheetAnalytics && activeRawSheet && (
            <div className="p-4 sm:p-6 space-y-5">
              {/* Collapsible Column Mapping Panel */}
              {showMappingPanel && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="text-xs font-bold text-slate-800 dark:text-white">
                      ضبط صف العناوين وربط الأعمدة لورقة «{activeSheetAnalytics.sheetName}»:
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <label className="font-semibold text-slate-600 dark:text-slate-300">
                        صف العناوين:
                      </label>
                      <select
                        value={activeSheetAnalytics.headerRowIndex}
                        onChange={(e) => handleHeaderRowChange(Number(e.target.value))}
                        className="h-9 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 font-mono font-bold dark:text-white"
                      >
                        {activeRawSheet.rawRows.slice(0, 20).map((r, rIdx) => (
                          <option key={rIdx} value={rIdx}>
                            صف {rIdx + 1} —{' '}
                            {r
                              .filter((c) => c.trim())
                              .slice(0, 3)
                              .join(' | ')
                              .slice(0, 42) || '(فارغ)'}
                          </option>
                        ))}
                      </select>
                      {activeEntry.sheetOverrides[activeSheetAnalytics.sheetIndex] && (
                        <button
                          type="button"
                          onClick={resetActiveSheetOverride}
                          className="h-9 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold inline-flex items-center gap-1 cursor-pointer"
                          title="إعادة الكشف التلقائي"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>تلقائي</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
                    {MAPPING_FIELD_LABELS.map(({ key, label }) => (
                      <div key={key}>
                        <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          {label}
                        </label>
                        <select
                          value={activeSheetAnalytics.mapping[key]}
                          onChange={(e) => handleColumnMappingChange(key, Number(e.target.value))}
                          className="w-full h-9 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-xs dark:text-white"
                        >
                          <option value={-1}>— غير مرتبط —</option>
                          {populatedMappingOptions.map((opt) => (
                            <option key={opt.colIdx} value={opt.colIdx}>
                              {opt.colIdx + 1}. {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sheet Hero Analytics Strip: Last Code, Next Code, Counts, Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Last Code Card */}
                <div className="p-4 rounded-xl bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Hash className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>آخر كود في «{activeSheetAnalytics.sheetName}»</span>
                    </span>
                    {activeSheetAnalytics.lastCode && (
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyCode(activeSheetAnalytics.lastCode, 'sheet-hero-last')
                        }
                        className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer font-bold"
                      >
                        {copiedCodeKey === 'sheet-hero-last' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>تم النسخ</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>نسخ</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <div
                    dir="ltr"
                    className="text-base sm:text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white truncate text-right"
                    title={activeSheetAnalytics.lastCode || '—'}
                  >
                    {activeSheetAnalytics.lastCode || 'غير متوفر'}
                  </div>
                  {activeSheetAnalytics.lastRowCode &&
                    activeSheetAnalytics.lastRowCode !== activeSheetAnalytics.lastCode && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        آخر صف مُدخل:{' '}
                        <span dir="ltr" className="font-mono font-semibold">
                          {activeSheetAnalytics.lastRowCode}
                        </span>
                      </div>
                    )}
                </div>

                {/* Next Suggested Code Card */}
                <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/25 border border-blue-200/80 dark:border-blue-900/60 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                    <span className="inline-flex items-center gap-1">
                      <GitBranch className="w-3.5 h-3.5" />
                      <span>الكود التالي المقترح</span>
                    </span>
                    {activeSheetAnalytics.nextSuggestedCode && (
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyCode(
                            activeSheetAnalytics.nextSuggestedCode,
                            'sheet-hero-next'
                          )
                        }
                        className="text-blue-700 dark:text-blue-300 hover:underline inline-flex items-center gap-1 cursor-pointer font-bold"
                      >
                        {copiedCodeKey === 'sheet-hero-next' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>تم النسخ</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>نسخ</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <div
                    dir="ltr"
                    className="text-base sm:text-lg font-extrabold font-mono tabular-nums text-blue-700 dark:text-blue-300 truncate text-right"
                    title={activeSheetAnalytics.nextSuggestedCode || '—'}
                  >
                    {activeSheetAnalytics.nextSuggestedCode || '—'}
                  </div>
                  <div className="text-[11px] text-blue-700/75 dark:text-blue-400/80">
                    {activeSheetAnalytics.prefixBreakdown.length > 1
                      ? `يوجد ${activeSheetAnalytics.prefixBreakdown.length} سلاسل أكواد بالورقة`
                      : activeSheetAnalytics.latestSubmissionDate
                        ? `آخر تاريخ: ${activeSheetAnalytics.latestSubmissionDate}`
                        : 'تسلسل تلقائي بناءً على آخر رقم'}
                  </div>
                </div>

                {/* Total Count & Revisions Card */}
                <div className="p-4 rounded-xl bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    العدد في التحليل (آخر REV فقط)
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                      {activeSheetAnalytics.totalRows}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">بند</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    {activeSheetAnalytics.supersededCount > 0
                      ? `من ${activeSheetAnalytics.totalRawRows} صف · مستبعد ${activeSheetAnalytics.supersededCount} مراجعة قديمة`
                      : `${activeSheetAnalytics.uniqueCodesCount} كود فريد · ${activeSheetAnalytics.revisionsCount} مراجعة`}
                  </div>
                </div>

                {/* Status Summary Card */}
                <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/60 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <span>
                      {activeSheetAnalytics.hasStatusColumn
                        ? 'موقف الاعتماد'
                        : 'معلومات الورقة'}
                    </span>
                    {activeSheetAnalytics.hasStatusColumn && (
                      <span className="font-mono tabular-nums font-bold">
                        {activeSheetAnalytics.approvalRate}% معتمد
                      </span>
                    )}
                  </div>
                  {activeSheetAnalytics.hasStatusColumn ? (
                    <>
                      <div className="flex items-baseline gap-2.5 font-mono tabular-nums text-sm font-extrabold">
                        <span className="text-emerald-700 dark:text-emerald-300">
                          A:{activeSheetAnalytics.statusCounts.A}
                        </span>
                        <span className="text-teal-700 dark:text-teal-300">
                          B:{activeSheetAnalytics.statusCounts.B}
                        </span>
                        <span className="text-amber-700 dark:text-amber-300">
                          W:{activeSheetAnalytics.statusCounts.W}
                        </span>
                        <span className="text-rose-700 dark:text-rose-300">
                          C/D:{activeSheetAnalytics.rejectedCount}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                        C: {activeSheetAnalytics.statusCounts.C} · D: {activeSheetAnalytics.statusCounts.D}
                        {activeSheetAnalytics.statusCounts.OTHER > 0
                          ? ` · أخرى: ${activeSheetAnalytics.statusCounts.OTHER}`
                          : ''}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                        {activeSheetAnalytics.headers.length} عمود
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{activeSheetAnalytics.latestSubmissionDate || 'بدون عمود موقف'}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Interactive Recharts Panel for This Internal Sheet */}
              {activeSheetAnalytics.totalRows > 0 &&
                (activeSheetAnalytics.hasStatusColumn ||
                  activeSheetSecondaryBarData.mode !== 'none') && (
                  <div
                    className={`grid grid-cols-1 gap-4 items-stretch ${
                      activeSheetAnalytics.hasStatusColumn &&
                      activeSheetSecondaryBarData.mode !== 'none'
                        ? 'lg:grid-cols-12'
                        : ''
                    }`}
                  >
                    {activeSheetAnalytics.hasStatusColumn &&
                      activeSheetStatusDonutData.length > 0 && (
                        <div
                          className={`${
                            activeSheetSecondaryBarData.mode !== 'none' ? 'lg:col-span-5' : ''
                          } rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 p-4 flex flex-col justify-between gap-3`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <PieChartIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>توزيع حالات التقديمات بالورقة</span>
                            </h4>
                            {filterStatus !== 'all' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setFilterStatus('all');
                                  setVisibleCount(ROWS_PER_PAGE);
                                }}
                                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                              >
                                عرض الكل
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                اضغط للفلترة
                              </span>
                            )}
                          </div>

                          <div className="relative h-48 w-full" dir="ltr">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={activeSheetStatusDonutData}
                                  dataKey="value"
                                  nameKey="name"
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={50}
                                  outerRadius={76}
                                  paddingAngle={2}
                                  strokeWidth={0}
                                  className="cursor-pointer"
                                  onClick={(slice: {
                                    statusKey?: string;
                                    payload?: { statusKey?: string };
                                  }) => {
                                    const sk = slice?.statusKey || slice?.payload?.statusKey;
                                    if (sk) {
                                      setFilterStatus((prev) => (prev === sk ? 'all' : sk));
                                      setVisibleCount(ROWS_PER_PAGE);
                                    }
                                  }}
                                >
                                  {activeSheetStatusDonutData.map((entry) => (
                                    <Cell
                                      key={`sheet-donut-${entry.statusKey}`}
                                      fill={entry.fill}
                                      opacity={
                                        filterStatus === 'all' || filterStatus === entry.statusKey
                                          ? 1
                                          : 0.35
                                      }
                                    />
                                  ))}
                                </Pie>
                                <Tooltip content={<ExcelChartTooltip />} />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                              <span className="text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                                {activeSheetAnalytics.approvalRate}%
                              </span>
                              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                نسبة الاعتماد
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-200/80 dark:border-slate-800 text-xs">
                            {activeSheetStatusDonutData.map((item) => {
                              const isSelected = filterStatus === item.statusKey;
                              return (
                                <button
                                  key={`sheet-lg-${item.statusKey}`}
                                  type="button"
                                  onClick={() => {
                                    setFilterStatus(isSelected ? 'all' : item.statusKey);
                                    setVisibleCount(ROWS_PER_PAGE);
                                  }}
                                  className={`flex items-center justify-between gap-2 px-2 py-1 rounded-lg transition-colors cursor-pointer text-right ${
                                    isSelected
                                      ? 'bg-blue-50 dark:bg-blue-950/60 ring-1 ring-blue-400'
                                      : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 truncate">
                                    <span
                                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                                      style={{ backgroundColor: item.fill }}
                                    />
                                    <span className="truncate">{item.shortLabel}</span>
                                  </span>
                                  <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white shrink-0">
                                    {item.value}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    {activeSheetSecondaryBarData.mode !== 'none' && (
                      <div
                        className={`${
                          activeSheetAnalytics.hasStatusColumn ? 'lg:col-span-7' : ''
                        } rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 p-4 flex flex-col justify-between gap-3`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span>
                              {activeSheetSecondaryBarData.mode === 'disciplines'
                                ? 'توزيع التقديمات حسب التخصص'
                                : 'توزيع التقديمات حسب سلاسل الأكواد'}
                            </span>
                          </h4>
                          {activeSheetSecondaryBarData.mode === 'disciplines' &&
                            filterDiscipline !== 'all' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setFilterDiscipline('all');
                                  setVisibleCount(ROWS_PER_PAGE);
                                }}
                                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                              >
                                إلغاء فلتر التخصص
                              </button>
                            )}
                        </div>

                        <div className="h-52 w-full" dir="ltr">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={activeSheetSecondaryBarData.items}
                              margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.25} />
                              <XAxis
                                dataKey="name"
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                interval="preserveStartEnd"
                              />
                              <YAxis
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                allowDecimals={false}
                              />
                              <Tooltip content={<ExcelChartTooltip />} />
                              <Bar
                                dataKey="البنود"
                                fill="#2563eb"
                                radius={[5, 5, 0, 0]}
                                maxBarSize={42}
                                className={
                                  activeSheetSecondaryBarData.mode === 'disciplines'
                                    ? 'cursor-pointer'
                                    : ''
                                }
                                onClick={(barData: { payload?: { key?: string } }) => {
                                  if (activeSheetSecondaryBarData.mode !== 'disciplines') return;
                                  const key = barData?.payload?.key;
                                  if (key) {
                                    setFilterDiscipline((prev) => (prev === key ? 'all' : key));
                                    setVisibleCount(ROWS_PER_PAGE);
                                  }
                                }}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              {/* Multi-Prefix Last Code Breakdown (Shown when a sheet has multiple code series) */}
              {activeSheetAnalytics.prefixBreakdown.length > 1 && (
                <div className="space-y-2.5 pt-1">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    آخر كود والعدد حسب سلسلة التكويد داخل «{activeSheetAnalytics.sheetName}»
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-xs text-right border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                          <th className="px-3 py-2 whitespace-nowrap">سلسلة / بادئة الكود</th>
                          <th className="px-3 py-2 whitespace-nowrap text-center">العدد</th>
                          <th className="px-3 py-2 whitespace-nowrap text-center">فريد</th>
                          <th className="px-3 py-2 whitespace-nowrap">آخر كود</th>
                          <th className="px-3 py-2 whitespace-nowrap">الكود التالي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {activeSheetAnalytics.prefixBreakdown.map((p, idx) => (
                          <tr
                            key={`${p.prefix}-${idx}`}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                          >
                            <td
                              dir="ltr"
                              className="px-3 py-2 font-mono font-bold text-slate-800 dark:text-slate-200 text-right whitespace-nowrap"
                            >
                              {p.prefix}
                            </td>
                            <td className="px-3 py-2 font-mono tabular-nums font-bold text-center text-slate-900 dark:text-white">
                              {p.count}
                            </td>
                            <td className="px-3 py-2 font-mono tabular-nums text-center text-slate-500 dark:text-slate-400">
                              {p.uniqueCount}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <span
                                  dir="ltr"
                                  className="font-mono tabular-nums font-bold text-slate-900 dark:text-white"
                                >
                                  {p.lastCode}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyCode(p.lastCode, `pfx-last-${idx}`)}
                                  className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                                  title="نسخ آخر كود"
                                >
                                  {copiedCodeKey === `pfx-last-${idx}` ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {p.nextCode ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <span
                                    dir="ltr"
                                    className="font-mono tabular-nums font-bold text-blue-600 dark:text-blue-400"
                                  >
                                    {p.nextCode}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyCode(p.nextCode, `pfx-next-${idx}`)}
                                    className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                                    title="نسخ الكود التالي"
                                  >
                                    {copiedCodeKey === `pfx-next-${idx}` ? (
                                      <Check className="w-3 h-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Disciplines Breakdown (Interactive Filter Row) */}
              {activeSheetAnalytics.disciplines.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      توزيع التخصصات داخل الورقة ({activeSheetAnalytics.disciplines.length})
                    </span>
                    {filterDiscipline !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setFilterDiscipline('all')}
                        className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                      >
                        عرض كل التخصصات
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {activeSheetAnalytics.disciplines.slice(0, 14).map((d) => {
                      const active = filterDiscipline === d.name;
                      return (
                        <button
                          key={d.name}
                          type="button"
                          onClick={() => {
                            setFilterDiscipline(active ? 'all' : d.name);
                            setVisibleCount(ROWS_PER_PAGE);
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                            active
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                          }`}
                        >
                          <span>{d.name}</span>
                          <span
                            className={`mr-1.5 font-mono tabular-nums ${
                              active ? 'text-blue-100' : 'text-slate-400'
                            }`}
                          >
                            {d.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Custom Status Values Breakdown (if the sheet uses non-A/B/C/D/W labels) */}
              {activeSheetAnalytics.customStatusBreakdown.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2.5">
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    قيم حالة إضافية بالورقة:
                  </span>
                  {activeSheetAnalytics.customStatusBreakdown.map((item) => (
                    <span key={item.label} className="tabular-nums">
                      {item.label}: <strong className="font-mono">{item.count}</strong>
                    </span>
                  ))}
                </div>
              )}

              {/* Revision Deduplication Toggle (Shown when older revisions were excluded) */}
              {activeSheetAnalytics.supersededCount > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-fit">
                    <button
                      type="button"
                      onClick={() => {
                        setRevisionViewMode('latest');
                        setVisibleCount(ROWS_PER_PAGE);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                        revisionViewMode === 'latest'
                          ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      آخر Revision فقط ({activeSheetAnalytics.latestRows.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRevisionViewMode('all');
                        setVisibleCount(ROWS_PER_PAGE);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                        revisionViewMode === 'all'
                          ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      كل الصفوف والمراجعات ({activeSheetAnalytics.allRows.length})
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    جميع الأرقام والنسب بالأعلى محسوبة على{' '}
                    <strong className="text-slate-700 dark:text-slate-200">
                      آخر Revision لكل كود فقط
                    </strong>{' '}
                    (تم استبعاد{' '}
                    <span className="font-mono tabular-nums font-bold">
                      {activeSheetAnalytics.supersededCount}
                    </span>{' '}
                    مراجعة قديمة).
                  </div>
                </div>
              )}

              {/* Filters Toolbar */}
              <div
                className={`grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs ${
                  activeSheetAnalytics.supersededCount > 0
                    ? ''
                    : 'pt-2 border-t border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="relative sm:col-span-1">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={tableSearch}
                    onChange={(e) => {
                      setTableSearch(e.target.value);
                      setVisibleCount(ROWS_PER_PAGE);
                    }}
                    placeholder="بحث في كل أعمدة الورقة..."
                    className="w-full h-10 pr-9 pl-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {activeSheetAnalytics.hasStatusColumn && (
                  <select
                    value={filterStatus}
                    onChange={(e) => {
                      setFilterStatus(e.target.value);
                      setVisibleCount(ROWS_PER_PAGE);
                    }}
                    className="h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">كل مواقف الاعتماد</option>
                    <option value="A">A — معتمد ({activeSheetAnalytics.statusCounts.A})</option>
                    <option value="B">
                      B — معتمد بملاحظات ({activeSheetAnalytics.statusCounts.B})
                    </option>
                    <option value="W">
                      W — تحت المراجعة ({activeSheetAnalytics.statusCounts.W})
                    </option>
                    <option value="C">
                      C — يُعاد التقديم ({activeSheetAnalytics.statusCounts.C})
                    </option>
                    <option value="D">D — مرفوض ({activeSheetAnalytics.statusCounts.D})</option>
                    {activeSheetAnalytics.statusCounts.OTHER > 0 && (
                      <option value="OTHER">
                        أخرى ({activeSheetAnalytics.statusCounts.OTHER})
                      </option>
                    )}
                  </select>
                )}

                {activeSheetAnalytics.disciplines.length > 0 && (
                  <select
                    value={filterDiscipline}
                    onChange={(e) => {
                      setFilterDiscipline(e.target.value);
                      setVisibleCount(ROWS_PER_PAGE);
                    }}
                    className="h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">
                      كل التخصصات ({activeSheetAnalytics.disciplines.length})
                    </option>
                    {activeSheetAnalytics.disciplines.map((d) => (
                      <option key={d.name} value={d.name}>
                        {d.name} ({d.count})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Sheet Data Table */}
              {filteredRows.length === 0 ? (
                <div className="py-10 text-center text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                  {activeSheetAnalytics.totalRows === 0
                    ? `الورقة «${activeSheetAnalytics.sheetName}» لا تحتوي على صفوف بيانات.`
                    : 'لا توجد صفوف مطابقة لمعايير البحث الحالية. يمكنك تعديل الفلاتر أو ضبط أعمدة الورقة.'}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="sm:hidden">اسحب الجدول أفقياً لعرض باقي الأعمدة</span>
                    <span className="font-mono tabular-nums font-bold">
                      عرض {Math.min(visibleCount, filteredRows.length)} من {filteredRows.length} سجل
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    {useCustomColumnsTable ? (
                      /* Dynamic Raw Columns Table for custom sheets */
                      <table className="w-full text-xs text-right border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
                            <th className="px-3 py-2.5 whitespace-nowrap">صف</th>
                            {customVisibleHeaders.map((h) => (
                              <th key={h} className="px-3 py-2.5 whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                            <th className="px-3 py-2.5 whitespace-nowrap text-center">تفاصيل</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                          {filteredRows.slice(0, visibleCount).map((row) => (
                            <tr
                              key={row.rowIndex}
                              className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                            >
                              <td className="px-3 py-2.5 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                                {row.rowIndex}
                              </td>
                              {customVisibleHeaders.map((h) => (
                                <td
                                  key={h}
                                  className="px-3 py-2.5 text-slate-800 dark:text-slate-200 max-w-xs truncate"
                                  title={row.rawCells[h] || ''}
                                >
                                  {row.rawCells[h] || '—'}
                                </td>
                              ))}
                              <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => setInspectRow(row)}
                                  title="عرض كل أعمدة الصف"
                                  className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 cursor-pointer transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      /* Standard Structured Log Table */
                      <table className="w-full text-xs text-right border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
                            <th className="px-3 py-2.5 whitespace-nowrap">صف</th>
                            {tableColFlags.code && (
                              <th className="px-3 py-2.5 whitespace-nowrap">الكود / رقم التقديم</th>
                            )}
                            {tableColFlags.description && (
                              <th className="px-3 py-2.5 min-w-[220px]">وصف البند</th>
                            )}
                            {tableColFlags.discipline && (
                              <th className="px-3 py-2.5 whitespace-nowrap">التخصص</th>
                            )}
                            {tableColFlags.rev && (
                              <th className="px-3 py-2.5 whitespace-nowrap text-center">REV</th>
                            )}
                            {tableColFlags.lastCode && (
                              <th className="px-3 py-2.5 whitespace-nowrap">Last Code</th>
                            )}
                            {tableColFlags.status && (
                              <th className="px-3 py-2.5 whitespace-nowrap">الموقف</th>
                            )}
                            {tableColFlags.submissionDate && (
                              <th className="px-3 py-2.5 whitespace-nowrap">تاريخ التقديم</th>
                            )}
                            {tableColFlags.replyDate && (
                              <th className="px-3 py-2.5 whitespace-nowrap">تاريخ الرد</th>
                            )}
                            <th className="px-3 py-2.5 whitespace-nowrap text-center">تفاصيل</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                          {filteredRows.slice(0, visibleCount).map((row) => {
                            const isSuperseded = !row.isLatestRevision;
                            return (
                              <tr
                                key={row.rowIndex}
                                className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                                  isSuperseded
                                    ? 'opacity-60 bg-slate-50/60 dark:bg-slate-800/25'
                                    : ''
                                }`}
                              >
                                <td className="px-3 py-2.5 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                                  {row.rowIndex}
                                </td>
                                {tableColFlags.code && (
                                  <td
                                    dir="ltr"
                                    className="px-3 py-2.5 font-mono tabular-nums font-bold text-slate-900 dark:text-white whitespace-nowrap text-left"
                                  >
                                    <div>{row.submittalNumber || '—'}</div>
                                    {isSuperseded && (
                                      <div
                                        dir="rtl"
                                        className="font-sans text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 text-right"
                                      >
                                        مراجعة سابقة (مستبعدة)
                                      </div>
                                    )}
                                  </td>
                                )}
                                {tableColFlags.description && (
                                  <td className="px-3 py-2.5 text-slate-800 dark:text-slate-200 max-w-md">
                                    <div className="line-clamp-2 font-medium">
                                      {row.description || '—'}
                                    </div>
                                    {row.location && (
                                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                        الموقع: {row.location}
                                      </div>
                                    )}
                                  </td>
                                )}
                                {tableColFlags.discipline && (
                                  <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                    {row.discipline || '—'}
                                  </td>
                                )}
                                {tableColFlags.rev && (
                                  <td className="px-3 py-2.5 font-mono tabular-nums text-center whitespace-nowrap">
                                    <div className="font-bold text-slate-800 dark:text-slate-200">
                                      {row.rev || '—'}
                                    </div>
                                    {row.revisionHistoryCount > 1 && (
                                      <div className="font-sans text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                                        {isSuperseded
                                          ? 'مستبدل'
                                          : `الأحدث (${row.revisionHistoryCount} مراجعات)`}
                                      </div>
                                    )}
                                  </td>
                                )}
                                {tableColFlags.lastCode && (
                                  <td className="px-3 py-2.5 whitespace-nowrap">
                                    {!tableColFlags.status && activeSheetAnalytics.hasStatusColumn ? (
                                      renderStatusText(row.statusCode, row.lastCode || row.statusRaw)
                                    ) : (
                                      <span
                                        dir="ltr"
                                        className="font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200"
                                      >
                                        {row.lastCode || '—'}
                                      </span>
                                    )}
                                  </td>
                                )}
                                {tableColFlags.status && (
                                  <td className="px-3 py-2.5 whitespace-nowrap">
                                    {renderStatusText(row.statusCode, row.statusRaw)}
                                  </td>
                                )}
                                {tableColFlags.submissionDate && (
                                  <td className="px-3 py-2.5 font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                    {row.submissionDate || '—'}
                                  </td>
                                )}
                                {tableColFlags.replyDate && (
                                  <td className="px-3 py-2.5 font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                    {row.replyDate || '—'}
                                  </td>
                                )}
                                <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => setInspectRow(row)}
                                    title={
                                      row.revisionHistoryCount > 1
                                        ? 'عرض تفاصيل الصف وسجل المراجعات'
                                        : 'عرض كل أعمدة الصف'
                                    }
                                    className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 cursor-pointer transition-colors"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {filteredRows.length > visibleCount && (
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                      <span className="tabular-nums">
                        عرض {Math.min(visibleCount, filteredRows.length)} من أصل{' '}
                        {filteredRows.length} سجل
                      </span>
                      <button
                        type="button"
                        onClick={() => setVisibleCount((prev) => prev + ROWS_PER_PAGE)}
                        className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-bold cursor-pointer"
                      >
                        عرض {ROWS_PER_PAGE} صف إضافي
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Full Row Inspector Modal */}
      {inspectRow && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setInspectRow(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[85vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                  تفاصيل الصف رقم {inspectRow.rowIndex}
                  {activeSheetAnalytics ? ` — ${activeSheetAnalytics.sheetName}` : ''}
                </h3>
                {inspectRow.submittalNumber && (
                  <div
                    dir="ltr"
                    className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 mt-0.5 text-right"
                  >
                    {inspectRow.submittalNumber}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setInspectRow(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Revision History for Codes with Multiple Revisions */}
              {inspectedCodeRevisions.length > 1 && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <GitBranch className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>سجل المراجعات لهذا الكود ({inspectedCodeRevisions.length})</span>
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      التحليل يعتمد آخر مراجعة فقط
                    </span>
                  </div>
                  <div className="divide-y divide-slate-200/80 dark:divide-slate-700/70">
                    {inspectedCodeRevisions.map((revRow) => {
                      const isCurrent = revRow.rowIndex === inspectRow.rowIndex;
                      return (
                        <button
                          key={revRow.rowIndex}
                          type="button"
                          onClick={() => setInspectRow(revRow)}
                          className={`w-full py-2 px-2.5 text-right flex flex-wrap items-center justify-between gap-2 transition-colors cursor-pointer rounded-lg ${
                            isCurrent
                              ? 'bg-blue-50 dark:bg-blue-950/50'
                              : 'hover:bg-white dark:hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2 font-mono tabular-nums">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {revRow.rev
                                ? /^(rev|r)[\s._-]*\d/i.test(revRow.rev.trim())
                                  ? revRow.rev.trim().toUpperCase()
                                  : `REV ${revRow.rev}`
                                : 'REV 00'}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-500 dark:text-slate-400">
                              صف {revRow.rowIndex}
                            </span>
                            {revRow.submissionDate && (
                              <>
                                <span className="text-slate-400">·</span>
                                <span className="text-slate-500 dark:text-slate-400">
                                  {revRow.submissionDate}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2.5">
                            {renderStatusText(revRow.statusCode, revRow.statusRaw)}
                            <span
                              className={`text-[11px] font-bold ${
                                revRow.isLatestRevision
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              {revRow.isLatestRevision ? 'الأحدث (معتمد بالتحليل)' : 'مراجعة سابقة'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {Object.entries(inspectRow.rawCells).map(([colName, val]) => (
                  <div
                    key={colName}
                    className="py-2.5 flex flex-col sm:flex-row sm:items-start justify-between gap-1.5"
                  >
                    <span className="font-bold text-slate-500 dark:text-slate-400 sm:w-1/3 shrink-0">
                      {colName}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white sm:w-2/3 break-words">
                      {val}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
