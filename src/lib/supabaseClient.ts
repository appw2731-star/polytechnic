import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthUser, UserRole } from '../types/study';

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
export const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export async function getActiveAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export function isSupabaseMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  const msg = (err.message ?? '').toLowerCase();
  return (
    err.code === '42P01' ||
    err.code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('relation')
  );
}

export function mapSupabaseProfileToAuthUser(
  row: Record<string, unknown> | null,
  fallbackAuth?: {
    id: string;
    email?: string;
    created_at?: string;
    updated_at?: string;
    user_metadata?: Record<string, unknown>;
  }
): AuthUser {
  const meta = fallbackAuth?.user_metadata ?? {};
  const now = new Date().toISOString();
  const role: UserRole = row?.role === 'admin' ? 'admin' : 'student';
  const rawGender = row?.gender;
  const gender: '' | 'male' | 'female' =
    rawGender === 'male' || rawGender === 'female' ? rawGender : '';
  const rawVis = row?.profile_visibility;
  const profileVisibility: 'public' | 'department' | 'private' =
    rawVis === 'public' || rawVis === 'private' ? rawVis : 'department';

  return {
    id: String(row?.id || fallbackAuth?.id || ''),
    fullName: String(
      row?.full_name ||
        meta.full_name ||
        meta.name ||
        fallbackAuth?.email?.split('@')[0] ||
        'Student'
    ),
    email: String(row?.email || fallbackAuth?.email || ''),
    role,
    avatarUrl: String(row?.avatar_url || meta.avatar_url || ''),
    gender,
    showGender: Boolean(row?.show_gender),
    bio: String(row?.bio || ''),
    department: String(row?.department || meta.department || 'power'),
    semester: Math.min(8, Math.max(1, Number(row?.semester || meta.semester || 4))),
    collegeName: String(row?.college_name || row?.institute_name || meta.college_name || ''),
    instituteName: String(row?.institute_name || row?.college_name || ''),
    rollNumber: String(row?.roll_number || ''),
    profileVisibility,
    firebaseUid: row?.firebase_uid ? String(row.firebase_uid) : undefined,
    createdAt: String(row?.created_at || fallbackAuth?.created_at || now),
    updatedAt: String(row?.updated_at || fallbackAuth?.updated_at || now),
  };
}

export async function fetchSupabaseTable<T>(tableName: string, query = 'select=*'): Promise<T[]> {
  if (!isSupabaseConfigured) {
    return [];
  }
  const base = SUPABASE_URL.replace(/\/+$/, '');
  const token = await getActiveAccessToken();
  const res = await fetch(`${base}/rest/v1/${tableName}?${query}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase query error (${res.status})`);
  }
  return (await res.json()) as T[];
}
