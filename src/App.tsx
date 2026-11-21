import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, RefreshCw, X } from 'lucide-react';
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
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { usePWAInstall } from './hooks/usePWAInstall';
import { bi } from './i18n/translations';
import {
  isSupabaseMissingRelationError,
  mapSupabaseProfileToAuthUser,
  supabase,
} from './lib/supabaseClient';
import { aiService } from './services/aiService';
import { apiClient, BootstrapResponse, getStoredToken, setStoredToken } from './services/apiClient';
import { offlineDb } from './services/offlineDb';
import { createNewAiSession, storageService } from './services/storageService';
import {
  AiChatMessage,
  AiChatSession,
  AppReleaseConfig,
  AppView,
  AuthUser,
  CompletedTimerSession,
  DepartmentId,
  FormulaItem,
  QuizAttempt,
  SemesterNumber,
  StudyMateState,
  StudyNote,
  StudyTask,
  Subject,
  TimeSettings,
  UserSettings,
} from './types/study';
import { getDhakaClockSnapshot } from './utils/formatBn';

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

  const [inAppToast, setInAppToast] = useState<{ title: string; body: string } | null>(null);
  const firedRemindersRef = useRef<Set<string>>(new Set());

  const isOnline = useOnlineStatus();
  const { canPrompt, isInstalled, isIos, promptInstall } = usePWAInstall();

  const [swUpdateHandler, setSwUpdateHandler] = useState<(() => void) | null>(null);

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
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
      // ignore if migration not yet applied
    }

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
  }, []);

  useEffect(() => {
    void refreshBootstrap();

    const hydrateSupabaseSession = async () => {
      if (supabase) {
        try {
          const { data } = await supabase.auth.getSession();
          const sessUser = data.session?.user;
          if (sessUser) {
            let profRow: Record<string, unknown> | null = null;
            const { data: prof, error: profErr } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', sessUser.id)
              .maybeSingle();
            if (!profErr && prof) {
              profRow = prof as Record<string, unknown>;
            } else if (profErr && !isSupabaseMissingRelationError(profErr)) {
              console.warn('Profile read note:', profErr.message);
            }
            const mapped = mapSupabaseProfileToAuthUser(profRow, sessUser);
            // Also verify role against server /api/auth/me (checks ADMIN_EMAIL override)
            try {
              const serverMe = await apiClient.getMe();
              if (serverMe.user.role === 'admin') {
                mapped.role = 'admin';
              }
            } catch {
              // ignore
            }
            setCurrentUser(mapped);
            void syncSupabaseUserContext(mapped);
            return;
          }
        } catch {
          // fallback to local token below
        }
      }

      const token = getStoredToken();
      if (token) {
        apiClient
          .getMe()
          .then((res) => {
            setCurrentUser(res.user);
          })
          .catch(() => {
            setStoredToken(null);
          });
      }
    };

    void hydrateSupabaseSession();

    if (!supabase) return;
    const sb = supabase;
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        setActiveView('profile');
      }
      if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        return;
      }
      if (session?.user) {
        void (async () => {
          const { data: prof } = await sb
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();
          const mapped = mapSupabaseProfileToAuthUser(
            (prof as Record<string, unknown> | null) ?? null,
            session.user
          );
          try {
            const serverMe = await apiClient.getMe();
            if (serverMe.user.role === 'admin') {
              mapped.role = 'admin';
            }
          } catch {
            // ignore
          }
          setCurrentUser(mapped);
          void syncSupabaseUserContext(mapped);
        })();
      }
    });

    return () => subscription.unsubscribe();
  }, [refreshBootstrap, syncSupabaseUserContext]);

  useEffect(() => {
    storageService.saveState(state);
  }, [state]);

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
      setInAppToast({ title, body });
      if (
        state.timeSettings.notificationsEnabled &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification(title, { body });
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
    setState((prev) => ({
      ...prev,
      notes: prev.notes.map((n) =>
        n.id === id
          ? { ...n, title, content, subjectId, subjectName, updatedAt: new Date().toISOString() }
          : n
      ),
    }));
  };

  const handleDeleteNote = (id: string) => {
    setState((prev) => ({ ...prev, notes: prev.notes.filter((n) => n.id !== id) }));
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
    if (supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
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

        {inAppToast && (
          <div className="mx-4 sm:mx-6 lg:mx-8 mt-4 p-3.5 rounded-xl bg-cyan-600/12 border border-cyan-500/40 flex items-start justify-between gap-3 no-print">
            <div className="flex items-start gap-2.5">
              <Bell className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {inAppToast.title}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  {inAppToast.body}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInAppToast(null)}
              aria-label="Close notification"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10">
          {activeView === 'dashboard' && (
            <DashboardView
              state={state}
              currentUser={currentUser}
              notices={bootstrap.notices}
              formulas={allFormulas}
              onNavigate={setActiveView}
              onToggleTask={handleToggleTask}
            />
          )}

          {activeView === 'pdf-library' && (
            <PdfLibraryView
              language={state.settings.language}
              currentUser={currentUser}
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
              onUpdateSettings={handleUpdateSettings}
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
