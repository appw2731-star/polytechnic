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
import { ApiError, apiClient, getStoredToken, setStoredToken } from '../services/apiClient';
import { isSupabaseConfigured, isSupabaseMissingRelationError, supabase } from './supabaseClient';
import type { AuthUser, LanguageMode } from '../types/study';

export const FIREBASE_WEB_CONFIG = FIREBASE_RUNTIME_CONFIG;
export const isFirebaseAuthConfigured = isFirebaseConfigured;

const GOOGLE_REDIRECT_STORAGE_KEY = 'polytechnic_google_redirect_ctx_v1';
const CACHED_AUTH_USER_KEY = 'polytechnic_hub_cached_user_v1';
const REDIRECT_PENDING_TTL_MS = 10 * 60 * 1000;
const EXPIRY_CLOCK_SKEW_MS = 5000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface GoogleSignInContext {
  fullName?: string;
  department?: string;
  semester?: number;
  collegeName?: string;
  rollNumber?: string;
}

interface StoredRedirectPayload {
  startedAt: number;
  context?: GoogleSignInContext;
}

export interface ParsedAuthToken {
  valid: boolean;
  expired: boolean;
  sub?: string;
  role?: string;
  expMs?: number;
  kind: 'app' | 'jwt' | 'invalid';
}

export interface SessionValidationResult {
  status: 'valid' | 'missing' | 'invalid' | 'offline';
  user?: AuthUser;
  token?: string;
}

export interface CanonicalFirebaseMapping {
  firebaseUid: string;
  canonicalProfileId: string;
  email: string;
  fullName: string;
  avatarUrl: string;
  department?: string;
  semester?: number;
  collegeName?: string;
  rollNumber?: string;
}

export interface FirebaseProfileSyncResult {
  token: string;
  user: AuthUser;
  firebaseUid: string;
  canonicalProfileId: string;
  idToken: string;
}

export interface FirebaseSignInOutcome {
  redirected: boolean;
  idToken?: string;
  user?: User;
  syncedUser?: AuthUser;
  token?: string;
}

export interface ConsumedGoogleRedirectResult {
  idToken: string;
  user: User;
  syncedUser: AuthUser;
  token: string;
  context?: GoogleSignInContext;
}

export interface SupabaseProfileVerificationResult {
  exists: boolean;
  created: boolean;
  syncedToSupabase: boolean;
  user: AuthUser;
}

// ============================================================================
// CORE FIREBASE INSTANCE & TOKEN VALIDATION HELPERS
// ============================================================================

export function getFirebaseAuthInstance(): Auth | null {
  if (!isFirebaseAuthConfigured || typeof window === 'undefined') {
    return null;
  }
  return firebaseAuth;
}

export function getCurrentFirebaseUser(): User | null {
  const auth = getFirebaseAuthInstance();
  return auth?.currentUser ?? null;
}

export async function getFreshFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const user = getCurrentFirebaseUser();
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

function decodeBase64UrlJson(segment: string): Record<string, unknown> | null {
  if (!segment || typeof segment !== 'string') return null;
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + '='.repeat(padLen);
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const jsonText = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(jsonText) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Parses and validates both 2-part app HMAC tokens (`<payload>.<sig>`) and
 * 3-part standard JWTs (`<header>.<payload>.<sig>`). Checks payload shape,
 * non-empty `sub`, and expiration (`exp`) before allowing initial auth state.
 */
export function parseStoredAuthToken(token: string | null | undefined): ParsedAuthToken {
  if (!token || typeof token !== 'string') {
    return { valid: false, expired: false, kind: 'invalid' };
  }
  const trimmed = token.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
    return { valid: false, expired: false, kind: 'invalid' };
  }

  const parts = trimmed.split('.');
  let payload: Record<string, unknown> | null = null;
  let kind: 'app' | 'jwt' | 'invalid' = 'invalid';

  if (parts.length === 2 && parts[0] && parts[1]) {
    payload = decodeBase64UrlJson(parts[0]);
    kind = 'app';
  } else if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    const header = decodeBase64UrlJson(parts[0]);
    if (!header || typeof header.alg !== 'string') {
      return { valid: false, expired: false, kind: 'invalid' };
    }
    payload = decodeBase64UrlJson(parts[1]);
    kind = 'jwt';
  } else {
    return { valid: false, expired: false, kind: 'invalid' };
  }

  if (!payload) {
    return { valid: false, expired: false, kind: 'invalid' };
  }

  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  const rawExp = typeof payload.exp === 'number' ? payload.exp : Number(payload.exp);
  if (!sub || !Number.isFinite(rawExp) || rawExp <= 0) {
    return { valid: false, expired: false, kind: 'invalid' };
  }

  const expMs = rawExp < 1e12 ? rawExp * 1000 : rawExp;
  const expired = expMs <= Date.now() + EXPIRY_CLOCK_SKEW_MS;
  const role = typeof payload.role === 'string' ? payload.role : undefined;

  return {
    valid: !expired,
    expired,
    sub,
    role,
    expMs,
    kind,
  };
}

export function isStoredTokenStructurallyValid(token: string | null | undefined): boolean {
  const parsed = parseStoredAuthToken(token);
  return parsed.valid && !parsed.expired;
}

export function getCachedAuthUser(expectedSub?: string): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHED_AUTH_USER_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as AuthUser;
    if (!user || typeof user.id !== 'string' || !user.id) return null;
    if (expectedSub && user.id !== expectedSub) return null;
    return user;
  } catch {
    return null;
  }
}

export function setCachedAuthUser(user: AuthUser | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (user && user.id) {
      window.localStorage.setItem(CACHED_AUTH_USER_KEY, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(CACHED_AUTH_USER_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

/**
 * Validates `getStoredToken()` structurally and against `/api/auth/me` before
 * setting authenticated state across browser refreshes. Clears malformed, expired,
 * or 401/403-rejected tokens while preserving valid unexpired offline sessions.
 */
export async function validateStoredSessionToken(): Promise<SessionValidationResult> {
  const token = getStoredToken();
  if (!token) {
    setCachedAuthUser(null);
    return { status: 'missing' };
  }

  const parsed = parseStoredAuthToken(token);
  if (!parsed.valid || parsed.expired) {
    setStoredToken(null);
    setCachedAuthUser(null);
    return { status: 'invalid' };
  }

  try {
    const me = await apiClient.getMe();
    setCachedAuthUser(me.user);
    return {
      status: 'valid',
      user: me.user,
      token,
    };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      setStoredToken(null);
      setCachedAuthUser(null);
      return { status: 'invalid' };
    }

    const cached = getCachedAuthUser(parsed.sub);
    if (cached) {
      return {
        status: 'offline',
        user: cached,
        token,
      };
    }
    return { status: 'offline', token };
  }
}

// ============================================================================
// ENVIRONMENT DETECTION & PENDING REDIRECT CONTEXT
// ============================================================================

export function isCrossOriginIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function isMobileBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const uaMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|SamsungBrowser|Mobile/i.test(ua);
  const coarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return uaMobile || (coarsePointer && window.innerWidth <= 900);
}

export function isStandaloneOrMobileInAppBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const isNativeCapacitor = Boolean(
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
      ?.isNativePlatform?.()
  );
  const ua = navigator.userAgent || '';
  const isEmbeddedWebView = /\bwv\b|FBAN|FBAV|Instagram|Line\/|MicroMessenger|TikTok/i.test(ua);
  return isStandalone || isNativeCapacitor || isEmbeddedWebView;
}

export function shouldPreferGoogleRedirect(): boolean {
  if (typeof window === 'undefined') return false;
  if (isStandaloneOrMobileInAppBrowser()) {
    return true;
  }
  if (isMobileBrowser() && !isCrossOriginIframe()) {
    return true;
  }
  return false;
}

function savePendingGoogleRedirect(context?: GoogleSignInContext): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: StoredRedirectPayload = {
      startedAt: Date.now(),
      context,
    };
    window.sessionStorage.setItem(GOOGLE_REDIRECT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage restriction errors
  }
}

function readPendingGoogleRedirect(): StoredRedirectPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(GOOGLE_REDIRECT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredRedirectPayload;
    if (!parsed || typeof parsed.startedAt !== 'number') {
      window.sessionStorage.removeItem(GOOGLE_REDIRECT_STORAGE_KEY);
      return null;
    }
    if (Date.now() - parsed.startedAt > REDIRECT_PENDING_TTL_MS) {
      window.sessionStorage.removeItem(GOOGLE_REDIRECT_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearPendingGoogleRedirect(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(GOOGLE_REDIRECT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function buildGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

function isPopupFallbackErrorCode(code: string): boolean {
  return (
    code === 'auth/popup-blocked' ||
    code === 'auth/operation-not-supported-in-this-environment' ||
    code === 'auth/cancelled-popup-request' ||
    code === 'auth/internal-error'
  );
}

// ============================================================================
// UNIFIED FIREBASE UID -> CANONICAL SUPABASE PROFILE MAPPING
// ============================================================================

/**
 * Derives the exact deterministic UUID v5-shaped identifier used on the backend
 * (`deterministicUuidFromFirebaseUid`) so a Firebase UID maps 1:1 to a canonical
 * `profiles.id` UUID in Supabase across devices and login flows.
 */
export async function deriveProfileUuidFromFirebaseUid(uid: string): Promise<string> {
  const input = new TextEncoder().encode(`polytechnic-hub-firebase:${uid}`);
  const digest = await crypto.subtle.digest('SHA-256', input);
  const bytes = Array.from(new Uint8Array(digest));
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  const p1 = hex.slice(0, 8);
  const p2 = hex.slice(8, 12);
  const p3 = `5${hex.slice(13, 16)}`;
  const variantNibble = ['8', '9', 'a', 'b'][parseInt(hex[16], 16) % 4];
  const p4 = `${variantNibble}${hex.slice(17, 20)}`;
  const p5 = hex.slice(20, 32);
  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

export async function resolveCanonicalFirebaseMapping(
  fbUser: User,
  context?: GoogleSignInContext
): Promise<CanonicalFirebaseMapping> {
  const canonicalProfileId = await deriveProfileUuidFromFirebaseUid(fbUser.uid);
  const email = (fbUser.email || '').trim().toLowerCase();
  const fullName =
    context?.fullName?.trim() ||
    fbUser.displayName?.trim() ||
    (email ? email.split('@')[0] : 'Student');
  return {
    firebaseUid: fbUser.uid,
    canonicalProfileId,
    email,
    fullName,
    avatarUrl: fbUser.photoURL?.trim() || '',
    department: context?.department?.trim() || undefined,
    semester: context?.semester,
    collegeName: context?.collegeName?.trim() || undefined,
    rollNumber: context?.rollNumber?.trim() || undefined,
  };
}

/**
 * Checks directly against Supabase `profiles` whether a profile row exists for
 * the hydrated user (matching canonical `id`, `firebase_uid`, or `email`).
 * Returns `null` when Supabase is unconfigured or unreachable so callers can
 * delegate safely to the server-side ensure-profile endpoint.
 */
export async function verifySupabaseProfileExists(
  user: AuthUser
): Promise<{ found: boolean; row?: Record<string, unknown> } | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  try {
    // 1. Check by canonical UUID `id` when valid
    if (user.id && UUID_REGEX.test(user.id)) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, firebase_uid, full_name, email, department, semester, college_name, avatar_url, bio, role')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        if (isSupabaseMissingRelationError(error)) return null;
      } else if (data) {
        return { found: true, row: data as Record<string, unknown> };
      }
    }

    // 2. Check by mapped `firebase_uid` if present
    if (user.firebaseUid) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, firebase_uid, full_name, email, department, semester, college_name, avatar_url, bio, role')
        .eq('firebase_uid', user.firebaseUid)
        .maybeSingle();

      if (!error && data) {
        return { found: true, row: data as Record<string, unknown> };
      }
    }

    // 3. Fallback lookup by email
    if (user.email) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, firebase_uid, full_name, email, department, semester, college_name, avatar_url, bio, role')
        .ilike('email', user.email.trim())
        .maybeSingle();

      if (!error && data) {
        return { found: true, row: data as Record<string, unknown> };
      }
    }

    return { found: false };
  } catch {
    return null;
  }
}

/**
 * Creates a missing student profile row in Supabase (directly when an active
 * Supabase session is present, and authoritatively via `/api/auth/ensure-profile`
 * using the server's service-role key so Firebase-authenticated and built-in
 * accounts are always provisioned cleanly).
 */
export async function createMissingSupabaseProfile(
  user: AuthUser,
  defaults?: GoogleSignInContext
): Promise<SupabaseProfileVerificationResult> {
  const canonicalId =
    user.id && UUID_REGEX.test(user.id)
      ? user.id
      : user.firebaseUid
        ? await deriveProfileUuidFromFirebaseUid(user.firebaseUid)
        : user.id;

  const mergedUser: AuthUser = {
    ...user,
    id: canonicalId || user.id,
    fullName: user.fullName?.trim() || defaults?.fullName?.trim() || user.email?.split('@')[0] || 'Student',
    department: user.department || defaults?.department || 'power',
    semester: user.semester || defaults?.semester || 4,
    collegeName: user.collegeName || user.instituteName || defaults?.collegeName || '',
    instituteName: user.instituteName || user.collegeName || defaults?.collegeName || '',
    rollNumber: user.rollNumber || defaults?.rollNumber || '',
  };

  let createdDirectly = false;
  if (isSupabaseConfigured && supabase && UUID_REGEX.test(mergedUser.id)) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        const now = new Date().toISOString();
        const { error } = await supabase.from('profiles').upsert(
          {
            id: mergedUser.id,
            firebase_uid: mergedUser.firebaseUid ?? null,
            full_name: mergedUser.fullName,
            email: mergedUser.email,
            department: mergedUser.department,
            semester: mergedUser.semester,
            college_name: mergedUser.collegeName,
            institute_name: mergedUser.instituteName,
            roll_number: mergedUser.rollNumber,
            avatar_url: mergedUser.avatarUrl,
            role: mergedUser.role,
            updated_at: now,
          },
          { onConflict: 'id' }
        );
        if (!error) {
          createdDirectly = true;
        }
      }
    } catch {
      // Service-role backend endpoint below handles authoritative creation
    }
  }

  try {
    const serverRes = await apiClient.ensureProfile({
      fullName: mergedUser.fullName,
      department: mergedUser.department,
      semester: mergedUser.semester,
      collegeName: mergedUser.collegeName || undefined,
      rollNumber: mergedUser.rollNumber || undefined,
    });
    const canonical = serverRes.user;
    setCachedAuthUser(canonical);
    return {
      exists: serverRes.exists || createdDirectly,
      created: serverRes.created || createdDirectly,
      syncedToSupabase: serverRes.syncedToSupabase || createdDirectly,
      user: canonical,
    };
  } catch {
    return {
      exists: createdDirectly,
      created: createdDirectly,
      syncedToSupabase: createdDirectly,
      user: mergedUser,
    };
  }
}

/**
 * Verifies the hydrated user's profile existence in Supabase and triggers
 * `createMissingSupabaseProfile` automatically if the profile row is missing.
 */
export async function ensureSupabaseProfileExists(
  user: AuthUser,
  defaults?: GoogleSignInContext
): Promise<SupabaseProfileVerificationResult> {
  const check = await verifySupabaseProfileExists(user);
  if (check?.found) {
    const row = check.row ?? {};
    const reconciled: AuthUser = {
      ...user,
      fullName: String(row.full_name || user.fullName),
      department: String(row.department || user.department || 'power'),
      semester: Number(row.semester || user.semester || 4),
      collegeName: String(row.college_name || user.collegeName || ''),
      avatarUrl: String(row.avatar_url || user.avatarUrl || ''),
      bio: String(row.bio || user.bio || ''),
      firebaseUid: String(row.firebase_uid || user.firebaseUid || '') || undefined,
    };

    // If user has a firebaseUid that isn't yet linked on the Supabase row, trigger server link
    if (user.firebaseUid && !row.firebase_uid) {
      return createMissingSupabaseProfile(reconciled, defaults);
    }

    setCachedAuthUser(reconciled);
    return {
      exists: true,
      created: false,
      syncedToSupabase: true,
      user: reconciled,
    };
  }

  // Profile missing in Supabase (or anon RLS prevented direct read): invoke creation/ensure pipeline
  return createMissingSupabaseProfile(user, defaults);
}

/**
 * Unified completion pipeline for all Firebase auth paths (Google Popup,
 * Google Redirect, Email/Password, and refresh session reconciliation).
 * Deterministically maps Firebase UID -> canonical Supabase `profiles` UUID,
 * exchanges the Firebase ID token for a validated session token, and guarantees
 * profile existence in Supabase.
 */
export async function syncFirebaseUserToSupabaseProfile(
  fbUser: User,
  context?: GoogleSignInContext
): Promise<FirebaseProfileSyncResult> {
  const [idToken, mapping] = await Promise.all([
    fbUser.getIdToken(true),
    resolveCanonicalFirebaseMapping(fbUser, context),
  ]);

  const synced = await apiClient.firebaseSync({
    idToken,
    fullName: mapping.fullName,
    department: mapping.department,
    semester: mapping.semester,
    collegeName: mapping.collegeName,
    rollNumber: mapping.rollNumber,
  });

  if (!isStoredTokenStructurallyValid(synced.token)) {
    throw new Error('Server issued an invalid or expired session token.');
  }

  const canonicalUser: AuthUser = {
    ...synced.user,
    id: synced.user.id || mapping.canonicalProfileId,
    firebaseUid: synced.user.firebaseUid || mapping.firebaseUid,
  };

  setStoredToken(synced.token);
  setCachedAuthUser(canonicalUser);

  // Best-effort client-side Supabase profile reconciliation when an active Supabase session exists
  if (isSupabaseConfigured && supabase && UUID_REGEX.test(canonicalUser.id)) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        await supabase.from('profiles').upsert(
          {
            id: canonicalUser.id,
            firebase_uid: mapping.firebaseUid,
            full_name: canonicalUser.fullName,
            email: canonicalUser.email,
            avatar_url: canonicalUser.avatarUrl,
            department: canonicalUser.department,
            semester: canonicalUser.semester,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
      }
    } catch {
      // Authoritative service-role upsert already ran inside /api/auth/firebase-sync
    }
  }

  return {
    token: synced.token,
    user: canonicalUser,
    firebaseUid: mapping.firebaseUid,
    canonicalProfileId: canonicalUser.id,
    idToken,
  };
}

// ============================================================================
// UNIFIED GOOGLE POPUP / REDIRECT & SESSION RECONCILIATION FLOWS
// ============================================================================

async function startGoogleRedirectFlow(
  auth: Auth,
  provider: GoogleAuthProvider,
  context?: GoogleSignInContext
): Promise<FirebaseSignInOutcome> {
  savePendingGoogleRedirect(context);
  await signInWithRedirect(auth, provider);
  return { redirected: true };
}

export async function signInWithGoogleUnified(
  context?: GoogleSignInContext
): Promise<FirebaseSignInOutcome> {
  const auth = getFirebaseAuthInstance();
  if (!auth) {
    throw new Error(
      'Firebase Authentication is not configured. Check firebase-applet-config.json or VITE_FIREBASE_* environment variables.'
    );
  }

  await setPersistence(auth, browserLocalPersistence).catch(() => {});
  const provider = buildGoogleProvider();

  if (shouldPreferGoogleRedirect()) {
    return startGoogleRedirectFlow(auth, provider, context);
  }

  try {
    const cred = await signInWithPopup(auth, provider);
    clearPendingGoogleRedirect();
    const synced = await syncFirebaseUserToSupabaseProfile(cred.user, context);
    return {
      redirected: false,
      idToken: synced.idToken,
      user: cred.user,
      syncedUser: synced.user,
      token: synced.token,
    };
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : '';
    if (isPopupFallbackErrorCode(code)) {
      return startGoogleRedirectFlow(auth, provider, context);
    }
    throw err;
  }
}

export async function consumeGoogleRedirectResult(): Promise<ConsumedGoogleRedirectResult | null> {
  const auth = getFirebaseAuthInstance();
  if (!auth) return null;

  await setPersistence(auth, browserLocalPersistence).catch(() => {});
  const pending = readPendingGoogleRedirect();

  let redirectUser: User | null = null;
  try {
    const result = await getRedirectResult(auth);
    redirectUser = result?.user ?? null;
  } catch (err) {
    clearPendingGoogleRedirect();
    throw err;
  }

  // Mobile browsers with ITP / third-party cookie partitioning may resolve getRedirectResult()
  // to null while still hydrating auth.currentUser once authStateReady() settles.
  if (!redirectUser && pending) {
    if (typeof auth.authStateReady === 'function') {
      await auth.authStateReady().catch(() => {});
    }
    if (auth.currentUser) {
      redirectUser = auth.currentUser;
    }
  }

  if (!redirectUser) {
    if (pending) {
      clearPendingGoogleRedirect();
    }
    return null;
  }

  clearPendingGoogleRedirect();
  const synced = await syncFirebaseUserToSupabaseProfile(redirectUser, pending?.context);
  return {
    idToken: synced.idToken,
    user: redirectUser,
    syncedUser: synced.user,
    token: synced.token,
    context: pending?.context,
  };
}

/**
 * Waits for Firebase Auth persistence to settle after a browser refresh and, if
 * an active Firebase user exists, runs the unified UID -> Supabase sync pipeline.
 */
export async function reconcileFirebaseSession(): Promise<FirebaseProfileSyncResult | null> {
  const auth = getFirebaseAuthInstance();
  if (!auth) return null;

  await setPersistence(auth, browserLocalPersistence).catch(() => {});
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady().catch(() => {});
  }

  const fbUser = auth.currentUser;
  if (!fbUser) return null;

  try {
    return await syncFirebaseUserToSupabaseProfile(fbUser);
  } catch {
    return null;
  }
}

// ============================================================================
// EMAIL / PASSWORD, RESET, SIGN OUT & ERROR FORMATTING
// ============================================================================

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
    case 'auth/redirect-cancelled-by-user':
      return language === 'en'
        ? 'Google sign-in was cancelled before completing login.'
        : 'Google সাইন-ইন সম্পন্ন হওয়ার আগেই বাতিল করা হয়েছে।';
    case 'auth/cancelled-popup-request':
      return language === 'en'
        ? 'Another sign-in window was already open. Retrying sign-in...'
        : 'আরেকটি সাইন-ইন পপ-আপ খোলা ছিল। পুনরায় চেষ্টা করুন...';
    case 'auth/account-exists-with-different-credential':
      return language === 'en'
        ? 'An account already exists with the same email using another sign-in method.'
        : 'এই ইমেইল দিয়ে অন্য লগইন পদ্ধতিতে ইতিমধ্যেই অ্যাকাউন্ট রয়েছে।';
    case 'auth/user-disabled':
      return language === 'en'
        ? 'This account has been disabled. Please contact support.'
        : 'এই অ্যাকাউন্টটি নিষ্ক্রিয় করা হয়েছে।';
    case 'auth/too-many-requests':
      return language === 'en'
        ? 'Too many attempts. Please wait a moment and try again.'
        : 'অতিরিক্ত চেষ্টার কারণে সাময়িকভাবে ব্লক হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।';
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
  clearPendingGoogleRedirect();
  setStoredToken(null);
  setCachedAuthUser(null);
  const auth = getFirebaseAuthInstance();
  if (!auth) return;
  await signOut(auth);
}

export function subscribeFirebaseAuth(callback: (user: User | null) => void): () => void {
  const auth = getFirebaseAuthInstance();
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
}
