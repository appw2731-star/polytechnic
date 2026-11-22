// Shared Firebase Cloud Messaging (FCM HTTP v1) helper for Supabase Edge Functions (Deno).
// Uses FIREBASE_SERVICE_ACCOUNT_JSON secret — never exposed to client code.

export interface ServiceAccountCredentials {
  project_id: string;
  client_email: string;
  private_key: string;
}

export type PushCategory = 'APP_UPDATE' | 'IMPORTANT' | 'EDUCATION' | 'EMERGENCY' | 'GENERAL';

export const ANDROID_CHANNEL_MAP: Record<PushCategory, string> = {
  APP_UPDATE: 'polytechnic_app_update',
  IMPORTANT: 'polytechnic_important',
  EDUCATION: 'polytechnic_education',
  EMERGENCY: 'polytechnic_emergency',
  GENERAL: 'polytechnic_general',
};

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function parseServiceAccount(rawJson: string | undefined): ServiceAccountCredentials | null {
  if (!rawJson || !rawJson.trim()) return null;
  try {
    const parsed = JSON.parse(rawJson) as Partial<ServiceAccountCredentials>;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    return {
      project_id: parsed.project_id,
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, '\n'),
    };
  } catch {
    return null;
  }
}

export async function getFcmAccessToken(creds: ServiceAccountCredentials): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: creds.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: nowSec,
      exp: nowSec + 3600,
    })
  );
  const signingInput = `${header}.${claim}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(creds.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google OAuth token exchange failed (${res.status}): ${errText}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export interface FcmDispatchPayload {
  token: string;
  platform: 'web' | 'android' | 'ios';
  title: string;
  body: string;
  category: PushCategory;
  notificationId: string;
  targetView: string;
  actionUrl?: string;
  imageUrl?: string;
  soundMode: 'custom' | 'default' | 'silent';
}

export async function sendSingleFcmMessage(
  creds: ServiceAccountCredentials,
  accessToken: string,
  payload: FcmDispatchPayload
): Promise<{ ok: boolean; invalidToken?: boolean; error?: string }> {
  const channelId = ANDROID_CHANNEL_MAP[payload.category] || 'polytechnic_general';
  const link =
    payload.actionUrl && payload.actionUrl.startsWith('/')
      ? payload.actionUrl
      : `/?view=${encodeURIComponent(payload.targetView)}&nid=${encodeURIComponent(payload.notificationId)}`;

  const androidNotification: Record<string, unknown> = {
    channel_id: channelId,
    title: payload.title,
    body: payload.body,
    click_action: 'FCM_PLUGIN_ACTIVITY',
  };
  if (payload.soundMode === 'custom') {
    androidNotification.sound = 'polytechnic_chime';
  } else if (payload.soundMode === 'default') {
    androidNotification.sound = 'default';
  }
  if (payload.imageUrl) {
    androidNotification.image = payload.imageUrl;
  }

  const webpushNotification: Record<string, unknown> = {
    title: payload.title,
    body: payload.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: `ph-notif-${payload.notificationId}`,
    renotify: true,
    requireInteraction: payload.category === 'EMERGENCY',
    silent: payload.soundMode === 'silent',
  };
  if (payload.imageUrl) {
    webpushNotification.image = payload.imageUrl;
  }

  const message: Record<string, unknown> = {
    token: payload.token,
    notification: {
      title: payload.title,
      body: payload.body,
      ...(payload.imageUrl ? { image: payload.imageUrl } : {}),
    },
    data: {
      notificationId: payload.notificationId,
      category: payload.category,
      targetView: payload.targetView,
      actionUrl: payload.actionUrl || '',
      imageUrl: payload.imageUrl || '',
      soundMode: payload.soundMode,
      title: payload.title,
      body: payload.body,
    },
    android: {
      priority: payload.category === 'EMERGENCY' || payload.category === 'IMPORTANT' ? 'HIGH' : 'NORMAL',
      notification: androidNotification,
    },
    webpush: {
      headers: {
        Urgency: payload.category === 'EMERGENCY' ? 'high' : 'normal',
      },
      notification: webpushNotification,
      fcm_options: {
        link,
      },
    },
  };

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${creds.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    }
  );

  if (res.ok) {
    return { ok: true };
  }

  const errJson = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string; details?: { errorCode?: string }[] };
  };
  const errCode =
    errJson?.error?.details?.find((d) => d.errorCode)?.errorCode || errJson?.error?.status || '';
  const invalidToken =
    res.status === 404 ||
    res.status === 410 ||
    errCode === 'UNREGISTERED' ||
    errCode === 'INVALID_ARGUMENT';

  return {
    ok: false,
    invalidToken,
    error: errJson?.error?.message || `FCM error ${res.status}`,
  };
}
