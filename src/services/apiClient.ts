import { auth as firebaseAuth } from '../firebase';
import { getActiveAccessToken } from '../lib/supabaseClient';
import {
  createCommunityPostInFirestore,
  deleteCommunityPostInFirestore,
  fetchCommunityPostsFromFirestore,
  fetchPublicProfileFromFirestore,
  isVerifiedFirebaseSession,
  replyCommunityPostInFirestore,
  syncUserProfileToFirestore,
  toggleLikeCommunityPostInFirestore,
} from './firestoreService';
import {
  AdminAiConfig,
  AdminPushDashboardData,
  AdminUsageMetrics,
  AppReleaseConfig,
  AuthUser,
  CommunityPost,
  DeviceTokenRecord,
  FormulaItem,
  McqQuestion,
  NotificationPreferences,
  PlatformNotice,
  PublicStudentProfile,
  PushAudienceType,
  PushCategory,
  PushNotificationCampaign,
  PushSoundMode,
  ScheduledPushNotification,
  SharedPdfNote,
  UserNotificationItem,
  UserPdfRecord,
  UserRole,
} from '../types/study';

const TOKEN_STORAGE_KEY = 'polytechnic_hub_auth_token_v1';
const CACHED_USER_STORAGE_KEY = 'polytechnic_hub_cached_user_v1';

function readCachedUserSnapshot(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(CACHED_USER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AuthUser;
      if (parsed && typeof parsed.id === 'string' && parsed.id) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  const fbUser = firebaseAuth?.currentUser;
  if (!fbUser) return null;
  const email = (fbUser.email || fbUser.providerData?.[0]?.email || '').trim().toLowerCase();
  const isFacebook = fbUser.providerData?.some((p) => p.providerId === 'facebook.com');
  const now = new Date().toISOString();
  return {
    id: fbUser.uid,
    firebaseUid: fbUser.uid,
    authProvider: isFacebook ? 'facebook' : 'google',
    fullName: fbUser.displayName?.trim() || (email ? email.split('@')[0] : 'Student'),
    email,
    role: fbUser.emailVerified && email === 'webrokib@gmail.com' ? 'admin' : 'student',
    avatarUrl: fbUser.photoURL?.trim() || '',
    coverUrl: '',
    gender: '',
    showGender: false,
    bio: '',
    department: 'power',
    semester: 4,
    collegeName: '',
    instituteName: '',
    rollNumber: '',
    profileVisibility: 'public',
    createdAt: now,
    updatedAt: now,
  };
}

function writeCachedUserSnapshot(user: AuthUser): void {
  try {
    window.localStorage.setItem(CACHED_USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // ignore
  }
}

function mergePostsById(primary: CommunityPost[], secondary: CommunityPost[]): CommunityPost[] {
  const byId = new Map<string, CommunityPost>();
  for (const post of secondary) {
    if (post?.id) byId.set(post.id, post);
  }
  for (const post of primary) {
    if (post?.id) byId.set(post.id, post);
  }
  return Array.from(byId.values()).sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  );
}

export interface BootstrapResponse {
  notices: PlatformNotice[];
  sharedNotes: SharedPdfNote[];
  mcqs: (McqQuestion & { semester?: number })[];
  customFormulas: FormulaItem[];
  deletedFormulaIds: string[];
  appConfig: AppReleaseConfig;
  hasAdmin: boolean;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getStoredToken(): string | null {
  try {
    const raw = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token && token.trim()) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage error
  }
}

async function getUnifiedAuthToken(): Promise<string | null> {
  const localToken = getStoredToken();
  if (localToken) return localToken;
  try {
    if (firebaseAuth?.currentUser) {
      const fbToken = await firebaseAuth.currentUser.getIdToken();
      if (fbToken) return fbToken;
    }
  } catch {
    // ignore
  }
  return getActiveAccessToken();
}

async function recoverFirebaseSessionToken(): Promise<string | null> {
  try {
    const fbUser = firebaseAuth?.currentUser;
    if (!fbUser) return null;
    const freshIdToken = await fbUser.getIdToken(true);
    if (!freshIdToken) return null;
    try {
      const syncRes = await fetch('/api/auth/firebase-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: freshIdToken }),
      });
      if (syncRes.ok) {
        const synced = (await syncRes.json().catch(() => ({}))) as { token?: string };
        if (synced.token) {
          setStoredToken(synced.token);
          return synced.token;
        }
      }
    } catch {
      // Fall back to sending fresh Firebase ID token directly
    }
    return freshIdToken;
  } catch {
    return null;
  }
}

async function parseJsonApiResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new ApiError(
      res.ok ? 'Backend API is unavailable on this host.' : `Request failed (${res.status})`,
      res.ok ? 503 : res.status
    );
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  }
  return data;
}

async function apiRequest<T>(path: string, init: RequestInit = {}, allowAuthRetry = true): Promise<T> {
  const token = await getUnifiedAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, { ...init, headers });
  if (res.status === 401 && allowAuthRetry && path !== '/api/auth/firebase-sync') {
    const recoveredToken = await recoverFirebaseSessionToken();
    if (recoveredToken && recoveredToken !== token) {
      const retryHeaders = {
        ...headers,
        Authorization: `Bearer ${recoveredToken}`,
      };
      const retryRes = await fetch(path, { ...init, headers: retryHeaders });
      return parseJsonApiResponse<T>(retryRes);
    }
  }

  return parseJsonApiResponse<T>(res);
}

export const apiClient = {
  getBootstrap(): Promise<BootstrapResponse> {
    return apiRequest<BootstrapResponse>('/api/bootstrap');
  },

  register(payload: {
    fullName: string;
    email: string;
    password: string;
    department: string;
    semester: number;
    instituteName?: string;
    rollNumber?: string;
  }): Promise<{ token: string; user: AuthUser }> {
    return apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
    return apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  firebaseSync(payload: {
    idToken: string;
    fullName?: string;
    department?: string;
    semester?: number;
    collegeName?: string;
    rollNumber?: string;
    authProvider?: 'google' | 'facebook' | 'email';
  }): Promise<{ token: string; user: AuthUser }> {
    return apiRequest('/api/auth/firebase-sync', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  bootstrapAdmin(payload: {
    fullName: string;
    email: string;
    password: string;
    setupSecret?: string;
  }): Promise<{ token: string; user: AuthUser }> {
    return apiRequest('/api/auth/bootstrap-admin', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getMe(): Promise<{ user: AuthUser }> {
    return apiRequest('/api/auth/me');
  },

  async updateProfile(
    payload: Partial<
      Pick<
        AuthUser,
        | 'fullName'
        | 'department'
        | 'semester'
        | 'collegeName'
        | 'instituteName'
        | 'rollNumber'
        | 'bio'
        | 'gender'
        | 'showGender'
        | 'profileVisibility'
        | 'avatarUrl'
        | 'coverUrl'
      >
    >
  ): Promise<{ user: AuthUser; syncedToSupabase?: boolean }> {
    const baseSnapshot = readCachedUserSnapshot();
    const nowIso = new Date().toISOString();
    const resolvedCollege =
      payload.collegeName !== undefined
        ? payload.collegeName
        : payload.instituteName !== undefined
          ? payload.instituteName
          : baseSnapshot?.collegeName || baseSnapshot?.instituteName || '';

    const optimisticUser: AuthUser | null = baseSnapshot
      ? {
          ...baseSnapshot,
          ...payload,
          fullName:
            payload.fullName !== undefined ? payload.fullName.trim() : baseSnapshot.fullName,
          collegeName: resolvedCollege,
          instituteName: resolvedCollege,
          avatarUrl:
            payload.avatarUrl !== undefined ? payload.avatarUrl : baseSnapshot.avatarUrl,
          coverUrl:
            payload.coverUrl !== undefined ? payload.coverUrl : baseSnapshot.coverUrl,
          firebaseUid: baseSnapshot.firebaseUid || firebaseAuth?.currentUser?.uid || undefined,
          updatedAt: nowIso,
        }
      : null;

    const canSyncFirestore = Boolean(optimisticUser && isVerifiedFirebaseSession());

    const [serverRes, firestoreRes] = await Promise.allSettled([
      apiRequest<{ user: AuthUser; syncedToSupabase?: boolean }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
      canSyncFirestore && optimisticUser
        ? syncUserProfileToFirestore(optimisticUser)
        : Promise.resolve(),
    ]);

    if (serverRes.status === 'fulfilled' && serverRes.value?.user) {
      const mergedUser: AuthUser = {
        ...serverRes.value.user,
        firebaseUid:
          serverRes.value.user.firebaseUid ||
          optimisticUser?.firebaseUid ||
          firebaseAuth?.currentUser?.uid ||
          undefined,
        coverUrl:
          payload.coverUrl !== undefined
            ? payload.coverUrl
            : serverRes.value.user.coverUrl || optimisticUser?.coverUrl || '',
        avatarUrl:
          payload.avatarUrl !== undefined
            ? payload.avatarUrl
            : serverRes.value.user.avatarUrl || optimisticUser?.avatarUrl || '',
      };
      writeCachedUserSnapshot(mergedUser);
      if (isVerifiedFirebaseSession() && firestoreRes.status === 'rejected') {
        void syncUserProfileToFirestore(mergedUser).catch(() => {});
      }
      return {
        user: mergedUser,
        syncedToSupabase: Boolean(serverRes.value.syncedToSupabase),
      };
    }

    if (canSyncFirestore && optimisticUser && firestoreRes.status === 'fulfilled') {
      writeCachedUserSnapshot(optimisticUser);
      return { user: optimisticUser, syncedToSupabase: false };
    }

    if (serverRes.status === 'rejected') {
      throw serverRes.reason;
    }
    if (firestoreRes.status === 'rejected') {
      throw firestoreRes.reason;
    }
    throw new Error('প্রোফাইল আপডেট করা যায়নি। আবার চেষ্টা করুন।');
  },

  ensureProfile(payload?: {
    fullName?: string;
    department?: string;
    semester?: number;
    collegeName?: string;
    rollNumber?: string;
  }): Promise<{
    exists: boolean;
    created: boolean;
    syncedToSupabase: boolean;
    user: AuthUser;
  }> {
    return apiRequest('/api/auth/ensure-profile', {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    });
  },

  async getPublicProfile(userId: string): Promise<{
    profile: PublicStudentProfile;
    posts: CommunityPost[];
  }> {
    const [fsRes, apiRes] = await Promise.allSettled([
      fetchPublicProfileFromFirestore(userId),
      apiRequest<{ profile: PublicStudentProfile; posts: CommunityPost[] }>(
        `/api/users/${encodeURIComponent(userId)}/public-profile`
      ),
    ]);

    const fsData = fsRes.status === 'fulfilled' ? fsRes.value : null;
    const apiData = apiRes.status === 'fulfilled' ? apiRes.value : null;

    if (fsData && apiData) {
      const mergedPosts = mergePostsById(fsData.posts, apiData.posts);
      return {
        profile: {
          ...apiData.profile,
          fullName: fsData.profile.fullName || apiData.profile.fullName,
          avatarUrl: fsData.profile.avatarUrl || apiData.profile.avatarUrl,
          coverUrl: fsData.profile.coverUrl || apiData.profile.coverUrl,
          bio: fsData.profile.bio || apiData.profile.bio,
          collegeName: fsData.profile.collegeName || apiData.profile.collegeName,
          department: fsData.profile.department || apiData.profile.department,
          semester: fsData.profile.semester || apiData.profile.semester,
          postsCount: mergedPosts.length,
        },
        posts: mergedPosts,
      };
    }

    if (fsData) return fsData;
    if (apiData) return apiData;

    if (apiRes.status === 'rejected') throw apiRes.reason;
    throw new Error('প্রোফাইল পাওয়া যায়নি।');
  },

  // Community
  getCommunityProfiles(ids: string[]): Promise<{
    profiles: Record<
      string,
      {
        id: string;
        fullName: string;
        department: string;
        semester: number;
        collegeName: string;
        avatarUrl: string;
        bio: string;
        role: UserRole;
        source: 'supabase' | 'server';
      }
    >;
  }> {
    const q = encodeURIComponent(ids.join(','));
    return apiRequest(`/api/community/profiles?ids=${q}`);
  },

  async getCommunityPosts(includeHidden = false): Promise<{ posts: CommunityPost[] }> {
    const q = includeHidden ? '?includeHidden=1' : '';
    const [fsRes, apiRes] = await Promise.allSettled([
      fetchCommunityPostsFromFirestore(includeHidden),
      apiRequest<{ posts: CommunityPost[] }>(`/api/community/posts${q}`),
    ]);

    const fsPosts = fsRes.status === 'fulfilled' ? fsRes.value : [];
    const apiPosts = apiRes.status === 'fulfilled' ? apiRes.value.posts || [] : [];

    if (fsRes.status === 'rejected' && apiRes.status === 'rejected') {
      throw apiRes.reason;
    }

    return { posts: mergePostsById(fsPosts, apiPosts) };
  },

  async createCommunityPost(payload: {
    title?: string;
    body: string;
    imageUrl?: string;
    department: string;
    semester: number;
    subjectTag?: string;
  }): Promise<{ post: CommunityPost }> {
    if (isVerifiedFirebaseSession()) {
      const authorSnapshot = readCachedUserSnapshot();
      if (authorSnapshot) {
        const post = await createCommunityPostInFirestore(authorSnapshot, payload);
        return { post };
      }
    }

    return apiRequest('/api/community/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async toggleLikeCommunityPost(postId: string): Promise<{ post: CommunityPost }> {
    if (isVerifiedFirebaseSession()) {
      try {
        const post = await toggleLikeCommunityPostInFirestore(postId);
        return { post };
      } catch {
        // Fallback to Express backend for legacy non-Firestore posts
      }
    }
    return apiRequest(`/api/community/posts/${encodeURIComponent(postId)}/like`, {
      method: 'POST',
    });
  },

  async replyCommunityPost(postId: string, body: string): Promise<{ post: CommunityPost }> {
    if (isVerifiedFirebaseSession()) {
      const authorSnapshot = readCachedUserSnapshot();
      if (authorSnapshot) {
        try {
          const post = await replyCommunityPostInFirestore(postId, authorSnapshot, body);
          return { post };
        } catch {
          // Fallback to Express backend for legacy non-Firestore posts
        }
      }
    }
    return apiRequest(`/api/community/posts/${encodeURIComponent(postId)}/reply`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  },

  reportCommunityPost(postId: string): Promise<{ reportsCount: number }> {
    return apiRequest(`/api/community/posts/${encodeURIComponent(postId)}/report`, {
      method: 'POST',
    });
  },

  async deleteCommunityPost(postId: string): Promise<{ deleted: boolean }> {
    if (isVerifiedFirebaseSession()) {
      const [fsDel, apiDel] = await Promise.allSettled([
        deleteCommunityPostInFirestore(postId),
        apiRequest<{ deleted: boolean }>(`/api/community/posts/${encodeURIComponent(postId)}`, {
          method: 'DELETE',
        }),
      ]);
      if (fsDel.status === 'fulfilled' || apiDel.status === 'fulfilled') {
        return { deleted: true };
      }
      throw fsDel.reason;
    }
    return apiRequest(`/api/community/posts/${encodeURIComponent(postId)}`, {
      method: 'DELETE',
    });
  },

  // Admin APIs (strictly role-verified server-side)
  adminGetMetrics(): Promise<{ metrics: AdminUsageMetrics }> {
    return apiRequest('/api/admin/metrics');
  },

  adminGetAiConfig(): Promise<{ aiConfig: AdminAiConfig }> {
    return apiRequest('/api/admin/ai-config');
  },

  adminUpdateAiConfig(config: Partial<AdminAiConfig>): Promise<{ aiConfig: AdminAiConfig }> {
    return apiRequest('/api/admin/ai-config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  adminSaveFormula(formula: Omit<FormulaItem, 'id'> & { id?: string }): Promise<{ formula: FormulaItem }> {
    return apiRequest('/api/admin/formulas', {
      method: 'POST',
      body: JSON.stringify(formula),
    });
  },

  adminDeleteFormula(subject: 'physics' | 'mathematics', id: string): Promise<{ deleted: boolean }> {
    return apiRequest(`/api/admin/formulas/${encodeURIComponent(subject)}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  adminCreateNotice(notice: Omit<PlatformNotice, 'id' | 'createdAt'>): Promise<{ notice: PlatformNotice }> {
    return apiRequest('/api/admin/notices', {
      method: 'POST',
      body: JSON.stringify(notice),
    });
  },

  adminDeleteNotice(id: string): Promise<{ deleted: boolean }> {
    return apiRequest(`/api/admin/notices/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  adminCreateSharedNote(note: Omit<SharedPdfNote, 'id' | 'createdAt'>): Promise<{ sharedNote: SharedPdfNote }> {
    return apiRequest('/api/admin/shared-notes', {
      method: 'POST',
      body: JSON.stringify(note),
    });
  },

  async adminUploadSharedNote(
    file: File,
    meta: {
      title: string;
      department: string;
      semester: number;
      subjectCode?: string;
      summary?: string;
      downloadPermitted?: boolean;
    },
    onProgress?: (pct: number) => void
  ): Promise<{ sharedNote: SharedPdfNote }> {
    const token = await getUnifiedAuthToken();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/admin/shared-notes/upload', true);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', 'application/pdf');
      xhr.setRequestHeader('X-Pdf-Meta', encodeURIComponent(JSON.stringify(meta)));

      xhr.upload.onprogress = (ev) => {
        if (onProgress && ev.lengthComputable && ev.total > 0) {
          onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
        }
      };

      xhr.onload = () => {
        try {
          const parsed = JSON.parse(xhr.responseText || '{}') as {
            sharedNote?: SharedPdfNote;
            error?: string;
          };
          if (xhr.status >= 200 && xhr.status < 300 && parsed.sharedNote) {
            onProgress?.(100);
            resolve({ sharedNote: parsed.sharedNote });
          } else {
            reject(new Error(parsed.error || `Upload failed (${xhr.status})`));
          }
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during catalog PDF upload.'));
      xhr.send(file);
    });
  },

  adminUpdateSharedNote(
    id: string,
    payload: Partial<
      Pick<
        SharedPdfNote,
        'title' | 'department' | 'semester' | 'subjectCode' | 'summary' | 'pdfUrl' | 'downloadPermitted'
      >
    >
  ): Promise<{ sharedNote: SharedPdfNote }> {
    return apiRequest(`/api/admin/shared-notes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  adminDeleteSharedNote(id: string): Promise<{ deleted: boolean }> {
    return apiRequest(`/api/admin/shared-notes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  adminCreateMcq(mcq: {
    category: string;
    department: string;
    semester: number;
    questionBn: string;
    optionsBn: [string, string, string, string];
    correctIndex: 0 | 1 | 2 | 3;
    explanationBn: string;
  }): Promise<{ mcq: McqQuestion }> {
    return apiRequest('/api/admin/mcqs', {
      method: 'POST',
      body: JSON.stringify(mcq),
    });
  },

  adminDeleteMcq(id: string): Promise<{ deleted: boolean }> {
    return apiRequest(`/api/admin/mcqs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  adminUpdateConfig(config: Partial<AppReleaseConfig>): Promise<{ appConfig: AppReleaseConfig }> {
    return apiRequest('/api/admin/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  adminListUsers(): Promise<{ users: AuthUser[] }> {
    return apiRequest('/api/admin/users');
  },

  adminSetUserRole(id: string, role: UserRole): Promise<{ user: AuthUser }> {
    return apiRequest(`/api/admin/users/${encodeURIComponent(id)}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  adminSetUserStatus(id: string, isDisabled: boolean): Promise<{ user: AuthUser }> {
    return apiRequest(`/api/admin/users/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isDisabled }),
    });
  },

  adminModeratePost(
    id: string,
    payload: { isHidden?: boolean; clearReports?: boolean }
  ): Promise<{ post: CommunityPost }> {
    return apiRequest(`/api/admin/community/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  // Personal Cloud PDF Library
  getPdfs(): Promise<{ pdfs: UserPdfRecord[] }> {
    return apiRequest('/api/pdfs');
  },

  async uploadPdfWithProgress(
    file: File,
    meta: {
      customTitle: string;
      originalFilename: string;
      department: string;
      semester: number;
      subjectName?: string;
    },
    onProgress?: (pct: number) => void
  ): Promise<{ pdf: UserPdfRecord }> {
    const token = await getUnifiedAuthToken();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/pdfs/upload', true);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', 'application/pdf');
      xhr.setRequestHeader('X-Pdf-Meta', encodeURIComponent(JSON.stringify(meta)));

      xhr.upload.onprogress = (ev) => {
        if (onProgress && ev.lengthComputable && ev.total > 0) {
          onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
        }
      };

      xhr.onload = () => {
        try {
          const parsed = JSON.parse(xhr.responseText || '{}') as {
            pdf?: UserPdfRecord;
            error?: string;
          };
          if (xhr.status >= 200 && xhr.status < 300 && parsed.pdf) {
            onProgress?.(100);
            resolve({ pdf: parsed.pdf });
          } else {
            reject(new Error(parsed.error || `Upload failed (${xhr.status})`));
          }
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during PDF upload.'));
      xhr.send(file);
    });
  },

  async fetchAuthenticatedPdfBytes(url: string): Promise<Uint8Array> {
    const token = await getUnifiedAuthToken();
    const isInternal = url.startsWith('/');
    const headers: Record<string, string> = {};
    if (isInternal && token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errJson.error || `Failed to load PDF (${res.status})`);
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  },

  updatePdfMeta(
    id: string,
    payload: {
      customTitle?: string;
      department?: string;
      semester?: number;
      subjectName?: string;
    }
  ): Promise<{ pdf: UserPdfRecord }> {
    return apiRequest(`/api/pdfs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  deletePdf(id: string): Promise<{ deleted: boolean }> {
    return apiRequest(`/api/pdfs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  // Push Notifications (Student Inbox, Preferences & Device Tokens)
  registerDeviceToken(payload: {
    token: string;
    platform: 'web' | 'android' | 'ios';
    browserOrDevice?: string;
    appVersion?: string;
  }): Promise<{ deviceToken: DeviceTokenRecord }> {
    return apiRequest('/api/notifications/device-token', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  deactivateDeviceToken(token: string): Promise<{ deactivated: boolean }> {
    return apiRequest('/api/notifications/device-token', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    });
  },

  getNotificationInbox(): Promise<{
    notifications: UserNotificationItem[];
    unreadCount: number;
    preferences: NotificationPreferences;
    devices: DeviceTokenRecord[];
    fcmConfigured: boolean;
  }> {
    return apiRequest('/api/notifications/inbox');
  },

  markNotificationRead(id: string): Promise<{ notification: UserNotificationItem }> {
    return apiRequest(`/api/notifications/inbox/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
    });
  },

  markAllNotificationsRead(): Promise<{ markedCount: number }> {
    return apiRequest('/api/notifications/inbox/read-all', {
      method: 'POST',
    });
  },

  deleteUserNotification(id: string): Promise<{ deleted: boolean }> {
    return apiRequest(`/api/notifications/inbox/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  updateNotificationPreferences(
    payload: Partial<NotificationPreferences>
  ): Promise<{ preferences: NotificationPreferences }> {
    return apiRequest('/api/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  // Admin Push Notification Management
  adminGetNotifications(): Promise<AdminPushDashboardData> {
    return apiRequest('/api/admin/notifications');
  },

  adminSendNotification(payload: {
    title: string;
    body: string;
    category: PushCategory;
    imageUrl?: string;
    targetView?: string;
    actionUrl?: string;
    audienceType: PushAudienceType;
    targetUserIds?: string[];
    targetDepartment?: string;
    targetSemester?: number | null;
    soundMode?: PushSoundMode;
    scheduledFor?: string | null;
  }): Promise<{
    scheduled: boolean;
    fcmConfigured?: boolean;
    campaign?: PushNotificationCampaign;
    scheduledNotification?: ScheduledPushNotification;
    invalidTokensCleaned?: number;
  }> {
    return apiRequest('/api/admin/notifications/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  adminUpdateScheduledNotification(
    id: string,
    payload: Partial<{
      title: string;
      body: string;
      category: PushCategory;
      imageUrl: string;
      targetView: string;
      audienceType: PushAudienceType;
      targetUserIds: string[];
      targetDepartment: string;
      targetSemester: number | null;
      soundMode: PushSoundMode;
      scheduledFor: string;
      status: 'pending' | 'cancelled';
    }>
  ): Promise<{ scheduledNotification: ScheduledPushNotification }> {
    return apiRequest(`/api/admin/notifications/scheduled/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  adminDeleteScheduledNotification(id: string): Promise<{ deleted: boolean }> {
    return apiRequest(`/api/admin/notifications/scheduled/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};
