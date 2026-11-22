import React, { useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  BellRing,
  Check,
  CheckCheck,
  ExternalLink,
  Inbox,
  RefreshCw,
  Settings,
  ShieldAlert,
  Smartphone,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { getCategoryMeta, NOTIFICATION_CATEGORIES } from '../data/notificationCategories';
import { bi } from '../i18n/translations';
import {
  NOTIFICATION_SOUND_OPTIONS,
  playNotificationSound,
} from '../services/notificationSound';
import { getPushCapabilities } from '../services/pushNotificationService';
import type {
  AppView,
  AuthUser,
  DeviceTokenRecord,
  LanguageMode,
  NotificationPreferences,
  PushCategory,
  UserNotificationItem,
} from '../types/study';

interface NotificationCenterViewProps {
  language: LanguageMode;
  currentUser: AuthUser | null;
  notifications: UserNotificationItem[];
  preferences: NotificationPreferences;
  devices: DeviceTokenRecord[];
  fcmConfigured: boolean;
  isLoading: boolean;
  onRefreshInbox: () => Promise<void>;
  onMarkRead: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onDeleteNotification: (id: string) => Promise<void>;
  onUpdatePreferences: (partial: Partial<NotificationPreferences>) => Promise<void>;
  onRequestEnablePush: () => Promise<{
    granted: boolean;
    token: string | null;
    platform: 'web' | 'android';
    reason?: string;
  }>;
  onDeactivateDevice: () => Promise<void>;
  onNavigate: (view: AppView) => void;
}

export const NotificationCenterView: React.FC<NotificationCenterViewProps> = ({
  language,
  currentUser,
  notifications,
  preferences,
  devices,
  fcmConfigured,
  isLoading,
  onRefreshInbox,
  onMarkRead,
  onMarkAllRead,
  onDeleteNotification,
  onUpdatePreferences,
  onRequestEnablePush,
  onDeactivateDevice,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<'inbox' | 'preferences'>('inbox');
  const [selectedCategory, setSelectedCategory] = useState<PushCategory | 'ALL'>('ALL');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [enablingPush, setEnablingPush] = useState(false);

  const caps = getPushCapabilities();

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (selectedCategory !== 'ALL' && n.category !== selectedCategory) return false;
      if (onlyUnread && n.isRead) return false;
      return true;
    });
  }, [notifications, selectedCategory, onlyUnread]);

  const showNotice = (msg: string) => {
    setStatusBanner(msg);
    window.setTimeout(() => setStatusBanner(null), 5000);
  };

  const handleEnablePushClick = async () => {
    setEnablingPush(true);
    try {
      const res = await onRequestEnablePush();
      if (res.token) {
        showNotice(
          bi(
            language,
            'পুশ নোটিফিকেশন ও ডিভাইস টোকেন সফলভাবে নিবন্ধিত হয়েছে!',
            'Push notifications enabled and device token registered!'
          )
        );
      } else if (res.granted) {
        showNotice(
          res.reason ||
            bi(
              language,
              'ব্রাউজার অনুমতি সক্রিয় হয়েছে। ব্যাকগ্রাউন্ড FCM-এর জন্য Firebase কনফিগার করুন।',
              'Browser permission granted. Configure Firebase Web keys for background FCM push.'
            )
        );
      } else {
        showNotice(
          res.reason ||
            bi(
              language,
              'নোটিফিকেশন অনুমতি পাওয়া যায়নি। ব্রাউজার সেটিংস থেকে অনুমতি দিন।',
              'Notification permission was not granted.'
            )
        );
      }
      await onRefreshInbox();
    } finally {
      setEnablingPush(false);
    }
  };

  const handleNotificationOpen = async (item: UserNotificationItem) => {
    if (!item.isRead) {
      await onMarkRead(item.id);
    }
    if (item.actionUrl && /^https?:\/\//i.test(item.actionUrl)) {
      window.open(item.actionUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (item.targetView && item.targetView !== 'notifications') {
      onNavigate(item.targetView as AppView);
    }
  };

  const handlePreviewSound = async () => {
    const ok = await playNotificationSound(preferences.soundStyle, true);
    if (!ok) {
      showNotice(
        bi(
          language,
          'অডিও প্লেব্যাক ব্রাউজার দ্বারা ব্লক হয়েছে বা সাইলেন্ট আছে।',
          'Audio playback was blocked or muted by your device.'
        )
      );
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <BellRing className="w-6 h-6 text-cyan-500" />
            <span>{bi(language, 'নোটিফিকেশন সেন্টার', 'Notification Center')}</span>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-cyan-500 text-slate-950 text-xs font-bold tabular-nums">
                {unreadCount}
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {bi(
              language,
              'রিয়েল-টাইম আপডেট, জরুরি সতর্কতা, পরীক্ষা ও স্টাডি পুশ ইনবক্স ও সাউন্ড সেটিংস',
              'Real-time push inbox, category controls, sound settings & multi-device registration'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('inbox')}
            className={`min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
              activeTab === 'inbox'
                ? 'border-cyan-500 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>{bi(language, 'ইনবক্স ও ইতিহাস', 'Inbox & History')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preferences')}
            className={`min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
              activeTab === 'preferences'
                ? 'border-cyan-500 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>{bi(language, 'সেটিংস ও সাউন্ড', 'Settings & Sound')}</span>
          </button>
        </div>
      </div>

      {statusBanner && (
        <div className="p-3.5 rounded-xl bg-cyan-500/12 border border-cyan-500/35 text-xs font-medium text-cyan-800 dark:text-cyan-200">
          {statusBanner}
        </div>
      )}

      {/* Auth Gate Notice */}
      {!currentUser && (
        <div className="rounded-2xl bg-white dark:bg-[#111827] border border-amber-500/35 p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {bi(
                language,
                'ব্যক্তিগত পুশ ইনবক্স পেতে সাইন ইন করুন',
                'Sign in to receive & manage personal push notifications'
              )}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {bi(
                language,
                'আপনার অ্যাকাউন্টের সাথে Web ও Android ডিভাইস টোকেন সংযুক্ত থাকলে অফলাইনে থাকা বা অ্যাপ বন্ধ অবস্থাতেও সতর্কতা পৌঁছাবে।',
                'Linking your account registers Web/Android FCM tokens so updates arrive even when the app is closed.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
          >
            {bi(language, 'সাইন ইন / প্রোফাইল খুলুন', 'Sign In / Profile')}
          </button>
        </div>
      )}

      {/* Permission & Device Push Banner */}
      <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                caps.permission === 'granted'
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : caps.permission === 'denied'
                    ? 'bg-red-500/15 text-red-500'
                    : 'bg-cyan-500/15 text-cyan-500'
              }`}
            >
              {caps.permission === 'denied' ? (
                <BellOff className="w-5 h-5" />
              ) : (
                <Bell className="w-5 h-5" />
              )}
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {caps.permission === 'granted'
                  ? bi(language, 'ডিভাইস নোটিফিকেশন অনুমতি সক্রিয় আছে', 'Device Push Permission Active')
                  : caps.permission === 'denied'
                    ? bi(language, 'নোটিফিকেশন অনুমতি ব্লক করা আছে', 'Notifications Blocked in Browser/OS')
                    : bi(
                        language,
                        'পরীক্ষা ও জরুরি পুশ নোটিফিকেশন চালু করুন',
                        'Enable Real-Time Push Notifications'
                      )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">
                {caps.permission === 'denied'
                  ? bi(
                      language,
                      'আপনি পূর্বে নোটিফিকেশন ব্লক করেছেন। আমরা অনুমতি বাইপাস করি না — পুনরায় চালু করতে ব্রাউজারের সাইট সেটিংস (Lock icon -> Notifications -> Allow) ব্যবহার করুন।',
                      'Notifications were previously blocked. Polytechnic Hub respects your device privacy — re-enable via Browser Site Settings (Lock icon → Notifications → Allow).'
                    )
                  : caps.isIos && !caps.isStandalonePwa
                    ? bi(
                        language,
                        'iOS Safari-তে Web Push পেতে প্রথমে Share -> "Add to Home Screen" দিয়ে PWA অ্যাপ হিসেবে ইনস্টল করুন (iOS 16.4+)।',
                        'On iOS Safari, tap Share → "Add to Home Screen" first (iOS 16.4+) to enable Web Push notifications.'
                      )
                    : bi(
                        language,
                        'BTEB পরীক্ষার রুটিন, জরুরি সতর্কতা ও নতুন স্টাডি আপডেট পেতে পুশ অনুমতি চালু রাখুন। অ্যাপ বন্ধ থাকলেও FCM/Service Worker-এর মাধ্যমে বার্তা পৌঁছাবে।',
                        'Receive exam updates, urgent alerts, and study announcements via FCM & Service Worker even when the app is in the background or closed.'
                      )}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                <span>
                  Web FCM Config:{' '}
                  <strong className={caps.isFirebaseWebConfigured ? 'text-emerald-500' : 'text-amber-500'}>
                    {caps.isFirebaseWebConfigured ? 'Configured' : 'Pending VITE_FIREBASE_*'}
                  </strong>
                </span>
                <span>
                  Server FCM Dispatch:{' '}
                  <strong className={fcmConfigured ? 'text-emerald-500' : 'text-amber-500'}>
                    {fcmConfigured ? 'Active' : 'In-App / Realtime Only'}
                  </strong>
                </span>
                <span>
                  Active Devices: <strong className="text-slate-900 dark:text-white">{devices.length}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handlePreviewSound()}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Volume2 className="w-3.5 h-3.5 text-cyan-500" />
              <span>{bi(language, 'সাউন্ড টেস্ট', 'Test Sound')}</span>
            </button>

            {caps.permission !== 'denied' && (
              <button
                type="button"
                disabled={enablingPush}
                onClick={() => void handleEnablePushClick()}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold"
              >
                <BellRing className="w-3.5 h-3.5" />
                <span>
                  {enablingPush
                    ? bi(language, 'নিবন্ধন হচ্ছে...', 'Registering...')
                    : caps.cachedToken
                      ? bi(language, 'টোকেন রিফ্রেশ করুন', 'Refresh Push Token')
                      : bi(language, 'পুশ চালু করুন', 'Enable Push')}
                </span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* TAB 1: INBOX & HISTORY */}
      {activeTab === 'inbox' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCategory('ALL')}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                  selectedCategory === 'ALL'
                    ? 'border-cyan-500 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {bi(language, 'সবগুলো', 'All')} ({notifications.length})
              </button>
              {NOTIFICATION_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const active = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                      active
                        ? cat.badgeClass
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{bi(language, cat.labelBn, cat.labelEn)}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOnlyUnread((prev) => !prev)}
                className={`min-h-[34px] px-3 py-1 rounded-lg border text-xs font-medium ${
                  onlyUnread
                    ? 'border-cyan-500 bg-cyan-500/12 text-cyan-600 dark:text-cyan-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {bi(language, 'শুধু অপঠিত', 'Unread Only')}
              </button>
              <button
                type="button"
                onClick={() => void onRefreshInbox()}
                className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void onMarkAllRead()}
                  className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-700"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{bi(language, 'সব পঠিত করুন', 'Mark All Read')}</span>
                </button>
              )}
            </div>
          </div>

          {filteredNotifications.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-10 text-center space-y-2">
              <Inbox className="w-9 h-9 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {bi(language, 'কোনো নোটিফিকেশন পাওয়া যায়নি', 'No notifications in your inbox')}
              </p>
              <p className="text-xs text-slate-500">
                {bi(
                  language,
                  'অ্যাডমিন থেকে নতুন ঘোষণা, পরীক্ষার রুটিন বা আপডেট পাঠানো হলে এখানে দেখতে পাবেন।',
                  'Announcements, exam updates, and urgent alerts from Polytechnic Hub will appear here.'
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map((item) => {
                const meta = getCategoryMeta(item.category);
                const CatIcon = meta.icon;
                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl bg-white dark:bg-[#111827] border p-4 transition-colors ${
                      item.isRead
                        ? 'border-slate-200 dark:border-slate-800 opacity-90'
                        : `${meta.borderClass} shadow-sm`
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.iconBgClass}`}
                      >
                        <CatIcon className="w-5 h-5" />
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase ${meta.badgeClass}`}
                            >
                              {bi(language, meta.labelBn, meta.labelEn)}
                            </span>
                            {!item.isRead && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-600 dark:text-cyan-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                                {bi(language, 'নতুন', 'UNREAD')}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 tabular-nums">
                            {new Date(item.createdAt).toLocaleString(
                              language === 'bn' ? 'bn-BD' : 'en-US',
                              {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              }
                            )}
                          </span>
                        </div>

                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            {item.title}
                          </h3>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed whitespace-pre-wrap">
                            {item.body}
                          </p>
                        </div>

                        {item.imageUrl && (
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            className="max-h-48 w-auto rounded-xl border border-slate-200 dark:border-slate-800 object-cover"
                          />
                        )}

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {(item.targetView !== 'notifications' || item.actionUrl) && (
                            <button
                              type="button"
                              onClick={() => void handleNotificationOpen(item)}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
                            >
                              <span>{bi(language, 'সংশ্লিষ্ট পেজ খুলুন', 'Open Related Page')}</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                          {!item.isRead && (
                            <button
                              type="button"
                              onClick={() => void onMarkRead(item.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                              <span>{bi(language, 'পঠিত', 'Mark Read')}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void onDeleteNotification(item.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-red-500 hover:bg-red-500/10 ml-auto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{bi(language, 'মুছুন', 'Delete')}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: NOTIFICATION SETTINGS & SOUND CONTROLS */}
      {activeTab === 'preferences' && (
        <div className="space-y-5">
          {/* Master & Sound Settings */}
          <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 lg:p-6 space-y-5">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {bi(language, 'নোটিফিকেশন ও কাস্টম সাউন্ড সেটিংস', 'Push & Custom Sound Controls')}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-start justify-between gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {bi(language, 'পুশ নোটিফিকেশন গ্রহণ', 'Enable Notifications')}
                  </p>
                  <p className="text-xs text-slate-500">
                    {bi(
                      language,
                      'চালু বা বন্ধ করলে কেবল আপনার অ্যাকাউন্ট প্রেফারেন্স আপডেট হয়; ডিভাইস পারমিশন কখনোই জোর করে বদলানো হয় না।',
                      'Controls delivery preference without overriding your OS/browser permission.'
                    )}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.pushEnabled}
                  onChange={(e) => void onUpdatePreferences({ pushEnabled: e.target.checked })}
                  className="w-5 h-5 accent-cyan-600 mt-0.5 shrink-0"
                />
              </label>

              <label className="flex items-start justify-between gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    {preferences.soundEnabled ? (
                      <Volume2 className="w-4 h-4 text-cyan-500" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-slate-400" />
                    )}
                    <span>{bi(language, 'নোটিফিকেশন সাউন্ড', 'Notification Sound')}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {bi(
                      language,
                      'ডিভাইসের Silent / Do Not Disturb মোড সর্বদা অগ্রাধিকার পাবে।',
                      'Respects phone Silent and Do Not Disturb mode automatically.'
                    )}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.soundEnabled}
                  onChange={(e) => void onUpdatePreferences({ soundEnabled: e.target.checked })}
                  className="w-5 h-5 accent-cyan-600 mt-0.5 shrink-0"
                />
              </label>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {bi(language, 'সাউন্ড টোন নির্বাচন (Foreground & Android Channel)', 'Notification Tone Style')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {NOTIFICATION_SOUND_OPTIONS.map((tone) => (
                  <button
                    key={tone.id}
                    type="button"
                    disabled={!preferences.soundEnabled}
                    onClick={() => {
                      void onUpdatePreferences({ soundStyle: tone.id });
                      void playNotificationSound(tone.id, true);
                    }}
                    className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-semibold text-left transition-colors disabled:opacity-50 ${
                      preferences.soundStyle === tone.id
                        ? 'border-cyan-500 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {bi(language, tone.labelBn, tone.labelEn)}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {bi(
                  language,
                  'প্ল্যাটফর্ম তথ্য: ফোরগ্রাউন্ড অ্যাপ ও Android চ্যানেলে কাস্টম সাউন্ড কাজ করে। ব্রাউজার সম্পূর্ণ বন্ধ থাকলে ব্রাউজার/OS নিজস্ব ডিফল্ট সাউন্ড ব্যবহার করে (কাস্টম ব্যাকগ্রাউন্ড অডিও সব ব্রাউজারে সমর্থিত নয়)।',
                  'Platform transparency: Custom chime audio plays in-app and via Android notification channels. When a web browser is closed, the OS/browser plays its default notification sound (browsers do not permit custom background audio files).'
                )}
              </p>
            </div>
          </section>

          {/* Category Controls */}
          <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 lg:p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {bi(language, 'ক্যাটাগরি অনুযায়ী নিয়ন্ত্রণ', 'Category-Based Notification Controls')}
            </h2>

            <div className="space-y-2.5">
              {(
                [
                  {
                    cat: NOTIFICATION_CATEGORIES[2], // EDUCATION
                    key: 'allowEducation' as const,
                    value: preferences.allowEducation,
                    isCritical: false,
                  },
                  {
                    cat: NOTIFICATION_CATEGORIES[4], // GENERAL
                    key: 'allowGeneral' as const,
                    value: preferences.allowGeneral,
                    isCritical: false,
                  },
                  {
                    cat: NOTIFICATION_CATEGORIES[0], // APP_UPDATE
                    key: 'allowAppUpdate' as const,
                    value: preferences.allowAppUpdate,
                    isCritical: false,
                  },
                  {
                    cat: NOTIFICATION_CATEGORIES[1], // IMPORTANT
                    key: 'allowImportant' as const,
                    value: preferences.allowImportant,
                    isCritical: false,
                  },
                  {
                    cat: NOTIFICATION_CATEGORIES[3], // EMERGENCY
                    key: 'allowEmergency' as const,
                    value: preferences.allowEmergency,
                    isCritical: true,
                  },
                ] as const
              ).map(({ cat, key, value, isCritical }) => {
                const Icon = cat.icon;
                return (
                  <label
                    key={cat.id}
                    className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border cursor-pointer ${
                      isCritical ? 'border-red-500/35 bg-red-500/5' : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cat.iconBgClass}`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{bi(language, cat.labelBn, cat.labelEn)}</span>
                          {isCritical && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
                              <ShieldAlert className="w-3 h-3" />
                              {bi(language, 'অতি জরুরি ও নিরাপত্তা', 'Critical Security & Emergency')}
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {bi(language, cat.descBn, cat.descEn)}
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={(e) => void onUpdatePreferences({ [key]: e.target.checked })}
                      className="w-4 h-4 accent-cyan-600 shrink-0"
                    />
                  </label>
                );
              })}
            </div>
          </section>

          {/* Registered Multi-Device Tokens */}
          <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-cyan-500" />
                <span>{bi(language, 'নিবন্ধিত ডিভাইসসমূহ', 'Registered Push Devices')}</span>
              </h2>
              {caps.cachedToken && (
                <button
                  type="button"
                  onClick={() => void onDeactivateDevice().then(() => onRefreshInbox())}
                  className="text-xs font-semibold text-red-500 hover:underline"
                >
                  {bi(language, 'এই ডিভাইস বিচ্ছিন্ন করুন', 'Unregister This Device')}
                </button>
              )}
            </div>

            {devices.length === 0 ? (
              <p className="text-xs text-slate-500">
                {bi(
                  language,
                  'এখনো কোনো FCM ডিভাইস টোকেন নিবন্ধিত হয়নি। উপরের "Enable Push" বাটনে ক্লিক করুন।',
                  'No active FCM device tokens registered yet. Click "Enable Push" above when Firebase config is active.'
                )}
              </p>
            ) : (
              <div className="space-y-2">
                {devices.map((d) => (
                  <div
                    key={d.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white uppercase">
                        {d.platform} · v{d.appVersion}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">{d.browserOrDevice || 'Browser / Device'}</p>
                    </div>
                    <span className="text-[11px] text-emerald-500 font-semibold shrink-0">Active</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
