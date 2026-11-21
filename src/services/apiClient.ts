import { getActiveAccessToken } from '../lib/supabaseClient';
import {
  AdminAiConfig,
  AdminUsageMetrics,
  AppReleaseConfig,
  AuthUser,
  CommunityPost,
  FormulaItem,
  McqQuestion,
  PlatformNotice,
  SharedPdfNote,
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

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const supabaseToken = await getActiveAccessToken();
  const token = supabaseToken || getStoredToken();
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

  adminModeratePost(
    id: string,
    payload: { isHidden?: boolean; clearReports?: boolean }
  ): Promise<{ post: CommunityPost }> {
    return apiRequest(`/api/admin/community/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
};
