import { getTodayDayBn } from '../data/curriculum';
import { AiChatSession, StudyMateState, TimeSettings } from '../types/study';

const STORAGE_KEY = 'studymate_diploma_state_v1';

export function createDefaultTimeSettings(): TimeSettings {
  return {
    studyStartTime: '18:00',
    studyEndTime: '22:00',
    dailyDurationMinutes: 180,
    notificationsEnabled: false,
    reminderMinutesBefore: 5,
    sessions: [
      {
        id: 'session-init-1',
        label: 'সন্ধ্যা থিওরি ও গণিত সেশন',
        startTime: '18:30',
        endTime: '20:00',
        reminderEnabled: true,
      },
      {
        id: 'session-init-2',
        label: 'রাত রিভিশন ও MCQ অনুশীলন',
        startTime: '21:00',
        endTime: '22:00',
        reminderEnabled: true,
      },
    ],
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
  const today = getTodayDayBn();
  const nowIso = new Date().toISOString();
  const initialSession = createNewAiSession('প্রথম স্টাডি সেশন');

  return {
    settings: {
      studentName: 'ডিপ্লোমা শিক্ষার্থী',
      department: 'power',
      semester: 4,
      theme: 'dark',
      language: 'bn',
      showEnglishTerms: true,
    },
    timeSettings: createDefaultTimeSettings(),
    timerHistory: [],
    tasks: [
      {
        id: 'task-init-1',
        title: 'ভালভ টাইমিং ডায়াগ্রাম ও CRDI ফুয়েল সিস্টেম রিভিশন',
        subjectCode: '27141',
        subjectName: 'আইসি ইঞ্জিন ডিটেইলস (IC Engine Details)',
        day: today,
        startTime: '18:30',
        endTime: '19:30',
        durationMinutes: 60,
        completed: false,
        priority: 'উচ্চ',
        createdAt: nowIso,
      },
      {
        id: 'task-init-2',
        title: 'ওয়াটার-টিউব বয়লার মাউন্টিংস ও সেফটি ভালভ অনুশীলন',
        subjectCode: '27143',
        subjectName: 'বয়লার অপারেশন অ্যান্ড মেইনটেন্যান্স',
        day: today,
        startTime: '20:00',
        endTime: '21:00',
        durationMinutes: 60,
        completed: true,
        priority: 'মধ্যম',
        createdAt: nowIso,
      },
      {
        id: 'task-init-3',
        title: 'ইঞ্জিনিয়ারিং মেকানিক্স ও MCQ মডেল টেস্ট',
        subjectCode: '27041',
        subjectName: 'ইঞ্জিনিয়ারিং মেকানিক্স',
        day: today,
        startTime: '21:15',
        endTime: '22:00',
        durationMinutes: 45,
        completed: false,
        priority: 'সাধারণ',
        createdAt: nowIso,
      },
    ],
    notes: [
      {
        id: 'note-init-1',
        title: 'বয়লার মাউন্টিংস ও অ্যাক্সেসরিজের পার্থক্য (২৭১৪৩)',
        content:
          '• মাউন্টিংস (নিরাপত্তার জন্য অপরিহার্য): সেফটি ভালভ, ওয়াটার লেভেল ইন্ডিকেটর, প্রেশার গেজ, ফিউজিবল প্লাগ।\n• অ্যাক্সেসরিজ (দক্ষতা বাড়াতে সহায়ক): ইকোনোমাইজার, সুপারহিটার, এয়ার প্রি-হিটার, ফিড পাম্প।',
        subjectId: 'sub-27143',
        subjectName: 'বয়লার অপারেশন অ্যান্ড মেইনটেন্যান্স',
        pinned: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'note-init-2',
        title: 'ম্যাট্রিক্স ও নির্ণায়ক পরীক্ষার জরুরি নোট (২৫৯১১)',
        content:
          '• কোনো বর্গ ম্যাট্রিক্সকে সিঙ্গুলার বলা হয় যদি |A| = 0 হয়।\n• বিপরীত ম্যাট্রিক্স A⁻¹ কেবল নন-সিঙ্গুলার (|A| ≠ 0) ম্যাট্রিক্সের জন্যই পাওয়া যায়।\n• ক্রেমারের সূত্র: x = Dx / D, y = Dy / D, z = Dz / D।',
        subjectId: 'sub-25911',
        subjectName: 'ম্যাথমেটিক্স-১',
        pinned: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ],
    completedChapterIds: ['ch-27141-1'],
    quizHistory: [],
    aiMessages: [],
    aiSessions: [initialSession],
    activeAiSessionId: initialSession.id,
    favoriteFormulaIds: ['phy-elec-01', 'math-trig-01'],
    recentPdfIds: [],
    readNoticeIds: [],
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

      const legacyMessages = Array.isArray(parsed.aiMessages) ? parsed.aiMessages : [];
      let sessions: AiChatSession[] = Array.isArray(parsed.aiSessions) && parsed.aiSessions.length > 0
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

      return {
        settings: {
          ...fallback.settings,
          ...(parsed.settings ?? {}),
          language: parsed.settings?.language === 'en' ? 'en' : 'bn',
        },
        timeSettings: {
          ...defaultTime,
          ...(parsed.timeSettings ?? {}),
          sessions: Array.isArray(parsed.timeSettings?.sessions)
            ? parsed.timeSettings.sessions
            : defaultTime.sessions,
        },
        timerHistory: Array.isArray(parsed.timerHistory) ? parsed.timerHistory : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : fallback.tasks,
        notes: Array.isArray(parsed.notes) ? parsed.notes : fallback.notes,
        completedChapterIds: Array.isArray(parsed.completedChapterIds)
          ? parsed.completedChapterIds
          : fallback.completedChapterIds,
        quizHistory: Array.isArray(parsed.quizHistory) ? parsed.quizHistory : [],
        aiMessages: legacyMessages,
        aiSessions: sessions,
        activeAiSessionId: activeId,
        favoriteFormulaIds: Array.isArray(parsed.favoriteFormulaIds)
          ? parsed.favoriteFormulaIds
          : fallback.favoriteFormulaIds,
        recentPdfIds: Array.isArray(parsed.recentPdfIds) ? parsed.recentPdfIds : [],
        readNoticeIds: Array.isArray(parsed.readNoticeIds) ? parsed.readNoticeIds : [],
      };
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

  resetToDemo(): StudyMateState {
    const fresh = createInitialState();
    this.saveState(fresh);
    return fresh;
  },

  clearAll(): StudyMateState {
    const freshSession = createNewAiSession('নতুন চ্যাট সেশন');
    const empty: StudyMateState = {
      settings: createInitialState().settings,
      timeSettings: {
        ...createDefaultTimeSettings(),
        sessions: [],
      },
      timerHistory: [],
      tasks: [],
      notes: [],
      completedChapterIds: [],
      quizHistory: [],
      aiMessages: [],
      aiSessions: [freshSession],
      activeAiSessionId: freshSession.id,
      favoriteFormulaIds: [],
      recentPdfIds: [],
      readNoticeIds: [],
    };
    this.saveState(empty);
    return empty;
  },
};
