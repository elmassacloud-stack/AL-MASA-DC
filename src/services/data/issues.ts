import { doc, updateDoc, runTransaction } from 'firebase/firestore';
import { AppNotification, IssueReport } from '../../types';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { safeStorage, STORAGE_KEYS, stripUndefined } from './shared';

export interface IssueDomainCallbacks {
  addNotification: (notif: Omit<AppNotification, 'id' | 'isRead' | 'createdAt' | 'readBy'>) => void;
  notify: () => void;
}

export function getIssues(): IssueReport[] {
  try {
    const data = safeStorage.getItem(STORAGE_KEYS.ISSUES);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function addIssue(
  issue: Omit<IssueReport, 'id' | 'issueNumber' | 'createdAt' | 'updatedAt' | 'status'>,
  callbacks: IssueDomainCallbacks
): Promise<IssueReport> {
  const year = new Date().getFullYear();
  const counterId = `issues-${year}`;
  const counterRef = doc(db, 'counters', counterId);
  const now = new Date().toISOString();
  const issueId =
    'iss-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
  const issueRef = doc(db, 'issues', issueId);

  let newIssue!: IssueReport;
  try {
    newIssue = await runTransaction(db, async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const prevValue =
        counterSnap.exists() && typeof counterSnap.data().value === 'number'
          ? Math.floor(counterSnap.data().value)
          : 0;
      const nextValue = prevValue + 1;

      if (counterSnap.exists()) {
        tx.update(counterRef, { value: nextValue, updatedAt: now });
      } else {
        tx.set(counterRef, { value: 1, updatedAt: now });
      }

      const nextSeq = String(nextValue).padStart(3, '0');
      const created: IssueReport = stripUndefined({
        ...issue,
        authorId: auth.currentUser?.uid || issue.authorId,
        id: issueId,
        issueNumber: `ISS-${year}-${nextSeq}`,
        status: 'new',
        createdAt: now,
        updatedAt: now
      });

      tx.set(issueRef, stripUndefined(created));
      return created;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `issues/${issueId}`);
  }

  const issues = getIssues();
  const updatedIssues = [newIssue, ...issues.filter((i) => i.id !== newIssue.id)];
  safeStorage.setJson(STORAGE_KEYS.ISSUES, updatedIssues);

  const isUrgent = newIssue.priority === 'urgent';
  callbacks.addNotification({
    title: isUrgent
      ? `بلاغ عاجل: ${newIssue.issueNumber} — ${newIssue.projectName}`
      : `بلاغ مشكلة جديدة: ${newIssue.issueNumber} — ${newIssue.projectName}`,
    message: `أبلغ ${newIssue.authorName} عن ${isUrgent ? 'مشكلة عاجلة' : 'مشكلة بالموقع'}: ${newIssue.description.slice(0, 80)}${newIssue.description.length > 80 ? '...' : ''}`,
    type: isUrgent ? 'urgent_issue' : 'issue_reported',
    priority: newIssue.priority,
    targetRole: 'admin',
    projectId: newIssue.projectId,
    senderId: newIssue.authorId,
    senderName: newIssue.authorName,
    linkTab: 'issues'
  });

  callbacks.notify();
  return newIssue;
}

export function updateIssue(
  issueId: string,
  updates: Partial<Pick<IssueReport, 'status' | 'adminComment' | 'resolvedAt'>>,
  notify: () => void
): boolean {
  const issues = getIssues();
  const idx = issues.findIndex((i) => i.id === issueId);
  if (idx === -1) return false;

  const updatedAt = new Date().toISOString();
  const resolvedAt = updates.status === 'resolved' ? updatedAt : issues[idx].resolvedAt;
  const patch = stripUndefined({
    ...updates,
    updatedAt,
    resolvedAt
  });

  issues[idx] = {
    ...issues[idx],
    ...patch
  };
  safeStorage.setJson(STORAGE_KEYS.ISSUES, issues);

  updateDoc(doc(db, 'issues', issueId), patch).catch((error) =>
    handleFirestoreError(error, OperationType.UPDATE, `issues/${issueId}`)
  );

  notify();
  return true;
}
