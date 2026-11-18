import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
} from 'firebase/auth';
import type { UserCredential } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const typedConfig = firebaseConfig as typeof firebaseConfig & { firestoreDatabaseId?: string };
const app = initializeApp(typedConfig);
export const firebaseApp = app;

export const db = typedConfig.firestoreDatabaseId
  ? getFirestore(app, typedConfig.firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/meetings.space.created',
];

export const googleProvider = new GoogleAuthProvider();
SCOPES.forEach((scope) => googleProvider.addScope(scope));
googleProvider.setCustomParameters({ prompt: 'select_account' });

const basicGoogleProvider = new GoogleAuthProvider();
basicGoogleProvider.setCustomParameters({ prompt: 'select_account' });

let cachedAccessToken: string | null = null;
let inFlightSignIn: Promise<UserCredential> | null = null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    cachedAccessToken = null;
  }
});

async function runSinglePopupSignIn(provider: GoogleAuthProvider): Promise<UserCredential> {
  if (inFlightSignIn) {
    return inFlightSignIn;
  }
  const promise = signInWithPopup(auth, provider).finally(() => {
    if (inFlightSignIn === promise) {
      inFlightSignIn = null;
    }
  });
  inFlightSignIn = promise;
  return promise;
}

export async function signInWithBasicGoogle(): Promise<UserCredential> {
  return runSinglePopupSignIn(basicGoogleProvider);
}

export async function signInWithGoogleForApp(): Promise<{
  credentialResult: UserCredential;
  accessToken: string | null;
}> {
  const result = await runSinglePopupSignIn(googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  cachedAccessToken = credential?.accessToken ?? null;
  return { credentialResult: result, accessToken: cachedAccessToken };
}

export const FIREBASE_PROJECT_ID = typedConfig.projectId;

export function formatAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const message = error instanceof Error ? error.message : String(error || '');

  if (code === 'auth/popup-closed-by-user' || message.includes('auth/popup-closed-by-user')) {
    return 'Sign-in window was closed before completing Google login. Please click again and finish signing in inside the popup (if popups are blocked in this preview, open the app in a new browser tab).';
  }
  if (code === 'auth/cancelled-popup-request' || message.includes('auth/cancelled-popup-request')) {
    return 'A Google sign-in window is already open. Please finish or close it and try once more.';
  }
  if (code === 'auth/popup-blocked' || message.includes('auth/popup-blocked')) {
    return 'Your browser blocked the Google sign-in popup. Please allow popups for this site or open the app in a new tab and try again.';
  }
  if (code === 'auth/network-request-failed' || message.includes('auth/network-request-failed')) {
    return 'Network error while connecting to Google Sign-In. Please check your connection and try again.';
  }
  if (code === 'auth/unauthorized-domain' || message.includes('auth/unauthorized-domain')) {
    const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
    return currentHost
      ? `Domain "${currentHost}" is not authorized in Firebase Authentication yet. Add it under Authentication → Settings → Authorized domains.`
      : 'This app domain is not authorized in Firebase Authentication. Add this domain under Authentication → Settings → Authorized domains.';
  }
  return message || 'Google Sign-In failed. Please try again.';
}

export function getInMemoryGoogleAccessToken(): string | null {
  return cachedAccessToken;
}

export function clearInMemoryGoogleAccessToken(): void {
  cachedAccessToken = null;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
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
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
