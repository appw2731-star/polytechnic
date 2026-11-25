import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  Bell,
  Bot,
  CalendarCheck2,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  ExternalLink,
  FolderOpen,
  HelpCircle,
  MessageSquare,
  NotebookPen,
  Pencil,
  Search,
  Sigma,
  Target,
  Timer,
  Wrench,
  X,
} from 'lucide-react';
import {
  SUBJECTS_CATALOG,
  getSubjectsForUser,
  getTodayDayBn,
} from '../data/curriculum';
import { bi } from '../i18n/translations';
import type { ProfileUpdateResult } from '../services/profileUpdateService';
import {
  AppView,
  AuthUser,
  DepartmentId,
  FormulaItem,
  PlatformNotice,
  SemesterNumber,
  StudyMateState,
} from '../types/study';
import { formatDateBn, toBnDigits } from '../utils/formatBn';
import { DashboardHero, type HeroProfileChangePayload } from './DashboardHero';
import { LiveBangladeshClock } from './LiveBangladeshClock';
import { MathFormula } from './MathFormula';

interface DashboardViewProps {
  state: StudyMateState;
  currentUser: AuthUser | null;
  notices: PlatformNotice[];
  formulas: FormulaItem[];
  onNavigate: (view: AppView) => void;
  onToggleTask: (taskId: string) => void;
  onUpdateWeeklyGoal?: (hours: number) => void;
  onUpdateHeroProfile?: (
    partial: HeroProfileChangePayload
  ) => Promise<ProfileUpdateResult> | ProfileUpdateResult | void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  currentUser,
  notices,
  formulas,
  onNavigate,
  onToggleTask,
  onUpdateWeeklyGoal,
  onUpdateHeroProfile,
}) => {
  const lang = state.settings.language;
  const todayBn = getTodayDayBn();
  const semesterSubjects = getSubjectsForUser(state.settings.department, state.settings.semester);

  const [globalSearch, setGlobalSearch] = useState('');
  const weeklyGoalHours = Math.min(100, Math.max(1, state.settings.weeklyStudyGoalHours ?? 14));
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(weeklyGoalHours));

  const weeklyStudyStats = useMemo(() => {
    // Compute start of current study week in Asia/Dhaka (Saturday 00:00:00 BDT = UTC+6)
    const dhakaOffsetMs = 6 * 60 * 60 * 1000;
    const nowDhaka = new Date(Date.now() + dhakaOffsetMs);
    const dayOfWeek = nowDhaka.getUTCDay(); // 0=Sun ... 6=Sat
    const daysSinceSaturday = (dayOfWeek + 1) % 7;
    const weekStartDhaka = Date.UTC(
      nowDhaka.getUTCFullYear(),
      nowDhaka.getUTCMonth(),
      nowDhaka.getUTCDate() - daysSinceSaturday,
      0,
      0,
      0,
      0
    );
    const weekStartUtcMs = weekStartDhaka - dhakaOffsetMs;

    let weeklySessionsCount = 0;
    const timerMinutes = state.timerHistory.reduce((sum, session) => {
      const completedMs = new Date(session.completedAt).getTime();
      if (!Number.isNaN(completedMs) && completedMs >= weekStartUtcMs) {
        weeklySessionsCount += 1;
        return sum + (session.completedMinutes || 0);
      }
      return sum;
    }, 0);

    const taskMinutes = state.tasks.reduce(
      (sum, task) => (task.completed ? sum + (task.durationMinutes || 0) : sum),
      0
    );

    const totalMinutes = timerMinutes + taskMinutes;
    const studiedHours = totalMinutes / 60;
    const rawPercent = weeklyGoalHours > 0 ? Math.round((studiedHours / weeklyGoalHours) * 100) : 0;
    const clampedPercent = Math.min(100, Math.max(0, rawPercent));
    const remainingHours = Math.max(0, weeklyGoalHours - studiedHours);

    return {
      weeklySessionsCount,
      timerMinutes,
      taskMinutes,
      totalMinutes,
      studiedHours,
      rawPercent,
      clampedPercent,
      remainingHours,
      goalReached: studiedHours >= weeklyGoalHours,
    };
  }, [state.timerHistory, state.tasks, weeklyGoalHours]);

  const handleSaveWeeklyGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Math.round(Number(goalInput));
    const nextGoal = Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : weeklyGoalHours;
    onUpdateWeeklyGoal?.(nextGoal);
    setGoalInput(String(nextGoal));
    setIsEditingGoal(false);
  };

  const todaysTasks = state.tasks.filter((t) => t.day === todayBn);
  const completedTodayCount = todaysTasks.filter((t) => t.completed).length;
  const totalTasksCompleted = state.tasks.filter((t) => t.completed).length;
  const totalTasks = state.tasks.length;
  const taskProgressPercent = totalTasks > 0 ? Math.round((totalTasksCompleted / totalTasks) * 100) : 0;

  const totalSemesterChapters = semesterSubjects.reduce((acc, s) => acc + s.chapters.length, 0);
  const completedSemesterChapters = semesterSubjects.reduce(
    (acc, s) => acc + s.chapters.filter((ch) => state.completedChapterIds.includes(ch.id)).length,
    0
  );

  const avgQuizScore =
    state.quizHistory.length > 0
      ? Math.round(
          state.quizHistory.reduce((acc, q) => acc + q.scorePercent, 0) / state.quizHistory.length
        )
      : null;

  const highlightedFormulas = useMemo(() => {
    const favs = formulas.filter((f) => state.favoriteFormulaIds.includes(f.id));
    if (favs.length >= 2) return favs.slice(0, 3);
    return [...favs, ...formulas.filter((f) => !state.favoriteFormulaIds.includes(f.id))].slice(0, 3);
  }, [formulas, state.favoriteFormulaIds]);

  const searchMatches = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return { formulas: [] as FormulaItem[], subjects: [] as typeof SUBJECTS_CATALOG };
    return {
      formulas: formulas
        .filter(
          (f) =>
            f.nameEn.toLowerCase().includes(q) ||
            f.nameBn.toLowerCase().includes(q) ||
            f.chapter.toLowerCase().includes(q)
        )
        .slice(0, 4),
      subjects: SUBJECTS_CATALOG.filter(
        (s) =>
          s.code.toLowerCase().includes(q) ||
          s.nameBn.toLowerCase().includes(q) ||
          (s.nameEn ?? '').toLowerCase().includes(q)
      ).slice(0, 4),
    };
  }, [globalSearch, formulas]);

  const quickActions: {
    view: AppView;
    titleBn: string;
    titleEn: string;
    subBn: string;
    subEn: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      view: 'pdf-library',
      titleBn: 'আমার PDF লাইব্রেরি',
      titleEn: 'My PDF Library',
      subBn: 'প্রাইভেট PDF আপলোড ও রিডার',
      subEn: 'Private PDF Uploads & Reader',
      icon: FolderOpen,
    },
    {
      view: 'formulas',
      titleBn: 'ফর্মুলা হাব',
      titleEn: 'Formula Hub',
      subBn: `${toBnDigits(formulas.length)}টি Physics ও Math সূত্র`,
      subEn: `${formulas.length} Physics & Math Formulas`,
      icon: Sigma,
    },
    {
      view: 'ai',
      titleBn: 'এআই টিউটর',
      titleEn: 'AI Tutor',
      subBn: 'দ্রুত স্ট্রিমিং সমাধান',
      subEn: 'Fast Streaming Mentor',
      icon: Bot,
    },
    {
      view: 'tools',
      titleBn: 'পাওয়ার ও ইঞ্জিনিয়ারিং টুলস',
      titleEn: 'Power Tech Tools',
      subBn: 'ওহম, পাওয়ার, এনার্জি ও সূত্র',
      subEn: "Ohm's Law, Power & Calculators",
      icon: Wrench,
    },
    {
      view: 'result',
      titleBn: 'BTEB রেজাল্ট',
      titleEn: 'BTEB Result',
      subBn: 'অফিশিয়াল রেজাল্ট পোর্টাল',
      subEn: 'Official Board Result Search',
      icon: Award,
    },
    {
      view: 'quiz',
      titleBn: 'MCQ ও মডেল টেস্ট',
      titleEn: 'MCQ & Model Test',
      subBn: 'টাইমারসহ কুইজ অনুশীলন',
      subEn: 'Timed Practice Tests',
      icon: HelpCircle,
    },
    {
      view: 'community',
      titleBn: 'স্টুডেন্ট কমিউনিটি',
      titleEn: 'Student Community',
      subBn: 'প্রশ্ন-উত্তর ও আলোচনা',
      subEn: 'Q&A & Peer Help',
      icon: MessageSquare,
    },
    {
      view: 'notes',
      titleBn: 'নোটস ও শেয়ার্ড PDF',
      titleEn: 'Notes & Shared PDFs',
      subBn: `${toBnDigits(state.notes.length)}টি সংরক্ষিত নোট`,
      subEn: `${state.notes.length} Saved Notes`,
      icon: NotebookPen,
    },
    {
      view: 'install',
      titleBn: 'অ্যাপ ইনস্টল (PWA/APK)',
      titleEn: 'Install App (PWA/APK)',
      subBn: 'অফলাইন অ্যাপ ও APK স্ট্যাটাস',
      subEn: 'Offline PWA & Android APK',
      icon: Download,
    },
  ];

  const displayName =
    currentUser?.fullName ||
    state.settings.studentName ||
    bi(lang, 'পলিটেকনিক শিক্ষার্থী', 'Polytechnic Student');
  const displayCollege =
    currentUser?.collegeName ||
    currentUser?.instituteName ||
    state.settings.collegeName ||
    bi(lang, 'আপনার পলিটেকনিক ইনস্টিটিউট যোগ করুন', 'Add your Polytechnic Institute');
  const displayAvatar = currentUser?.avatarUrl || state.settings.avatarDataUrl || '';

  return (
    <div className="space-y-6">
      {/* Global Quick Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
          placeholder={bi(
            lang,
            'ফর্মুলা (যেমন Ohm, Torque), বিষয় কোড (27141) বা অধ্যায় খুঁজুন...',
            'Search formulas (e.g. Ohm, Torque), subject code (27141), or chapters...'
          )}
          className="w-full min-h-[46px] pl-11 pr-4 py-2.5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
        {(searchMatches.formulas.length > 0 || searchMatches.subjects.length > 0) && (
          <div className="absolute left-0 right-0 top-13 z-30 rounded-2xl bg-white dark:bg-[#0D1426] border border-slate-200 dark:border-slate-800 shadow-2xl divide-y divide-slate-200 dark:divide-slate-800">
            {searchMatches.formulas.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setGlobalSearch('');
                  onNavigate('formulas');
                }}
                className="w-full px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <div>
                  <p className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400">
                    {f.subject === 'physics' ? 'Physics' : 'Mathematics'} · {f.chapter}
                  </p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {lang === 'en' ? f.nameEn : f.nameBn}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>
            ))}
            {searchMatches.subjects.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setGlobalSearch('');
                  onNavigate('subjects');
                }}
                className="w-full px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <div>
                  <p className="text-xs font-mono font-semibold text-cyan-600 dark:text-cyan-400">
                    {m.code}
                  </p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {lang === 'en' ? m.nameEn || m.nameBn : m.nameBn}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mobile-First Profile Hero Card */}
      <DashboardHero
        initialName={displayName}
        collegeName={displayCollege}
        initialDepartment={(currentUser?.department as DepartmentId) || state.settings.department}
        initialSemester={(currentUser?.semester as SemesterNumber) || state.settings.semester}
        initialAvatarUrl={displayAvatar}
        onUpdateHeroProfile={onUpdateHeroProfile}
        onOpenPdfLibrary={() => onNavigate('pdf-library')}
        onOpenFormulaHub={() => onNavigate('formulas')}
        onOpenStudyTimer={() => onNavigate('timer')}
      />

      {/* Live Bangladesh Clock + Important Notices */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-6">
          <LiveBangladeshClock onOpenTimer={() => onNavigate('timer')} />
        </div>

        <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-cyan-500" />
              <span>{bi(lang, 'গুরুত্বপূর্ণ নোটিশ', 'Important Notices')}</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('result')}
              className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline whitespace-nowrap"
            >
              {bi(lang, 'BTEB রেজাল্ট', 'BTEB Result')}
            </button>
          </div>

          <div className="space-y-2">
            {notices.slice(0, 2).map((n) => (
              <div
                key={n.id}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {n.title}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                    {n.body}
                  </p>
                </div>
                {n.officialLink && (
                  <a
                    href={n.officialLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open official link"
                    className="p-1.5 rounded-lg text-cyan-500 hover:bg-cyan-500/10 shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4-Column Study Metrics Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <div className="p-4 lg:p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {bi(lang, `আজকের টাস্ক (${todayBn})`, "Today's Tasks")}
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {lang === 'bn'
              ? `${toBnDigits(completedTodayCount)} / ${toBnDigits(todaysTasks.length)}`
              : `${completedTodayCount} / ${todaysTasks.length}`}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {bi(lang, 'সম্পন্ন হয়েছে', 'Completed')}
          </p>
        </div>

        <div className="p-4 lg:p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {bi(lang, 'রুটিন অগ্রগতি', 'Routine Progress')}
          </p>
          <p className="mt-2 text-2xl font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">
            {lang === 'bn' ? `${toBnDigits(taskProgressPercent)}%` : `${taskProgressPercent}%`}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {bi(lang, `মোট ${toBnDigits(totalTasksCompleted)}টি সম্পন্ন`, `${totalTasksCompleted} tasks done`)}
          </p>
        </div>

        <div className="p-4 lg:p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {bi(lang, 'অধ্যায় সমাপ্তি', 'Chapters Finished')}
          </p>
          <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {lang === 'bn'
              ? `${toBnDigits(completedSemesterChapters)} / ${toBnDigits(totalSemesterChapters)}`
              : `${completedSemesterChapters} / ${totalSemesterChapters}`}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {bi(lang, 'বর্তমান সেমিস্টার', 'Current Semester')}
          </p>
        </div>

        <div className="p-4 lg:p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {bi(lang, 'গড় কুইজ স্কোর', 'Avg Quiz Score')}
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {avgQuizScore !== null
              ? lang === 'bn'
                ? `${toBnDigits(avgQuizScore)}%`
                : `${avgQuizScore}%`
              : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {state.quizHistory.length > 0
              ? bi(lang, `${toBnDigits(state.quizHistory.length)}টি কুইজ`, `${state.quizHistory.length} quizzes taken`)
              : bi(lang, 'এখনো কুইজ দেওয়া হয়নি', 'No quizzes yet')}
          </p>
        </div>
      </section>

      {/* Weekly Study Goal Card with Circular Progress Bar */}
      {(() => {
        const radius = 52;
        const circumference = 2 * Math.PI * radius;
        const dashOffset =
          circumference - (weeklyStudyStats.clampedPercent / 100) * circumference;
        const studiedHoursFormatted = weeklyStudyStats.studiedHours.toFixed(1);
        const remainingFormatted = weeklyStudyStats.remainingHours.toFixed(1);

        return (
          <section
            aria-label={bi(lang, 'সাপ্তাহিক অধ্যয়ন লক্ষ্য', 'Weekly Study Goal')}
            className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 lg:p-6"
          >
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              {/* Circular Progress Ring */}
              <div className="flex items-center justify-center shrink-0">
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <svg
                    viewBox="0 0 128 128"
                    className="w-32 h-32 -rotate-90"
                    role="img"
                    aria-label={bi(
                      lang,
                      `সাপ্তাহিক অধ্যয়ন অগ্রগতি ${weeklyStudyStats.clampedPercent}%`,
                      `Weekly study progress ${weeklyStudyStats.clampedPercent}%`
                    )}
                  >
                    <defs>
                      <linearGradient id="weeklyGoalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={weeklyStudyStats.goalReached ? '#10b981' : '#3b82f6'} />
                        <stop offset="100%" stopColor={weeklyStudyStats.goalReached ? '#34d399' : '#06b6d4'} />
                      </linearGradient>
                    </defs>
                    <circle
                      cx="64"
                      cy="64"
                      r={radius}
                      fill="none"
                      strokeWidth="10"
                      className="stroke-slate-200 dark:stroke-slate-800"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r={radius}
                      fill="none"
                      strokeWidth="10"
                      stroke="url(#weeklyGoalGrad)"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={dashOffset}
                      className="transition-[stroke-dashoffset] duration-500 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span
                      className={`text-2xl font-bold tabular-nums leading-none ${
                        weeklyStudyStats.goalReached
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {lang === 'bn'
                        ? `${toBnDigits(weeklyStudyStats.rawPercent)}%`
                        : `${weeklyStudyStats.rawPercent}%`}
                    </span>
                    <span className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                      {lang === 'bn'
                        ? `${toBnDigits(studiedHoursFormatted)} / ${toBnDigits(weeklyGoalHours)} ঘঃ`
                        : `${studiedHoursFormatted} / ${weeklyGoalHours}h`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Goal Info & Controls */}
              <div className="flex-1 min-w-0 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-cyan-500 shrink-0" />
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        {bi(lang, 'সাপ্তাহিক অধ্যয়ন লক্ষ্য', 'Weekly Study Goal')}
                      </h2>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                          weeklyStudyStats.goalReached
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400'
                        }`}
                      >
                        {weeklyStudyStats.goalReached
                          ? bi(lang, 'লক্ষ্য অর্জিত!', 'Goal Achieved!')
                          : bi(
                              lang,
                              `বাকি ${toBnDigits(remainingFormatted)} ঘণ্টা`,
                              `${remainingFormatted}h left`
                            )}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {bi(
                        lang,
                        'এই সপ্তাহে স্টাডি টাইমার এবং সম্পন্ন করা রুটিন টাস্ক থেকে মোট অধ্যয়ন সময় হিসাব করা হচ্ছে।',
                        'Tracks your study hours logged this week across completed timer sessions and routine tasks.'
                      )}
                    </p>
                  </div>

                  {onUpdateWeeklyGoal && !isEditingGoal && (
                    <button
                      type="button"
                      onClick={() => {
                        setGoalInput(String(weeklyGoalHours));
                        setIsEditingGoal(true);
                      }}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-cyan-500/50 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5 text-cyan-500" />
                      <span>{bi(lang, 'লক্ষ্য পরিবর্তন', 'Set Goal')}</span>
                    </button>
                  )}
                </div>

                {isEditingGoal ? (
                  <form
                    onSubmit={handleSaveWeeklyGoal}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-3"
                  >
                    <div className="flex flex-wrap items-center gap-2.5">
                      <label
                        htmlFor="weekly-goal-hours-input"
                        className="text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        {bi(lang, 'সাপ্তাহিক লক্ষ্য (ঘণ্টা):', 'Target hours per week:')}
                      </label>
                      <input
                        id="weekly-goal-hours-input"
                        type="number"
                        min={1}
                        max={100}
                        step={1}
                        required
                        value={goalInput}
                        onChange={(e) => setGoalInput(e.target.value)}
                        className="w-24 min-h-[38px] px-3 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                      <div className="flex items-center gap-1.5">
                        {[7, 14, 21, 28].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setGoalInput(String(preset))}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                              Number(goalInput) === preset
                                ? 'bg-cyan-600 text-white border-cyan-600'
                                : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-cyan-500/40'
                            }`}
                          >
                            {lang === 'bn' ? `${toBnDigits(preset)} ঘঃ` : `${preset}h`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        className="min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{bi(lang, 'সংরক্ষণ করুন', 'Save Goal')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingGoal(false)}
                        className="min-h-[36px] inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>{bi(lang, 'বাতিল', 'Cancel')}</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                      <span>
                        {bi(
                          lang,
                          `লক্ষ্য: ${toBnDigits(weeklyGoalHours)} ঘণ্টা/সপ্তাহ`,
                          `Target: ${weeklyGoalHours} hrs/week`
                        )}
                      </span>
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      <span>
                        {bi(
                          lang,
                          `সেশন: ${toBnDigits(weeklyStudyStats.weeklySessionsCount)}টি (${toBnDigits(weeklyStudyStats.timerMinutes)} মিঃ)`,
                          `Sessions: ${weeklyStudyStats.weeklySessionsCount} (${weeklyStudyStats.timerMinutes}m)`
                        )}
                      </span>
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      <span>
                        {bi(
                          lang,
                          `রুটিন টাস্ক: ${toBnDigits(weeklyStudyStats.taskMinutes)} মিঃ`,
                          `Tasks: ${weeklyStudyStats.taskMinutes}m`
                        )}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onNavigate('timer')}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-500/12 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 text-xs font-bold transition-colors whitespace-nowrap shrink-0"
                    >
                      <Timer className="w-3.5 h-3.5" />
                      <span>{bi(lang, 'অধ্যয়ন শুরু করুন', 'Log Study Session')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        );
      })()}

      {/* Formula Hub Highlights + Recent Study Activity */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {bi(lang, 'গুরুত্বপূর্ণ সূত্র (Formula Hub)', 'Formula Hub Highlights')}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('formulas')}
              className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
            >
              {bi(lang, 'সব সূত্র দেখুন', 'Explore Formulas')}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {highlightedFormulas.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate('formulas')}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/40 text-left space-y-1.5"
              >
                <p className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 truncate">
                  {item.subject === 'physics' ? 'Physics' : 'Math'} · {item.chapter}
                </p>
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {lang === 'en' ? item.nameEn : item.nameBn}
                </p>
                <div className="text-xs text-slate-700 dark:text-slate-200 overflow-x-auto">
                  <MathFormula latex={item.expressionLatex} displayMode={false} />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            {bi(lang, 'সাম্প্রতিক অধ্যয়ন কার্যক্রম', 'Recent Study Activity')}
          </h2>
          {state.timerHistory.length === 0 && state.quizHistory.length === 0 ? (
            <p className="text-xs text-slate-500 py-3">
              {bi(
                lang,
                'টাইমার সেশন বা MCQ কুইজ সম্পন্ন করলে এখানে কার্যক্রম দেখা যাবে।',
                'Complete a study timer or quiz to record recent study activity.'
              )}
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {state.timerHistory.slice(0, 2).map((t) => (
                <li
                  key={t.id}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                >
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                    {t.label}
                  </span>
                  <span className="font-mono text-emerald-500 font-semibold shrink-0">
                    {t.completedMinutes}m
                  </span>
                </li>
              ))}
              {state.quizHistory.slice(0, 2).map((q) => (
                <li
                  key={q.id}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                >
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                    Quiz: {q.category}
                  </span>
                  <span className="font-mono text-cyan-500 font-semibold shrink-0">
                    {q.scorePercent}% ({formatDateBn(q.completedAt)})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Main Two-Column Content: Today's Study Tasks + Quick Access Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {bi(lang, `আজকের পড়াশোনার তালিকা (${todayBn})`, "Today's Study Tasks")}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {bi(lang, 'কাজ সম্পন্ন হলে চেকবক্সে টিক দিন', 'Tap a task to mark completed')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('routine')}
              className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 whitespace-nowrap"
            >
              <CalendarCheck2 className="w-4 h-4 inline mr-1" />
              {bi(lang, 'রুটিন', 'Routine')}
            </button>
          </div>

          {todaysTasks.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {bi(
                  lang,
                  `আজকের (${todayBn}) জন্য এখনো কোনো স্টাডি টাস্ক যোগ করা হয়নি।`,
                  'No study tasks scheduled for today yet.'
                )}
              </p>
              <button
                type="button"
                onClick={() => onNavigate('routine')}
                className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
              >
                <span>{bi(lang, 'রুটিনে টাস্ক যোগ করুন', 'Add Routine Task')}</span>
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {todaysTasks.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onToggleTask(task.id)}
                    className="w-full min-h-[58px] px-5 py-3 flex items-start gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <span className="mt-0.5 shrink-0">
                      {task.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium ${
                          task.completed
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {task.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>{task.subjectName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Clock className="w-3 h-3" />
                          {task.startTime} – {task.endTime}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {bi(lang, 'প্ল্যাটফর্মের দ্রুত প্রবেশ', 'Quick Feature Access')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {bi(lang, 'যেকোনো মডিউলে সরাসরি প্রবেশ করুন', 'Jump straight into any tool or study section')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.view}
                  type="button"
                  onClick={() => onNavigate(action.view)}
                  className="min-h-[56px] w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {bi(lang, action.titleBn, action.titleEn)}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {bi(lang, action.subBn, action.subEn)}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-500 shrink-0" />
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
