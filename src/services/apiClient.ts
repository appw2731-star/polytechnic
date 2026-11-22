import { getActiveAccessToken } from '../lib/supabaseClient';
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

export interface BootstrapResponse {
  notices: PlatformNotice[];
  sharedNotes: SharedPdfNote[];
  mcqs: (McqQuestion & { semester?: number })[];
  customFormulas: FormulaItem[];
  deletedFormulaIds: string[];
  appConfig: AppReleaseConfig;
  hasAdmin: boolean;
}

export function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
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
  return getActiveAccessToken();
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getUnifiedAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
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

  updateProfile(
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
      >
    >
  ): Promise<{ user: AuthUser }> {
    return apiRequest('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  // Community
  getCommunityPosts(includeHidden = false): Promise<{ posts: CommunityPost[] }> {
    const q = includeHidden ? '?includeHidden=1' : '';
    return apiRequest(`/api/community/posts${q}`);
  },

  createCommunityPost(payload: {
    title: string;
    body: string;
    department: string;
    semester: number;
    subjectTag?: string;
  }): Promise<{ post: CommunityPost }> {
    return apiRequest('/api/community/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  replyCommunityPost(postId: string, body: string): Promise<{ post: CommunityPost }> {
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

  deleteCommunityPost(postId: string): Promise<{ deleted: boolean }> {
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
