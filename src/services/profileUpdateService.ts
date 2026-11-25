import { auth as firebaseAuth } from '../firebase';
import { setCachedAuthUser } from '../lib/firebaseAuth';
import {
  isSupabaseConfigured,
  isSupabaseMissingRelationError,
  mapSupabaseProfileToAuthUser,
  supabase,
} from '../lib/supabaseClient';
import type { AuthUser, SemesterNumber } from '../types/study';
import { apiClient, getStoredToken } from './apiClient';
import { isVerifiedFirebaseSession, syncUserProfileToFirestore } from './firestoreService';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface HeroProfileUpdatePayload {
  fullName?: string;
  avatarUrl?: string;
  coverUrl?: string;
  collegeName?: string;
  instituteName?: string;
  department?: string;
  semester?: SemesterNumber;
  rollNumber?: string;
  bio?: string;
  gender?: '' | 'male' | 'female';
  showGender?: boolean;
  profileVisibility?: 'public' | 'department' | 'private';
}

export interface ProfileUpdateResult {
  user?: AuthUser;
  syncedToBackend: boolean;
  syncedToSupabase?: boolean;
  syncedToFirestore?: boolean;
  error?: string;
}

interface SanitizedProfilePayload {
  fullName?: string;
  avatarUrl?: string;
  coverUrl?: string;
  collegeName?: string;
  instituteName?: string;
  department?: string;
  semester?: number;
  rollNumber?: string;
  bio?: string;
  gender?: '' | 'male' | 'female';
  showGender?: boolean;
  profileVisibility?: 'public' | 'department' | 'private';
}

function isSupabaseUnknownColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  const msg = (err.message ?? '').toLowerCase();
  return (
    err.code === 'PGRST204' ||
    err.code === '42703' ||
    (msg.includes('column') && (msg.includes('does not exist') || msg.includes('schema cache')))
  );
}

function mergeUpdatedAuthUser(
  base: AuthUser | null | undefined,
  committed: Partial<AuthUser> | null | undefined,
  cleanPayload: SanitizedProfilePayload
): AuthUser | undefined {
  const seed = committed?.id ? committed : base;
  if (!seed || !seed.id) return undefined;

  const now = new Date().toISOString();
  const resolvedCollege =
    cleanPayload.collegeName !== undefined
      ? cleanPayload.collegeName
      : committed?.collegeName ??
        committed?.instituteName ??
        base?.collegeName ??
        base?.instituteName ??
        '';

  return {
    id: committed?.id || base?.id || seed.id,
    firebaseUid: committed?.firebaseUid ?? base?.firebaseUid,
    authProvider: committed?.authProvider ?? base?.authProvider,
    fullName:
      cleanPayload.fullName ??
      committed?.fullName ??
      base?.fullName ??
      'Student',
    email: committed?.email || base?.email || '',
    role: committed?.role || base?.role || 'student',
    avatarUrl:
      cleanPayload.avatarUrl !== undefined
        ? cleanPayload.avatarUrl
        : committed?.avatarUrl ?? base?.avatarUrl ?? '',
    coverUrl:
      cleanPayload.coverUrl !== undefined
        ? cleanPayload.coverUrl
        : committed?.coverUrl ?? base?.coverUrl ?? '',
    gender:
      cleanPayload.gender !== undefined
        ? cleanPayload.gender
        : committed?.gender ?? base?.gender ?? '',
    showGender:
      cleanPayload.showGender !== undefined
        ? cleanPayload.showGender
        : committed?.showGender ?? base?.showGender ?? false,
    bio:
      cleanPayload.bio !== undefined
        ? cleanPayload.bio
        : committed?.bio ?? base?.bio ?? '',
    department:
      cleanPayload.department ??
      committed?.department ??
      base?.department ??
      'power',
    semester:
      cleanPayload.semester ??
      committed?.semester ??
      base?.semester ??
      4,
    collegeName: resolvedCollege,
    instituteName: resolvedCollege,
    rollNumber:
      cleanPayload.rollNumber !== undefined
        ? cleanPayload.rollNumber
        : committed?.rollNumber ?? base?.rollNumber ?? '',
    profileVisibility:
      cleanPayload.profileVisibility ??
      committed?.profileVisibility ??
      base?.profileVisibility ??
      'public',
    createdAt: committed?.createdAt || base?.createdAt || now,
    updatedAt: committed?.updatedAt || now,
  };
}

/**
 * Commits profile edits directly to the Supabase `profiles` table when a
 * Supabase client + authenticated Supabase session is active. Falls back cleanly
 * to core columns if an older migration lacks optional columns.
 */
async function commitProfileToSupabaseDirect(
  cleanPayload: SanitizedProfilePayload,
  currentUser?: AuthUser | null
): Promise<{ user?: AuthUser; committed: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { committed: false };
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionUser = sessionData.session?.user ?? null;
    const targetId =
      sessionUser?.id ||
      (currentUser?.id && UUID_REGEX.test(currentUser.id) ? currentUser.id : '');

    if (!sessionUser || !targetId) {
      return { committed: false };
    }

    const now = new Date().toISOString();
    const fullUpdateRow: Record<string, unknown> = { updated_at: now };
    const coreUpdateRow: Record<string, unknown> = { updated_at: now };

    if (cleanPayload.fullName !== undefined) {
      fullUpdateRow.full_name = cleanPayload.fullName;
      coreUpdateRow.full_name = cleanPayload.fullName;
    }
    if (cleanPayload.department !== undefined) {
      fullUpdateRow.department = cleanPayload.department;
      coreUpdateRow.department = cleanPayload.department;
    }
    if (cleanPayload.semester !== undefined) {
      fullUpdateRow.semester = cleanPayload.semester;
      coreUpdateRow.semester = cleanPayload.semester;
    }
    if (cleanPayload.collegeName !== undefined) {
      fullUpdateRow.college_name = cleanPayload.collegeName;
      fullUpdateRow.institute_name = cleanPayload.collegeName;
      coreUpdateRow.college_name = cleanPayload.collegeName;
    }
    if (cleanPayload.avatarUrl !== undefined) {
      fullUpdateRow.avatar_url = cleanPayload.avatarUrl;
      coreUpdateRow.avatar_url = cleanPayload.avatarUrl;
    }
    if (cleanPayload.rollNumber !== undefined) {
      fullUpdateRow.roll_number = cleanPayload.rollNumber;
    }
    if (cleanPayload.bio !== undefined) {
      fullUpdateRow.bio = cleanPayload.bio;
    }
    if (cleanPayload.gender !== undefined) {
      fullUpdateRow.gender = cleanPayload.gender;
    }
    if (cleanPayload.showGender !== undefined) {
      fullUpdateRow.show_gender = cleanPayload.showGender;
    }
    if (cleanPayload.profileVisibility !== undefined) {
      fullUpdateRow.profile_visibility = cleanPayload.profileVisibility;
    }

    // 1. Update existing row in `public.profiles`
    let { data, error } = await supabase
      .from('profiles')
      .update(fullUpdateRow)
      .eq('id', targetId)
      .select('*')
      .maybeSingle();

    if (error && isSupabaseUnknownColumnError(error)) {
      const retry = await supabase
        .from('profiles')
        .update(coreUpdateRow)
        .eq('id', targetId)
        .select('*')
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      if (isSupabaseMissingRelationError(error)) {
        return { committed: false };
      }
      return { committed: false, error: error.message };
    }

    // 2. If no profile row existed yet for this auth user, insert/upsert it
    if (!data) {
      const resolvedEmail = (
        currentUser?.email ||
        sessionUser.email ||
        ''
      )
        .trim()
        .toLowerCase();
      const upsertFull: Record<string, unknown> = {
        id: targetId,
        email: resolvedEmail,
        full_name:
          cleanPayload.fullName ||
          currentUser?.fullName ||
          (resolvedEmail ? resolvedEmail.split('@')[0] : 'Student'),
        department: cleanPayload.department || currentUser?.department || 'power',
        semester: cleanPayload.semester || currentUser?.semester || 4,
        college_name:
          cleanPayload.collegeName ??
          currentUser?.collegeName ??
          currentUser?.instituteName ??
          '',
        institute_name:
          cleanPayload.collegeName ??
          currentUser?.instituteName ??
          currentUser?.collegeName ??
          '',
        avatar_url:
          cleanPayload.avatarUrl ?? currentUser?.avatarUrl ?? '',
        roll_number:
          cleanPayload.rollNumber ?? currentUser?.rollNumber ?? '',
        bio: cleanPayload.bio ?? currentUser?.bio ?? '',
        updated_at: now,
      };

      const upsertRes = await supabase
        .from('profiles')
        .upsert(upsertFull, { onConflict: 'id' })
        .select('*')
        .maybeSingle();

      if (upsertRes.error && isSupabaseUnknownColumnError(upsertRes.error)) {
        const upsertCore = {
          id: targetId,
          email: resolvedEmail,
          full_name: upsertFull.full_name,
          department: upsertFull.department,
          semester: upsertFull.semester,
          college_name: upsertFull.college_name,
          avatar_url: upsertFull.avatar_url,
          updated_at: now,
        };
        const retryUpsert = await supabase
          .from('profiles')
          .upsert(upsertCore, { onConflict: 'id' })
          .select('*')
          .maybeSingle();
        data = retryUpsert.data;
        error = retryUpsert.error;
      } else {
        data = upsertRes.data;
        error = upsertRes.error;
      }

      if (error) {
        return { committed: false, error: error.message };
      }
    }

    if (data) {
      const mapped = mapSupabaseProfileToAuthUser(data as Record<string, unknown>, {
        id: targetId,
        email: sessionUser.email ?? currentUser?.email,
      });
      const merged = mergeUpdatedAuthUser(currentUser, mapped, cleanPayload);
      return { user: merged ?? mapped, committed: true };
    }

    return { committed: false };
  } catch (err) {
    return {
      committed: false,
      error: err instanceof Error ? err.message : 'Supabase profile update failed',
    };
  }
}

export class ProfileUpdateService {
  async updateHeroProfile(
    payload: HeroProfileUpdatePayload,
    isOnline: boolean,
    currentUser?: AuthUser | null
  ): Promise<ProfileUpdateResult> {
    const cleanPayload: SanitizedProfilePayload = {};

    if (typeof payload.fullName === 'string') {
      const trimmed = payload.fullName.trim();
      if (trimmed.length < 2) {
        return {
          syncedToBackend: false,
          syncedToSupabase: false,
          syncedToFirestore: false,
          error: 'নাম কমপক্ষে ২ অক্ষরের হতে হবে।',
        };
      }
      cleanPayload.fullName = trimmed.slice(0, 100);
    }

    const rawCollege =
      typeof payload.collegeName === 'string'
        ? payload.collegeName
        : typeof payload.instituteName === 'string'
          ? payload.instituteName
          : undefined;
    if (typeof rawCollege === 'string') {
      const trimmedCollege = rawCollege.trim().slice(0, 160);
      if (trimmedCollege.length < 2) {
        return {
          syncedToBackend: false,
          syncedToSupabase: false,
          syncedToFirestore: false,
          error: 'পলিটেকনিক ইনস্টিটিউটের সঠিক নাম নির্বাচন করুন বা লিখুন।',
        };
      }
      cleanPayload.collegeName = trimmedCollege;
      cleanPayload.instituteName = trimmedCollege;
    }

    if (typeof payload.department === 'string' && payload.department.trim()) {
      cleanPayload.department = payload.department.trim().slice(0, 60);
    }

    if (payload.semester !== undefined) {
      const sem = Math.min(8, Math.max(1, Math.trunc(Number(payload.semester) || 1)));
      cleanPayload.semester = sem;
    }

    if (typeof payload.avatarUrl === 'string') {
      cleanPayload.avatarUrl = payload.avatarUrl.trim();
    }

    if (typeof payload.coverUrl === 'string') {
      cleanPayload.coverUrl = payload.coverUrl.trim();
    }

    if (typeof payload.rollNumber === 'string') {
      cleanPayload.rollNumber = payload.rollNumber.trim().slice(0, 40);
    }

    if (typeof payload.bio === 'string') {
      cleanPayload.bio = payload.bio.trim().slice(0, 400);
    }

    if (payload.gender === '' || payload.gender === 'male' || payload.gender === 'female') {
      cleanPayload.gender = payload.gender;
    }

    if (typeof payload.showGender === 'boolean') {
      cleanPayload.showGender = payload.showGender;
    }

    if (
      payload.profileVisibility === 'public' ||
      payload.profileVisibility === 'department' ||
      payload.profileVisibility === 'private'
    ) {
      cleanPayload.profileVisibility = payload.profileVisibility;
    }

    if (Object.keys(cleanPayload).length === 0) {
      return {
        user: currentUser ?? undefined,
        syncedToBackend: false,
        syncedToSupabase: false,
        syncedToFirestore: false,
      };
    }

    // Detect any active authentication session (app JWT, Firebase Auth, or Supabase Auth)
    const hasLocalToken = Boolean(getStoredToken());
    const hasFirebaseUser = Boolean(firebaseAuth?.currentUser);
    let hasSupabaseSession = false;
    if (isSupabaseConfigured && supabase) {
      try {
        const { data } = await supabase.auth.getSession();
        hasSupabaseSession = Boolean(data.session?.user);
      } catch {
        hasSupabaseSession = false;
      }
    }

    const isAuthenticated = hasLocalToken || hasFirebaseUser || hasSupabaseSession || Boolean(currentUser?.id);

    if (!isOnline || !isAuthenticated) {
      const localMerged = currentUser
        ? mergeUpdatedAuthUser(currentUser, currentUser, cleanPayload)
        : undefined;
      if (localMerged) {
        setCachedAuthUser(localMerged);
      }
      return {
        user: localMerged,
        syncedToBackend: false,
        syncedToSupabase: false,
        syncedToFirestore: false,
      };
    }

    let backendUser: AuthUser | undefined;
    let syncedToBackend = false;
    let syncedToSupabase = false;
    let syncedToFirestore = false;
    let backendError: string | undefined;

    // 1. Commit via backend API (which persists to server store, Supabase `profiles` via service role, and Firestore)
    try {
      const res = await apiClient.updateProfile(cleanPayload);
      backendUser = res.user;
      syncedToBackend = true;
      syncedToSupabase = Boolean(res.syncedToSupabase);
    } catch (err) {
      backendError =
        err instanceof Error ? err.message : 'সার্ভারে প্রোফাইল আপডেট সংরক্ষণ করা যায়নি।';
    }

    // 2. Directly commit to Supabase `profiles` table if client has an active Supabase session
    //    and the backend did not already confirm a Supabase commit (covers static hosting & client-only Supabase keys)
    let supabaseUser: AuthUser | undefined;
    let supabaseError: string | undefined;
    if (isSupabaseConfigured && supabase && hasSupabaseSession && !syncedToSupabase) {
      const directRes = await commitProfileToSupabaseDirect(
        cleanPayload,
        backendUser ?? currentUser
      );
      if (directRes.committed) {
        syncedToSupabase = true;
        supabaseUser = directRes.user;
      } else if (directRes.error) {
        supabaseError = directRes.error;
      }
    }

    const committedUser = mergeUpdatedAuthUser(
      currentUser,
      supabaseUser ?? backendUser,
      cleanPayload
    );

    // 3. Mirror committed user to Cloud Firestore for verified Firebase accounts
    if (committedUser && isVerifiedFirebaseSession()) {
      try {
        await syncUserProfileToFirestore(committedUser);
        syncedToFirestore = true;
      } catch (err) {
        console.warn(
          'Firestore profile mirror notice:',
          err instanceof Error ? err.message : err
        );
      }
    }

    if (committedUser && (syncedToBackend || syncedToSupabase || syncedToFirestore)) {
      setCachedAuthUser(committedUser);
      return {
        user: committedUser,
        syncedToBackend: syncedToBackend || syncedToSupabase || syncedToFirestore,
        syncedToSupabase,
        syncedToFirestore,
      };
    }

    return {
      syncedToBackend: false,
      syncedToSupabase: false,
      syncedToFirestore: false,
      error: backendError || supabaseError || 'প্রোফাইল আপডেট সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।',
    };
  }
}

export const profileUpdateService = new ProfileUpdateService();
