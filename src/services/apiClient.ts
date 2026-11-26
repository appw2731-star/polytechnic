import { auth as firebaseAuth } from '../firebase';
import { getActiveAccessToken } from '../lib/supabaseClient';
import {
  adminCreateMcqInFirestore,
  adminCreateNoticeInFirestore,
  adminCreatePushNotificationInFirestore,
  adminDeleteFormulaInFirestore,
  adminDeleteMcqInFirestore,
  adminDeleteNoticeInFirestore,
  adminDeleteSharedNoteInFirestore,
  adminModerateCommunityPostInFirestore,
  adminSaveAppConfigInFirestore,
  adminSaveFormulaInFirestore,
  adminSaveSharedNoteInFirestore,
  adminSetUserRoleInFirestore,
  adminSetUserStatusInFirestore,
  createCommunityPostInFirestore,
  deleteCommunityPostInFirestore,
  fetchAllUsersForAdminFromFirestore,
  fetchCommunityPostsFromFirestore,
  fetchPlatformAppConfigFromFirestore,
  fetchPlatformFormulasFromFirestore,
  fetchPlatformMcqsFromFirestore,
  fetchPlatformNoticesFromFirestore,
  fetchPlatformSharedNotesFromFirestore,
  fetchPublicProfileFromFirestore,
  fetchPushNotificationsFromFirestore,
  isVerifiedAdminFirebaseSession,
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

const READ_CAMPAIGNS_STORAGE_KEY = 'polytechnic_hub_read_push_ids_v1';
const DELETED_CAMPAIGNS_STORAGE_KEY = 'polytechnic_hub_deleted_push_ids_v1';

function readLocalIdSet(storageKey: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function writeLocalIdSet(storageKey: string, ids: Set<string>): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(ids).slice(-500)));
  } catch {
    // ignore storage errors
  }
}

export function doesCampaignTargetUser(
  campaign: PushNotificationCampaign,
  user: AuthUser | null
): boolean {
  if (!user) return false;
  if (campaign.audienceType === 'all') return true;
  if (campaign.audienceType === 'selected_users') {
    const targetSet = new Set(campaign.targetUserIds || []);
    return Boolean(
      targetSet.has(user.id) || (user.firebaseUid && targetSet.has(user.firebaseUid))
    );
  }
  if (campaign.audienceType === 'department_semester') {
    if (campaign.targetDepartment && user.department !== campaign.targetDepartment) return false;
    if (campaign.targetSemester && Number(user.semester) !== Number(campaign.targetSemester)) {
      return false;
    }
    return true;
  }
  return true;
}

export function campaignToInboxItem(
  campaign: PushNotificationCampaign,
  userId: string
): UserNotificationItem {
  const readIds = readLocalIdSet(READ_CAMPAIGNS_STORAGE_KEY);
  const isRead = readIds.has(campaign.id);
  return {
    id: `fs-notif-${campaign.id}`,
    notificationId: campaign.id,
    userId,
    title: campaign.title,
    body: campaign.body,
    category: campaign.category,
    imageUrl: campaign.imageUrl,
    targetView: campaign.targetView || 'notifications',
    actionUrl: campaign.actionUrl || '',
    isRead,
    readAt: isRead ? campaign.createdAt : '',
    deliveredVia: 'in_app',
    createdAt: campaign.createdAt,
  };
}

function isTokenUnexpired(token: string): boolean {
  try {
    const parts = token.split('.');
    const seg = parts.length === 2 ? parts[0] : parts.length === 3 ? parts[1] : '';
    if (!seg) return false;
    const norm = seg.replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (norm.length % 4)) % 4;
    const json = JSON.parse(window.atob(norm + '='.repeat(pad))) as { exp?: number };
    const rawExp = Number(json.exp || 0);
    if (!Number.isFinite(rawExp) || rawExp <= 0) return false;
    const expMs = rawExp < 1e12 ? rawExp * 1000 : rawExp;
    return expMs > Date.now() + 10000;
  } catch {
    return false;
  }
}

async function getUnifiedAuthToken(): Promise<string | null> {
  const localToken = getStoredToken();
  if (localToken && isTokenUnexpired(localToken)) {
    return localToken;
  }
  if (localToken) {
    // Clear expired cached token so we grab a fresh Firebase ID token
    setStoredToken(null);
  }
  try {
    if (firebaseAuth) {
      if (!firebaseAuth.currentUser && typeof firebaseAuth.authStateReady === 'function') {
        await firebaseAuth.authStateReady().catch(() => {});
      }
      if (firebaseAuth.currentUser) {
        const fbToken = await firebaseAuth.currentUser.getIdToken();
        if (fbToken) return fbToken;
      }
    }
  } catch {
    // ignore
  }
  return getActiveAccessToken();
}

async function recoverFirebaseSessionToken(): Promise<string | null> {
  try {
    if (firebaseAuth && !firebaseAuth.currentUser && typeof firebaseAuth.authStateReady === 'function') {
      await firebaseAuth.authStateReady().catch(() => {});
    }
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
  if (
    (res.status === 401 || res.status === 403) &&
    allowAuthRetry &&
    path !== '/api/auth/firebase-sync'
  ) {
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

function mergeById<T extends { id: string }>(primary: T[], secondary: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of secondary) {
    if (item?.id) byId.set(item.id, item);
  }
  for (const item of primary) {
    if (item?.id) byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

const DEFAULT_APP_CONFIG: AppReleaseConfig = {
  appVersion: '2.0.0',
  apkStatus: 'coming_soon',
  apkDownloadUrl: '',
  apkReleaseNotes: '',
  btebResultUrl: 'https://result.bteb.gov.bd/result-search',
  officialWebsiteUrl: 'https://bteb.gov.bd/',
  updatedAt: '',
};

export const apiClient = {
  async getBootstrap(): Promise<BootstrapResponse> {
    const [apiRes, fsNotices, fsFormulas, fsNotes, fsMcqs, fsConfig] = await Promise.allSettled([
      apiRequest<BootstrapResponse>('/api/bootstrap'),
      fetchPlatformNoticesFromFirestore(),
      fetchPlatformFormulasFromFirestore(),
      fetchPlatformSharedNotesFromFirestore(),
      fetchPlatformMcqsFromFirestore(),
      fetchPlatformAppConfigFromFirestore(),
    ]);

    const apiData = apiRes.status === 'fulfilled' ? apiRes.value : null;
    const notices = mergeById(
      fsNotices.status === 'fulfilled' ? fsNotices.value : [],
      apiData?.notices ?? []
    ).sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    const customFormulas = mergeById(
      fsFormulas.status === 'fulfilled' ? fsFormulas.value : [],
      apiData?.customFormulas ?? []
    );
    const sharedNotes = mergeById(
      fsNotes.status === 'fulfilled' ? fsNotes.value : [],
      apiData?.sharedNotes ?? []
    ).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const mcqs = mergeById(
      fsMcqs.status === 'fulfilled' ? fsMcqs.value : [],
      apiData?.mcqs ?? []
    );
    const appConfig =
      (fsConfig.status === 'fulfilled' && fsConfig.value) ||
      apiData?.appConfig ||
      DEFAULT_APP_CONFIG;

    return {
      notices,
      sharedNotes,
      mcqs,
      customFormulas,
      deletedFormulaIds: apiData?.deletedFormulaIds ?? [],
      appConfig,
      hasAdmin: apiData?.hasAdmin ?? true,
    };
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

  // Admin APIs (strictly role-verified server-side + Cloud Firestore dual-sync)
  async adminGetMetrics(): Promise<{ metrics: AdminUsageMetrics }> {
    try {
      return await apiRequest<{ metrics: AdminUsageMetrics }>('/api/admin/metrics');
    } catch (err) {
      if (isVerifiedAdminFirebaseSession()) {
        const [users, posts, notices, mcqs, formulas] = await Promise.all([
          fetchAllUsersForAdminFromFirestore().catch(() => []),
          fetchCommunityPostsFromFirestore(true).catch(() => []),
          fetchPlatformNoticesFromFirestore().catch(() => []),
          fetchPlatformMcqsFromFirestore().catch(() => []),
          fetchPlatformFormulasFromFirestore().catch(() => []),
        ]);
        return {
          metrics: {
            totalAiRequests: 0,
            aiErrorsCount: 0,
            averageAiLatencyMs: 0,
            lastAiRequestAt: '',
            requestsByMode: { general: 0, explain: 0, math: 0, power: 0, recommend: 0 },
            totalLocalUsers: users.length,
            totalUserPdfs: 0,
            totalPhysicsFormulas: formulas.filter((f) => f.subject === 'physics').length,
            totalMathFormulas: formulas.filter((f) => f.subject === 'mathematics').length,
            totalCommunityPosts: posts.length,
            totalMcqs: mcqs.length,
            totalNotices: notices.length,
            serverUptimeSeconds: 0,
          },
        };
      }
      throw err;
    }
  },

  async adminGetAiConfig(): Promise<{ aiConfig: AdminAiConfig }> {
    try {
      return await apiRequest<{ aiConfig: AdminAiConfig }>('/api/admin/ai-config');
    } catch (err) {
      if (isVerifiedAdminFirebaseSession()) {
        return {
          aiConfig: {
            activeModel: 'gemini-4-hydrogen',
            thinkingLevel: 'LOW',
            conciseByDefault: false,
            maxHistoryTurns: 8,
            customSystemAddon: '',
            updatedAt: new Date().toISOString(),
          },
        };
      }
      throw err;
    }
  },

  adminUpdateAiConfig(config: Partial<AdminAiConfig>): Promise<{ aiConfig: AdminAiConfig }> {
    return apiRequest('/api/admin/ai-config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  async adminSaveFormula(formula: Omit<FormulaItem, 'id'> & { id?: string }): Promise<{ formula: FormulaItem }> {
    const canFs = isVerifiedAdminFirebaseSession();
    const [apiRes, fsRes] = await Promise.allSettled([
      apiRequest<{ formula: FormulaItem }>('/api/admin/formulas', {
        method: 'POST',
        body: JSON.stringify(formula),
      }),
      canFs ? adminSaveFormulaInFirestore(formula) : Promise.reject(new Error('no-fs')),
    ]);
    if (fsRes.status === 'fulfilled') return { formula: fsRes.value };
    if (apiRes.status === 'fulfilled') return apiRes.value;
    throw apiRes.reason;
  },

  async adminDeleteFormula(subject: 'physics' | 'mathematics', id: string): Promise<{ deleted: boolean }> {
    const canFs = isVerifiedAdminFirebaseSession();
    const [apiRes, fsRes] = await Promise.allSettled([
      apiRequest<{ deleted: boolean }>(`/api/admin/formulas/${encodeURIComponent(subject)}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
      canFs ? adminDeleteFormulaInFirestore(id) : Promise.reject(new Error('no-fs')),
    ]);
    if (fsRes.status === 'fulfilled' || apiRes.status === 'fulfilled') return { deleted: true };
    throw apiRes.reason;
  },

  async adminCreateNotice(notice: Omit<PlatformNotice, 'id' | 'createdAt'>): Promise<{ notice: PlatformNotice }> {
    const noticeId = `ntc-${Date.now()}`;
    const canFs = isVerifiedAdminFirebaseSession();
    const [apiRes, fsRes] = await Promise.allSettled([
      apiRequest<{ notice: PlatformNotice }>('/api/admin/notices', {
        method: 'POST',
        body: JSON.stringify(notice),
      }),
      canFs ? adminCreateNoticeInFirestore(notice, noticeId) : Promise.reject(new Error('no-fs')),
    ]);
    if (fsRes.status === 'fulfilled') return { notice: fsRes.value };
    if (apiRes.status === 'fulfilled') return apiRes.value;
    throw apiRes.reason;
  },

  async adminDeleteNotice(id: string): Promise<{ deleted: boolean }> {
    const canFs = isVerifiedAdminFirebaseSession();
    const [apiRes, fsRes] = await Promise.allSettled([
      apiRequest<{ deleted: boolean }>(`/api/admin/notices/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
      canFs ? adminDeleteNoticeInFirestore(id) : Promise.reject(new Error('no-fs')),
    ]);
    if (fsRes.status === 'fulfilled' || apiRes.status === 'fulfilled') return { deleted: true };
    throw apiRes.reason;
  },

  async adminCreateSharedNote(note: Omit<SharedPdfNote, 'id' | 'createdAt'>): Promise<{ sharedNote: SharedPdfNote }> {
    const canFs = isVerifiedAdminFirebaseSession();
    const [apiRes, fsRes] = await Promise.allSettled([
      apiRequest<{ sharedNote: SharedPdfNote }>('/api/admin/shared-notes', {
        method: 'POST',
        body: JSON.stringify(note),
      }),
      canFs ? adminSaveSharedNoteInFirestore(note) : Promise.reject(new Error('no-fs')),
    ]);
    if (fsRes.status === 'fulfilled') return { sharedNote: fsRes.value };
    if (apiRes.status === 'fulfilled') return apiRes.value;
    throw apiRes.reason;
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
    const uploadOnce = (token: string | null) =>
      new Promise<{ status: number; sharedNote?: SharedPdfNote; error?: string }>((resolve, reject) => {
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
            resolve({ status: xhr.status, sharedNote: parsed.sharedNote, error: parsed.error });
          } catch {
            resolve({ status: xhr.status, error: `Upload failed (${xhr.status})` });
          }
        };

        xhr.onerror = () => reject(new Error('Network error during catalog PDF upload.'));
        xhr.send(file);
      });

    let token = await getUnifiedAuthToken();
    let result = await uploadOnce(token);
    if (result.status === 401 || result.status === 403) {
      const recovered = await recoverFirebaseSessionToken();
      if (recovered && recovered !== token) {
        token = recovered;
        result = await uploadOnce(token);
      }
    }

    if (result.status >= 200 && result.status < 300 && result.sharedNote) {
      onProgress?.(100);
      if (isVerifiedAdminFirebaseSession()) {
        void adminSaveSharedNoteInFirestore(result.sharedNote).catch(() => {});
      }
      return { sharedNote: result.sharedNote };
    }
    throw new Error(result.error || `Upload failed (${result.status})`);
  },

  async adminUpdateSharedNote(
    id: string,
    payload: Partial<
      Pick<
        SharedPdfNote,
        'title' | 'department' | 'semester' | 'subjectCode' | 'summary' | 'pdfUrl' | 'downloadPermitted'
      >
    >
  ): Promise<{ sharedNote: SharedPdfNote }> {
    const canFs = isVerifiedAdminFirebaseSession();
    const [apiRes, fsRes] = await Promise.allSettled([
      apiRequest<{ sharedNote: SharedPdfNote }>(`/api/admin/shared-notes/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
      canFs
        ? adminSaveSharedNoteInFirestore({
            id,
            title: payload.title || 'Shared Note',
            department: payload.department || 'power',
            semester: payload.semester || 4,
            subjectCode: payload.subjectCode || '',
            summary: payload.summary || '',
            pdfUrl: payload.pdfUrl || '',
            downloadPermitted: payload.downloadPermitted !== false,
          })
        : Promise.reject(new Error('no-fs')),
    ]);
    if (apiRes.status === 'fulfilled') return apiRes.value;
    if (fsRes.status === 'fulfilled') return { sharedNote: fsRes.value };
    throw apiRes.reason;
  },

  async adminDeleteSharedNote(id: string): Promise<{ deleted: boolean }> {
    const canFs = isVerifiedAdminFirebaseSession();
    const [apiRes, fsRes] = await Promise.allSettled([
      apiRequest<{ deleted: boolean }>(`/api/admin/shared-notes/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
      canFs ? adminDeleteSharedNoteInFirestore(id) : Promise.reject(new Error('no-fs')),
    ]);
    if (fsRes.status === 'fulfilled' || apiRes.status === 'fulfilled') return { deleted: true };
    throw apiRes.reason;
  },

  async adminCreateMcq(mcq: {
    category: string;
    department: string;
    semester: number;
    questionBn: string;
    optionsBn: [string, string, string, string];
    correctIndex: 0 | 1 | 2 | 3;
    explanationBn: string;
  }): Promise<{ mcq: McqQuestion }> {
    const canFs = isVerifiedAdminFirebaseSession();
    const [apiRes, fsRes] = await Promise.allSettled([
      apiRequest<{ mcq: McqQuestion }>('/api/admin/mcqs', {
        method: 'POST',
        body: JSON.stringify(mcq),
      }),
      canFs ? adminCreateMcqInFirestore(mcq) : Promise.reject(new Error('no-fs')),
    ]);
    if (fsRes.status === 'fulfilled') return { mcq: fsRes.value };
    if (apiRes.status === 'fulfilled') return apiRes.value;
    throw apiRes.reason;
  },

  async adminDeleteMcq(id: string): Promise<{ deleted: boolean }> {
    const canFs = isVerifiedAdminFirebaseSession();
    const [apiRes, fsRes] = await Promise.allSettled([
      apiRequest<{ deleted: boolean }>(`/api/admin/mcqs/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
      canFs ? adminDeleteMcqInFirestore(id) : Promise.reject(new Error('no-fs')),
    ]);
    if (fsRes.status === 'fulfilled' || apiRes.status === 'fulfilled') return { deleted: true };
    throw apiRes.reason;
  },

  async adminUpdateConfig(config: Partial<AppReleaseConfig>): Promise<{ appConfig: AppReleaseConfig }> {
    const canFs = isVerifiedAdminFirebaseSession();
    const [apiRes, fsRes] = await Promise.allSettled([
      apiRequest<{ appConfig: AppReleaseConfig }>('/api/admin/config', {
        method: 'PUT',
        body: JSON.stringify(config),
      }),
      canFs ? adminSaveAppConfigInFirestore(config) : Promise.reject(new Error('no-fs')),
    ]);
    if (fsRes.status === 'fulfilled') return { appConfig: fsRes.value };
    if (apiRes.status === 'fulfilled') return apiRes.value;
    throw apiRes.reason;
  },

  async adminListUsers(): Promise<{ users: AuthUser[] }> {
    const [apiRes, fsRes] = await Promise.allSettled([
      apiRequest<{ users: AuthUser[] }>('/api/admin/users'),
      isVerifiedAdminFirebaseSession()
        ? fetchAllUsersForAdminFromFirestore()
        : Promise.resolve([] as AuthUser[]),
    ]);

    const apiUsers = apiRes.status === 'fulfilled' ? apiRes.value.users || [] : [];
    const fsUsers = fsRes.status === 'fulfilled' ? fsRes.value : [];

    if (apiRes.status === 'rejected' && fsRes.status === 'rejected') {
      throw apiRes.reason;
    }

    // Deduplicate cleanly by firebaseUid or email (preferring Firestore profile customizations)
    const byKey = new Map<string, AuthUser>();
    for (const u of apiUsers) {
      const key = u.firebaseUid || u.email?.toLowerCase() || u.id;
      byKey.set(key, u);
    }
    for (const u of fsUsers) {
      const key = u.firebaseUid || u.email?.toLowerCase() || u.id;
      const existing = byKey.get(key);
      byKey.set(key, existing ? { ...existing, ...u, id: u.id } : u);
    }

    return {
      users: Array.from(byKey.values()).sort((a, b) =>
        (b.createdAt || '').localeCompare(a.createdAt || '')
      ),
    };
  },

  async adminSetUserRole(
    id: string,
    role: UserRole,
    meta?: { firebaseUid?: string; email?: string }
  ): Promise<{ user?: AuthUser; updated?: boolean }> {
    const fsTargetUid = meta?.firebaseUid || id;
    const canFs = isVerifiedAdminFirebaseSession();
    const [apiRes, fsRes] = await Promise.allSettled([
      apiRequest<{ user: AuthUser }>(`/api/admin/users/${encodeURIComponent(id)}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
      canFs
        ? adminSetUserRoleInFirestore(fsTargetUid, role, meta?.email || '')
        : Promise.reject(new Error('no-fs')),
    ]);
    if (apiRes.status === 'fulfilled') return apiRes.value;
    if (fsRes.status === 'fulfilled') return { updated: true };
    throw apiRes.reason;
  },

  async adminSetUserStatus(
    id: string,
    isDisabled: boolean,
    meta?: { firebaseUid?: string }
  ): Promise<{ user?: AuthUser; updated?: boolean }> {
    const fsTargetUid = meta?.firebaseUid || id;
    const canFs = isVerifiedAdminFirebaseSession();
    const [apiRes, fsRes] = await Promise.allSettled([
      apiRequest<{ user: AuthUser }>(`/api/admin/users/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isDisabled }),
      }),
      canFs
        ? adminSetUserStatusInFirestore(fsTargetUid, isDisabled)
        : Promise.reject(new Error('no-fs')),
    ]);
    if (apiRes.status === 'fulfilled') return apiRes.value;
    if (fsRes.status === 'fulfilled') return { updated: true };
    throw apiRes.reason;
  },

  async adminModeratePost(
    id: string,
    payload: { isHidden?: boolean; clearReports?: boolean }
  ): Promise<{ post: CommunityPost }> {
    const canFs = isVerifiedAdminFirebaseSession();
    const [apiRes, fsRes] = await Promise.allSettled([
      apiRequest<{ post: CommunityPost }>(`/api/admin/community/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
      canFs
        ? adminModerateCommunityPostInFirestore(id, { isHidden: payload.isHidden })
        : Promise.resolve(null),
    ]);
    if (fsRes.status === 'fulfilled' && fsRes.value) return { post: fsRes.value };
    if (apiRes.status === 'fulfilled') return apiRes.value;
    if (apiRes.status === 'rejected') throw apiRes.reason;
    throw new Error('পোস্ট আপডেট করা যায়নি।');
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

  async getNotificationInbox(): Promise<{
    notifications: UserNotificationItem[];
    unreadCount: number;
    preferences: NotificationPreferences;
    devices: DeviceTokenRecord[];
    fcmConfigured: boolean;
  }> {
    const userSnap = readCachedUserSnapshot();
    const [apiRes, fsRes] = await Promise.allSettled([
      apiRequest<{
        notifications: UserNotificationItem[];
        unreadCount: number;
        preferences: NotificationPreferences;
        devices: DeviceTokenRecord[];
        fcmConfigured: boolean;
      }>('/api/notifications/inbox'),
      fetchPushNotificationsFromFirestore(),
    ]);

    const apiData = apiRes.status === 'fulfilled' ? apiRes.value : null;
    const fsCampaigns = fsRes.status === 'fulfilled' ? fsRes.value : [];
    const deletedIds = readLocalIdSet(DELETED_CAMPAIGNS_STORAGE_KEY);

    const byNotificationId = new Map<string, UserNotificationItem>();
    for (const item of apiData?.notifications ?? []) {
      const key = item.notificationId || item.id;
      if (!deletedIds.has(key) && !deletedIds.has(item.id)) {
        byNotificationId.set(key, item);
      }
    }
    if (userSnap) {
      for (const camp of fsCampaigns) {
        if (!doesCampaignTargetUser(camp, userSnap)) continue;
        if (deletedIds.has(camp.id) || deletedIds.has(`fs-notif-${camp.id}`)) continue;
        if (!byNotificationId.has(camp.id)) {
          byNotificationId.set(camp.id, campaignToInboxItem(camp, userSnap.id));
        }
      }
    }

    const merged = Array.from(byNotificationId.values()).sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
    const unreadCount = merged.filter((n) => !n.isRead).length;

    const defaultPrefs: NotificationPreferences = {
      userId: userSnap?.id || '',
      pushEnabled: true,
      soundEnabled: true,
      soundStyle: 'chime',
      allowAppUpdate: true,
      allowImportant: true,
      allowEducation: true,
      allowEmergency: true,
      allowGeneral: true,
      respectDnd: true,
      updatedAt: new Date().toISOString(),
    };

    return {
      notifications: merged,
      unreadCount,
      preferences: apiData?.preferences ?? defaultPrefs,
      devices: apiData?.devices ?? [],
      fcmConfigured: apiData?.fcmConfigured ?? false,
    };
  },

  async markNotificationRead(id: string): Promise<{ notification?: UserNotificationItem }> {
    const campaignId = id.startsWith('fs-notif-') ? id.slice('fs-notif-'.length) : id;
    const readIds = readLocalIdSet(READ_CAMPAIGNS_STORAGE_KEY);
    readIds.add(campaignId);
    readIds.add(id);
    writeLocalIdSet(READ_CAMPAIGNS_STORAGE_KEY, readIds);
    if (id.startsWith('fs-notif-')) {
      return {};
    }
    return apiRequest<{ notification?: UserNotificationItem }>(
      `/api/notifications/inbox/${encodeURIComponent(id)}/read`,
      {
        method: 'PATCH',
      }
    ).catch(() => ({}));
  },

  async markAllNotificationsRead(): Promise<{ markedCount: number }> {
    const fsCampaigns = await fetchPushNotificationsFromFirestore().catch(() => []);
    if (fsCampaigns.length > 0) {
      const readIds = readLocalIdSet(READ_CAMPAIGNS_STORAGE_KEY);
      for (const c of fsCampaigns) readIds.add(c.id);
      writeLocalIdSet(READ_CAMPAIGNS_STORAGE_KEY, readIds);
    }
    return apiRequest<{ markedCount: number }>('/api/notifications/inbox/read-all', {
      method: 'POST',
    }).catch(() => ({ markedCount: fsCampaigns.length }));
  },

  async deleteUserNotification(id: string): Promise<{ deleted: boolean }> {
    const campaignId = id.startsWith('fs-notif-') ? id.slice('fs-notif-'.length) : id;
    const deletedIds = readLocalIdSet(DELETED_CAMPAIGNS_STORAGE_KEY);
    deletedIds.add(campaignId);
    deletedIds.add(id);
    writeLocalIdSet(DELETED_CAMPAIGNS_STORAGE_KEY, deletedIds);
    if (id.startsWith('fs-notif-')) {
      return { deleted: true };
    }
    return apiRequest<{ deleted: boolean }>(`/api/notifications/inbox/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).catch(() => ({ deleted: true }));
  },

  updateNotificationPreferences(
    payload: Partial<NotificationPreferences>
  ): Promise<{ preferences: NotificationPreferences }> {
    return apiRequest('/api/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  // Admin Push Notification Management (Express FCM + Cloud Firestore real-time dual-sync)
  async adminGetNotifications(): Promise<AdminPushDashboardData> {
    const [apiRes, fsRes] = await Promise.allSettled([
      apiRequest<AdminPushDashboardData>('/api/admin/notifications'),
      fetchPushNotificationsFromFirestore(),
    ]);

    const apiData = apiRes.status === 'fulfilled' ? apiRes.value : null;
    const fsHistory = fsRes.status === 'fulfilled' ? fsRes.value : [];

    if (!apiData && fsRes.status === 'rejected') {
      throw apiRes.status === 'rejected'
        ? apiRes.reason
        : new Error('Failed to load push notifications');
    }

    const mergedHistory = mergeById(apiData?.history ?? [], fsHistory).sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );

    const fallbackStats = {
      totalCampaigns: mergedHistory.length,
      totalPendingScheduled: apiData?.scheduled?.filter((s) => s.status === 'pending').length ?? 0,
      totalRecipientsReached: mergedHistory.reduce((sum, n) => sum + (n.totalRecipients || 0), 0),
      totalFcmSent: mergedHistory.reduce((sum, n) => sum + (n.fcmSentCount || 0), 0),
      totalFcmFailed: mergedHistory.reduce((sum, n) => sum + (n.fcmFailedCount || 0), 0),
      totalInboxRead: apiData?.stats.totalInboxRead ?? 0,
      totalInboxDelivered: apiData?.stats.totalInboxDelivered ?? mergedHistory.length,
      activeWebDevices: apiData?.stats.activeWebDevices ?? 0,
      activeAndroidDevices: apiData?.stats.activeAndroidDevices ?? 0,
    };

    return {
      fcmConfigured: apiData?.fcmConfigured ?? false,
      supabaseServiceConfigured: apiData?.supabaseServiceConfigured ?? false,
      history: mergedHistory,
      scheduled: apiData?.scheduled ?? [],
      stats: apiData
        ? {
            ...apiData.stats,
            totalCampaigns: mergedHistory.length,
            totalRecipientsReached: Math.max(
              apiData.stats.totalRecipientsReached,
              fallbackStats.totalRecipientsReached
            ),
          }
        : fallbackStats,
    };
  },

  async adminSendNotification(payload: {
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
    if (payload.scheduledFor) {
      return apiRequest('/api/admin/notifications/send', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }

    const canFs = isVerifiedAdminFirebaseSession();
    const apiPromise = apiRequest<{
      scheduled: boolean;
      fcmConfigured?: boolean;
      campaign?: PushNotificationCampaign;
      scheduledNotification?: ScheduledPushNotification;
      invalidTokensCleaned?: number;
    }>('/api/admin/notifications/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const [apiRes, fsUsers] = await Promise.allSettled([
      apiPromise,
      canFs ? fetchAllUsersForAdminFromFirestore().catch(() => []) : Promise.resolve([]),
    ]);

    const resolvedApi = apiRes.status === 'fulfilled' ? apiRes.value : null;
    const totalFsUsers = fsUsers.status === 'fulfilled' ? fsUsers.value.length : 0;
    const estimatedRecipients = Math.max(
      resolvedApi?.campaign?.totalRecipients ?? 0,
      payload.audienceType === 'selected_users'
        ? payload.targetUserIds?.length ?? 0
        : totalFsUsers || 1
    );

    let fsCampaign: PushNotificationCampaign | null = null;
    if (canFs) {
      try {
        fsCampaign = await adminCreatePushNotificationInFirestore({
          id: resolvedApi?.campaign?.id,
          title: payload.title,
          body: payload.body,
          category: payload.category,
          imageUrl: payload.imageUrl,
          targetView: payload.targetView,
          actionUrl: payload.actionUrl,
          audienceType: payload.audienceType,
          targetUserIds: payload.targetUserIds,
          targetDepartment: payload.targetDepartment,
          targetSemester: payload.targetSemester,
          soundMode: payload.soundMode,
          totalRecipients: estimatedRecipients,
        });
      } catch (fsErr) {
        if (!resolvedApi) {
          throw fsErr;
        }
      }
    }

    if (resolvedApi) {
      return {
        ...resolvedApi,
        campaign: resolvedApi.campaign
          ? {
              ...resolvedApi.campaign,
              totalRecipients: Math.max(
                resolvedApi.campaign.totalRecipients,
                fsCampaign?.totalRecipients ?? 0
              ),
            }
          : fsCampaign ?? undefined,
      };
    }

    if (fsCampaign) {
      return {
        scheduled: false,
        fcmConfigured: false,
        campaign: fsCampaign,
        invalidTokensCleaned: 0,
      };
    }

    throw apiRes.status === 'rejected'
      ? apiRes.reason
      : new Error('নোটিফিকেশন পাঠানো যায়নি। আবার চেষ্টা করুন।');
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
