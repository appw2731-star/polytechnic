import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Play,
  RotateCcw,
  Trophy,
  XCircle,
} from 'lucide-react';
import { MCQ_QUESTION_BANK, QUIZ_CATEGORIES } from '../data/quizzes';
import { bi } from '../i18n/translations';
import { LanguageMode, McqQuestion, QuizAttempt } from '../types/study';
import { formatTimerSeconds, toBnDigits } from '../utils/formatBn';

interface QuizViewProps {
  quizHistory: QuizAttempt[];
  adminMcqs?: McqQuestion[];
  language?: LanguageMode;
  onSaveAttempt: (attempt: QuizAttempt) => void;
}

type QuizPhase = 'setup' | 'active' | 'result';

const OPTION_LETTERS = ['ক', 'খ', 'গ', 'ঘ'];

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const QuizView: React.FC<QuizViewProps> = ({
  quizHistory,
  adminMcqs = [],
  language = 'bn',
  onSaveAttempt,
}) => {
  const combinedBank = useMemo(() => [...adminMcqs, ...MCQ_QUESTION_BANK], [adminMcqs]);
  const categories = useMemo(() => {
    const baseCategories: readonly string[] = QUIZ_CATEGORIES;
    const extraCats = adminMcqs
      .map((m) => m.category)
      .filter((c) => !baseCategories.includes(c));
    return [...QUIZ_CATEGORIES, ...Array.from(new Set(extraCats))];
  }, [adminMcqs]);

  const [phase, setPhase] = useState<QuizPhase>('setup');
  const [selectedCategory, setSelectedCategory] = useState<string>(categories[0]);
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [minutesLimit, setMinutesLimit] = useState<number>(3);

  const [questions, setQuestions] = useState<McqQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [secondsLeft, setSecondsLeft] = useState<number>(180);
  const [totalSecondsAllocated, setTotalSecondsAllocated] = useState<number>(180);
  const [lastResult, setLastResult] = useState<QuizAttempt | null>(null);

  const finishQuiz = useCallback(
    (activeQuestions: McqQuestion[], currentAnswers: Record<string, number>, remainingSec: number) => {
      const correctCount = activeQuestions.reduce((acc, q) => {
        return acc + (currentAnswers[q.id] === q.correctIndex ? 1 : 0);
      }, 0);
      const total = activeQuestions.length || 1;
      const scorePercent = Math.round((correctCount / total) * 100);
      const timeTakenSeconds = Math.max(1, totalSecondsAllocated - remainingSec);

      const attempt: QuizAttempt = {
        id: `quiz-${Date.now()}`,
        category: selectedCategory,
        totalQuestions: total,
        correctAnswers: correctCount,
        scorePercent,
        timeTakenSeconds,
        completedAt: new Date().toISOString(),
      };

      setLastResult(attempt);
      onSaveAttempt(attempt);
      setPhase('result');
    },
    [onSaveAttempt, selectedCategory, totalSecondsAllocated]
  );

  useEffect(() => {
    if (phase !== 'active') return;
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === 'active' && secondsLeft === 0) {
      finishQuiz(questions, answers, 0);
    }
  }, [phase, secondsLeft, questions, answers, finishQuiz]);

  const startQuiz = () => {
    const pool =
      selectedCategory === categories[0]
        ? combinedBank
        : combinedBank.filter((q) => q.category === selectedCategory);

    const chosen = shuffleArray(pool).slice(0, Math.min(questionCount, pool.length));
    const totalSec = minutesLimit * 60;

    setQuestions(chosen);
    setAnswers({});
    setCurrentIdx(0);
    setTotalSecondsAllocated(totalSec);
    setSecondsLeft(totalSec);
    setLastResult(null);
    setPhase('active');
  };

  if (phase === 'setup') {
    const availableCount =
      selectedCategory === categories[0]
        ? combinedBank.length
        : combinedBank.filter((q) => q.category === selectedCategory).length;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
            {bi(language, 'এমসিকিউ কুইজ ও মডেল টেস্ট', 'MCQ Quiz & Model Test')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {bi(
              language,
              'বিষয় ও সময় নির্ধারণ করে পরীক্ষা শুরু করুন — স্বয়ংক্রিয় স্কোর ও ব্যাখ্যাসহ উত্তর দেখুন',
              'Choose category & timer — instant auto-scoring with detailed explanations'
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2.5">
                {bi(language, 'বিষয় ক্যাটাগরি নির্বাচন করুন', 'Select Quiz Category')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {categories.map((cat) => {
                  const active = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`min-h-[46px] px-4 py-2.5 rounded-xl border text-left text-sm font-medium transition-colors ${
                        active
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                  {bi(language, `প্রশ্ন সংখ্যা (উপলব্ধ ${toBnDigits(availableCount)}টি)`, `Questions (${availableCount} available)`)}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[5, 10].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setQuestionCount(cnt)}
                      className={`min-h-[44px] rounded-xl border text-sm font-semibold tabular-nums ${
                        questionCount === cnt
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {Math.min(cnt, availableCount)} Qs
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                  {bi(language, 'সময়সীমা', 'Time Limit')}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[2, 3, 5].map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setMinutesLimit(min)}
                      className={`min-h-[44px] rounded-xl border text-sm font-semibold tabular-nums ${
                        minutesLimit === min
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {min}m
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={availableCount === 0}
              onClick={startQuiz}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              <span>{bi(language, 'কুইজ শুরু করুন', 'Start Model Test')}</span>
            </button>
          </section>

          <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {bi(language, 'সাম্প্রতিক কুইজ ফলাফল', 'Recent Test History')}
            </h2>
            {quizHistory.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
                {bi(language, 'এখনো কোনো কুইজে অংশ নেননি।', 'No quiz attempts yet.')}
              </p>
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {quizHistory.slice(0, 6).map((item) => (
                  <li key={item.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {item.category}
                      </p>
                      <p className="text-xs text-slate-500 tabular-nums">
                        {item.correctAnswers}/{item.totalQuestions} · {item.timeTakenSeconds}s
                      </p>
                    </div>
                    <span className="text-sm font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">
                      {item.scorePercent}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    );
  }

  if (phase === 'active') {
    const currentQuestion = questions[currentIdx];
    const selectedOption = answers[currentQuestion.id];
    const answeredCount = Object.keys(answers).length;
    const isLowTime = secondsLeft <= 30;

    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-slate-500 truncate">{selectedCategory}</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
              Q {currentIdx + 1} / {questions.length} · Answered {answeredCount}
            </p>
          </div>

          <div
            className={`px-3.5 py-2 rounded-xl border font-mono text-sm font-bold tabular-nums flex items-center gap-2 ${
              isLowTime
                ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{formatTimerSeconds(secondsLeft)}</span>
          </div>
        </div>

        <section className="p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 space-y-5">
          <h2 className="text-base lg:text-lg font-semibold text-slate-900 dark:text-white leading-relaxed">
            {currentIdx + 1}. {currentQuestion.questionBn}
          </h2>

          <div className="space-y-2.5">
            {currentQuestion.optionsBn.map((option, optIdx) => {
              const isSelected = selectedOption === optIdx;
              return (
                <button
                  key={optIdx}
                  type="button"
                  onClick={() => setAnswers((prev) => ({ ...prev, [currentQuestion.id]: optIdx }))}
                  className={`w-full min-h-[50px] px-4 py-3 rounded-xl border text-left text-sm flex items-center gap-3 ${
                    isSelected
                      ? 'border-cyan-500 bg-cyan-500/12 text-slate-900 dark:text-white font-semibold'
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                      isSelected
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {OPTION_LETTERS[optIdx]}
                  </span>
                  <span className="flex-1">{option}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={currentIdx === 0}
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{bi(language, 'পূর্ববর্তী', 'Previous')}</span>
            </button>

            {currentIdx < questions.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
                className="min-h-[42px] inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold"
              >
                <span>{bi(language, 'পরবর্তী', 'Next')}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => finishQuiz(questions, answers, secondsLeft)}
                className="min-h-[42px] inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
              >
                <span>{bi(language, 'জমা দিন', 'Submit Test')}</span>
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {lastResult && (
        <section className="p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/12 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-500">{lastResult.category}</p>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                Score: {lastResult.correctAnswers} / {lastResult.totalQuestions} ({lastResult.scorePercent}%)
              </h1>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                Time taken: {lastResult.timeTakenSeconds}s
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={startQuiz}
              className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{bi(language, 'আবার দিন', 'Retry')}</span>
            </button>
            <button
              type="button"
              onClick={() => setPhase('setup')}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium"
            >
              {bi(language, 'নতুন বিষয়', 'New Topic')}
            </button>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          {bi(language, 'সঠিক উত্তর ও ব্যাখ্যা', 'Answer Review & Explanations')}
        </h2>

        {questions.map((q, idx) => {
          const userAns = answers[q.id];
          const isCorrect = userAns === q.correctIndex;
          return (
            <div
              key={q.id}
              className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {idx + 1}. {q.questionBn}
                </p>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold shrink-0 ${
                    isCorrect ? 'text-emerald-500' : 'text-red-500'
                  }`}
                >
                  {isCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  <span>{isCorrect ? 'Correct' : userAns === undefined ? 'Skipped' : 'Wrong'}</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {q.optionsBn.map((opt, optIdx) => {
                  const isCorrectOpt = optIdx === q.correctIndex;
                  const isUserOpt = optIdx === userAns;
                  return (
                    <div
                      key={optIdx}
                      className={`px-3 py-2 rounded-xl border ${
                        isCorrectOpt
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium'
                          : isUserOpt
                            ? 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {OPTION_LETTERS[optIdx]}) {opt}
                    </div>
                  );
                })}
              </div>

              {q.explanationBn && (
                <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/70 p-3 rounded-xl border border-slate-200/70 dark:border-slate-800">
                  <strong>Explanation:</strong> {q.explanationBn}
                </p>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
};
