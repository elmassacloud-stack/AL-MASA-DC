import { DailyReport, UserProfile } from '../types';

export interface ReportIdentityAudit {
  matchedUser?: UserProfile;
  /** Original author name captured at submission time (immutable audit record) */
  originalName: string;
  /** Original author email captured at submission time (immutable audit record) */
  originalEmail: string;
  /** Author name currently stored on the report document */
  recordedName: string;
  /** Author email currently stored on the report document */
  recordedEmail: string;
  /** Latest author name from the user's live profile (falls back to recordedName) */
  currentName: string;
  /** Latest author email from the user's live profile (falls back to recordedEmail) */
  currentEmail: string;
  /** True when the user's live profile has a newer name/email than what is stored on this report */
  needsSync: boolean;
  /** True when the original name differs from the recorded or current profile name */
  nameChanged: boolean;
  /** True when the original email differs from the recorded or current profile email */
  emailChanged: boolean;
  /** True whenever any original vs current difference or pending sync exists */
  hasAuditDifference: boolean;
  /** Timestamp of the latest identity re-sync on this report, if synced */
  identitySyncedAt?: string;
}

function cleanEmail(value?: string | null): string {
  return (value || '').trim().toLowerCase();
}

function cleanName(value?: string | null): string {
  return (value || '').trim();
}

export function findReportUserProfile(
  report: Pick<DailyReport, 'senderId' | 'senderEmail' | 'originalSenderEmail'>,
  users: UserProfile[]
): UserProfile | undefined {
  if (!users.length) return undefined;
  if (report.senderId) {
    const byId = users.find((u) => u.id === report.senderId);
    if (byId) return byId;
  }
  const repEmail = cleanEmail(report.senderEmail);
  if (repEmail) {
    const byEmail = users.find((u) => cleanEmail(u.email) === repEmail);
    if (byEmail) return byEmail;
  }
  const origEmail = cleanEmail(report.originalSenderEmail);
  if (origEmail) {
    return users.find((u) => cleanEmail(u.email) === origEmail);
  }
  return undefined;
}

export function getReportIdentityAudit(
  report: DailyReport,
  users: UserProfile[]
): ReportIdentityAudit {
  const matchedUser = findReportUserProfile(report, users);
  const recordedName = cleanName(report.senderName);
  const recordedEmail = cleanEmail(report.senderEmail);
  const originalName = cleanName(report.originalSenderName) || recordedName;
  const originalEmail = cleanEmail(report.originalSenderEmail) || recordedEmail;
  const currentName = matchedUser ? cleanName(matchedUser.displayName) || recordedName : recordedName;
  const currentEmail = matchedUser ? cleanEmail(matchedUser.email) || recordedEmail : recordedEmail;

  const needsSync = Boolean(
    matchedUser &&
      ((currentName && currentName !== recordedName) ||
        (currentEmail && currentEmail !== recordedEmail))
  );

  const nameChanged = Boolean(
    originalName && (originalName !== recordedName || originalName !== currentName)
  );

  const emailChanged = Boolean(
    originalEmail && (originalEmail !== recordedEmail || originalEmail !== currentEmail)
  );

  return {
    matchedUser,
    originalName,
    originalEmail,
    recordedName,
    recordedEmail,
    currentName,
    currentEmail,
    needsSync,
    nameChanged,
    emailChanged,
    hasAuditDifference: needsSync || nameChanged || emailChanged,
    identitySyncedAt: report.identitySyncedAt
  };
}
