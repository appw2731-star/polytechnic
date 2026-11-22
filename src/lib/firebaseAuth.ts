import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
import { auth as firebaseAuth, FIREBASE_RUNTIME_CONFIG, isFirebaseConfigured } from '../firebase';
import type { LanguageMode } from '../types/study';

export const FIREBASE_WEB_CONFIG = FIREBASE_RUNTIME_CONFIG;

export const isFirebaseAuthConfigured = isFirebaseConfigured;

export function getFirebaseAuthInstance(): Auth | null {
  if (!isFirebaseAuthConfigured || typeof window === 'undefined') {
    return null;
  }
  return firebaseAuth;
}

export function isStandaloneOrMobileInAppBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const ua = navigator.userAgent || '';
  const isEmbeddedWebView = /\bwv\b|FBAN|FBAV|Instagram|Line\//i.test(ua);
  return isStandalone || isEmbeddedWebView;
}

export function formatFirebaseAuthError(err: unknown, language: LanguageMode): string {
  const code =
    err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : '';
  const rawMessage = err instanceof Error ? err.message : String(err || '');

  switch (code) {
    case 'auth/unauthorized-domain': {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
      return language === 'en'
        ? `This domain (${host}) is not listed in Firebase Console -> Authentication -> Settings -> Authorized domains.`
        : `এই ডোমেইন (${host}) Firebase Console -> Authentication -> Settings -> Authorized domains তালিকায় যুক্ত নেই।`;
    }
    case 'auth/popup-blocked':
      return language === 'en'
        ? 'Popup was blocked by your browser. Redirecting to Google Sign-In...'
        : 'ব্রাউজার পপ-আপ ব্লক করেছে। রিডাইরেক্টের মাধ্যমে Google লগইন চালু হচ্ছে...';
    case 'auth/popup-closed-by-user':
      return language === 'en'
        ? 'Google sign-in popup was closed before completing login.'
        : 'Google সাইন-ইন সম্পন্ন হওয়ার আগেই পপ-আপ বন্ধ করা হয়েছে।';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return language === 'en'
        ? 'Invalid email or password.'
        : 'ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।';
    case 'auth/email-already-in-use':
      return language === 'en'
        ? 'An account with this email already exists. Try signing in or Continue with Google.'
        : 'এই ইমেইল দিয়ে ইতিমধ্যেই অ্যাকাউন্ট আছে। সাইন ইন অথবা Google দিয়ে লগইন চেষ্টা করুন।';
    case 'auth/weak-password':
      return language === 'en'
        ? 'Password should be at least 6 characters.'
        : 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।';
    case 'auth/network-request-failed':
      return language === 'en'
        ? 'Network connection failed. Please check your internet and retry.'
        : 'ইন্টারনেট সংযোগে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।';
    case 'auth/operation-not-allowed':
      return language === 'en'
        ? 'Google Sign-In is not enabled in Firebase Console -> Authentication -> Sign-in method.'
        : 'Firebase Console-এ Google Sign-In মেথড সক্রিয় করা নেই।';
    default:
      return rawMessage || (language === 'en' ? 'Authentication failed.' : 'লগইন প্রক্রিয়ায় ত্রুটি হয়েছে।');
  }
}

export interface FirebaseSignInOutcome {
  redirected?: boolean;
  idToken?: string;
  user?: User;
}

export async function signInWithGoogleUnified(): Promise<FirebaseSignInOutcome> {
  const auth = getFirebaseAuthInstance();
  if (!auth) {
    throw new Error(
      'Firebase Authentication is not configured. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_APP_ID in .env and add your domain to Firebase Authorized Domains.'
    );
  }

  await setPersistence(auth, browserLocalPersistence).catch(() => {});
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  provider.setCustomParameters({ prompt: 'select_account' });

  if (isStandaloneOrMobileInAppBrowser()) {
    await signInWithRedirect(auth, provider);
    return { redirected: true };
  }

  try {
    const cred = await signInWithPopup(auth, provider);
    const idToken = await cred.user.getIdToken(true);
    return { redirected: false, idToken, user: cred.user };
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : '';
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, provider);
      return { redirected: true };
    }
    throw err;
  }
}

export async function consumeGoogleRedirectResult(): Promise<{
  idToken: string;
  user: User;
} | null> {
  const auth = getFirebaseAuthInstance();
  if (!auth) return null;
  const result = await getRedirectResult(auth);
  if (!result?.user) return null;
  const idToken = await result.user.getIdToken(true);
  return { idToken, user: result.user };
}

export async function signInWithEmailFirebase(
  email: string,
  password: string
): Promise<{ idToken: string; user: User }> {
  const auth = getFirebaseAuthInstance();
  if (!auth) {
    throw new Error('Firebase Auth is not configured.');
  }
  await setPersistence(auth, browserLocalPersistence).catch(() => {});
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const idToken = await cred.user.getIdToken(true);
  return { idToken, user: cred.user };
}

export async function registerWithEmailFirebase(
  email: string,
  password: string,
  displayName: string
): Promise<{ idToken: string; user: User }> {
  const auth = getFirebaseAuthInstance();
  if (!auth) {
    throw new Error('Firebase Auth is not configured.');
  }
  await setPersistence(auth, browserLocalPersistence).catch(() => {});
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (displayName.trim()) {
    await updateProfile(cred.user, { displayName: displayName.trim() }).catch(() => {});
  }
  const idToken = await cred.user.getIdToken(true);
  return { idToken, user: cred.user };
}

export async function sendPasswordResetFirebase(email: string): Promise<void> {
  const auth = getFirebaseAuthInstance();
  if (!auth) {
    throw new Error('Firebase Auth is not configured.');
  }
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signOutFirebase(): Promise<void> {
  const auth = getFirebaseAuthInstance();
  if (!auth) return;
  await signOut(auth);
}

export function subscribeFirebaseAuth(callback: (user: User | null) => void): () => void {
  const auth = getFirebaseAuthInstance();
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
}
