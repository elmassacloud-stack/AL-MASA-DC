import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updateProfile,
  User,
  Auth
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  Firestore
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Primary Firebase Application
const primaryApp: FirebaseApp =
  getApps().find((a) => a.name === '[DEFAULT]') || initializeApp(firebaseConfig);

const firestoreDatabaseId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
export const auth: Auth = getAuth(primaryApp);
export const db: Firestore = firestoreDatabaseId
  ? getFirestore(primaryApp, firestoreDatabaseId)
  : getFirestore(primaryApp);

// Test Firestore connection at boot (required by Firebase integration guidelines)
async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('يرجى التحقق من اتصال الإنترنت وإعدادات Firebase.');
    }
  }
}
testFirestoreConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      cleaned[key] = val;
    }
  }
  return cleaned as T;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export async function sendResetPasswordEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export function subscribeToAuthState(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

/**
 * Creates a Firebase Auth user using a secondary Firebase App instance
 * so the currently logged-in Admin session is NOT interrupted or logged out.
 */
export async function createFirebaseUserByAdmin(
  email: string,
  password: string,
  displayName: string
): Promise<string> {
  const secondaryAppName = 'AdminUserCreator';
  const secondaryApp =
    getApps().find((a) => a.name === secondaryAppName) ||
    initializeApp(firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const cred = await createUserWithEmailAndPassword(
      secondaryAuth,
      email.trim().toLowerCase(),
      password
    );
    if (displayName.trim()) {
      await updateProfile(cred.user, { displayName: displayName.trim() });
    }
    return cred.user.uid;
  } finally {
    await signOut(secondaryAuth).catch(() => undefined);
  }
}

export function translateFirebaseAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code || '';
  const message = (error as { message?: string })?.message || '';

  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    message.includes('invalid-credential')
  ) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  }
  if (code === 'auth/invalid-email') {
    return 'صيغة البريد الإلكتروني غير صحيحة.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'هذا البريد الإلكتروني مسجل مسبقاً في نظام المصادقة.';
  }
  if (code === 'auth/weak-password') {
    return 'كلمة المرور ضعيفة جداً؛ يجب أن تتكون من 6 أحرف على الأقل.';
  }
  if (code === 'auth/too-many-requests') {
    return 'تم حظر المحاولات مؤقتاً لكثرة المحاولات الخاطئة. يرجى المحاولة بعد قليل.';
  }
  if (code === 'auth/user-disabled') {
    return 'تم تعطيل هذا الحساب. يرجى التواصل مع مسؤول النظام.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'تسجيل الدخول بالبريد وكلمة المرور غير مفعل حالياً في إعدادات Firebase Console.';
  }
  if (code === 'auth/network-request-failed') {
    return 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.';
  }
  return 'حدث خطأ أثناء المصادقة. يرجى التحقق من البيانات والمحاولة مجدداً.';
}
