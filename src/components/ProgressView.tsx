import React from 'react';
import { BarChart3, CheckCircle2, Clock, HelpCircle } from 'lucide-react';
import { getSubjectsForUser } from '../data/curriculum';
import { AppView, StudyMateState } from '../types/study';
import { formatDateBn, toBnDigits } from '../utils/formatBn';
import { WeeklyStudyGoalChart } from './WeeklyStudyGoalChart';

interface ProgressViewProps {
  state: StudyMateState;
  onNavigate: (view: AppView) => void;
  onUpdateWeeklyGoal?: (hours: number) => void;
}

export const ProgressView: React.FC<ProgressViewProps> = ({
  state,
  onNavigate,
  onUpdateWeeklyGoal,
}) => {
  const completedTasks = state.tasks.filter((t) => t.completed);
  const totalTasks = state.tasks.length;
  const taskPct = totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0;

  const taskStudyMinutes = completedTasks.reduce((sum, t) => sum + (t.durationMinutes || 0), 0);
  const timerStudyMinutes = state.timerHistory.reduce((sum, s) => sum + (s.completedMinutes || 0), 0);
  const totalStudyMinutes = taskStudyMinutes + timerStudyMinutes;
  const studyHours = (totalStudyMinutes / 60).toFixed(1);

  const semesterSubjects = getSubjectsForUser(state.settings.department, state.settings.semester);
  const totalChapters = semesterSubjects.reduce((sum, s) => sum + s.chapters.length, 0);
  const completedChapters = semesterSubjects.reduce(
    (sum, s) => sum + s.chapters.filter((ch) => state.completedChapterIds.includes(ch.id)).length,
    0
  );
  const chapterPct = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;

  const avgQuizScore =
    state.quizHistory.length > 0
      ? Math.round(
          state.quizHistory.reduce((sum, q) => sum + q.scorePercent, 0) / state.quizHistory.length
        )
      : 0;

  const bestQuizScore =
    state.quizHistory.length > 0
      ? Math.max(...state.quizHistory.map((q) => q.scorePercent))
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
          অধ্যয়ন অগ্রগতি ও পরিসংখ্যান
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          আপনার সম্পন্ন করা রুটিন, অধ্যায় এবং এমসিকিউ কুইজের প্রকৃত পরিসংখ্যান
        </p>
      </div>

      {/* Summary Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <div className="p-4 lg:p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs">সম্পন্ন রুটিন টাস্ক</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {toBnDigits(completedTasks.length)} / {toBnDigits(totalTasks)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            সাফল্যের হার {toBnDigits(taskPct)}%
          </p>
        </div>

        <div className="p-4 lg:p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs">মোট অধ্যয়ন সময়</span>
            <Clock className="w-4 h-4 text-sky-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {toBnDigits(studyHours)} ঘণ্টা
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {toBnDigits(totalStudyMinutes)} মিনিট সম্পন্ন
          </p>
        </div>

        <div className="p-4 lg:p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs">অধ্যায় অগ্রগতি</span>
            <BarChart3 className="w-4 h-4 text-sky-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {toBnDigits(chapterPct)}%
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {toBnDigits(completedChapters)}/{toBnDigits(totalChapters)} অধ্যায়
          </p>
        </div>

        <div className="p-4 lg:p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs">গড় কুইজ স্কোর</span>
            <HelpCircle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {state.quizHistory.length > 0 ? `${toBnDigits(avgQuizScore)}%` : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {state.quizHistory.length > 0
              ? `সর্বোচ্চ: ${toBnDigits(bestQuizScore)}%`
              : 'এখনো পরীক্ষা হয়নি'}
          </p>
        </div>
      </section>

      {/* Weekly Study Time vs Goal Recharts Bar Chart */}
      <WeeklyStudyGoalChart
        state={state}
        onNavigate={onNavigate}
        onUpdateWeeklyGoal={onUpdateWeeklyGoal}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Subject-wise Chapter Progress */}
        <section className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              বিষয়ভিত্তিক অধ্যায় সমাপ্তি
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('subjects')}
              className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline"
            >
              বিষয় দেখুন
            </button>
          </div>

          <div className="space-y-4">
            {semesterSubjects.map((subj) => {
              const done = subj.chapters.filter((ch) =>
                state.completedChapterIds.includes(ch.id)
              ).length;
              const total = subj.chapters.length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <div key={subj.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {subj.nameBn}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                      {toBnDigits(done)}/{toBnDigits(total)} ({toBnDigits(pct)}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-sky-500 transition-all duration-200"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Quiz Score History & Visual Chart */}
        <section className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              কুইজ স্কোর ইতিহাস
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('quiz')}
              className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline"
            >
              নতুন কুইজ দিন
            </button>
          </div>

          {state.quizHistory.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                এখনো কোনো কুইজের ফলাফল সংরক্ষিত নেই।
              </p>
              <button
                type="button"
                onClick={() => onNavigate('quiz')}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium"
              >
                <span>প্রথম কুইজ শুরু করুন</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Clean Bar Visualization of Recent Quizzes */}
              <div className="h-36 flex items-end gap-2 pt-4 pb-2 px-2 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800">
                {state.quizHistory
                  .slice(0, 8)
                  .reverse()
                  .map((attempt, idx) => (
                    <div key={attempt.id} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                        {toBnDigits(attempt.scorePercent)}%
                      </span>
                      <div className="w-full max-w-[36px] bg-slate-200 dark:bg-slate-800 rounded-t-md h-20 flex items-end overflow-hidden">
                        <div
                          className={`w-full rounded-t-md transition-all ${
                            attempt.scorePercent >= 70
                              ? 'bg-emerald-500'
                              : attempt.scorePercent >= 40
                              ? 'bg-sky-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ height: `${Math.max(8, attempt.scorePercent)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 tabular-nums">#{toBnDigits(idx + 1)}</span>
                    </div>
                  ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2 font-medium">বিষয়</th>
                      <th className="py-2 font-medium text-right">সঠিক</th>
                      <th className="py-2 font-medium text-right">স্কোর</th>
                      <th className="py-2 font-medium text-right">তারিখ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {state.quizHistory.slice(0, 6).map((q) => (
                      <tr key={q.id}>
                        <td className="py-2.5 pr-2 font-medium text-slate-800 dark:text-slate-200">
                          {q.category}
                        </td>
                        <td className="py-2.5 text-right text-slate-600 dark:text-slate-300 tabular-nums">
                          {toBnDigits(q.correctAnswers)}/{toBnDigits(q.totalQuestions)}
                        </td>
                        <td className="py-2.5 text-right font-semibold text-sky-600 dark:text-sky-400 tabular-nums">
                          {toBnDigits(q.scorePercent)}%
                        </td>
                        <td className="py-2.5 text-right text-slate-500 dark:text-slate-400 tabular-nums">
                          {formatDateBn(q.completedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
