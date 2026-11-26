import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Check, Clock, Pencil, Target, Timer, X } from 'lucide-react';
import { bi } from '../i18n/translations';
import { AppView, DayOfWeek, StudyMateState } from '../types/study';
import { toBnDigits } from '../utils/formatBn';

interface WeeklyStudyGoalChartProps {
  state: StudyMateState;
  onNavigate: (view: AppView) => void;
  onUpdateWeeklyGoal?: (hours: number) => void;
}

type ChartMode = 'weekly' | 'daily';

interface WeeklyBarDatum {
  key: string;
  label: string;
  rangeLabel: string;
  studiedHours: number;
  timerMinutes: number;
  taskMinutes: number;
  goalHours: number;
  percentOfGoal: number;
  isCurrent: boolean;
  goalMet: boolean;
}

interface DailyBarDatum {
  key: DayOfWeek;
  label: string;
  fullDayLabel: string;
  studiedHours: number;
  timerMinutes: number;
  taskMinutes: number;
  targetHours: number;
  percentOfTarget: number;
  isToday: boolean;
  goalMet: boolean;
}

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const STUDY_DAYS: { key: DayOfWeek; shortBn: string; shortEn: string; fullEn: string }[] = [
  { key: 'শনিবার', shortBn: 'শনি', shortEn: 'Sat', fullEn: 'Saturday' },
  { key: 'রবিবার', shortBn: 'রবি', shortEn: 'Sun', fullEn: 'Sunday' },
  { key: 'সোমবার', shortBn: 'সোম', shortEn: 'Mon', fullEn: 'Monday' },
  { key: 'মঙ্গলবার', shortBn: 'মঙ্গল', shortEn: 'Tue', fullEn: 'Tuesday' },
  { key: 'বুধবার', shortBn: 'বুধ', shortEn: 'Wed', fullEn: 'Wednesday' },
  { key: 'বৃহস্পতিবার', shortBn: 'বৃহঃ', shortEn: 'Thu', fullEn: 'Thursday' },
  { key: 'শুক্রবার', shortBn: 'শুক্র', shortEn: 'Fri', fullEn: 'Friday' },
];

function formatNum(value: number | string, isBn: boolean): string {
  const str = String(value);
  return isBn ? toBnDigits(str) : str;
}

function formatWeekRange(startUtcMs: number, isBn: boolean): string {
  const start = new Date(startUtcMs + DHAKA_OFFSET_MS);
  const end = new Date(startUtcMs + 6 * 24 * 60 * 60 * 1000 + DHAKA_OFFSET_MS);
  const locale = isBn ? 'bn-BD' : 'en-US';
  const fmt = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

export const WeeklyStudyGoalChart: React.FC<WeeklyStudyGoalChartProps> = ({
  state,
  onNavigate,
  onUpdateWeeklyGoal,
}) => {
  const lang = state.settings.language;
  const isBn = lang === 'bn';
  const isDark = state.settings.theme === 'dark';

  const weeklyGoalHours = Math.min(100, Math.max(1, state.settings.weeklyStudyGoalHours ?? 14));
  const dailyTargetHours = Number((weeklyGoalHours / 7).toFixed(2));

  const [chartMode, setChartMode] = useState<ChartMode>('weekly');
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(String(weeklyGoalHours));

  useEffect(() => {
    setGoalDraft(String(weeklyGoalHours));
  }, [weeklyGoalHours]);

  const {
    weeklySeries,
    dailySeries,
    currentWeekHours,
    currentWeekTimerMinutes,
    currentWeekTaskMinutes,
    weeklyPercent,
    remainingHours,
    goalReached,
    weeklyYMax,
    dailyYMax,
  } = useMemo(() => {
    const nowDhaka = new Date(Date.now() + DHAKA_OFFSET_MS);
    const todaySatIndex = (nowDhaka.getUTCDay() + 1) % 7; // 0=Sat .. 6=Fri
    const weekStartDhakaMs = Date.UTC(
      nowDhaka.getUTCFullYear(),
      nowDhaka.getUTCMonth(),
      nowDhaka.getUTCDate() - todaySatIndex,
      0,
      0,
      0,
      0
    );
    const currentWeekStartUtcMs = weekStartDhakaMs - DHAKA_OFFSET_MS;

    // 1. Daily breakdown for current Sat–Fri study week
    const dailyTimerMinutes = [0, 0, 0, 0, 0, 0, 0];
    const dailyTaskMinutes = [0, 0, 0, 0, 0, 0, 0];

    for (const session of state.timerHistory) {
      const completedMs = new Date(session.completedAt).getTime();
      if (
        !Number.isNaN(completedMs) &&
        completedMs >= currentWeekStartUtcMs &&
        completedMs < currentWeekStartUtcMs + WEEK_MS
      ) {
        const d = new Date(completedMs + DHAKA_OFFSET_MS);
        const dayIdx = (d.getUTCDay() + 1) % 7;
        dailyTimerMinutes[dayIdx] += Math.max(0, session.completedMinutes || 0);
      }
    }

    for (const task of state.tasks) {
      if (!task.completed) continue;
      const dayIdx = STUDY_DAYS.findIndex((d) => d.key === task.day);
      if (dayIdx >= 0) {
        dailyTaskMinutes[dayIdx] += Math.max(0, task.durationMinutes || 0);
      }
    }

    const dailyData: DailyBarDatum[] = STUDY_DAYS.map((dayInfo, idx) => {
      const timerMin = dailyTimerMinutes[idx];
      const taskMin = dailyTaskMinutes[idx];
      const totalHrs = Number(((timerMin + taskMin) / 60).toFixed(2));
      const pct = dailyTargetHours > 0 ? Math.round((totalHrs / dailyTargetHours) * 100) : 0;
      return {
        key: dayInfo.key,
        label: isBn ? dayInfo.shortBn : dayInfo.shortEn,
        fullDayLabel: isBn ? dayInfo.key : dayInfo.fullEn,
        studiedHours: totalHrs,
        timerMinutes: timerMin,
        taskMinutes: taskMin,
        targetHours: dailyTargetHours,
        percentOfTarget: pct,
        isToday: idx === todaySatIndex,
        goalMet: totalHrs >= dailyTargetHours && totalHrs > 0,
      };
    });

    // 2. Last 4 weeks comparison against weeklyStudyGoalHours
    const weekLabelsBn = ['৩ সপ্তাহ আগে', '২ সপ্তাহ আগে', 'গত সপ্তাহ', 'চলতি সপ্তাহ'];
    const weekLabelsEn = ['3 Wks Ago', '2 Wks Ago', 'Last Week', 'This Week'];

    const curWeekTaskTotalMin = dailyTaskMinutes.reduce((a, b) => a + b, 0);
    const curWeekTimerTotalMin = dailyTimerMinutes.reduce((a, b) => a + b, 0);

    const weeklyData: WeeklyBarDatum[] = [3, 2, 1, 0].map((weeksBack, idx) => {
      const startUtc = currentWeekStartUtcMs - weeksBack * WEEK_MS;
      const endUtc = startUtc + WEEK_MS;
      const isCurrent = weeksBack === 0;

      const timerMin = isCurrent
        ? curWeekTimerTotalMin
        : state.timerHistory.reduce((sum, s) => {
            const ms = new Date(s.completedAt).getTime();
            if (!Number.isNaN(ms) && ms >= startUtc && ms < endUtc) {
              return sum + Math.max(0, s.completedMinutes || 0);
            }
            return sum;
          }, 0);

      const taskMin = isCurrent ? curWeekTaskTotalMin : 0;
      const studiedHours = Number(((timerMin + taskMin) / 60).toFixed(2));
      const pct = weeklyGoalHours > 0 ? Math.round((studiedHours / weeklyGoalHours) * 100) : 0;

      return {
        key: `week-${weeksBack}`,
        label: isBn ? weekLabelsBn[idx] : weekLabelsEn[idx],
        rangeLabel: formatWeekRange(startUtc, isBn),
        studiedHours,
        timerMinutes: timerMin,
        taskMinutes: taskMin,
        goalHours: weeklyGoalHours,
        percentOfGoal: pct,
        isCurrent,
        goalMet: studiedHours >= weeklyGoalHours,
      };
    });

    const curHours = Number(((curWeekTimerTotalMin + curWeekTaskTotalMin) / 60).toFixed(1));
    const pct = weeklyGoalHours > 0 ? Math.round((curHours / weeklyGoalHours) * 100) : 0;
    const remHours = Number(Math.max(0, weeklyGoalHours - curHours).toFixed(1));

    const maxWeeklyVal = Math.max(
      weeklyGoalHours,
      ...weeklyData.map((w) => w.studiedHours)
    );
    const maxDailyVal = Math.max(
      dailyTargetHours,
      ...dailyData.map((d) => d.studiedHours)
    );

    return {
      weeklySeries: weeklyData,
      dailySeries: dailyData,
      currentWeekHours: curHours,
      currentWeekTimerMinutes: curWeekTimerTotalMin,
      currentWeekTaskMinutes: curWeekTaskTotalMin,
      weeklyPercent: pct,
      remainingHours: remHours,
      goalReached: curHours >= weeklyGoalHours,
      weeklyYMax: Math.max(2, Math.ceil(maxWeeklyVal * 1.2)),
      dailyYMax: Math.max(2, Number((maxDailyVal * 1.25).toFixed(1))),
    };
  }, [state.timerHistory, state.tasks, weeklyGoalHours, dailyTargetHours, isBn]);

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Math.round(Number(goalDraft));
    const nextHours = Number.isFinite(parsed)
      ? Math.min(100, Math.max(1, parsed))
      : weeklyGoalHours;
    onUpdateWeeklyGoal?.(nextHours);
    setGoalDraft(String(nextHours));
    setIsEditingGoal(false);
  };

  const axisColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(15, 23, 42, 0.08)';
  const goalLineColor = '#f59e0b';
  const cursorFill = isDark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(15, 23, 42, 0.04)';

  const renderTooltip = (props: {
    active?: boolean;
    payload?: ReadonlyArray<{ payload?: WeeklyBarDatum | DailyBarDatum }>;
  }) => {
    const { active, payload } = props;
    if (!active || !payload || payload.length === 0 || !payload[0].payload) return null;

    if (chartMode === 'weekly') {
      const d = payload[0].payload as WeeklyBarDatum;
      return (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 shadow-lg text-xs space-y-1.5">
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">{d.label}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{d.rangeLabel}</p>
          </div>
          <div className="space-y-0.5 tabular-nums pt-1 border-t border-slate-100 dark:border-slate-800">
            <p className="flex items-center justify-between gap-4 text-slate-700 dark:text-slate-200">
              <span>{bi(lang, 'মোট অধ্যয়ন', 'Studied')}</span>
              <span className="font-semibold text-sky-600 dark:text-sky-400">
                {formatNum(d.studiedHours.toFixed(1), isBn)} {bi(lang, 'ঘণ্টা', 'hrs')}
              </span>
            </p>
            <p className="flex items-center justify-between gap-4 text-slate-500 dark:text-slate-400">
              <span>{bi(lang, 'সাপ্তাহিক লক্ষ্য', 'Weekly Goal')}</span>
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {formatNum(d.goalHours, isBn)} {bi(lang, 'ঘণ্টা', 'hrs')}
              </span>
            </p>
            <p className="flex items-center justify-between gap-4 text-slate-500 dark:text-slate-400">
              <span>{bi(lang, 'লক্ষ্য অর্জন', 'Completion')}</span>
              <span
                className={`font-semibold ${
                  d.goalMet
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                {formatNum(d.percentOfGoal, isBn)}%
              </span>
            </p>
            {(d.timerMinutes > 0 || d.taskMinutes > 0) && (
              <p className="pt-1 text-[11px] text-slate-400 dark:text-slate-500">
                {bi(
                  lang,
                  `টাইমার ${toBnDigits(d.timerMinutes)} মি. · রুটিন ${toBnDigits(d.taskMinutes)} মি.`,
                  `Timer ${d.timerMinutes}m · Routine ${d.taskMinutes}m`
                )}
              </p>
            )}
          </div>
        </div>
      );
    }

    const d = payload[0].payload as DailyBarDatum;
    return (
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 shadow-lg text-xs space-y-1.5">
        <p className="font-semibold text-slate-900 dark:text-white">
          {d.fullDayLabel}
          {d.isToday ? ` (${bi(lang, 'আজ', 'Today')})` : ''}
        </p>
        <div className="space-y-0.5 tabular-nums pt-1 border-t border-slate-100 dark:border-slate-800">
          <p className="flex items-center justify-between gap-4 text-slate-700 dark:text-slate-200">
            <span>{bi(lang, 'অধ্যয়ন সময়', 'Studied')}</span>
            <span className="font-semibold text-sky-600 dark:text-sky-400">
              {formatNum(d.studiedHours.toFixed(1), isBn)} {bi(lang, 'ঘণ্টা', 'hrs')}
            </span>
          </p>
          <p className="flex items-center justify-between gap-4 text-slate-500 dark:text-slate-400">
            <span>{bi(lang, 'দৈনিক লক্ষ্য', 'Daily Target')}</span>
            <span className="font-medium text-amber-600 dark:text-amber-400">
              {formatNum(d.targetHours.toFixed(1), isBn)} {bi(lang, 'ঘণ্টা', 'hrs')}
            </span>
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-0.5">
            {bi(
              lang,
              `টাইমার ${toBnDigits(d.timerMinutes)} মি. · রুটিন ${toBnDigits(d.taskMinutes)} মি.`,
              `Timer ${d.timerMinutes}m · Routine ${d.taskMinutes}m`
            )}
          </p>
        </div>
      </div>
    );
  };

  return (
    <section
      aria-label={bi(lang, 'সাপ্তাহিক অধ্যয়ন সময় বনাম লক্ষ্য চার্ট', 'Weekly study time vs goal chart')}
      className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 lg:p-6 space-y-5"
    >
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <h2 className="text-base lg:text-lg font-semibold text-slate-900 dark:text-white">
            {bi(lang, 'সাপ্তাহিক অধ্যয়ন সময় বনাম লক্ষ্য', 'Weekly Study Time vs. Goal')}
          </h2>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            <span>
              {bi(
                lang,
                `চলতি সপ্তাহ: ${toBnDigits(currentWeekHours.toFixed(1))} ঘণ্টা`,
                `This week: ${currentWeekHours.toFixed(1)} hrs`
              )}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {bi(
                lang,
                `লক্ষ্য: ${toBnDigits(weeklyGoalHours)} ঘণ্টা/সপ্তাহ`,
                `Goal: ${weeklyGoalHours} hrs/week`
              )}
            </span>
            <span aria-hidden="true">·</span>
            <span
              className={
                goalReached
                  ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                  : 'font-semibold text-sky-600 dark:text-sky-400'
              }
            >
              {goalReached
                ? bi(lang, `লক্ষ্য অর্জিত (${toBnDigits(weeklyPercent)}%)`, `Goal Reached (${weeklyPercent}%)`)
                : bi(
                    lang,
                    `${toBnDigits(weeklyPercent)}% সম্পন্ন (${toBnDigits(remainingHours.toFixed(1))} ঘণ্টা বাকি)`,
                    `${weeklyPercent}% complete (${remainingHours.toFixed(1)} hrs remaining)`
                  )}
            </span>
          </div>
        </div>

        {/* Interactive Controls: Segmented Mode Switch + Inline Goal Edit */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="tablist"
            aria-label={bi(lang, 'চার্ট ভিউ নির্বাচন', 'Chart view selector')}
            className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          >
            <button
              type="button"
              role="tab"
              aria-selected={chartMode === 'weekly'}
              onClick={() => setChartMode('weekly')}
              className={`min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                chartMode === 'weekly'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {bi(lang, 'সাপ্তাহিক (৪ সপ্তাহ)', 'Weekly (4 Wks)')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={chartMode === 'daily'}
              onClick={() => setChartMode('daily')}
              className={`min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                chartMode === 'daily'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {bi(lang, 'দৈনিক (শনি–শুক্র)', 'Daily (Sat–Fri)')}
            </button>
          </div>

          {onUpdateWeeklyGoal && !isEditingGoal && (
            <button
              type="button"
              onClick={() => setIsEditingGoal(true)}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>{bi(lang, 'লক্ষ্য পরিবর্তন', 'Edit Goal')}</span>
            </button>
          )}

          {onUpdateWeeklyGoal && isEditingGoal && (
            <form onSubmit={handleSaveGoal} className="inline-flex items-center gap-1.5">
              <label htmlFor="progress-weekly-goal-input" className="sr-only">
                {bi(lang, 'সাপ্তাহিক অধ্যয়ন লক্ষ্য (ঘণ্টা)', 'Weekly study goal in hours')}
              </label>
              <input
                id="progress-weekly-goal-input"
                type="number"
                min={1}
                max={100}
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
                className="w-20 min-h-[38px] px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {bi(lang, 'ঘণ্টা', 'hrs')}
              </span>
              <button
                type="submit"
                aria-label={bi(lang, 'সংরক্ষণ করুন', 'Save goal')}
                className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label={bi(lang, 'বাতিল', 'Cancel')}
                onClick={() => {
                  setGoalDraft(String(weeklyGoalHours));
                  setIsEditingGoal(false);
                }}
                className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Inline Metric Strip (Clean hairline dividers, no nested cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3.5 border-y border-slate-200/80 dark:border-slate-800">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {bi(lang, 'সাপ্তাহিক লক্ষ্য', 'Weekly Goal')}
          </p>
          <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white tabular-nums">
            {formatNum(weeklyGoalHours, isBn)} {bi(lang, 'ঘণ্টা', 'hrs')}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {bi(lang, 'চলতি সপ্তাহে অধ্যয়ন', 'Studied This Week')}
          </p>
          <p className="mt-0.5 text-lg font-bold text-sky-600 dark:text-sky-400 tabular-nums">
            {formatNum(currentWeekHours.toFixed(1), isBn)} {bi(lang, 'ঘণ্টা', 'hrs')}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {bi(lang, 'দৈনিক গড় প্রয়োজন', 'Daily Target Pace')}
          </p>
          <p className="mt-0.5 text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
            {formatNum(dailyTargetHours.toFixed(1), isBn)} {bi(lang, 'ঘণ্টা/দিন', 'hrs/day')}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {bi(lang, 'টাইমার বনাম রুটিন', 'Timer vs. Routine')}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
            {formatNum(currentWeekTimerMinutes, isBn)} {bi(lang, 'মি.', 'm')} /{' '}
            {formatNum(currentWeekTaskMinutes, isBn)} {bi(lang, 'মি.', 'm')}
          </p>
        </div>
      </div>

      {/* Recharts BarChart */}
      <div className="w-full h-[270px] sm:h-[290px]">
        <ResponsiveContainer width="100%" height="100%">
          {chartMode === 'weekly' ? (
            <BarChart
              data={weeklySeries}
              margin={{ top: 18, right: 16, left: -8, bottom: 4 }}
              barCategoryGap="26%"
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: axisColor, fontSize: 12 }}
                dy={6}
              />
              <YAxis
                domain={[0, weeklyYMax]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: axisColor, fontSize: 11 }}
                tickFormatter={(v: number) => `${formatNum(v, isBn)}${isBn ? 'ঘ' : 'h'}`}
                width={42}
              />
              <Tooltip cursor={{ fill: cursorFill }} content={renderTooltip} />
              <ReferenceLine
                y={weeklyGoalHours}
                stroke={goalLineColor}
                strokeWidth={2}
                strokeDasharray="6 4"
                label={{
                  value: bi(
                    lang,
                    `লক্ষ্য: ${toBnDigits(weeklyGoalHours)} ঘণ্টা`,
                    `Goal: ${weeklyGoalHours}h`
                  ),
                  position: 'insideTopRight',
                  fill: isDark ? '#fbbf24' : '#b45309',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />
              <Bar
                dataKey="studiedHours"
                name={bi(lang, 'অধ্যয়ন ঘণ্টা', 'Studied Hours')}
                radius={[8, 8, 0, 0]}
                maxBarSize={56}
              >
                {weeklySeries.map((entry) => {
                  const fill = entry.goalMet
                    ? '#10b981'
                    : entry.isCurrent
                      ? '#0284c7'
                      : isDark
                        ? '#475569'
                        : '#94a3b8';
                  return <Cell key={entry.key} fill={fill} />;
                })}
              </Bar>
            </BarChart>
          ) : (
            <BarChart
              data={dailySeries}
              margin={{ top: 18, right: 16, left: -8, bottom: 4 }}
              barCategoryGap="24%"
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: axisColor, fontSize: 12 }}
                dy={6}
              />
              <YAxis
                domain={[0, dailyYMax]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: axisColor, fontSize: 11 }}
                tickFormatter={(v: number) => `${formatNum(v, isBn)}${isBn ? 'ঘ' : 'h'}`}
                width={42}
              />
              <Tooltip cursor={{ fill: cursorFill }} content={renderTooltip} />
              <ReferenceLine
                y={dailyTargetHours}
                stroke={goalLineColor}
                strokeWidth={2}
                strokeDasharray="6 4"
                label={{
                  value: bi(
                    lang,
                    `দৈনিক লক্ষ্য: ${toBnDigits(dailyTargetHours.toFixed(1))} ঘণ্টা`,
                    `Daily Target: ${dailyTargetHours.toFixed(1)}h`
                  ),
                  position: 'insideTopRight',
                  fill: isDark ? '#fbbf24' : '#b45309',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />
              <Bar
                dataKey="studiedHours"
                name={bi(lang, 'দৈনিক অধ্যয়ন', 'Daily Study')}
                radius={[7, 7, 0, 0]}
                maxBarSize={44}
              >
                {dailySeries.map((entry) => {
                  const fill = entry.goalMet
                    ? '#10b981'
                    : entry.isToday
                      ? '#0284c7'
                      : isDark
                        ? '#38bdf8'
                        : '#0ea5e9';
                  return <Cell key={entry.key} fill={fill} />;
                })}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend & Action Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-slate-200/70 dark:border-slate-800 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2.5 rounded-sm bg-sky-600 inline-block" aria-hidden="true" />
            <span>
              {chartMode === 'weekly'
                ? bi(lang, 'চলতি সপ্তাহ', 'This Week')
                : bi(lang, 'অধ্যয়ন সময়', 'Study Time')}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2.5 rounded-sm bg-emerald-500 inline-block" aria-hidden="true" />
            <span>{bi(lang, 'লক্ষ্য অর্জিত', 'Goal Met')}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-4 border-t-2 border-dashed border-amber-500 inline-block"
              aria-hidden="true"
            />
            <span>
              {chartMode === 'weekly'
                ? bi(lang, 'সাপ্তাহিক লক্ষ্য রেখা', 'Weekly Goal Line')
                : bi(lang, 'দৈনিক লক্ষ্য রেখা', 'Daily Target Line')}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {currentWeekHours === 0 && (
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>
                {bi(lang, 'এখনো চলতি সপ্তাহের সেশন নেই', 'No study logged this week yet')}
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={() => onNavigate('timer')}
            className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
          >
            <Timer className="w-3.5 h-3.5" />
            <span>{bi(lang, 'অধ্যয়ন টাইমার চালু করুন', 'Start Study Timer')}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('routine')}
            className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{bi(lang, 'রুটিন', 'Routine')}</span>
          </button>
        </div>
      </div>
    </section>
  );
};
