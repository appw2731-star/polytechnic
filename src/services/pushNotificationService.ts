import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { getMessaging, getToken, isSupported, onMessage, type MessagePayload } from 'firebase/messaging';
import { NOTIFICATION_CATEGORIES } from '../data/notificationCategories';
import { firebaseApp, FIREBASE_RUNTIME_CONFIG } from '../firebase';
import type { PushCategory } from '../types/study';
import { apiClient } from './apiClient';

const TOKEN_CACHE_KEY = 'polytechnic_hub_fcm_token_v1';

const FIREBASE_WEB_CONFIG = FIREBASE_RUNTIME_CONFIG;

const FIREBASE_VAPID_KEY =
  (import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined)?.trim() || '';

export interface PushCapabilities {
  isNativeAndroid: boolean;
  isWebPushSupported: boolean;
  isFirebaseWebConfigured: boolean;
  isIos: boolean;
  isStandalonePwa: boolean;
  permission: NotificationPermission | 'unsupported';
  cachedToken: string | null;
}

export interface ForegroundPushEvent {
  notificationId: string;
  title: string;
  body: string;
  category: PushCategory;
  targetView: string;
  actionUrl: string;
  imageUrl: string;
  soundMode: 'custom' | 'default' | 'silent';
}

export function isFirebaseWebPushReady(): boolean {
  return Boolean(
    FIREBASE_WEB_CONFIG.apiKey &&
      FIREBASE_WEB_CONFIG.projectId &&
      FIREBASE_WEB_CONFIG.messagingSenderId &&
      FIREBASE_WEB_CONFIG.appId &&
      FIREBASE_VAPID_KEY
  );
}

export function getCachedPushToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_CACHE_KEY);
  } catch {
    return null;
  }
}

function setCachedPushToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_CACHE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_CACHE_KEY);
    }
  } catch {
    // ignore
  }
}

export function getPushCapabilities(): PushCapabilities {
  const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isStandalonePwa =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true);

  const isWebPushSupported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  const permission: NotificationPermission | 'unsupported' =
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';

  return {
    isNativeAndroid,
    isWebPushSupported,
    isFirebaseWebConfigured: isFirebaseWebPushReady(),
    isIos,
    isStandalonePwa,
    permission,
    cachedToken: getCachedPushToken(),
  };
}

export async function ensureAndroidNotificationChannels(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  try {
    for (const cat of NOTIFICATION_CATEGORIES) {
      await PushNotifications.createChannel({
        id: cat.androidChannelId,
        name: cat.androidChannelName,
        description: cat.descEn,
        importance: cat.androidImportance,
        visibility: 1,
        sound: 'polytechnic_chime',
        vibration: true,
        lights: true,
      });
    }
  } catch (err) {
    console.warn('Android notification channel creation warning:', err);
  }
}

async function getOrRegisterPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) {
      return existing;
    }
    // In dev or non-SW builds, register standalone /sw-push.js directly
    const reg = await navigator.serviceWorker.register('/sw-push.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return reg;
  } catch {
    return null;
  }
}

function normalizePushData(rawData: Record<string, unknown>, titleFallback = '', bodyFallback = ''): ForegroundPushEvent {
  const rawCat = String(rawData.category || 'GENERAL').toUpperCase();
  const validCats: PushCategory[] = ['APP_UPDATE', 'IMPORTANT', 'EDUCATION', 'EMERGENCY', 'GENERAL'];
  const category: PushCategory = validCats.includes(rawCat as PushCategory)
    ? (rawCat as PushCategory)
    : 'GENERAL';

  const rawSound = String(rawData.soundMode || rawData.sound_mode || 'custom');
  const soundMode: 'custom' | 'default' | 'silent' =
    rawSound === 'silent' || rawSound === 'default' ? rawSound : 'custom';

  return {
    notificationId: String(rawData.notificationId || rawData.notification_id || ''),
    title: String(rawData.title || titleFallback || 'Polytechnic Hub'),
    body: String(rawData.body || bodyFallback || ''),
    category,
    targetView: String(rawData.targetView || rawData.target_view || 'notifications'),
    actionUrl: String(rawData.actionUrl || rawData.action_url || ''),
    imageUrl: String(rawData.imageUrl || rawData.image_url || ''),
    soundMode,
  };
}

export const pushNotificationService = {
  async requestPermissionAndRegister(isAuthenticated: boolean): Promise<{
    granted: boolean;
    token: string | null;
    platform: 'web' | 'android';
    reason?: string;
  }> {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      await ensureAndroidNotificationChannels();
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }
      if (permStatus.receive !== 'granted') {
        return {
          granted: false,
          token: null,
          platform: 'android',
          reason: 'Android notification permission denied.',
        };
      }

      const tokenPromise = new Promise<string | null>((resolve) => {
        const timeout = window.setTimeout(() => resolve(null), 8000);
        void PushNotifications.addListener('registration', (regToken) => {
          window.clearTimeout(timeout);
          resolve(regToken.value);
        });
        void PushNotifications.addListener('registrationError', () => {
          window.clearTimeout(timeout);
          resolve(null);
        });
      });

      await PushNotifications.register();
      const nativeToken = await tokenPromise;
      if (nativeToken) {
        setCachedPushToken(nativeToken);
        if (isAuthenticated) {
          await apiClient
            .registerDeviceToken({
              token: nativeToken,
              platform: 'android',
              browserOrDevice: navigator.userAgent.slice(0, 100),
            })
            .catch(() => {});
        }
      }
      return {
        granted: true,
        token: nativeToken,
        platform: 'android',
        reason: nativeToken ? undefined : 'Capacitor FCM token unavailable (check google-services.json).',
      };
    }

    // Web / PWA Push flow
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
      return {
        granted: false,
        token: null,
        platform: 'web',
        reason: 'This browser does not support Web Push notifications.',
      };
    }

    const permission =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();

    if (permission !== 'granted') {
      return {
        granted: false,
        token: null,
        platform: 'web',
        reason:
          permission === 'denied'
            ? 'Notification permission was blocked in browser settings.'
            : 'Notification permission dismissed.',
      };
    }

    const swReg = await getOrRegisterPushServiceWorker();
    if (!isFirebaseWebPushReady()) {
      return {
        granted: true,
        token: null,
        platform: 'web',
        reason:
          'Browser permission granted for foreground/local alerts. Configure VITE_FIREBASE_* and VITE_FIREBASE_VAPID_KEY for background FCM push.',
      };
    }

    try {
      const fcmSupported = await isSupported();
      if (!fcmSupported) {
        return {
          granted: true,
          token: null,
          platform: 'web',
          reason: 'Firebase Web Messaging is not supported in this browser context.',
        };
      }

      const messaging = getMessaging(firebaseApp);
      const token = await getToken(messaging, {
        vapidKey: FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: swReg ?? undefined,
      });

      if (token) {
        setCachedPushToken(token);
        if (isAuthenticated) {
          await apiClient
            .registerDeviceToken({
              token,
              platform: 'web',
              browserOrDevice: navigator.userAgent.slice(0, 100),
            })
            .catch(() => {});
        }
      }

      return { granted: Boolean(token), token: token || null, platform: 'web' };
    } catch (err) {
      return {
        granted: true,
        token: null,
        platform: 'web',
        reason: err instanceof Error ? err.message : 'Failed to obtain FCM Web token.',
      };
    }
  },

  async deactivateCurrentDevice(): Promise<void> {
    const token = getCachedPushToken();
    if (!token) return;
    await apiClient.deactivateDeviceToken(token).catch(() => {});
    setCachedPushToken(null);
  },

  subscribeForegroundHandlers(handlers: {
    onForegroundMessage: (event: ForegroundPushEvent) => void;
    onNotificationClick: (info: {
      targetView: string;
      notificationId: string;
      actionUrl: string;
    }) => void;
  }): () => void {
    const cleanups: (() => void)[] = [];

    // 1. Service Worker window messages (click deep link & background sync ping)
    if ('serviceWorker' in navigator) {
      const onSwMessage = (event: MessageEvent) => {
        const msg = event.data as {
          type?: string;
          targetView?: string;
          notificationId?: string;
          actionUrl?: string;
          payload?: Record<string, unknown>;
        };
        if (!msg?.type) return;
        if (msg.type === 'POLYTECHNIC_NOTIFICATION_CLICK') {
          handlers.onNotificationClick({
            targetView: msg.targetView || 'notifications',
            notificationId: msg.notificationId || '',
            actionUrl: msg.actionUrl || '',
          });
        } else if (msg.type === 'POLYTECHNIC_PUSH_RECEIVED' && msg.payload) {
          handlers.onForegroundMessage(normalizePushData(msg.payload));
        }
      };
      navigator.serviceWorker.addEventListener('message', onSwMessage);
      cleanups.push(() => navigator.serviceWorker.removeEventListener('message', onSwMessage));
    }

    // 2. Firebase Web SDK foreground onMessage
    if (isFirebaseWebPushReady() && typeof window !== 'undefined') {
      void isSupported().then((supported) => {
        if (!supported) return;
        try {
          const messaging = getMessaging(firebaseApp);
          const unsubscribe = onMessage(messaging, (payload: MessagePayload) => {
            const normalized = normalizePushData(
              (payload.data as Record<string, unknown>) ?? {},
              payload.notification?.title ?? '',
              payload.notification?.body ?? ''
            );
            if (!normalized.imageUrl && payload.notification?.image) {
              normalized.imageUrl = payload.notification.image;
            }
            handlers.onForegroundMessage(normalized);
          });
          cleanups.push(unsubscribe);
        } catch {
          // ignore if SW / messaging unavailable
        }
      });
    }

    // 3. Capacitor Android Native Foreground & Action Click Listeners
    if (Capacitor.isNativePlatform()) {
      void ensureAndroidNotificationChannels();
      const fgPromise = PushNotifications.addListener('pushNotificationReceived', (notif) => {
        const normalized = normalizePushData(
          (notif.data as Record<string, unknown>) ?? {},
          notif.title ?? '',
          notif.body ?? ''
        );
        handlers.onForegroundMessage(normalized);
      });
      const clickPromise = PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (action) => {
          const data = (action.notification.data as Record<string, unknown>) ?? {};
          handlers.onNotificationClick({
            targetView: String(data.targetView || data.target_view || 'notifications'),
            notificationId: String(data.notificationId || data.notification_id || ''),
            actionUrl: String(data.actionUrl || data.action_url || ''),
          });
        }
      );
      cleanups.push(() => {
        void fgPromise.then((h) => h.remove());
        void clickPromise.then((h) => h.remove());
      });
    }

    return () => {
      for (const fn of cleanups) {
        try {
          fn();
        } catch {
          // ignore
        }
      }
    };
  },
};
