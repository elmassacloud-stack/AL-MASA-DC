import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { NotificationPreferences, Project, UserProfile } from '../../types';
import { isSuperAdminEmail } from '../../config';
import {
  assertFirestoreWriteAvailable,
  createFirebaseUserByAdmin,
  db,
  handleFirestoreError,
  OperationType
} from '../firebase';
import { normalizeNotificationPreferences } from '../../utils/notificationPreferences';
import { CreateUserPayload, safeStorage, STORAGE_KEYS, stripUndefined } from './shared';

export interface UsersDomainContext {
  getCurrentUser: () => UserProfile | null;
  setCurrentUser: (user: UserProfile | null) => void;
  getProjects: () => Project[];
  notify: () => void;
}

export function getUsers(): UserProfile[] {
  try {
    const data = safeStorage.getItem(STORAGE_KEYS.USERS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function upsertLocalUser(user: UserProfile): void {
  const users = getUsers();
  const idx = users.findIndex(
    (u) => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase()
  );
  if (idx !== -1) {
    users[idx] = user;
  } else {
    users.push(user);
  }
  safeStorage.setJson(STORAGE_KEYS.USERS, users);
}

export async function createUserWithAuth(
  payload: CreateUserPayload,
  ctx: UsersDomainContext
): Promise<UserProfile> {
  assertFirestoreWriteAvailable();
  const uid = await createFirebaseUserByAdmin(
    payload.email,
    payload.password,
    payload.displayName
  );
  const now = new Date().toISOString();
  const isAdminUser = payload.role === 'admin' || isSuperAdminEmail(payload.email);

  const newUser: UserProfile = stripUndefined({
    id: uid,
    email: payload.email.trim().toLowerCase(),
    displayName: payload.displayName.trim(),
    jobTitle: payload.jobTitle.trim(),
    role: isAdminUser ? 'admin' : 'site',
    allProjects: isAdminUser ? true : Boolean(payload.allProjects),
    canAccessExecutedWorks: isAdminUser ? true : Boolean(payload.canAccessExecutedWorks),
    canAccessSiteDeliverables: true,
    assignedProjects:
      isAdminUser || payload.allProjects
        ? ctx.getProjects().map((p) => p.id)
        : payload.assignedProjects,
    status: 'active',
    phone: payload.phone?.trim() || undefined,
    createdAt: now,
    updatedAt: now
  });

  try {
    await setDoc(doc(db, 'users', newUser.id), stripUndefined(newUser));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${newUser.id}`);
  }

  upsertLocalUser(newUser);
  ctx.notify();
  return newUser;
}

export async function deleteUser(
  userId: string,
  ctx: UsersDomainContext
): Promise<boolean> {
  assertFirestoreWriteAvailable();
  const users = getUsers();
  const target = users.find((u) => u.id === userId);
  if (!target) return false;

  const currentUser = ctx.getCurrentUser();
  if (isSuperAdminEmail(target.email) || (currentUser && currentUser.id === userId)) {
    return false;
  }

  try {
    await deleteDoc(doc(db, 'users', userId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
  }

  const filtered = users.filter((u) => u.id !== userId);
  safeStorage.setJson(STORAGE_KEYS.USERS, filtered);
  ctx.notify();
  return true;
}

export async function updateMyNotificationPreferences(
  prefs: NotificationPreferences,
  ctx: UsersDomainContext
): Promise<boolean> {
  assertFirestoreWriteAvailable();
  const activeUser = ctx.getCurrentUser();
  if (!activeUser) return false;

  const normalizedPrefs = normalizeNotificationPreferences(prefs);
  const updatedAt = new Date().toISOString();
  const updatedUser: UserProfile = stripUndefined({
    ...activeUser,
    notificationPreferences: normalizedPrefs,
    updatedAt
  });

  try {
    await updateDoc(doc(db, 'users', activeUser.id), {
      notificationPreferences: normalizedPrefs,
      updatedAt
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${activeUser.id}`);
  }

  upsertLocalUser(updatedUser);
  ctx.setCurrentUser(updatedUser);
  ctx.notify();
  return true;
}
