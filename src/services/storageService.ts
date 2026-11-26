import {
  AiChatSession,
  StudyMateState,
  TimeSettings,
  UpcomingExam,
  UpcomingExamType,
} from '../types/study';
import {
  computeStudyStreak,
  recordActivityDate,
  sanitizeDateKeys,
  toDhakaDateKey,
} from '../utils/studyStreak';

const STORAGE_KEY = 'studymate_diploma_state_v1';
const DEMO_SANITIZED_KEY = 'polytechnic_hub_demo_sanitized_v2';

const LEGACY_DEMO_TASK_IDS = new Set(['task-init-1', 'task-init-2', 'task-init-3']);
const LEGACY_DEMO_NOTE_IDS = new Set(['note-init-1', 'note-init-2']);
const LEGACY_DEMO_SESSION_IDS = new Set(['session-init-1', 'session-init-2']);
const LEGACY_DEMO_ALARM_IDS = new Set(['alarm-init-1']);

export function createDefaultTimeSettings(): TimeSettings {
  return {
    studyStartTime: '18:00',
    studyEndTime: '22:00',
    dailyDurationMinutes: 180,
    notificationsEnabled: false,
    reminderMinutesBefore: 5,
    sessions: [],
    alarms: [],
  };
}

export function createNewAiSession(title = 'নতুন চ্যাট সেশন'): AiChatSession {
  const now = new Date().toISOString();
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createInitialState(): StudyMateState {
  const initialSession = createNewAiSession('নতুন চ্যাট সেশন');

  return {
    settings: {
      studentName: '',
      collegeName: '',
      avatarDataUrl: '',
      coverDataUrl: '',
      department: 'power',
      semester: 4,
      theme: 'dark',
      language: 'bn',
      showEnglishTerms: true,
      weeklyStudyGoalHours: 14,
    },
    timeSettings: createDefaultTimeSettings(),
    timerHistory: [],
    tasks: [],
    notes: [],
    completedChapterIds: [],
    quizHistory: [],
    aiMessages: [],
    aiSessions: [initialSession],
    activeAiSessionId: initialSession.id,
    favoriteFormulaIds: [],
    recentPdfIds: [],
    readNoticeIds: [],
    streakActivityDates: [toDhakaDateKey()],
    streakStudyActionDates: [],
    longestStudyStreak: 1,
    upcomingExams: [],
  };
}

export const storageService = {
  loadState(): StudyMateState {
    const fallback = createInitialState();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return fallback;
      }
      const parsed = JSON.parse(raw) as Partial<StudyMateState>;
      const defaultTime = createDefaultTimeSettings();
      const needsLegacyDemoCleanup = !window.localStorage.getItem(DEMO_SANITIZED_KEY);

      const legacyMessages = Array.isArray(parsed.aiMessages) ? parsed.aiMessages : [];
      let sessions: AiChatSession[] =
        Array.isArray(parsed.aiSessions) && parsed.aiSessions.length > 0
          ? parsed.aiSessions
              .filter((s): s is AiChatSession => Boolean(s && typeof s.id === 'string'))
              .map((s) => ({
                ...s,
                title: typeof s.title === 'string' && s.title.trim() ? s.title : 'চ্যাট সেশন',
                messages: Array.isArray(s.messages) ? s.messages : [],
                createdAt: s.createdAt || new Date().toISOString(),
                updatedAt: s.updatedAt || new Date().toISOString(),
              }))
          : fallback.aiSessions;

      if (sessions.length === 0) {
        sessions = fallback.aiSessions;
      }

      if (
        (!Array.isArray(parsed.aiSessions) || parsed.aiSessions.length === 0) &&
        legacyMessages.length > 0
      ) {
        sessions = [
          {
            id: 'chat-migrated-1',
            title: legacyMessages[0]?.text?.slice(0, 36) || 'পূর্ববর্তী চ্যাট',
            messages: legacyMessages,
            createdAt: legacyMessages[0]?.timestamp || new Date().toISOString(),
            updatedAt:
              legacyMessages[legacyMessages.length - 1]?.timestamp || new Date().toISOString(),
          },
        ];
      }

      const activeId =
        parsed.activeAiSessionId && sessions.some((s) => s.id === parsed.activeAiSessionId)
          ? parsed.activeAiSessionId
          : sessions[0].id;

      let studentName =
        typeof parsed.settings?.studentName === 'string' ? parsed.settings.studentName.trim() : '';
      let collegeName =
        typeof parsed.settings?.collegeName === 'string' ? parsed.settings.collegeName.trim() : '';

      let tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
      let notes = Array.isArray(parsed.notes) ? parsed.notes : [];
      let timeSessions = Array.isArray(parsed.timeSettings?.sessions)
        ? parsed.timeSettings.sessions
        : [];
      let alarms = Array.isArray(parsed.timeSettings?.alarms) ? parsed.timeSettings.alarms : [];
      let completedChapterIds = Array.isArray(parsed.completedChapterIds)
        ? parsed.completedChapterIds
        : [];
      let favoriteFormulaIds = Array.isArray(parsed.favoriteFormulaIds)
        ? parsed.favoriteFormulaIds
        : [];

      // One-time cleanup of legacy pre-seeded demo items while preserving real user entries
      if (needsLegacyDemoCleanup) {
        if (studentName.toLowerCase() === 'rokib hasan') {
          studentName = '';
          if (
            collegeName === 'ঢাকা পলিটেকনিক ইনস্টিটিউট' ||
            collegeName === 'বগুড়া পলিটেকনিক ইনস্টিটিউট'
          ) {
            collegeName = '';
          }
        }
        tasks = tasks.filter((t) => !LEGACY_DEMO_TASK_IDS.has(t.id));
        notes = notes.filter((n) => !LEGACY_DEMO_NOTE_IDS.has(n.id));
        timeSessions = timeSessions.filter((s) => !LEGACY_DEMO_SESSION_IDS.has(s.id));
        alarms = alarms.filter((a) => !LEGACY_DEMO_ALARM_IDS.has(a.id));
        if (completedChapterIds.length === 1 && completedChapterIds[0] === 'ch-27141-1') {
          completedChapterIds = [];
        }
        if (
          favoriteFormulaIds.length === 2 &&
          favoriteFormulaIds.includes('phy-elec-01') &&
          favoriteFormulaIds.includes('math-trig-01')
        ) {
          favoriteFormulaIds = [];
        }
      }

      const loaded: StudyMateState = {
        settings: {
          ...fallback.settings,
          ...(parsed.settings ?? {}),
          studentName,
          collegeName,
          avatarDataUrl:
            typeof parsed.settings?.avatarDataUrl === 'string' ? parsed.settings.avatarDataUrl : '',
          coverDataUrl:
            typeof parsed.settings?.coverDataUrl === 'string' ? parsed.settings.coverDataUrl : '',
          language: parsed.settings?.language === 'en' ? 'en' : 'bn',
          weeklyStudyGoalHours:
            typeof parsed.settings?.weeklyStudyGoalHours === 'number' &&
            Number.isFinite(parsed.settings.weeklyStudyGoalHours)
              ? Math.min(100, Math.max(1, Math.round(parsed.settings.weeklyStudyGoalHours)))
              : 14,
        },
        timeSettings: {
          ...defaultTime,
          ...(parsed.timeSettings ?? {}),
          sessions: timeSessions,
          alarms,
        },
        timerHistory: Array.isArray(parsed.timerHistory) ? parsed.timerHistory : [],
        tasks,
        notes,
        completedChapterIds,
        quizHistory: Array.isArray(parsed.quizHistory) ? parsed.quizHistory : [],
        aiMessages: legacyMessages,
        aiSessions: sessions,
        activeAiSessionId: activeId,
        favoriteFormulaIds,
        recentPdfIds: Array.isArray(parsed.recentPdfIds) ? parsed.recentPdfIds : [],
        readNoticeIds: Array.isArray(parsed.readNoticeIds) ? parsed.readNoticeIds : [],
        upcomingExams: Array.isArray(parsed.upcomingExams)
          ? parsed.upcomingExams
              .filter(
                (item): item is UpcomingExam =>
                  Boolean(
                    item &&
                      typeof item.id === 'string' &&
                      typeof item.title === 'string' &&
                      item.title.trim().length > 0 &&
                      typeof item.examDate === 'string' &&
                      /^\d{4}-\d{2}-\d{2}$/.test(item.examDate)
                  )
              )
              .map((item) => {
                const validTypes: UpcomingExamType[] = ['final', 'midterm', 'practical', 'quiz'];
                const examType: UpcomingExamType = validTypes.includes(item.examType)
                  ? item.examType
                  : 'final';
                const examTime =
                  typeof item.examTime === 'string' && /^\d{2}:\d{2}$/.test(item.examTime)
                    ? item.examTime
                    : '10:00';
                return {
                  id: item.id,
                  title: item.title.trim().slice(0, 120),
                  examDate: item.examDate,
                  examTime,
                  examType,
                  createdAt:
                    typeof item.createdAt === 'string' && item.createdAt
                      ? item.createdAt
                      : new Date().toISOString(),
                };
              })
          : [],
      };

      // Record today's app visit toward the student's Study Streak and compute best streak
      const streakActivityDates = recordActivityDate(
        sanitizeDateKeys(parsed.streakActivityDates),
        toDhakaDateKey()
      );
      const streakStudyActionDates = sanitizeDateKeys(parsed.streakStudyActionDates);
      const initialStreak = computeStudyStreak({
        activityDates: streakActivityDates,
        studyActionDates: streakStudyActionDates,
        timerHistory: loaded.timerHistory,
        quizHistory: loaded.quizHistory,
        storedBest: parsed.longestStudyStreak,
      });
      loaded.streakActivityDates = streakActivityDates;
      loaded.streakStudyActionDates = streakStudyActionDates;
      loaded.longestStudyStreak = initialStreak.longestStreak;

      if (needsLegacyDemoCleanup) {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded));
          window.localStorage.setItem(DEMO_SANITIZED_KEY, '1');
        } catch {
          // ignore storage write errors
        }
      }

      return loaded;
    } catch {
      return fallback;
    }
  },

  saveState(state: StudyMateState): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to persist Polytechnic Hub state:', error);
    }
  },

  clearAll(): StudyMateState {
    const empty = createInitialState();
    this.saveState(empty);
    return empty;
  },
};
