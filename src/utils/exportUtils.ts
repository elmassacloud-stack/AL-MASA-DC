import * as XLSX from 'xlsx';
import { DailyReport, IssueReport } from '../types';
import { SUBMITTAL_STATUS_CONFIG } from '../config';

/**
 * Export a single Daily Report to an Excel (.xlsx) workbook matching the original Excel form
 */
export function exportDailyReportToExcel(report: DailyReport) {
  const wb = XLSX.utils.book_new();

  // Prepare worksheet data rows
  const rows: (string | number)[][] = [
    ['تقرير الأعمال اليومي - إدارة مراقبة الوثائق (Document Control)'],
    [''],
    ['المشروع:', report.projectName, '', 'التاريخ:', report.reportDate],
    ['مرسل التقرير:', report.senderName, '', 'حالة الاعتماد:', report.status === 'reviewed' ? 'تمت المراجعة' : 'قيد المتابعة'],
    [''],
    ['الأعمال المقدمة (Submitted Works)'],
    ['م', 'البند (Item Description)', 'رقم التقديم (Submittal No.)', 'REV', 'الموقف (Status)', 'وصف الموقف'],
  ];

  // Submitted works rows
  if (report.submittedWorks.length === 0) {
    rows.push(['-', 'لا توجد تقديمات مسجلة لهذا اليوم', '-', '-', '-', '-']);
  } else {
    report.submittedWorks.forEach((item, idx) => {
      const statusMeta = SUBMITTAL_STATUS_CONFIG[item.status];
      rows.push([
        idx + 1,
        item.itemDescription,
        item.submittalNumber,
        item.rev,
        item.status,
        statusMeta ? statusMeta.labelAr : item.status
      ]);
    });
  }

  rows.push(['']);
  rows.push(['الأعمال المستلمة (Received Works)']);
  rows.push(['م', 'البند (Item Description)', 'رقم التقديم (Submittal No.)', 'REV', 'الموقف (Status)', 'وصف الموقف']);

  // Received works rows
  if (report.receivedWorks.length === 0) {
    rows.push(['-', 'لا توجد أعمال مستلمة مسجلة لهذا اليوم', '-', '-', '-', '-']);
  } else {
    report.receivedWorks.forEach((item, idx) => {
      const statusMeta = SUBMITTAL_STATUS_CONFIG[item.status];
      rows.push([
        idx + 1,
        item.itemDescription,
        item.submittalNumber,
        item.rev,
        item.status,
        statusMeta ? statusMeta.labelAr : item.status
      ]);
    });
  }

  rows.push(['']);
  rows.push(['ملاحظات عامة ومرفقات:']);
  rows.push([report.notes || 'لا توجد ملاحظات إضافية']);

  if (report.adminFeedback) {
    rows.push(['ملاحظات وتعليقات إدارة مراقبة الوثائق (DC):']);
    rows.push([report.adminFeedback]);
  }

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  ws['!cols'] = [
    { wch: 6 },   // م
    { wch: 45 },  // البند
    { wch: 28 },  // رقم التقديم
    { wch: 8 },   // REV
    { wch: 10 },  // الموقف
    { wch: 32 }   // وصف الموقف
  ];

  // Append worksheet
  XLSX.utils.book_append_sheet(wb, ws, 'تقرير الأعمال اليومي');

  // Trigger download
  const safeProject = report.projectName.replace(/[\\/:*?"<>|]/g, '_');
  const filename = `تقرير_أعمال_${safeProject}_${report.reportDate}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Export all submittals across all reports to CSV
 */
export function exportSubmittalsLogToCSV(reports: DailyReport[]) {
  const rows: string[][] = [
    ['المشروع', 'التاريخ', 'النوع', 'م', 'البند', 'رقم التقديم', 'REV', 'الموقف', 'المرسل']
  ];

  reports.forEach((rep) => {
    rep.submittedWorks.forEach((sub, i) => {
      rows.push([
        `"${rep.projectName}"`,
        `"${rep.reportDate}"`,
        '"مقدم"',
        `"${i + 1}"`,
        `"${sub.itemDescription.replace(/"/g, '""')}"`,
        `"${sub.submittalNumber}"`,
        `"${sub.rev}"`,
        `"${sub.status}"`,
        `"${rep.senderName}"`
      ]);
    });

    rep.receivedWorks.forEach((rec, i) => {
      rows.push([
        `"${rep.projectName}"`,
        `"${rep.reportDate}"`,
        '"مستلم"',
        `"${i + 1}"`,
        `"${rec.itemDescription.replace(/"/g, '""')}"`,
        `"${rec.submittalNumber}"`,
        `"${rec.rev}"`,
        `"${rec.status}"`,
        `"${rep.senderName}"`
      ]);
    });
  });

  downloadCSV(rows, `سجل_التقديمات_الشامل_${new Date().toISOString().split('T')[0]}.csv`);
}

/**
 * Export site issues list to CSV
 */
export function exportIssuesLogToCSV(issues: IssueReport[]) {
  const rows: string[][] = [
    ['رقم البلاغ', 'المشروع', 'النوع', 'الأولوية', 'الحالة', 'المرسل', 'التاريخ', 'الوصف', 'تعليق الإدارة']
  ];

  issues.forEach((iss) => {
    rows.push([
      `"${iss.issueNumber}"`,
      `"${iss.projectName}"`,
      `"${iss.type}"`,
      `"${iss.priority === 'urgent' ? 'عاجل' : 'عادي'}"`,
      `"${iss.status}"`,
      `"${iss.authorName}"`,
      `"${iss.createdAt.split('T')[0]}"`,
      `"${iss.description.replace(/"/g, '""')}"`,
      `"${(iss.adminComment || '').replace(/"/g, '""')}"`
    ]);
  });

  downloadCSV(rows, `سجل_البلاغات_والمشكلات_${new Date().toISOString().split('T')[0]}.csv`);
}

// Helper to trigger UTF-8 BOM CSV download for Excel Arabic support
function downloadCSV(rows: string[][], filename: string) {
  const csvContent = '\uFEFF' + rows.map((r) => r.join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
