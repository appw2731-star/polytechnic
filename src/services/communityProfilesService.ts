import { isSupabaseConfigured, isSupabaseMissingRelationError, supabase } from '../lib/supabaseClient';
import { apiClient } from './apiClient';
import { CommunityPost, UserRole } from '../types/study';

export interface CommunityAuthorProfile {
  id: string;
  fullName: string;
  department: string;
  semester: number;
  collegeName: string;
  avatarUrl: string;
  bio: string;
  role: UserRole;
  source: 'supabase' | 'server' | 'post';
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface SupabaseProfileRow {
  id: string;
  full_name?: string | null;
  department?: string | null;
  semester?: number | null;
  college_name?: string | null;
  institute_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  role?: string | null;
  profile_visibility?: string | null;
}

function mapSupabaseRow(
  row: SupabaseProfileRow,
  viewerId?: string | null
): CommunityAuthorProfile {
  const isPrivate = row.profile_visibility === 'private' && viewerId !== row.id;
  return {
    id: String(row.id),
    fullName: String(row.full_name || 'Student').trim() || 'Student',
    department: String(row.department || 'power').trim() || 'power',
    semester: Math.min(8, Math.max(1, Number(row.semester) || 4)),
    collegeName: isPrivate
      ? ''
      : String(row.college_name || row.institute_name || '').trim(),
    avatarUrl: String(row.avatar_url || '').trim(),
    bio: isPrivate ? '' : String(row.bio || '').trim(),
    role: row.role === 'admin' ? 'admin' : 'student',
    source: 'supabase',
  };
}

/**
 * Fetches author profiles for CommunityView posts from the Supabase `profiles` table.
 * Falls back to `/api/community/profiles` (which also queries Supabase via service role)
 * for any author IDs blocked by RLS or using non-UUID local IDs, and finally falls back
 * to the post's embedded author snapshot.
 */
export async function fetchCommunityAuthorProfiles(
  posts: CommunityPost[],
  viewerId?: string | null
): Promise<Record<string, CommunityAuthorProfile>> {
  const uniqueAuthorIds = Array.from(
    new Set(posts.map((p) => p.authorId).filter((id): id is string => Boolean(id)))
  );
  if (uniqueAuthorIds.length === 0) return {};

  const resolvedMap: Record<string, CommunityAuthorProfile> = {};

  // 1. Direct query to Supabase `profiles` table for UUID author IDs
  const uuidAuthorIds = uniqueAuthorIds.filter((id) => UUID_REGEX.test(id));
  if (isSupabaseConfigured && supabase && uuidAuthorIds.length > 0) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, full_name, department, semester, college_name, institute_name, avatar_url, bio, role, profile_visibility'
        )
        .in('id', uuidAuthorIds);

      if (!error && Array.isArray(data)) {
        for (const row of data as SupabaseProfileRow[]) {
          if (row && row.id) {
            resolvedMap[row.id] = mapSupabaseRow(row, viewerId);
          }
        }
      } else if (error && !isSupabaseMissingRelationError(error)) {
        // RLS or transient network error — handled by server-side Supabase lookup below
      }
    } catch {
      // Fall through to server-side Supabase lookup
    }
  }

  // 2. Server-side batch lookup (queries Supabase `profiles` with service role + local store)
  const missingIds = uniqueAuthorIds.filter((id) => !resolvedMap[id]);
  if (missingIds.length > 0) {
    try {
      const res = await apiClient.getCommunityProfiles(missingIds);
      if (res?.profiles) {
        for (const [id, prof] of Object.entries(res.profiles)) {
          if (!resolvedMap[id] && prof) {
            resolvedMap[id] = prof;
          }
        }
      }
    } catch {
      // Offline or unavailable — post snapshot fallback below
    }
  }

  // 3. Guarantee every post author has a complete profile card even offline
  for (const post of posts) {
    if (!resolvedMap[post.authorId]) {
      resolvedMap[post.authorId] = {
        id: post.authorId,
        fullName: post.authorName,
        department: post.authorDepartment || post.department || 'power',
        semester: Math.min(8, Math.max(1, Number(post.semester) || 4)),
        collegeName: post.authorCollegeName || '',
        avatarUrl: post.authorAvatarUrl || '',
        bio: '',
        role: post.authorRole,
        source: 'post',
      };
    }
  }

  return resolvedMap;
}
