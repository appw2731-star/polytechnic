import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CalendarDays, Plus, Trash2, X } from 'lucide-react';
import { bi } from '../i18n/translations';
import { LanguageMode, Subject, UpcomingExam, UpcomingExamType } from '../types/study';
import { toBnDigits } from '../utils/formatBn';

interface UpcomingExamCountdownProps {
  language: LanguageMode;
  exams: UpcomingExam[];
  semesterSubjects: Subject[];
  onAddExam: (exam: Omit<UpcomingExam, 'id' | 'createdAt'>) => void;
  onDeleteExam: (examId: string) => void;
}

interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

const EXAM_TYPE_LABELS: Record<UpcomingExamType, { bn: string; en: string }> = {
  final: { bn: 'সেমিস্টার ফাইনাল', en: 'Semester Final' },
  midterm: { bn: 'মিডটার্ম পরীক্ষা', en: 'Midterm Exam' },
  practical: { bn: 'প্র্যাকটিক্যাল', en: 'Practical Exam' },
  quiz: { bn: 'ক্লাস টেস্ট / কুইজ', en: 'Class Test / Quiz' },
};

function getExamTimestampMs(exam: Pick<UpcomingExam, 'examDate' | 'examTime'>): number {
  const [y, m, d] = exam.examDate.split('-').map(Number);
  const [hh, mm] = (exam.examTime || '10:00').split(':').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return Number.NaN;
  const safeH = Number.isFinite(hh) ? hh : 10;
  const safeM = Number.isFinite(mm) ? mm : 0;
  return new Date(y, m - 1, d, safeH, safeM, 0, 0).getTime();
}

function getDefaultFutureDateInput(daysAhead = 7): string {
  const target = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function computeCountdown(targetMs: number, nowMs: number): CountdownParts {
  const diff = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, totalMs: diff };
}

function formatNum(value: number | string, isBn: boolean): string {
  const str = String(value);
  return isBn ? toBnDigits(str) : str;
}

function formatExamDateTime(exam: UpcomingExam, isBn: boolean): string {
  const ts = getExamTimestampMs(exam);
  if (Number.isNaN(ts)) return exam.examDate;
  const dateObj = new Date(ts);
  const locale = isBn ? 'bn-BD' : 'en-US';
  const dateText = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(dateObj);
  const timeText = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(dateObj);
  return `${dateText} · ${timeText}`;
}

export const UpcomingExamCountdown: React.FC<UpcomingExamCountdownProps> = ({
  language,
  exams,
  semesterSubjects,
  onAddExam,
  onDeleteExam,
}) => {
  const isBn = language === 'bn';
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState('');
  const [examDate, setExamDate] = useState(() => getDefaultFutureDateInput(7));
  const [examTime, setExamTime] = useState('10:00');
  const [examType, setExamType] = useState<UpcomingExamType>('final');
  const [formError, setFormError] = useState<string | null>(null);

  const { upcomingExams, pastExams } = useMemo(() => {
    const withTs = exams
      .map((exam) => ({ exam, ts: getExamTimestampMs(exam) }))
      .filter((item) => !Number.isNaN(item.ts));

    const upcoming = withTs
      .filter((item) => item.ts > nowMs)
      .sort((a, b) => a.ts - b.ts);

    const past = withTs
      .filter((item) => item.ts <= nowMs)
      .sort((a, b) => b.ts - a.ts);

    return { upcomingExams: upcoming, pastExams: past };
  }, [exams, nowMs]);

  const nearest = upcomingExams[0] ?? null;

  useEffect(() => {
    if (upcomingExams.length === 0) return;
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [upcomingExams.length]);

  const countdown = nearest ? computeCountdown(nearest.ts, nowMs) : null;

  const urgency = useMemo(() => {
    if (!countdown) return null;
    if (countdown.days <= 3) {
      return {
        labelBn: 'খুব কাছাকাছি · চূড়ান্ত রিভিশন',
        labelEn: 'Coming up soon · Final revision',
        accentText: 'text-rose-600 dark:text-rose-400',
        tileAccent: 'border-rose-500/35 bg-rose-500/8 dark:bg-rose-500/10',
        numberText: 'text-rose-600 dark:text-rose-400',
      };
    }
    if (countdown.days <= 14) {
      return {
        labelBn: 'রিভিশন পর্ব চলমান',
        labelEn: 'Active revision window',
        accentText: 'text-amber-600 dark:text-amber-400',
        tileAccent: 'border-amber-500/30 bg-amber-500/8 dark:bg-amber-500/10',
        numberText: 'text-amber-600 dark:text-amber-400',
      };
    }
    return {
      labelBn: 'পরিকল্পিত প্রস্তুতি',
      labelEn: 'On track',
      accentText: 'text-cyan-600 dark:text-cyan-400',
      tileAccent: 'border-cyan-500/25 bg-cyan-500/8 dark:bg-cyan-500/10',
      numberText: 'text-cyan-700 dark:text-cyan-300',
    };
  }, [countdown]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError(bi(language, 'পরীক্ষার নাম বা বিষয় লিখুন।', 'Please enter an exam or subject name.'));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
      setFormError(bi(language, 'সঠিক পরীক্ষার তারিখ নির্বাচন করুন।', 'Please choose a valid exam date.'));
      return;
    }
    const safeTime = /^\d{2}:\d{2}$/.test(examTime) ? examTime : '10:00';
    const targetMs = getExamTimestampMs({ examDate, examTime: safeTime });
    if (Number.isNaN(targetMs) || targetMs <= Date.now()) {
      setFormError(
        bi(
          language,
          'ভবিষ্যতের একটি পরীক্ষার তারিখ ও সময় নির্বাচন করুন।',
          'Please select an upcoming date and time in the future.'
        )
      );
      return;
    }

    onAddExam({
      title: trimmedTitle.slice(0, 120),
      examDate,
      examTime: safeTime,
      examType,
    });
    setTitle('');
    setExamDate(getDefaultFutureDateInput(7));
    setExamTime('10:00');
    setExamType('final');
    setFormError(null);
    setShowForm(false);
    setNowMs(Date.now());
  };

  return (
    <section
      aria-label={bi(language, 'আসন্ন পরীক্ষার কাউন্টডাউন', 'Upcoming Exam Countdown')}
      className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 lg:p-6 space-y-5"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-cyan-700 dark:text-cyan-400 inline-flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5" />
              <span>{bi(language, 'পরীক্ষার কাউন্টডাউন', 'Exam Countdown')}</span>
            </span>
            {upcomingExams.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {isBn
                    ? `আসন্ন ${toBnDigits(upcomingExams.length)}টি পরীক্ষা`
                    : `${upcomingExams.length} upcoming ${upcomingExams.length === 1 ? 'exam' : 'exams'}`}
                </span>
              </>
            )}
            {urgency && (
              <>
                <span aria-hidden="true">·</span>
                <span className={`font-semibold ${urgency.accentText}`}>
                  {bi(language, urgency.labelBn, urgency.labelEn)}
                </span>
              </>
            )}
          </div>
          <h2 className="text-base lg:text-lg font-bold text-slate-900 dark:text-white leading-snug">
            {nearest
              ? nearest.exam.title
              : bi(language, 'আসন্ন পরীক্ষার সময়সূচি যুক্ত করুন', 'Track Your Upcoming Exams')}
          </h2>
          {nearest && (
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {bi(
                language,
                EXAM_TYPE_LABELS[nearest.exam.examType].bn,
                EXAM_TYPE_LABELS[nearest.exam.examType].en
              )}{' '}
              · {formatExamDateTime(nearest.exam, isBn)}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setShowForm((prev) => !prev);
          }}
          className={`min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
            showForm
              ? 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              : 'bg-cyan-600 hover:bg-cyan-500 text-white'
          }`}
        >
          {showForm ? (
            <>
              <X className="w-3.5 h-3.5" />
              <span>{bi(language, 'বন্ধ করুন', 'Close')}</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>{bi(language, 'পরীক্ষা যোগ করুন', 'Add Exam')}</span>
            </>
          )}
        </button>
      </div>

      {/* Inline Add Exam Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="pt-4 border-t border-slate-200/80 dark:border-slate-800 space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-5 space-y-1">
              <label
                htmlFor="exam-title-input"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                {bi(language, 'পরীক্ষা বা বিষয়ের নাম *', 'Exam or Subject Name *')}
              </label>
              <input
                id="exam-title-input"
                type="text"
                required
                maxLength={120}
                list="semester-exam-subject-suggestions"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder={bi(
                  language,
                  'যেমন: ৪র্থ সেমিস্টার ফাইনাল বা পাওয়ার প্ল্যান্ট',
                  'e.g. 4th Semester Final or Power Plant'
                )}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <datalist id="semester-exam-subject-suggestions">
                {semesterSubjects.map((subj) => (
                  <option
                    key={subj.id}
                    value={`${language === 'en' ? subj.nameEn || subj.nameBn : subj.nameBn} (${subj.code})`}
                  />
                ))}
              </datalist>
            </div>

            <div className="md:col-span-3 space-y-1">
              <label
                htmlFor="exam-date-input"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                {bi(language, 'পরীক্ষার তারিখ *', 'Exam Date *')}
              </label>
              <input
                id="exam-date-input"
                type="date"
                required
                value={examDate}
                onChange={(e) => {
                  setExamDate(e.target.value);
                  if (formError) setFormError(null);
                }}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div className="md:col-span-2 space-y-1">
              <label
                htmlFor="exam-time-input"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                {bi(language, 'সময়', 'Start Time')}
              </label>
              <input
                id="exam-time-input"
                type="time"
                value={examTime}
                onChange={(e) => setExamTime(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div className="md:col-span-2 space-y-1">
              <label
                htmlFor="exam-type-select"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                {bi(language, 'ধরন', 'Type')}
              </label>
              <select
                id="exam-type-select"
                value={examType}
                onChange={(e) => setExamType(e.target.value as UpcomingExamType)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="final">{bi(language, 'ফাইনাল', 'Final')}</option>
                <option value="midterm">{bi(language, 'মিডটার্ম', 'Midterm')}</option>
                <option value="practical">{bi(language, 'প্র্যাকটিক্যাল', 'Practical')}</option>
                <option value="quiz">{bi(language, 'কুইজ / টেস্ট', 'Quiz / Test')}</option>
              </select>
            </div>
          </div>

          {formError && (
            <p className="text-xs font-medium text-rose-600 dark:text-rose-400" role="alert">
              {formError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setShowForm(false);
              }}
              className="min-h-[38px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              {bi(language, 'বাতিল', 'Cancel')}
            </button>
            <button
              type="submit"
              className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold whitespace-nowrap transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{bi(language, 'সংরক্ষণ করুন', 'Save Exam')}</span>
            </button>
          </div>
        </form>
      )}

      {/* Nearest Exam Live Countdown OR Empty State */}
      {nearest && countdown && urgency ? (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2.5 sm:gap-4">
            {(
              [
                { value: countdown.days, labelBn: 'দিন', labelEn: 'Days' },
                { value: countdown.hours, labelBn: 'ঘণ্টা', labelEn: 'Hours' },
                { value: countdown.minutes, labelBn: 'মিনিট', labelEn: 'Minutes' },
                { value: countdown.seconds, labelBn: 'সেকেন্ড', labelEn: 'Seconds' },
              ] as const
            ).map((unit) => (
              <div
                key={unit.labelEn}
                className={`rounded-xl border px-3 py-3.5 sm:py-4 text-center ${urgency.tileAccent}`}
              >
                <p
                  className={`text-2xl sm:text-3xl lg:text-4xl font-bold font-mono tabular-nums tracking-tight ${urgency.numberText}`}
                >
                  {formatNum(String(unit.value).padStart(2, '0'), isBn)}
                </p>
                <p className="mt-1 text-[11px] sm:text-xs font-medium text-slate-600 dark:text-slate-400">
                  {bi(language, unit.labelBn, unit.labelEn)}
                </p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {bi(
                language,
                'নিকটতম পরীক্ষার রিয়েল-টাইম কাউন্টডাউন চালু আছে।',
                'Live countdown active for your nearest scheduled exam.'
              )}
            </span>
            <button
              type="button"
              onClick={() => onDeleteExam(nearest.exam.id)}
              aria-label={bi(language, `${nearest.exam.title} মুছে ফেলুন`, `Remove ${nearest.exam.title}`)}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{bi(language, 'মুছুন', 'Remove')}</span>
            </button>
          </div>
        </div>
      ) : (
        !showForm && (
          <div className="py-5 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CalendarDays className="w-5 h-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                {bi(
                  language,
                  'আপনার সেমিস্টার ফাইনাল, মিডটার্ম বা প্র্যাকটিক্যাল পরীক্ষার তারিখ যোগ করুন — নিকটতম পরীক্ষার লাইভ দিন-ঘণ্টা-মিনিট কাউন্টডাউন এখানে দেখানো হবে।',
                  'Add your upcoming semester final, midterm, or practical exam dates to see a live countdown timer for your nearest exam.'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{bi(language, 'প্রথম পরীক্ষা যোগ করুন', 'Add First Exam')}</span>
            </button>
          </div>
        )
      )}

      {/* Additional Scheduled Exams List (Clean hairline rows, no nested boxes) */}
      {upcomingExams.length > 1 && (
        <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800 space-y-2">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {bi(language, 'পরবর্তী অন্যান্য পরীক্ষা', 'Following Exams')}
          </p>
          <ul className="divide-y divide-slate-200/70 dark:divide-slate-800">
            {upcomingExams.slice(1).map(({ exam, ts }) => {
              const daysLeft = Math.max(0, Math.ceil((ts - nowMs) / (24 * 60 * 60 * 1000)));
              return (
                <li
                  key={exam.id}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">
                      {exam.title}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                      {bi(
                        language,
                        EXAM_TYPE_LABELS[exam.examType].bn,
                        EXAM_TYPE_LABELS[exam.examType].en
                      )}{' '}
                      · {formatExamDateTime(exam, isBn)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono font-semibold text-cyan-700 dark:text-cyan-400 tabular-nums whitespace-nowrap">
                      {isBn
                        ? `আর ${toBnDigits(daysLeft)} দিন`
                        : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteExam(exam.id)}
                      aria-label={bi(language, `${exam.title} মুছে ফেলুন`, `Delete ${exam.title}`)}
                      className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Past / Completed Exams Cleanup Row */}
      {pastExams.length > 0 && (
        <div className="pt-3 border-t border-slate-200/70 dark:border-slate-800 space-y-1.5">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {bi(language, 'সম্পন্ন / অতীত পরীক্ষা', 'Past Exams')}
          </p>
          <ul className="divide-y divide-slate-200/60 dark:divide-slate-800/80">
            {pastExams.slice(0, 3).map(({ exam }) => (
              <li
                key={exam.id}
                className="py-2 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400"
              >
                <span className="truncate">
                  {exam.title} · {formatExamDateTime(exam, isBn)}
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteExam(exam.id)}
                  aria-label={bi(language, `${exam.title} মুছে ফেলুন`, `Delete ${exam.title}`)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
