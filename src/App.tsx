import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { BASE_MATHEMATICS_FORMULAS, BASE_PHYSICS_FORMULAS } from './data/formulas';
import { AdminDashboardView } from './components/AdminDashboardView';
import { AiAssistantView } from './components/AiAssistantView';
import { BtebResultView } from './components/BtebResultView';
import { CommunityView } from './components/CommunityView';
import { DashboardView } from './components/DashboardView';
import { FormulaHubView } from './components/FormulaHubView';
import { InstallAppView } from './components/InstallAppView';
import { DesktopSidebar, MobileBottomNav, TopHeader } from './components/NavigationChrome';
import { NotesView } from './components/NotesView';
import { NotificationCenterView } from './components/NotificationCenterView';
import { PdfLibraryView } from './components/PdfLibraryView';
import { SplashScreen } from './components/PolytechnicHubLogo';
import { PowerToolsView } from './components/PowerToolsView';
import { ProfileAuthView } from './components/ProfileAuthView';
import { ProgressView } from './components/ProgressView';
import { QuizView } from './components/QuizView';
import { RoutineView } from './components/RoutineView';
import { SettingsView } from './components/SettingsView';
import { StudyTimeView } from './components/StudyTimeView';
import { SubjectsView } from './components/SubjectsView';
import { getCategoryMeta } from './data/notificationCategories';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { usePWAInstall } from './hooks/usePWAInstall';
import { bi } from './i18n/translations';
import {
  consumeGoogleRedirectResult,
  formatFirebaseAuthError,
  signOutFirebase,
  subscribeFirebaseAuth,
} from './lib/firebaseAuth';
import { supabase } from './lib/supabaseClient';
import { aiService } from './services/aiService';
import { apiClient, BootstrapResponse, getStoredToken, setStoredToken } from './services/apiClient';
import {
  deleteStudyNoteFromFirestore,
  subscribeUserStudyNotes,
  syncStudyNoteToFirestore,
  syncUserProfileToFirestore,
} from './services/firestoreService';
import { playNotificationSound } from './services/notificationSound';
import { offlineDb } from './services/offlineDb';
import { pushNotificationService } from './services/pushNotificationService';
import { createNewAiSession, storageService } from './services/storageService';
import {
  AiChatMessage,
  AiChatSession,
  AppReleaseConfig,
  AppView,
  AuthUser,
  CompletedTimerSession,
  DepartmentId,
  DeviceTokenRecord,
  FormulaItem,
  NotificationPreferences,
  PushCategory,
  QuizAttempt,
  SemesterNumber,
  StudyMateState,
  StudyNote,
  StudyTask,
  Subject,
  TimeSettings,
  UserNotificationItem,
  UserSettings,
} from './types/study';
import { getDhakaClockSnapshot } from './utils/formatBn';

const VALID_APP_VIEWS = new Set<AppView>([
  'dashboard',
  'notifications',
  'pdf-library',
  'formulas',
  'result',
  'ai',
  'tools',
  'profile',
  'subjects',
  'routine',
  'timer',
  'quiz',
  'notes',
  'community',
  'progress',
  'install',
  'settings',
  'admin',
]);

const LOCAL_SOUND_PREF_KEY = 'polytechnic_hub_sound_prefs_v1';

function loadLocalSoundPref(): {
  soundEnabled?: boolean;
  soundStyle?: NotificationPreferences['soundStyle'];
} {
  try {
    const raw = window.localStorage.getItem(LOCAL_SOUND_PREF_KEY);
    return raw ? (JSON.parse(raw) as { soundEnabled?: boolean; soundStyle?: NotificationPreferences['soundStyle'] }) : {};
  } catch {
    return {};
  }
}

function saveLocalSoundPref(prefs: Partial<NotificationPreferences>): void {
  try {
    const cur = loadLocalSoundPref();
    window.localStorage.setItem(
      LOCAL_SOUND_PREF_KEY,
      JSON.stringify({
        soundEnabled: prefs.soundEnabled ?? cur.soundEnabled ?? true,
        soundStyle: prefs.soundStyle ?? cur.soundStyle ?? 'chime',
      })
    );
  } catch {
    // ignore storage quota errors
  }
}

function makeDefaultNotificationPrefs(userId = ''): NotificationPreferences {
  const now = new Date().toISOString();
  const saved = typeof window !== 'undefined' ? loadLocalSoundPref() : {};
  return {
    userId,
    pushEnabled: true,
    soundEnabled: saved.soundEnabled ?? true,
    soundStyle: saved.soundStyle ?? 'chime',
    respectDnd: true,
    allowAppUpdate: true,
    allowImportant: true,
    allowEducation: true,
    allowEmergency: true,
    allowGeneral: true,
    updatedAt: now,
  };
}

function isCategoryAllowedByPrefs(
  category: PushCategory,
  prefs: NotificationPreferences
): boolean {
  if (!prefs.pushEnabled) {
    return category === 'EMERGENCY';
  }
  switch (category) {
    case 'APP_UPDATE':
      return prefs.allowAppUpdate;
    case 'IMPORTANT':
      return prefs.allowImportant;
    case 'EDUCATION':
      return prefs.allowEducation;
    case 'EMERGENCY':
      return prefs.allowEmergency;
    case 'GENERAL':
    default:
      return prefs.allowGeneral;
  }
}

const DEFAULT_APP_CONFIG: AppReleaseConfig = {
  appVersion: '2.0.0',
  apkStatus: 'coming_soon',
  apkDownloadUrl: '',
  apkReleaseNotes:
    'Android Capacitor project configured. Release APK download will activate once published by Admin.',
  btebResultUrl: 'https://result.bteb.gov.bd/result-search',
  officialWebsiteUrl: 'https://bteb.gov.bd/',
  updatedAt: new Date().toISOString(),
};

export default function App() {
  const [state, setState] = useState<StudyMateState>(() => storageService.loadState());
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  const [inAppToast, setInAppToast] = useState<{
    title: string;
    body: string;
    category?: PushCategory;
    targetView?: AppView;
    imageUrl?: string;
    notificationId?: string;
  } | null>(null);
  const firedRemindersRef = useRef<Set<string>>(new Set());
  const pendingDeepLinkNotificationIdRef = useRef<string | null>(null);

  const isOnline = useOnlineStatus();
  const { canPrompt, isInstalled, isIos, promptInstall } = usePWAInstall();

  const [swUpdateHandler, setSwUpdateHandler] = useState<(() => void) | null>(null);

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [inboxNotifications, setInboxNotifications] = useState<UserNotificationItem[]>([]);
  const [unreadPushCount, setUnreadPushCount] = useState<number>(0);
  const [pushPreferences, setPushPreferences] = useState<NotificationPreferences>(() =>
    makeDefaultNotificationPrefs()
  );
  const [registeredDevices, setRegisteredDevices] = useState<DeviceTokenRecord[]>([]);
  const [fcmServerConfigured, setFcmServerConfigured] = useState<boolean>(false);
  const [inboxLoading, setInboxLoading] = useState<boolean>(false);
  const pushPreferencesRef = useRef<NotificationPreferences>(pushPreferences);

  const [bootstrap, setBootstrap] = useState<BootstrapResponse>({
    notices: [],
    sharedNotes: [],
    mcqs: [],
    customFormulas: [],
    deletedFormulaIds: [],
    appConfig: DEFAULT_APP_CONFIG,
    hasAdmin: false,
  });

  useEffect(() => {
    pushPreferencesRef.current = pushPreferences;
  }, [pushPreferences]);

  useEffect(() => {
    const t = window.setTimeout(() => setShowSplash(false), 550);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onSwUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ applyUpdate: () => void }>).detail;
      if (detail?.applyUpdate) {
        setSwUpdateHandler(() => detail.applyUpdate);
      }
    };
    window.addEventListener('polytechnic-sw-update', onSwUpdate);
    return () => window.removeEventListener('polytechnic-sw-update', onSwUpdate);
  }, []);

  const refreshNotificationInbox = useCallback(async () => {
    if (!currentUser || !isOnline) return;
    setInboxLoading(true);
    try {
      const data = await apiClient.getNotificationInbox();
      setInboxNotifications(data.notifications);
      setUnreadPushCount(data.unreadCount);
      setPushPreferences(data.preferences);
      setRegisteredDevices(data.devices);
      setFcmServerConfigured(data.fcmConfigured);
    } catch {
      // keep current state on transient errors
    } finally {
      setInboxLoading(false);
    }
  }, [currentUser, isOnline]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view') as AppView | null;
    const nidParam = params.get('nid');
    if (viewParam && VALID_APP_VIEWS.has(viewParam)) {
      setActiveView(viewParam);
    }
    if (nidParam) {
      pendingDeepLinkNotificationIdRef.current = nidParam;
    }
    if (viewParam || nidParam) {
      const cleanUrl = `${window.location.pathname}${window.location.hash}`;
      window.history.replaceState({}, '', cleanUrl);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setInboxNotifications([]);
      setUnreadPushCount(0);
      setRegisteredDevices([]);
      setPushPreferences(makeDefaultNotificationPrefs());
      return;
    }
    void refreshNotificationInbox();
    if (pendingDeepLinkNotificationIdRef.current) {
      const nid = pendingDeepLinkNotificationIdRef.current;
      pendingDeepLinkNotificationIdRef.current = null;
      void apiClient
        .markNotificationRead(nid)
        .then(() => refreshNotificationInbox())
        .catch(() => {});
    }
  }, [currentUser, refreshNotificationInbox]);

  useEffect(() => {
    if (!currentUser || !isOnline) return;
    const poll = window.setInterval(() => {
      void refreshNotificationInbox();
    }, 30000);
    return () => window.clearInterval(poll);
  }, [currentUser, isOnline, refreshNotificationInbox]);

  useEffect(() => {
    const unsubscribe = pushNotificationService.subscribeForegroundHandlers({
      onForegroundMessage: (evt) => {
        const prefs = pushPreferencesRef.current;
        if (!isCategoryAllowedByPrefs(evt.category, prefs)) return;

        const shouldPlayCustom =
          prefs.soundEnabled && evt.soundMode !== 'silent' && evt.soundMode !== 'default';
        if (shouldPlayCustom) {
          void playNotificationSound(prefs.soundStyle, true);
        } else if (prefs.soundEnabled && evt.soundMode === 'default') {
          void playNotificationSound('system', true);
        }

        const safeTarget: AppView = VALID_APP_VIEWS.has(evt.targetView as AppView)
          ? (evt.targetView as AppView)
          : 'notifications';
        setInAppToast({
          title: evt.title,
          body: evt.body,
          category: evt.category,
          targetView: safeTarget,
          imageUrl: evt.imageUrl || undefined,
          notificationId: evt.notificationId || undefined,
        });
        void refreshNotificationInbox();
      },
      onNotificationClick: ({ targetView, notificationId, actionUrl }) => {
        if (notificationId && currentUser) {
          void apiClient
            .markNotificationRead(notificationId)
            .then(() => refreshNotificationInbox())
            .catch(() => {});
        }
        if (targetView && VALID_APP_VIEWS.has(targetView as AppView)) {
          setActiveView(targetView as AppView);
        } else {
          setActiveView('notifications');
        }
        if (actionUrl && actionUrl.startsWith('https://')) {
          window.location.assign(actionUrl);
        }
      },
    });
    return unsubscribe;
  }, [currentUser, refreshNotificationInbox]);

  useEffect(() => {
    if (!supabase || !currentUser || currentUser.id.startsWith('usr-')) return;
    const sb = supabase;
    const channel = sb
      .channel(`user-notifications-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${currentUser.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            title?: string;
            body?: string;
            category?: PushCategory;
            target_view?: string;
            image_url?: string | null;
          };
          const prefs = pushPreferencesRef.current;
          const cat: PushCategory = row.category || 'GENERAL';
          if (isCategoryAllowedByPrefs(cat, prefs)) {
            if (prefs.soundEnabled) {
              void playNotificationSound(prefs.soundStyle, true);
            }
            const safeView: AppView = VALID_APP_VIEWS.has(row.target_view as AppView)
              ? (row.target_view as AppView)
              : 'notifications';
            setInAppToast({
              title: row.title || 'Polytechnic Hub',
              body: row.body || '',
              category: cat,
              targetView: safeView,
              imageUrl: row.image_url || undefined,
              notificationId: row.id,
            });
          }
          void refreshNotificationInbox();
        }
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [currentUser, refreshNotificationInbox]);

  const refreshBootstrap = useCallback(async () => {
    try {
      const data = await apiClient.getBootstrap();
      setBootstrap(data);
      await offlineDb.setCachedValue('bootstrap_snapshot_v2', data);
    } catch {
      const cached = await offlineDb.getCachedValue<BootstrapResponse>('bootstrap_snapshot_v2');
      if (cached) {
        setBootstrap(cached);
      }
    }
  }, []);

  const syncSupabaseUserContext = useCallback(async (user: AuthUser) => {
    void syncUserProfileToFirestore(user).catch((err) => {
      console.warn('Firestore profile sync notice:', err instanceof Error ? err.message : err);
    });
    if (!supabase || user.id.startsWith('usr-')) return;
    try {
      const { data: favRows, error: favErr } = await supabase
        .from('favorites')
        .select('item_id')
        .eq('user_id', user.id)
        .eq('item_type', 'formula');
      if (!favErr && Array.isArray(favRows) && favRows.length > 0) {
        const cloudFavs = favRows.map((r) => String(r.item_id));
        setState((prev) => ({
          ...prev,
          favoriteFormulaIds: Array.from(new Set([...prev.favoriteFormulaIds, ...cloudFavs])),
        }));
      }
    } catch {
      // ignore if migration not yet applied or RLS blocks anon access
    }

    try {
      const cloudSessions = await aiService.loadCloudChatSessions(user.id);
      if (cloudSessions.length > 0) {
        setState((prev) => {
          const mergedMap = new Map<string, AiChatSession>();
          for (const s of cloudSessions) mergedMap.set(s.id, s);
          for (const s of Array.isArray(prev.aiSessions) ? prev.aiSessions : []) {
            const safeMsgs = Array.isArray(s?.messages) ? s.messages : [];
            if (safeMsgs.length > 0 && !mergedMap.has(s.id)) {
              mergedMap.set(s.id, { ...s, messages: safeMsgs });
            }
          }
          const merged = Array.from(mergedMap.values()).sort((a, b) =>
            (b.updatedAt || '').localeCompare(a.updatedAt || '')
          );
          return {
            ...prev,
            aiSessions: merged.length > 0 ? merged : prev.aiSessions,
            activeAiSessionId: merged[0]?.id ?? prev.activeAiSessionId,
          };
        });
      }
    } catch {
      // keep local chat history intact
    }
  }, []);

  useEffect(() => {
    void refreshBootstrap();

    let mounted = true;
    const hydrateUnifiedAuth = async () => {
      // 1. Check if returning from a Firebase Google Sign-In redirect (mobile / popup-blocked)
      try {
        const redirectCred = await consumeGoogleRedirectResult();
        if (redirectCred?.idToken && mounted) {
          const synced = await apiClient.firebaseSync({ idToken: redirectCred.idToken });
          setStoredToken(synced.token);
          if (mounted) {
            setCurrentUser(synced.user);
            void syncSupabaseUserContext(synced.user);
          }
          return;
        }
      } catch (err) {
        if (mounted) {
          setInAppToast({
            title: 'Google Sign-In',
            body: formatFirebaseAuthError(err, state.settings.language),
            category: 'IMPORTANT',
            targetView: 'profile',
          });
        }
      }

      // 2. Restore persistent session via stored Bearer token
      const token = getStoredToken();
      if (token) {
        try {
          const me = await apiClient.getMe();
          if (mounted) {
            setCurrentUser(me.user);
            void syncSupabaseUserContext(me.user);
            return;
          }
        } catch {
          setStoredToken(null);
        }
      }
    };

    void hydrateUnifiedAuth();

    // 3. Keep Firebase Auth state synchronized if user returns with active Firebase session
    const unsubscribeFb = subscribeFirebaseAuth((fbUser) => {
      if (!fbUser || !mounted) return;
      if (getStoredToken()) return;
      void fbUser
        .getIdToken()
        .then((idToken) => apiClient.firebaseSync({ idToken }))
        .then((synced) => {
          setStoredToken(synced.token);
          if (mounted) {
            setCurrentUser(synced.user);
            void syncSupabaseUserContext(synced.user);
          }
        })
        .catch(() => {
          // wait for explicit login
        });
    });

    return () => {
      mounted = false;
      unsubscribeFb();
    };
  }, [refreshBootstrap, syncSupabaseUserContext, state.settings.language]);

  useEffect(() => {
    storageService.saveState(state);
  }, [state]);

  useEffect(() => {
    if (!currentUser || !isOnline) return;
    const unsubscribeNotes = subscribeUserStudyNotes((cloudNotes) => {
      if (!cloudNotes.length) return;
      setState((prev) => {
        const map = new Map<string, StudyNote>();
        for (const n of prev.notes) map.set(n.id, n);
        for (const cn of cloudNotes) {
          const existing = map.get(cn.id);
          if (!existing || cn.updatedAt > existing.updatedAt) {
            map.set(cn.id, { ...cn, pinned: existing?.pinned ?? false });
          }
        }
        return {
          ...prev,
          notes: Array.from(map.values()).sort((a, b) =>
            (b.updatedAt || '').localeCompare(a.updatedAt || '')
          ),
        };
      });
    });
    return () => unsubscribeNotes();
  }, [currentUser, isOnline]);

  useEffect(() => {
    const root = document.documentElement;
    if (state.settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [state.settings.theme]);

  const allFormulas = useMemo<FormulaItem[]>(() => {
    const deletedSet = new Set(bootstrap.deletedFormulaIds);
    const mergedMap = new Map<string, FormulaItem>();
    for (const f of [...BASE_PHYSICS_FORMULAS, ...BASE_MATHEMATICS_FORMULAS]) {
      if (!deletedSet.has(f.id)) mergedMap.set(f.id, f);
    }
    for (const cf of bootstrap.customFormulas) {
      if (!deletedSet.has(cf.id)) mergedMap.set(cf.id, cf);
    }
    return Array.from(mergedMap.values());
  }, [bootstrap.customFormulas, bootstrap.deletedFormulaIds]);

  const triggerNotification = useCallback(
    (title: string, body: string) => {
      const prefs = pushPreferencesRef.current;
      if (prefs.soundEnabled) {
        void playNotificationSound(prefs.soundStyle, true);
      }
      setInAppToast({ title, body, category: 'EDUCATION', targetView: 'timer' });
      if (
        state.timeSettings.notificationsEnabled &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification(title, { body, icon: '/icons/icon-192x192.png' });
        } catch {
          // Shown in-app
        }
      }
    },
    [state.timeSettings.notificationsEnabled]
  );

  useEffect(() => {
    if (!state.timeSettings.notificationsEnabled) return;

    const checkSchedule = () => {
      const snap = getDhakaClockSnapshot(new Date());

      if (state.timeSettings.studyStartTime === snap.hhmm24) {
        const key = `main-start-${snap.dateKey24}-${snap.hhmm24}`;
        if (!firedRemindersRef.current.has(key)) {
          firedRemindersRef.current.add(key);
          triggerNotification(
            'Polytechnic Hub — পড়ার সময় শুরু হয়েছে',
            `বাংলাদেশ সময় ${snap.hours12}:${snap.minutes} ${snap.ampm} — আপনার দৈনিক অধ্যয়ন সেশন শুরু করার সময় হয়েছে।`
          );
        }
      }

      state.timeSettings.sessions.forEach((session) => {
        if (!session.reminderEnabled) return;
        if (session.startTime === snap.hhmm24) {
          const key = `sess-${session.id}-${snap.dateKey24}-${snap.hhmm24}`;
          if (!firedRemindersRef.current.has(key)) {
            firedRemindersRef.current.add(key);
            triggerNotification(
              `Polytechnic Hub রিমাইন্ডার: ${session.label}`,
              `সেশন শুরু (${session.startTime} – ${session.endTime})। মনোযোগ দিয়ে পড়া শুরু করুন!`
            );
          }
        }
      });
    };

    checkSchedule();
    const interval = window.setInterval(checkSchedule, 10000);
    return () => window.clearInterval(interval);
  }, [state.timeSettings, triggerNotification]);

  const handleToggleTheme = () => {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        theme: prev.settings.theme === 'dark' ? 'light' : 'dark',
      },
    }));
  };

  const handleToggleLanguage = () => {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        language: prev.settings.language === 'bn' ? 'en' : 'bn',
      },
    }));
  };

  const handleUpdateSettings = (partial: Partial<UserSettings>) => {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...partial,
      },
    }));
  };

  const handleUpdateTimeSettings = (partial: Partial<TimeSettings>) => {
    setState((prev) => ({
      ...prev,
      timeSettings: {
        ...prev.timeSettings,
        ...partial,
      },
    }));
  };

  const handleAddCompletedTimerSession = (session: CompletedTimerSession) => {
    setState((prev) => ({
      ...prev,
      timerHistory: [session, ...prev.timerHistory],
    }));
  };

  const handleClearTimerHistory = () => {
    setState((prev) => ({ ...prev, timerHistory: [] }));
  };

  const handleAddTask = (taskInput: Omit<StudyTask, 'id' | 'createdAt' | 'completed'>) => {
    const newTask: StudyTask = {
      ...taskInput,
      id: `task-${Date.now()}`,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({ ...prev, tasks: [newTask, ...prev.tasks] }));
  };

  const handleToggleTask = (taskId: string) => {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t)),
    }));
  };

  const handleDeleteTask = (taskId: string) => {
    setState((prev) => ({ ...prev, tasks: prev.tasks.filter((t) => t.id !== taskId) }));
  };

  const handleClearCompletedTasks = () => {
    setState((prev) => ({ ...prev, tasks: prev.tasks.filter((t) => !t.completed) }));
  };

  const handleToggleChapter = (chapterId: string) => {
    setState((prev) => {
      const exists = prev.completedChapterIds.includes(chapterId);
      return {
        ...prev,
        completedChapterIds: exists
          ? prev.completedChapterIds.filter((id) => id !== chapterId)
          : [...prev.completedChapterIds, chapterId],
      };
    });
  };

  const handleCreateNote = (
    title: string,
    content: string,
    subjectId?: string,
    subjectName?: string
  ) => {
    const now = new Date().toISOString();
    const newNote: StudyNote = {
      id: `note-${Date.now()}`,
      title,
      content,
      subjectId,
      subjectName,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    setState((prev) => ({ ...prev, notes: [newNote, ...prev.notes] }));
    void syncStudyNoteToFirestore(
      newNote,
      state.settings.department,
      state.settings.semester
    ).catch((err) => {
      console.warn('Firestore studyNote create sync notice:', err instanceof Error ? err.message : err);
    });
  };

  const handleAddSubjectNote = (subject: Subject, title: string, content: string) => {
    handleCreateNote(title, content, subject.id, subject.nameBn);
  };

  const handleUpdateNote = (
    id: string,
    title: string,
    content: string,
    subjectId?: string,
    subjectName?: string
  ) => {
    const now = new Date().toISOString();
    let updatedNote: StudyNote | null = null;
    setState((prev) => ({
      ...prev,
      notes: prev.notes.map((n) => {
        if (n.id !== id) return n;
        updatedNote = { ...n, title, content, subjectId, subjectName, updatedAt: now };
        return updatedNote;
      }),
    }));
    if (updatedNote) {
      void syncStudyNoteToFirestore(
        updatedNote,
        state.settings.department,
        state.settings.semester
      ).catch((err) => {
        console.warn('Firestore studyNote update sync notice:', err instanceof Error ? err.message : err);
      });
    }
  };

  const handleDeleteNote = (id: string) => {
    setState((prev) => ({ ...prev, notes: prev.notes.filter((n) => n.id !== id) }));
    void deleteStudyNoteFromFirestore(id).catch((err) => {
      console.warn('Firestore studyNote delete sync notice:', err instanceof Error ? err.message : err);
    });
  };

  const handleTogglePinNote = (id: string) => {
    setState((prev) => ({
      ...prev,
      notes: prev.notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)),
    }));
  };

  const handleSaveQuizAttempt = (attempt: QuizAttempt) => {
    setState((prev) => ({ ...prev, quizHistory: [attempt, ...prev.quizHistory] }));
  };

  const handleUpdateAiSessionMessages = (
    sessionId: string,
    updater: (prev: AiChatMessage[]) => AiChatMessage[],
    titleOverride?: string
  ) => {
    setState((prev) => {
      const now = new Date().toISOString();
      const prevSessions = Array.isArray(prev.aiSessions) ? prev.aiSessions : [];
      let updatedSession: AiChatSession | null = null;
      const nextSessions = prevSessions.map((s) => {
        if (s.id !== sessionId) return s;
        const currentMessages = Array.isArray(s.messages) ? s.messages : [];
        const rawNext = updater(currentMessages);
        const nextMsgs = Array.isArray(rawNext) ? rawNext : currentMessages;
        updatedSession = {
          ...s,
          title: titleOverride ?? s.title,
          messages: nextMsgs,
          updatedAt: now,
        };
        return updatedSession;
      });
      if (currentUser && !currentUser.id.startsWith('usr-') && updatedSession) {
        void aiService.saveCloudChatSession(currentUser.id, updatedSession);
      }
      return { ...prev, aiSessions: nextSessions };
    });
  };

  const handleCreateAiSession = () => {
    const fresh = createNewAiSession(
      bi(state.settings.language, 'নতুন চ্যাট সেশন', 'New Chat Session')
    );
    setState((prev) => ({
      ...prev,
      aiSessions: [fresh, ...prev.aiSessions],
      activeAiSessionId: fresh.id,
    }));
  };

  const handleSelectAiSession = (sessionId: string) => {
    setState((prev) => ({ ...prev, activeAiSessionId: sessionId }));
  };

  const handleDeleteAiSession = (sessionId: string) => {
    if (currentUser && !currentUser.id.startsWith('usr-')) {
      void aiService.deleteCloudChatSession(currentUser.id, sessionId);
    }
    setState((prev) => {
      const remaining = prev.aiSessions.filter((s) => s.id !== sessionId);
      const safeSessions =
        remaining.length > 0 ? remaining : [createNewAiSession('নতুন চ্যাট সেশন')];
      const nextActive =
        prev.activeAiSessionId === sessionId ? safeSessions[0].id : prev.activeAiSessionId;
      return {
        ...prev,
        aiSessions: safeSessions,
        activeAiSessionId: nextActive,
      };
    });
  };

  const handleClearActiveAiSession = () => {
    const activeId = state.activeAiSessionId;
    handleUpdateAiSessionMessages(activeId, () => []);
  };

  const handleToggleFavoriteFormula = (formulaId: string) => {
    setState((prev) => {
      const exists = prev.favoriteFormulaIds.includes(formulaId);
      const nextFavs = exists
        ? prev.favoriteFormulaIds.filter((id) => id !== formulaId)
        : [formulaId, ...prev.favoriteFormulaIds];

      if (supabase && currentUser && !currentUser.id.startsWith('usr-') && isOnline) {
        if (exists) {
          void supabase
            .from('favorites')
            .delete()
            .eq('user_id', currentUser.id)
            .eq('item_type', 'formula')
            .eq('item_id', formulaId);
        } else {
          void supabase.from('favorites').upsert(
            {
              user_id: currentUser.id,
              item_type: 'formula',
              item_id: formulaId,
            },
            { onConflict: 'user_id,item_type,item_id' }
          );
        }
      }
      return { ...prev, favoriteFormulaIds: nextFavs };
    });
  };

  const handleTrackRecentPdf = (pdfId: string) => {
    setState((prev) => ({
      ...prev,
      recentPdfIds: [pdfId, ...prev.recentPdfIds.filter((id) => id !== pdfId)].slice(0, 8),
    }));
  };

  const handleMarkNoticesRead = () => {
    setState((prev) => ({
      ...prev,
      readNoticeIds: bootstrap.notices.map((n) => n.id),
    }));
  };

  const handleMarkPushRead = async (id: string) => {
    setInboxNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
    );
    setUnreadPushCount((prev) => Math.max(0, prev - 1));
    try {
      await apiClient.markNotificationRead(id);
      await refreshNotificationInbox();
    } catch {
      await refreshNotificationInbox();
    }
  };

  const handleMarkAllPushRead = async () => {
    setInboxNotifications((prev) =>
      prev.map((n) => ({ ...n, isRead: true, readAt: n.readAt ?? new Date().toISOString() }))
    );
    setUnreadPushCount(0);
    try {
      await apiClient.markAllNotificationsRead();
      await refreshNotificationInbox();
    } catch {
      await refreshNotificationInbox();
    }
  };

  const handleDeletePushNotification = async (id: string) => {
    setInboxNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      await apiClient.deleteUserNotification(id);
      await refreshNotificationInbox();
    } catch {
      await refreshNotificationInbox();
    }
  };

  const handleUpdatePushPreferences = async (partial: Partial<NotificationPreferences>) => {
    saveLocalSoundPref(partial);
    setPushPreferences((prev) => ({ ...prev, ...partial, updatedAt: new Date().toISOString() }));
    if (!currentUser) return;
    try {
      const res = await apiClient.updateNotificationPreferences(partial);
      saveLocalSoundPref(res.preferences);
      setPushPreferences(res.preferences);
    } catch {
      await refreshNotificationInbox();
    }
  };

  const handleRequestEnablePush = async () => {
    const res = await pushNotificationService.requestPermissionAndRegister(Boolean(currentUser));
    if (res.token && currentUser) {
      await refreshNotificationInbox();
    }
    return res;
  };

  const handleDeactivateCurrentDevice = async () => {
    await pushNotificationService.deactivateCurrentDevice();
    await refreshNotificationInbox();
  };

  const handleAuthSuccess = (user: AuthUser) => {
    setCurrentUser(user);
    handleUpdateSettings({
      studentName: user.fullName,
      department: (user.department as DepartmentId) || state.settings.department,
      semester: (user.semester as SemesterNumber) || state.settings.semester,
    });
    void syncSupabaseUserContext(user);
  };

  const handleLogout = async () => {
    setStoredToken(null);
    await signOutFirebase().catch(() => {});
    setCurrentUser(null);
    if (activeView === 'admin') {
      setActiveView('dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#060B16] dark:text-slate-100 flex">
      <SplashScreen visible={showSplash} />

      <DesktopSidebar
        activeView={activeView}
        onSelectView={setActiveView}
        department={state.settings.department}
        semester={state.settings.semester}
        theme={state.settings.theme}
        language={state.settings.language}
        onToggleTheme={handleToggleTheme}
        studentName={state.settings.studentName}
        currentUser={currentUser}
        unreadPushCount={unreadPushCount}
      />

      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <TopHeader
          activeView={activeView}
          onSelectView={setActiveView}
          theme={state.settings.theme}
          language={state.settings.language}
          onToggleTheme={handleToggleTheme}
          onToggleLanguage={handleToggleLanguage}
          isOnline={isOnline}
          canPromptPwa={canPrompt}
          isPwaInstalled={isInstalled}
          onPromptPwa={() => void promptInstall()}
          notices={bootstrap.notices}
          readNoticeIds={state.readNoticeIds}
          onMarkNoticesRead={handleMarkNoticesRead}
          inboxNotifications={inboxNotifications}
          unreadPushCount={unreadPushCount}
        />

        {swUpdateHandler && (
          <div className="mx-4 sm:mx-6 lg:mx-8 mt-4 p-3 rounded-xl bg-cyan-500/12 border border-cyan-500/40 flex items-center justify-between gap-3 no-print">
            <p className="text-xs font-medium text-cyan-800 dark:text-cyan-200">
              {bi(
                state.settings.language,
                'Polytechnic Hub-এর নতুন আপডেট পাওয়া গেছে।',
                'A new update for Polytechnic Hub is ready.'
              )}
            </p>
            <button
              type="button"
              onClick={swUpdateHandler}
              className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-600 text-white text-xs font-semibold shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{bi(state.settings.language, 'আপডেট করুন', 'Reload')}</span>
            </button>
          </div>
        )}

        {inAppToast && (() => {
          const toastMeta = getCategoryMeta(inAppToast.category || 'GENERAL');
          const ToastIcon = toastMeta.icon;
          return (
            <div className={`mx-4 sm:mx-6 lg:mx-8 mt-4 p-3.5 rounded-xl border flex items-start justify-between gap-3 no-print ${toastMeta.badgeClass}`}>
              <button
                type="button"
                onClick={() => {
                  const target = inAppToast.targetView || 'notifications';
                  if (inAppToast.notificationId && currentUser) {
                    void handleMarkPushRead(inAppToast.notificationId);
                  }
                  setActiveView(target);
                  setInAppToast(null);
                }}
                className="flex items-start gap-2.5 text-left flex-1 min-w-0"
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${toastMeta.iconBgClass}`}>
                  <ToastIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-85">
                      {bi(state.settings.language, toastMeta.labelBn, toastMeta.labelEn)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {inAppToast.title}
                  </p>
                  <p className="text-xs text-slate-700 dark:text-slate-200 mt-0.5 line-clamp-2">
                    {inAppToast.body}
                  </p>
                </div>
                {inAppToast.imageUrl && (
                  <img
                    src={inAppToast.imageUrl}
                    alt=""
                    className="w-12 h-12 rounded-lg object-cover border border-white/20 shrink-0"
                  />
                )}
              </button>
              <button
                type="button"
                onClick={() => setInAppToast(null)}
                aria-label="Close notification"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })()}

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10">
          {activeView === 'dashboard' && (
            <DashboardView
              state={state}
              currentUser={currentUser}
              notices={bootstrap.notices}
              formulas={allFormulas}
              onNavigate={setActiveView}
              onToggleTask={handleToggleTask}
              onUpdateWeeklyGoal={(hours) =>
                handleUpdateSettings({ weeklyStudyGoalHours: hours })
              }
            />
          )}

          {activeView === 'notifications' && (
            <NotificationCenterView
              language={state.settings.language}
              currentUser={currentUser}
              notifications={inboxNotifications}
              preferences={pushPreferences}
              devices={registeredDevices}
              fcmConfigured={fcmServerConfigured}
              isLoading={inboxLoading}
              onRefreshInbox={refreshNotificationInbox}
              onMarkRead={handleMarkPushRead}
              onMarkAllRead={handleMarkAllPushRead}
              onDeleteNotification={handleDeletePushNotification}
              onUpdatePreferences={handleUpdatePushPreferences}
              onRequestEnablePush={handleRequestEnablePush}
              onDeactivateDevice={handleDeactivateCurrentDevice}
              onNavigate={setActiveView}
            />
          )}

          {activeView === 'pdf-library' && (
            <PdfLibraryView
              language={state.settings.language}
              currentUser={currentUser}
              sharedNotes={bootstrap.sharedNotes}
              defaultDepartment={state.settings.department}
              defaultSemester={state.settings.semester}
              isOnline={isOnline}
              onNavigate={setActiveView}
              onTrackRecentPdf={handleTrackRecentPdf}
            />
          )}

          {activeView === 'formulas' && (
            <FormulaHubView
              language={state.settings.language}
              formulas={allFormulas}
              favoriteFormulaIds={state.favoriteFormulaIds}
              currentUser={currentUser}
              onToggleFavoriteFormula={handleToggleFavoriteFormula}
              onRefreshFormulas={refreshBootstrap}
            />
          )}

          {activeView === 'result' && (
            <BtebResultView
              btebResultUrl={bootstrap.appConfig.btebResultUrl}
              officialWebsiteUrl={bootstrap.appConfig.officialWebsiteUrl}
              notices={bootstrap.notices}
              language={state.settings.language}
              isOnline={isOnline}
            />
          )}

          {activeView === 'tools' && <PowerToolsView language={state.settings.language} />}

          {activeView === 'profile' && (
            <ProfileAuthView
              language={state.settings.language}
              currentUser={currentUser}
              hasAdmin={bootstrap.hasAdmin}
              localSettings={state.settings}
              isPasswordRecovery={isPasswordRecovery}
              onClearPasswordRecovery={() => setIsPasswordRecovery(false)}
              onAuthSuccess={handleAuthSuccess}
              onLogout={handleLogout}
              onUpdateLocalSettings={handleUpdateSettings}
              onNavigate={setActiveView}
              onAdminClaimed={() => void refreshBootstrap()}
            />
          )}

          {activeView === 'subjects' && (
            <SubjectsView
              defaultDepartment={state.settings.department}
              defaultSemester={state.settings.semester}
              completedChapterIds={state.completedChapterIds}
              notes={state.notes}
              onToggleChapter={handleToggleChapter}
              onAddSubjectNote={handleAddSubjectNote}
            />
          )}

          {activeView === 'routine' && (
            <RoutineView
              tasks={state.tasks}
              department={state.settings.department}
              semester={state.settings.semester}
              onAddTask={handleAddTask}
              onToggleTask={handleToggleTask}
              onDeleteTask={handleDeleteTask}
              onClearCompleted={handleClearCompletedTasks}
            />
          )}

          {activeView === 'timer' && (
            <StudyTimeView
              language={state.settings.language}
              timeSettings={state.timeSettings}
              timerHistory={state.timerHistory}
              onUpdateTimeSettings={handleUpdateTimeSettings}
              onAddCompletedTimerSession={handleAddCompletedTimerSession}
              onClearTimerHistory={handleClearTimerHistory}
              onTriggerNotification={triggerNotification}
            />
          )}

          {activeView === 'quiz' && (
            <QuizView
              quizHistory={state.quizHistory}
              adminMcqs={bootstrap.mcqs}
              language={state.settings.language}
              onSaveAttempt={handleSaveQuizAttempt}
            />
          )}

          {activeView === 'ai' && (
            <AiAssistantView
              sessions={state.aiSessions}
              activeSessionId={state.activeAiSessionId}
              department={state.settings.department}
              semester={state.settings.semester}
              language={state.settings.language}
              isOnline={isOnline}
              onUpdateSessionMessages={handleUpdateAiSessionMessages}
              onCreateSession={handleCreateAiSession}
              onSelectSession={handleSelectAiSession}
              onDeleteSession={handleDeleteAiSession}
              onClearActiveSession={handleClearActiveAiSession}
              onSaveAsNote={(title, content) => handleCreateNote(title, content)}
            />
          )}

          {activeView === 'notes' && (
            <NotesView
              notes={state.notes}
              sharedNotes={bootstrap.sharedNotes}
              language={state.settings.language}
              onCreateNote={handleCreateNote}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
              onTogglePin={handleTogglePinNote}
              onOpenOfflineVault={() => setActiveView('pdf-library')}
            />
          )}

          {activeView === 'community' && (
            <CommunityView
              language={state.settings.language}
              currentUser={currentUser}
              defaultDepartment={state.settings.department}
              defaultSemester={state.settings.semester}
              isOnline={isOnline}
              onNavigate={setActiveView}
            />
          )}

          {activeView === 'progress' && (
            <ProgressView state={state} onNavigate={setActiveView} />
          )}

          {activeView === 'install' && (
            <InstallAppView
              language={state.settings.language}
              canPromptPwa={canPrompt}
              isPwaInstalled={isInstalled}
              isIos={isIos}
              onPromptPwa={() => void promptInstall()}
              appConfig={bootstrap.appConfig}
              needSwRefresh={Boolean(swUpdateHandler)}
              onUpdateSw={() => swUpdateHandler?.()}
            />
          )}

          {activeView === 'settings' && (
            <SettingsView
              state={state}
              currentUser={currentUser}
              pushPreferences={pushPreferences}
              onUpdateSettings={handleUpdateSettings}
              onUpdatePushPreferences={handleUpdatePushPreferences}
              onNavigate={setActiveView}
              onResetDemo={() => setState(storageService.resetToDemo())}
              onClearAll={() => setState(storageService.clearAll())}
            />
          )}

          {activeView === 'admin' && (
            <AdminDashboardView
              language={state.settings.language}
              currentUser={currentUser}
              formulas={allFormulas}
              notices={bootstrap.notices}
              sharedNotes={bootstrap.sharedNotes}
              mcqs={bootstrap.mcqs}
              appConfig={bootstrap.appConfig}
              onRefreshBootstrap={refreshBootstrap}
            />
          )}
        </main>
      </div>

      <MobileBottomNav
        activeView={activeView}
        onSelectView={setActiveView}
        language={state.settings.language}
        currentUser={currentUser}
      />
    </div>
  );
}
