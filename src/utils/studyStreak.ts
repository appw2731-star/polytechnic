import { CompletedTimerSession, QuizAttempt } from '../types/study';

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_STORED_ACTIVITY_DAYS = 365;

const WEEKDAYS_BN_SHORT = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];
const WEEKDAYS_EN_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 180, 365];

export interface StreakDayEntry {
  dateKey: string;
  dayShortBn: string;
  dayShortEn: string;
  dayNumber: number;
  active: boolean;
  hasStudyAction: boolean;
  isToday: boolean;
}

export interface StudyStreakSummary {
  currentStreak: number;
  longestStreak: number;
  activeToday: boolean;
  completedStudyToday: boolean;
  totalActiveDays: number;
  activeDaysLast7: number;
  nextMilestone: number;
  daysToNextMilestone: number;
  milestonePercent: number;
  last7Days: StreakDayEntry[];
  tierLabelBn: string;
  tierLabelEn: string;
  encouragementBn: string;
  encouragementEn: string;
}

/**
 * Formats a Date / timestamp / ISO string into a YYYY-MM-DD calendar key in Asia/Dhaka (UTC+6).
 */
export function toDhakaDateKey(input: Date | string | number = new Date()): string {
  const date = input instanceof Date ? input : new Date(input);
  const ms = date.getTime();
  if (Number.isNaN(ms)) {
    return toDhakaDateKey(new Date());
  }
  const dhaka = new Date(ms + DHAKA_OFFSET_MS);
  const year = dhaka.getUTCFullYear();
  const month = String(dhaka.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dhaka.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Safely shifts a YYYY-MM-DD date key by deltaDays using pure UTC calendar math.
 */
export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function sanitizeDateKeys(dates: unknown): string[] {
  if (!Array.isArray(dates)) return [];
  const unique = new Set<string>();
  for (const item of dates) {
    if (typeof item === 'string' && DATE_KEY_PATTERN.test(item)) {
      unique.add(item);
    }
  }
  return Array.from(unique).sort().slice(-MAX_STORED_ACTIVITY_DAYS);
}

export function recordActivityDate(
  existingDates: string[] | undefined,
  dateKey: string = toDhakaDateKey()
): string[] {
  const clean = sanitizeDateKeys(existingDates);
  if (!DATE_KEY_PATTERN.test(dateKey)) return clean;
  if (clean.includes(dateKey)) return clean;
  clean.push(dateKey);
  clean.sort();
  return clean.slice(-MAX_STORED_ACTIVITY_DAYS);
}

function getWeekdayAndDayFromKey(dateKey: string): { weekdayIndex: number; dayNumber: number } {
  const [y, m, d] = dateKey.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  return {
    weekdayIndex: utcDate.getUTCDay(),
    dayNumber: utcDate.getUTCDate(),
  };
}

function computeLongestConsecutiveRun(sortedDateKeys: string[]): number {
  if (sortedDateKeys.length === 0) return 0;
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sortedDateKeys.length; i += 1) {
    const expectedNext = shiftDateKey(sortedDateKeys[i - 1], 1);
    if (sortedDateKeys[i] === expectedNext) {
      run += 1;
      if (run > longest) longest = run;
    } else if (sortedDateKeys[i] !== sortedDateKeys[i - 1]) {
      run = 1;
    }
  }
  return longest;
}

export function computeStudyStreak(params: {
  activityDates?: string[];
  studyActionDates?: string[];
  timerHistory: CompletedTimerSession[];
  quizHistory: QuizAttempt[];
  storedBest?: number;
  now?: Date;
}): StudyStreakSummary {
  const todayKey = toDhakaDateKey(params.now ?? new Date());
  const yesterdayKey = shiftDateKey(todayKey, -1);

  const studyActionSet = new Set<string>(sanitizeDateKeys(params.studyActionDates));
  const activeSet = new Set<string>(sanitizeDateKeys(params.activityDates));

  for (const session of params.timerHistory) {
    if (session?.completedAt) {
      const key = toDhakaDateKey(session.completedAt);
      studyActionSet.add(key);
      activeSet.add(key);
    }
  }

  for (const attempt of params.quizHistory) {
    if (attempt?.completedAt) {
      const key = toDhakaDateKey(attempt.completedAt);
      studyActionSet.add(key);
      activeSet.add(key);
    }
  }

  for (const key of studyActionSet) {
    activeSet.add(key);
  }

  const sortedActive = Array.from(activeSet).sort();
  const activeToday = activeSet.has(todayKey);
  const completedStudyToday = studyActionSet.has(todayKey);

  // Current streak counts backwards from today if active today, else from yesterday if active yesterday
  let currentStreak = 0;
  let cursor = activeToday ? todayKey : activeSet.has(yesterdayKey) ? yesterdayKey : '';
  while (cursor && activeSet.has(cursor)) {
    currentStreak += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  const computedLongest = computeLongestConsecutiveRun(sortedActive);
  const safeStoredBest =
    typeof params.storedBest === 'number' && Number.isFinite(params.storedBest) && params.storedBest >= 0
      ? Math.floor(params.storedBest)
      : 0;
  const longestStreak = Math.max(safeStoredBest, computedLongest, currentStreak);

  // Build 7-day rolling window ending today (oldest -> today)
  const last7Days: StreakDayEntry[] = [];
  let activeDaysLast7 = 0;
  for (let offset = -6; offset <= 0; offset += 1) {
    const dateKey = shiftDateKey(todayKey, offset);
    const active = activeSet.has(dateKey);
    const hasStudyAction = studyActionSet.has(dateKey);
    if (active) activeDaysLast7 += 1;
    const { weekdayIndex, dayNumber } = getWeekdayAndDayFromKey(dateKey);
    last7Days.push({
      dateKey,
      dayShortBn: WEEKDAYS_BN_SHORT[weekdayIndex],
      dayShortEn: WEEKDAYS_EN_SHORT[weekdayIndex],
      dayNumber,
      active,
      hasStudyAction,
      isToday: offset === 0,
    });
  }

  const nextMilestone =
    STREAK_MILESTONES.find((milestone) => milestone > currentStreak) ?? currentStreak + 30;
  const daysToNextMilestone = Math.max(1, nextMilestone - currentStreak);
  const milestonePercent = Math.min(100, Math.round((currentStreak / nextMilestone) * 100));

  let tierLabelBn = 'শুরু হচ্ছে';
  let tierLabelEn = 'Getting Started';
  if (currentStreak >= 30) {
    tierLabelBn = 'অদম্য ধারাবাহিকতা';
    tierLabelEn = 'Unstoppable Consistency';
  } else if (currentStreak >= 14) {
    tierLabelBn = 'দৃঢ় অভ্যাস';
    tierLabelEn = 'Strong Study Habit';
  } else if (currentStreak >= 7) {
    tierLabelBn = 'সাপ্তাহিক চ্যাম্পিয়ন';
    tierLabelEn = 'Weekly Rhythm';
  } else if (currentStreak >= 3) {
    tierLabelBn = 'ভালো গতি';
    tierLabelEn = 'Building Momentum';
  } else if (currentStreak >= 1) {
    tierLabelBn = 'ধারাবাহিকতা শুরু';
    tierLabelEn = 'Streak Active';
  }

  let encouragementBn: string;
  let encouragementEn: string;
  if (currentStreak >= 7 && completedStudyToday) {
    encouragementBn = 'অসাধারণ ধারাবাহিকতা! আজকের পড়াশোনা সম্পন্ন হয়েছে — এভাবেই প্রতিদিন এগিয়ে যান।';
    encouragementEn = 'Great consistency! Today’s study session is logged — keep this momentum going.';
  } else if (completedStudyToday) {
    encouragementBn = 'আজকের স্টাডি অ্যাক্টিভিটি যুক্ত হয়েছে! আগামীকালও অ্যাপে এসে ধারাটি ধরে রাখুন।';
    encouragementEn = 'Today’s study work is logged! Return tomorrow to keep your streak alive.';
  } else if (activeToday) {
    encouragementBn = 'আজকের চেক-ইন সম্পন্ন! একটি রুটিন টাস্ক বা ফোকাস সেশন শেষ করে আজকের স্ট্রিক আরও মজবুত করুন।';
    encouragementEn = 'Daily check-in recorded! Finish a study task or focus session to strengthen today’s streak.';
  } else {
    encouragementBn = 'আজ একটি টাস্ক সম্পন্ন করে বা স্টাডি টাইমার চালিয়ে আপনার নতুন স্ট্রিক শুরু করুন।';
    encouragementEn = 'Complete a study task or start a focus timer today to ignite your streak.';
  }

  return {
    currentStreak,
    longestStreak,
    activeToday,
    completedStudyToday,
    totalActiveDays: sortedActive.length,
    activeDaysLast7,
    nextMilestone,
    daysToNextMilestone,
    milestonePercent,
    last7Days,
    tierLabelBn,
    tierLabelEn,
    encouragementBn,
    encouragementEn,
  };
}
