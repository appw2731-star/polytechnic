import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence, type Auth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore, type Firestore } from 'firebase/firestore';
import firebaseAppletConfig from '../firebase-applet-config.json';

export const FIREBASE_RUNTIME_CONFIG = {
  apiKey:
    (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined)?.trim() ||
    firebaseAppletConfig.apiKey ||
    '',
  authDomain:
    (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined)?.trim() ||
    firebaseAppletConfig.authDomain ||
    '',
  projectId:
    (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined)?.trim() ||
    firebaseAppletConfig.projectId ||
    '',
  storageBucket:
    (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined)?.trim() ||
    firebaseAppletConfig.storageBucket ||
    '',
  messagingSenderId:
    (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined)?.trim() ||
    firebaseAppletConfig.messagingSenderId ||
    '',
  appId:
    (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined)?.trim() ||
    firebaseAppletConfig.appId ||
    '',
  firestoreDatabaseId: firebaseAppletConfig.firestoreDatabaseId || '(default)',
};

export const isFirebaseConfigured = Boolean(
  FIREBASE_RUNTIME_CONFIG.apiKey &&
    FIREBASE_RUNTIME_CONFIG.authDomain &&
    FIREBASE_RUNTIME_CONFIG.projectId &&
    FIREBASE_RUNTIME_CONFIG.appId
);

export const firebaseApp: FirebaseApp = getApps().length
  ? getApps()[0]
  : initializeApp({
      apiKey: FIREBASE_RUNTIME_CONFIG.apiKey,
      authDomain: FIREBASE_RUNTIME_CONFIG.authDomain,
      projectId: FIREBASE_RUNTIME_CONFIG.projectId,
      storageBucket: FIREBASE_RUNTIME_CONFIG.storageBucket,
      messagingSenderId: FIREBASE_RUNTIME_CONFIG.messagingSenderId,
      appId: FIREBASE_RUNTIME_CONFIG.appId,
    });

export const db: Firestore = getFirestore(
  firebaseApp,
  FIREBASE_RUNTIME_CONFIG.firestoreDatabaseId
);

export const auth: Auth = getAuth(firebaseApp);

if (typeof window !== 'undefined') {
  void setPersistence(auth, browserLocalPersistence).catch(() => {});
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

async function testConnection(): Promise<void> {
  if (typeof window === 'undefined' || !isFirebaseConfigured) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
