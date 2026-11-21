import html2canvas from 'html2canvas';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { DailyReport, Project, SubmittalStatusCode, UserProfile } from '../types';
import { SUBMITTAL_STATUS_CONFIG } from '../config';
import { getReportIdentityAudit } from './identityAudit';
import { dataService } from '../services/dataService';
import { generateBrandPalette } from './brandTheme';

export type PdfExportPeriodMode = 'daily' | 'monthly' | 'range' | 'single';

export interface PdfReportExportOptions {
  mode: PdfExportPeriodMode;
  title: string;
  periodLabel: string;
  projectLabel: string;
  reports: DailyReport[];
  projects?: Project[];
  users?: UserProfile[];
  fileName?: string;
}

export interface GeneratedPdfResult {
  blob: Blob;
  fileName: string;
  pageCount: number;
}

const ARABIC_MONTHS: Record<string, string> = {
  '01': 'يناير',
  '02': 'فبراير',
  '03': 'مارس',
  '04': 'أبريل',
  '05': 'مايو',
  '06': 'يونيو',
  '07': 'يوليو',
  '08': 'أغسطس',
  '09': 'سبتمبر',
  '10': 'أكتوبر',
  '11': 'نوفمبر',
  '12': 'ديسمبر'
};

export function formatArabicMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  if (!year || !month) return yearMonth;
  return `${ARABIC_MONTHS[month] || month} ${year}`;
}

function escapeHtml(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatGeneratedTimestamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}  ${hh}:${mm}`;
}

function getReportStatusLabel(status: DailyReport['status']): {
  label: string;
  bg: string;
  fg: string;
  border: string;
} {
  if (status === 'reviewed') {
    return { label: 'معتمد ومراجع من DC', bg: '#ecfdf5', fg: '#065f46', border: '#6ee7b7' };
  }
  if (status === 'needs_revision') {
    return { label: 'يتطلب تعديل من الموقع', bg: '#fffbeb', fg: '#92400e', border: '#fcd34d' };
  }
  return { label: 'بانتظار مراجعة DC', bg: '#eff6ff', fg: '#1e40af', border: '#93c5fd' };
}

function getSubmittalStatusColors(code: SubmittalStatusCode): {
  bg: string;
  fg: string;
  border: string;
  shortAr: string;
} {
  switch (code) {
    case 'A':
      return { bg: '#dcfce7', fg: '#166534', border: '#86efac', shortAr: 'معتمد' };
    case 'B':
      return { bg: '#ccfbf1', fg: '#115e59', border: '#5eead4', shortAr: 'معتمد بملاحظات' };
    case 'W':
      return { bg: '#fef3c7', fg: '#92400e', border: '#fcd34d', shortAr: 'قيد المراجعة' };
    case 'C':
      return { bg: '#ffe4e6', fg: '#9f1239', border: '#fda4af', shortAr: 'إعادة تقديم' };
    case 'D':
      return { bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5', shortAr: 'مرفوض' };
    default: {
      const codeKey = String(code);
      const fallbackCfg = (SUBMITTAL_STATUS_CONFIG as Record<string, { labelAr?: string }>)[codeKey];
      const fallback = fallbackCfg?.labelAr?.split('(')[0]?.trim() || codeKey;
      return { bg: '#f1f5f9', fg: '#334155', border: '#cbd5e1', shortAr: fallback };
    }
  }
}

function sanitizeFileName(raw: string): string {
  return raw.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

/**
 * Build a clean, self-contained pure-HTML/hex-CSS RTL Arabic document optimized
 * specifically for pixel-accurate html2canvas rasterization and print-to-PDF.
 *
 * Key layout guarantees:
 * - Uses system Tahoma / Arial metrics (avoids html2canvas Cairo RTL space collapse & baseline drop).
 * - Uses table-based layout for KPI cards & status strips for rock-solid vertical centering.
 * - Marks atomic units with `data-pdf-block` so pagination NEVER slices through text, rows, or boxes.
 */
export function buildReportsPrintableHtml(options: PdfReportExportOptions): string {
  const { title, periodLabel, projectLabel, reports, projects = [], users = [] } = options;
  const brandPalette = generateBrandPalette(dataService.getBrandColor());

  const sortedReports = [...reports].sort((a, b) => {
    if (a.reportDate !== b.reportDate) return b.reportDate.localeCompare(a.reportDate);
    return a.projectName.localeCompare(b.projectName, 'ar');
  });

  // Aggregate summary KPIs
  let totalSubmitted = 0;
  let totalReceived = 0;
  let reviewedCount = 0;
  const statusTotals: Record<SubmittalStatusCode, number> = { A: 0, B: 0, W: 0, C: 0, D: 0 };
  const projectMap = new Map<
    string,
    {
      name: string;
      code: string;
      reportsCount: number;
      submitted: number;
      received: number;
      approved: number;
      pending: number;
      rejected: number;
    }
  >();

  for (const rep of sortedReports) {
    totalSubmitted += rep.submittedWorks.length;
    totalReceived += rep.receivedWorks.length;
    if (rep.status === 'reviewed') reviewedCount++;

    const projObj = projects.find((p) => p.id === rep.projectId);
    const existing = projectMap.get(rep.projectId) || {
      name: rep.projectName,
      code: projObj?.code || '',
      reportsCount: 0,
      submitted: 0,
      received: 0,
      approved: 0,
      pending: 0,
      rejected: 0
    };
    existing.reportsCount += 1;
    existing.submitted += rep.submittedWorks.length;
    existing.received += rep.receivedWorks.length;

    const allItems = [...rep.submittedWorks, ...rep.receivedWorks];
    for (const item of allItems) {
      if (item.status in statusTotals) {
        statusTotals[item.status] += 1;
      }
      if (item.status === 'A' || item.status === 'B') existing.approved += 1;
      else if (item.status === 'W') existing.pending += 1;
      else if (item.status === 'C' || item.status === 'D') existing.rejected += 1;
    }

    projectMap.set(rep.projectId, existing);
  }

  const projectSummaryRows = Array.from(projectMap.values()).sort(
    (a, b) => b.reportsCount - a.reportsCount
  );

  const generatedAt = formatGeneratedTimestamp();

  const projectSummaryTableHtml =
    projectSummaryRows.length > 1
      ? `
      <div class="section">
        <div class="section-title" data-pdf-keep-next="true">ملخص الأداء حسب المشروع (${projectSummaryRows.length} مشروع)</div>
        <table class="data-table">
          <thead>
            <tr data-pdf-block="true">
              <th style="width: 36%;">المشروع / الموقع</th>
              <th style="width: 12%; text-align:center;">التقارير</th>
              <th style="width: 13%; text-align:center;">المقدمة</th>
              <th style="width: 13%; text-align:center;">المستلمة</th>
              <th style="width: 13%; text-align:center;">معتمد (A/B)</th>
              <th style="width: 13%; text-align:center;">مراجعة (W)</th>
            </tr>
          </thead>
          <tbody>
            ${projectSummaryRows
              .map(
                (p) => `
              <tr data-pdf-block="true">
                <td>
                  <div style="font-weight:700; color:#0f172a;">${escapeHtml(p.name)}</div>
                  ${p.code ? `<div class="ltr-inline" style="font-size:10px; color:#64748b; margin-top:2px;">${escapeHtml(p.code)}</div>` : ''}
                </td>
                <td style="text-align:center; font-weight:700;">${p.reportsCount}</td>
                <td style="text-align:center; color:#1d4ed8; font-weight:700;">${p.submitted}</td>
                <td style="text-align:center; color:#047857; font-weight:700;">${p.received}</td>
                <td style="text-align:center; color:#166534; font-weight:700;">${p.approved}</td>
                <td style="text-align:center; color:#b45309; font-weight:700;">${p.pending}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
      : '';

  const renderWorksTable = (
    headingAr: string,
    headingEn: string,
    accentColor: string,
    items: DailyReport['submittedWorks']
  ) => {
    if (items.length === 0) {
      return `
        <div class="sub-section" data-pdf-block="true">
          <div class="sub-heading" style="border-right-color:${accentColor};">
            <span class="sub-heading-ar">${escapeHtml(headingAr)}</span>
            <span class="sub-heading-count">(${items.length})</span>
            <span class="sub-heading-en ltr-inline">${escapeHtml(headingEn)}</span>
          </div>
          <div class="empty-note">لا توجد بنود مسجلة في هذا القسم.</div>
        </div>
      `;
    }
    return `
      <div class="sub-section">
        <div class="sub-heading" data-pdf-keep-next="true" style="border-right-color:${accentColor};">
          <span class="sub-heading-ar">${escapeHtml(headingAr)}</span>
          <span class="sub-heading-count">(${items.length})</span>
          <span class="sub-heading-en ltr-inline">${escapeHtml(headingEn)}</span>
        </div>
        <table class="data-table">
          <thead>
            <tr data-pdf-block="true">
              <th style="width: 6%; text-align:center;">م</th>
              <th style="width: 44%;">وصف البند</th>
              <th style="width: 24%; text-align:center;">رقم التقديم</th>
              <th style="width: 7%; text-align:center;">REV</th>
              <th style="width: 19%; text-align:center;">الموقف</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((item, idx) => {
                const st = getSubmittalStatusColors(item.status);
                return `
                  <tr data-pdf-block="true">
                    <td style="text-align:center; color:#64748b; font-weight:700;">${idx + 1}</td>
                    <td style="font-weight:600; color:#0f172a; line-height:1.6;">${escapeHtml(item.itemDescription)}</td>
                    <td style="text-align:center;">
                      <span class="submittal-code ltr-inline">${escapeHtml(item.submittalNumber)}</span>
                    </td>
                    <td style="text-align:center; font-family: Consolas, 'Courier New', monospace; font-weight:700; color:#334155;">${escapeHtml(item.rev)}</td>
                    <td style="text-align:center;">
                      <span class="status-chip" style="background:${st.bg}; color:${st.fg}; border-color:${st.border};">
                        <span class="ltr-code">${escapeHtml(item.status)}</span> - ${escapeHtml(st.shortAr)}
                      </span>
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  const reportsBlocksHtml = sortedReports
    .map((rep, idx) => {
      const audit = getReportIdentityAudit(rep, users);
      const repStatus = getReportStatusLabel(rep.status);
      const projObj = projects.find((p) => p.id === rep.projectId);

      return `
        <div class="report-block">
          <table class="report-header-table" data-pdf-block="true" data-pdf-keep-next="true">
            <tr>
              <td style="vertical-align:middle;">
                <div class="report-title-line">
                  <span class="report-num">#${idx + 1}</span>
                  <span class="report-proj-name">${escapeHtml(rep.projectName)}</span>
                  ${projObj?.code ? `<span class="proj-code-chip ltr-inline">${escapeHtml(projObj.code)}</span>` : ''}
                </div>
                <div class="report-meta-line">
                  <span>التاريخ: <strong class="ltr-inline">${escapeHtml(rep.reportDate)}</strong></span>
                  <span class="meta-sep">|</span>
                  <span>المرسل: <strong>${escapeHtml(audit.currentName)}</strong></span>
                  <span class="meta-sep">|</span>
                  <span>المقدمة: <strong>${rep.submittedWorks.length}</strong></span>
                  <span class="meta-sep">|</span>
                  <span>المستلمة: <strong>${rep.receivedWorks.length}</strong></span>
                </div>
              </td>
              <td style="width:170px; text-align:left; vertical-align:middle;">
                <span class="status-chip" style="background:${repStatus.bg}; color:${repStatus.fg}; border-color:${repStatus.border};">
                  ${escapeHtml(repStatus.label)}
                </span>
              </td>
            </tr>
          </table>

          ${renderWorksTable('الأعمال المقدمة', 'Submitted Works', brandPalette['600'], rep.submittedWorks)}
          ${renderWorksTable('الأعمال المستلمة', 'Received Works', '#059669', rep.receivedWorks)}

          ${
            rep.notes
              ? `<div class="note-box" data-pdf-block="true"><strong>ملاحظات الموقع:</strong> ${escapeHtml(rep.notes)}</div>`
              : ''
          }
          ${
            rep.adminFeedback
              ? `<div class="note-box dc-note" data-pdf-block="true"><strong>تعليق إدارة مراقبة الوثائق (DC):</strong> ${escapeHtml(rep.adminFeedback)}</div>`
              : ''
          }
        </div>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      letter-spacing: 0 !important;
    }
    body {
      font-family: Tahoma, Arial, 'Segoe UI', sans-serif;
      background: #ffffff;
      color: #0f172a;
      direction: rtl;
      width: 794px;
      padding: 20px 26px 26px;
      line-height: 1.65;
      font-size: 12px;
      word-spacing: 1.5px;
    }
    .ltr-inline {
      direction: ltr;
      unicode-bidi: isolate;
      display: inline-block;
      font-family: Consolas, 'Courier New', monospace;
    }
    .ltr-code {
      direction: ltr;
      unicode-bidi: isolate;
      display: inline;
      font-family: Tahoma, Arial, 'Segoe UI', sans-serif;
      font-weight: 700;
    }

    /* Top Document Header */
    .header-table {
      width: 100%;
      border-collapse: collapse;
      border-bottom: 2.5px solid ${brandPalette['800']};
      margin-bottom: 14px;
    }
    .header-table td {
      padding-bottom: 12px;
      vertical-align: top;
    }
    .brand-tag {
      font-size: 11px;
      font-weight: 700;
      color: ${brandPalette['700']};
      margin-bottom: 4px;
    }
    .doc-title {
      font-size: 19px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.45;
      margin-bottom: 4px;
    }
    .doc-subtitle {
      font-size: 12px;
      color: #334155;
      line-height: 1.5;
    }
    .meta-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 6px 12px 10px;
      font-size: 11px;
      color: #334155;
      line-height: 1.7;
      text-align: right;
    }

    /* KPI Strip (Table for pixel-exact alignment in html2canvas) */
    .kpi-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 8px 0;
      margin: 0 -8px 12px;
      table-layout: fixed;
    }
    .kpi-cell {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 7px 12px 11px;
      vertical-align: top;
    }
    .kpi-label {
      font-size: 10.5px;
      font-weight: 700;
      color: #475569;
      margin-bottom: 3px;
    }
    .kpi-value {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      font-family: Consolas, 'Courier New', monospace;
      line-height: 1.25;
    }
    .kpi-sub {
      font-size: 10px;
      color: #64748b;
      margin-top: 2px;
    }

    /* Status Distribution Bar */
    .status-bar-table {
      width: 100%;
      border-collapse: collapse;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      margin-bottom: 14px;
    }
    .status-bar-table > tbody > tr > td {
      padding: 7px 10px;
      vertical-align: middle;
      font-size: 11px;
    }
    .status-bar-label {
      width: 150px;
      font-weight: 700;
      color: #0f172a;
      white-space: nowrap;
      padding: 5px 12px 10px !important;
      line-height: 1.3;
    }
    .status-chips-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 5px 0;
    }
    .status-chip-cell {
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      font-size: 10.5px;
      font-weight: 700;
      line-height: 1.2;
      padding: 3px 8px 9px;
      text-align: center;
      white-space: nowrap;
      vertical-align: middle;
    }

    /* Section Headings */
    .section {
      margin-bottom: 14px;
    }
    .section-title {
      font-size: 13.5px;
      font-weight: 700;
      color: #0f172a;
      background: #f1f5f9;
      border-right: 4px solid ${brandPalette['600']};
      padding: 3px 12px 10px;
      margin-bottom: 10px;
      border-radius: 4px;
      line-height: 1.3;
    }

    /* Report Block */
    .report-block {
      margin-bottom: 16px;
    }
    .report-header-table {
      width: 100%;
      border-collapse: collapse;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      margin-bottom: 10px;
    }
    .report-header-table td {
      padding: 7px 12px 11px;
    }
    .report-title-line {
      font-size: 13.5px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.5;
      margin-bottom: 4px;
    }
    .report-num {
      display: inline-block;
      background: ${brandPalette['100']};
      color: ${brandPalette['800']};
      border: 1px solid ${brandPalette['300']};
      border-radius: 4px;
      padding: 1px 7px 6px;
      font-size: 11px;
      font-family: Tahoma, Arial, sans-serif;
      font-weight: 700;
      line-height: 1.2;
      vertical-align: middle;
      margin-left: 6px;
    }
    .report-proj-name {
      font-weight: 700;
      vertical-align: middle;
    }
    .proj-code-chip {
      background: #e2e8f0;
      color: #334155;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 8px 6px;
      line-height: 1.2;
      vertical-align: middle;
      border-radius: 4px;
      margin-right: 6px;
    }
    .report-meta-line {
      font-size: 11px;
      color: #475569;
      line-height: 1.6;
    }
    .meta-sep {
      color: #cbd5e1;
      margin: 0 6px;
    }

    /* Sub-section Heading */
    .sub-section {
      margin-bottom: 12px;
    }
    .sub-heading {
      font-size: 12px;
      font-weight: 700;
      color: #1e293b;
      border-right: 4px solid #2563eb;
      padding: 2px 10px 9px;
      margin-bottom: 6px;
      background: #f8fafc;
      line-height: 1.3;
    }
    .sub-heading-ar {
      font-weight: 700;
    }
    .sub-heading-count {
      font-family: Tahoma, Arial, sans-serif;
      font-weight: 700;
      color: #1d4ed8;
      margin: 0 4px;
    }
    .sub-heading-en {
      font-size: 10.5px;
      color: #64748b;
      font-weight: 600;
      margin-right: 6px;
    }
    .empty-note {
      font-size: 11px;
      color: #64748b;
      padding: 5px 12px 10px;
      line-height: 1.4;
      background: #f8fafc;
      border: 1px dashed #cbd5e1;
      border-radius: 6px;
    }

    /* Data Tables */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      word-wrap: break-word;
      font-size: 11px;
      margin-bottom: 4px;
    }
    .data-table th {
      background: #e2e8f0;
      color: #1e293b;
      font-weight: 700;
      padding: 4px 8px 10px;
      border: 1px solid #94a3b8;
      text-align: right;
      line-height: 1.3;
    }
    .data-table td {
      padding: 5px 8px 9px;
      border: 1px solid #cbd5e1;
      vertical-align: middle;
      line-height: 1.45;
    }
    .data-table tbody tr:nth-child(even) td {
      background: #f8fafc;
    }
    .submittal-code {
      font-size: 10.5px;
      font-weight: 700;
      color: #1e3a8a;
      word-break: break-all;
    }

    /* Clean Rectangular Chips (Baseline-compensated for dead-center html2canvas rendering) */
    .status-chip {
      display: inline-block;
      padding: 2px 10px 8px;
      border-radius: 5px;
      border: 1px solid #cbd5e1;
      font-size: 10.5px;
      font-weight: 700;
      line-height: 1.2;
      vertical-align: middle;
      white-space: nowrap;
    }

    /* Notes Boxes */
    .note-box {
      padding: 6px 12px 11px;
      border-radius: 8px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      font-size: 11.5px;
      color: #1e293b;
      line-height: 1.65;
      margin-top: 8px;
    }
    .dc-note {
      background: #eff6ff;
      border-color: #93c5fd;
      color: #1e3a8a;
    }

    @media print {
      body { width: auto; padding: 10mm; }
      .data-table tr, .note-box, .report-header-table { page-break-inside: avoid; }
      .status-chip, .status-chip-cell { padding: 4px 10px !important; }
      .section-title { padding: 6px 12px !important; }
      .sub-heading { padding: 5px 10px !important; }
      .data-table th, .data-table td { padding: 7px 8px !important; }
      .report-num, .proj-code-chip { padding: 2px 7px !important; }
    }
  </style>
</head>
<body>
  <!-- Document Header -->
  <table class="header-table" data-pdf-block="true">
    <tr>
      <td style="width: 66%; padding-left: 14px;">
        <div class="brand-tag">شركة الماسة للمقاولات &nbsp;·&nbsp; إدارة مراقبة الوثائق <span class="ltr-inline">(DC)</span></div>
        <div class="doc-title">${escapeHtml(title)}</div>
        <div class="doc-subtitle">المشروع / النطاق: <strong>${escapeHtml(projectLabel)}</strong></div>
      </td>
      <td style="width: 34%;">
        <div class="meta-card">
          <div><strong>الفترة:</strong> ${/^[\d\s\-/.,:]+$/.test(periodLabel.trim()) ? `<span class="ltr-inline">${escapeHtml(periodLabel)}</span>` : `<span>${escapeHtml(periodLabel)}</span>`}</div>
          <div><strong>عدد التقارير:</strong> ${sortedReports.length} تقرير</div>
          <div><strong>تاريخ الاستخراج:</strong> <span class="ltr-inline">${escapeHtml(generatedAt)}</span></div>
        </div>
      </td>
    </tr>
  </table>

  <!-- KPI Summary Strip -->
  <table class="kpi-table" data-pdf-block="true">
    <tr>
      <td class="kpi-cell">
        <div class="kpi-label">إجمالي التقارير</div>
        <div class="kpi-value">${sortedReports.length}</div>
        <div class="kpi-sub">${reviewedCount} معتمد من DC</div>
      </td>
      <td class="kpi-cell">
        <div class="kpi-label">المشاريع المشمولة</div>
        <div class="kpi-value">${projectMap.size}</div>
        <div class="kpi-sub">موقع / مشروع</div>
      </td>
      <td class="kpi-cell">
        <div class="kpi-label">الأعمال المقدمة</div>
        <div class="kpi-value" style="color:#1d4ed8;">${totalSubmitted}</div>
        <div class="kpi-sub ltr-inline">Submitted Works</div>
      </td>
      <td class="kpi-cell">
        <div class="kpi-label">الأعمال المستلمة</div>
        <div class="kpi-value" style="color:#047857;">${totalReceived}</div>
        <div class="kpi-sub ltr-inline">Received Works</div>
      </td>
    </tr>
  </table>

  <!-- Status Distribution Strip -->
  <table class="status-bar-table" data-pdf-block="true">
    <tr>
      <td class="status-bar-label">توزيع مواقف التقديمات:</td>
      <td>
        <table class="status-chips-table">
          <tr>
            <td class="status-chip-cell" style="background:#dcfce7;color:#166534;border-color:#86efac;">معتمد (<span class="ltr-code">A</span>): ${statusTotals.A}</td>
            <td class="status-chip-cell" style="background:#ccfbf1;color:#115e59;border-color:#5eead4;">بملاحظات (<span class="ltr-code">B</span>): ${statusTotals.B}</td>
            <td class="status-chip-cell" style="background:#fef3c7;color:#92400e;border-color:#fcd34d;">قيد المراجعة (<span class="ltr-code">W</span>): ${statusTotals.W}</td>
            <td class="status-chip-cell" style="background:#ffe4e6;color:#9f1239;border-color:#fda4af;">إعادة تقديم (<span class="ltr-code">C</span>): ${statusTotals.C}</td>
            <td class="status-chip-cell" style="background:#fee2e2;color:#991b1b;border-color:#fca5a5;">مرفوض (<span class="ltr-code">D</span>): ${statusTotals.D}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  ${projectSummaryTableHtml}

  <div class="section">
    <div class="section-title" data-pdf-keep-next="true">تفاصيل تقارير الأعمال (${sortedReports.length})</div>
    ${reportsBlocksHtml}
  </div>
</body>
</html>`;
}

interface AtomicBlockRange {
  top: number;
  bottom: number;
  keepWithNext: boolean;
}

/**
 * Compute clean page-break Y coordinates (in canvas pixels) that NEVER cut inside
 * any table row, heading, KPI card, or notes box, and never leave an orphan heading
 * stranded at the bottom of a page.
 */
function computeSmartPageBreaks(
  totalHeightPx: number,
  maxSliceHeightPx: number,
  blocks: AtomicBlockRange[]
): Array<{ startY: number; endY: number }> {
  const pages: Array<{ startY: number; endY: number }> = [];
  let cursorY = 0;

  // Sort blocks top-to-bottom
  const sortedBlocks = [...blocks].sort((a, b) => a.top - b.top);
  const minProgressPx = Math.floor(maxSliceHeightPx * 0.25);

  while (cursorY < totalHeightPx - 4) {
    const idealEndY = cursorY + maxSliceHeightPx;

    // If the remaining content fits cleanly on this final page, finish!
    if (idealEndY >= totalHeightPx) {
      pages.push({ startY: cursorY, endY: totalHeightPx });
      break;
    }

    let chosenEndY = idealEndY;

    // 1. Check if any atomic block straddles the boundary `chosenEndY`
    for (const blk of sortedBlocks) {
      if (blk.top < chosenEndY && blk.bottom > chosenEndY) {
        // Pull the break cleanly ABOVE this block (as long as we still make meaningful progress)
        if (blk.top - cursorY >= minProgressPx) {
          chosenEndY = Math.max(cursorY + minProgressPx, Math.floor(blk.top - 4));
        }
        break;
      }
    }

    // 2. Prevent orphan headings (a keep-with-next heading left near the bottom of the page)
    for (let i = sortedBlocks.length - 1; i >= 0; i--) {
      const blk = sortedBlocks[i];
      if (!blk.keepWithNext) continue;
      if (blk.top >= cursorY + minProgressPx && blk.bottom <= chosenEndY) {
        // If there is very little space left after this heading (< 180 canvas px), move heading to next page
        if (chosenEndY - blk.bottom < 180) {
          chosenEndY = Math.floor(blk.top - 4);
        }
      }
    }

    // Safety guard against non-advancing cursor
    if (chosenEndY <= cursorY + 20) {
      chosenEndY = Math.min(totalHeightPx, idealEndY);
    }

    pages.push({ startY: cursorY, endY: chosenEndY });
    cursorY = chosenEndY;
  }

  return pages;
}

/**
 * Render the RTL Arabic HTML report inside an isolated off-screen iframe,
 * measure atomic DOM block bounds, rasterize with html2canvas at 2x DPI,
 * paginate cleanly onto A4 PDF pages via pdf-lib with ZERO sliced text,
 * and return a genuine downloadable PDF Blob.
 */
export async function generateReportsPdfBlob(
  options: PdfReportExportOptions
): Promise<GeneratedPdfResult> {
  if (options.reports.length === 0) {
    throw new Error('لا توجد تقارير متاحة للتصدير في الفترة المحددة.');
  }

  const html = buildReportsPrintableHtml(options);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '820px';
  iframe.style.height = '1400px';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      throw new Error('تعذر تهيئة مستند PDF في المتصفح.');
    }

    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    if (iframeDoc.fonts?.ready) {
      await Promise.race([
        iframeDoc.fonts.ready,
        new Promise((resolve) => window.setTimeout(resolve, 400))
      ]);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 100));

    const targetBody = iframeDoc.body;
    const renderHeight = Math.max(targetBody.scrollHeight, targetBody.offsetHeight, 600);
    iframe.style.height = `${renderHeight + 40}px`;

    // Measure atomic DOM elements BEFORE rasterization so pagination breaks cleanly between blocks
    const SCALE = 2;
    const bodyRect = targetBody.getBoundingClientRect();
    const atomicEls = Array.from(
      targetBody.querySelectorAll('[data-pdf-block], [data-pdf-keep-next]')
    );
    const atomicBlocks: AtomicBlockRange[] = atomicEls
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          top: Math.max(0, (rect.top - bodyRect.top) * SCALE),
          bottom: Math.max(0, (rect.bottom - bodyRect.top) * SCALE),
          keepWithNext: el.getAttribute('data-pdf-keep-next') === 'true'
        };
      })
      .filter((b) => b.bottom > b.top + 4);

    const fullCanvas = await html2canvas(targetBody, {
      scale: SCALE,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: 794,
      windowWidth: 794,
      height: renderHeight,
      windowHeight: renderHeight,
      logging: false
    });

    // A4 dimensions in PDF points (72 DPI)
    const A4_WIDTH = 595.28;
    const A4_HEIGHT = 841.89;
    const MARGIN_X = 20;
    const MARGIN_TOP = 18;
    const FOOTER_HEIGHT = 28;
    const DRAW_WIDTH = A4_WIDTH - MARGIN_X * 2;
    const MAX_DRAW_HEIGHT = A4_HEIGHT - MARGIN_TOP - FOOTER_HEIGHT - 12;

    const pxPerPt = fullCanvas.width / DRAW_WIDTH;
    const maxSliceHeightPx = Math.floor(MAX_DRAW_HEIGHT * pxPerPt);

    const pageSlices = computeSmartPageBreaks(fullCanvas.height, maxSliceHeightPx, atomicBlocks);

    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(options.title);
    pdfDoc.setCreator('El Massa Document Control System');
    const footerFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const totalPages = pageSlices.length;

    for (let idx = 0; idx < totalPages; idx++) {
      const { startY, endY } = pageSlices[idx];
      const slicePx = Math.max(1, endY - startY);

      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = fullCanvas.width;
      sliceCanvas.height = slicePx;

      const ctx = sliceCanvas.getContext('2d');
      if (!ctx) {
        throw new Error('تعذر معالجة صفحات ملف PDF.');
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        fullCanvas,
        0,
        startY,
        fullCanvas.width,
        slicePx,
        0,
        0,
        fullCanvas.width,
        slicePx
      );

      const dataUrl = sliceCanvas.toDataURL('image/png');
      const pngBytes = await fetch(dataUrl).then((res) => res.arrayBuffer());
      const embeddedPng = await pdfDoc.embedPng(pngBytes);

      const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      const drawnHeightPt = slicePx / pxPerPt;
      page.drawImage(embeddedPng, {
        x: MARGIN_X,
        y: A4_HEIGHT - MARGIN_TOP - drawnHeightPt,
        width: DRAW_WIDTH,
        height: drawnHeightPt
      });

      // Clean subtle footer divider + page numbering on every page
      const footerLineY = FOOTER_HEIGHT;
      page.drawLine({
        start: { x: MARGIN_X, y: footerLineY },
        end: { x: A4_WIDTH - MARGIN_X, y: footerLineY },
        thickness: 0.6,
        color: rgb(0.8, 0.84, 0.89)
      });

      const pageNumLabel = `Page ${idx + 1} / ${totalPages}`;
      page.drawText(pageNumLabel, {
        x: MARGIN_X,
        y: 12,
        size: 8.5,
        font: footerFont,
        color: rgb(0.42, 0.48, 0.56)
      });

      const rightBrandLabel = 'El Massa Contracting - Document Control (DC)';
      const brandWidth = footerFont.widthOfTextAtSize(rightBrandLabel, 8.5);
      page.drawText(rightBrandLabel, {
        x: A4_WIDTH - MARGIN_X - brandWidth,
        y: 12,
        size: 8.5,
        font: footerFont,
        color: rgb(0.42, 0.48, 0.56)
      });
    }

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = new Uint8Array(pdfBytes);
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' });

    const defaultName =
      options.fileName ||
      `${sanitizeFileName(options.title)}_${sanitizeFileName(options.periodLabel)}.pdf`;

    return {
      blob,
      fileName: defaultName.endsWith('.pdf') ? defaultName : `${defaultName}.pdf`,
      pageCount: totalPages
    };
  } finally {
    document.body.removeChild(iframe);
  }
}

export function triggerPdfDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Share a generated PDF using the Web Share API when supported, falling back to direct download.
 */
export async function shareOrDownloadPdf(
  blob: Blob,
  fileName: string,
  shareTitle: string
): Promise<'shared' | 'downloaded'> {
  try {
    const file = new File([blob], fileName, { type: 'application/pdf' });
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({
        title: shareTitle,
        text: shareTitle,
        files: [file]
      });
      return 'shared';
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return 'shared';
    }
  }

  triggerPdfDownload(blob, fileName);
  return 'downloaded';
}

/**
 * Trigger direct print / browser Save-as-PDF via a hidden same-origin iframe (avoids window.open)
 */
export function printReportsViaHiddenIframe(options: PdfReportExportOptions): void {
  const html = buildReportsPrintableHtml(options);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc || !iframe.contentWindow) {
    document.body.removeChild(iframe);
    return;
  }

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  window.setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 2000);
    }
  }, 300);
}
