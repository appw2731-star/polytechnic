import crypto from 'crypto';
import type { PushCategory } from './database.ts';

interface ServiceAccountJson {
  project_id: string;
  client_email: string;
  private_key: string;
}

const ANDROID_CHANNEL_MAP: Record<PushCategory, string> = {
  APP_UPDATE: 'polytechnic_app_update',
  IMPORTANT: 'polytechnic_important',
  EDUCATION: 'polytechnic_education',
  EMERGENCY: 'polytechnic_emergency',
  GENERAL: 'polytechnic_general',
};

let cachedOAuthToken: { token: string; expiresAt: number; clientEmail: string } | null = null;

export function getFirebaseServiceAccount(): ServiceAccountJson | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccountJson>;
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

export function isFcmAdminConfigured(): boolean {
  return Boolean(getFirebaseServiceAccount());
}

async function getGoogleFcmAccessToken(creds: ServiceAccountJson): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (
    cachedOAuthToken &&
    cachedOAuthToken.clientEmail === creds.client_email &&
    cachedOAuthToken.expiresAt > now + 60
  ) {
    return cachedOAuthToken.token;
  }

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(
    JSON.stringify({
      iss: creds.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url');

  const unsigned = `${header}.${claim}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer.sign(creds.private_key, 'base64url');
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`FCM OAuth token exchange failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cachedOAuthToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600),
    clientEmail: creds.client_email,
  };
  return data.access_token;
}

export interface SendFcmInput {
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

export async function dispatchFcmMessage(
  input: SendFcmInput
): Promise<{ ok: boolean; invalidToken?: boolean; error?: string }> {
  const creds = getFirebaseServiceAccount();
  if (!creds) {
    return { ok: false, error: 'FIREBASE_SERVICE_ACCOUNT_JSON is not configured on server.' };
  }

  const accessToken = await getGoogleFcmAccessToken(creds);
  const channelId = ANDROID_CHANNEL_MAP[input.category] || 'polytechnic_general';
  const link =
    input.actionUrl && input.actionUrl.startsWith('/')
      ? input.actionUrl
      : `/?view=${encodeURIComponent(input.targetView)}&nid=${encodeURIComponent(input.notificationId)}`;

  const androidNotification: Record<string, unknown> = {
    channel_id: channelId,
    title: input.title,
    body: input.body,
    click_action: 'FCM_PLUGIN_ACTIVITY',
  };
  if (input.soundMode === 'custom') {
    androidNotification.sound = 'polytechnic_chime';
  } else if (input.soundMode === 'default') {
    androidNotification.sound = 'default';
  }
  if (input.imageUrl) {
    androidNotification.image = input.imageUrl;
  }

  const webpushNotification: Record<string, unknown> = {
    title: input.title,
    body: input.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: `ph-notif-${input.notificationId}`,
    renotify: true,
    requireInteraction: input.category === 'EMERGENCY',
    silent: input.soundMode === 'silent',
  };
  if (input.imageUrl) {
    webpushNotification.image = input.imageUrl;
  }

  const message: Record<string, unknown> = {
    token: input.token,
    notification: {
      title: input.title,
      body: input.body,
      ...(input.imageUrl ? { image: input.imageUrl } : {}),
    },
    data: {
      notificationId: input.notificationId,
      category: input.category,
      targetView: input.targetView,
      actionUrl: input.actionUrl || '',
      imageUrl: input.imageUrl || '',
      soundMode: input.soundMode,
      title: input.title,
      body: input.body,
    },
    android: {
      priority: input.category === 'EMERGENCY' || input.category === 'IMPORTANT' ? 'HIGH' : 'NORMAL',
      notification: androidNotification,
    },
    webpush: {
      headers: {
        Urgency: input.category === 'EMERGENCY' ? 'high' : 'normal',
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
