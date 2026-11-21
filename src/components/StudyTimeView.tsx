import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  Coffee,
  Edit3,
  Flag,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { bi } from '../i18n/translations';
import {
  CompletedTimerSession,
  LanguageMode,
  ScheduledStudySession,
  TimeSettings,
} from '../types/study';
import { formatDateBn, formatTimeBn, formatTimerSeconds, toBnDigits } from '../utils/formatBn';
import { LiveBangladeshClock } from './LiveBangladeshClock';

interface StudyTimeViewProps {
  language?: LanguageMode;
  timeSettings: TimeSettings;
  timerHistory: CompletedTimerSession[];
  onUpdateTimeSettings: (partial: Partial<TimeSettings>) => void;
  onAddCompletedTimerSession: (session: CompletedTimerSession) => void;
  onClearTimerHistory: () => void;
  onTriggerNotification: (title: string, body: string) => void;
}

type TimerStatus = 'idle' | 'running' | 'paused';
type ClockToolMode = 'countdown' | 'pomodoro' | 'stopwatch';

function playCompletionBeep() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch {
    // Ignore audio restrictions
  }
}

export const StudyTimeView: React.FC<StudyTimeViewProps> = ({
  language = 'bn',
  timeSettings,
  timerHistory,
  onUpdateTimeSettings,
  onAddCompletedTimerSession,
  onClearTimerHistory,
  onTriggerNotification,
}) => {
  const [toolMode, setToolMode] = useState<ClockToolMode>('countdown');

  // Countdown & Pomodoro State
  const [plannedMinutes, setPlannedMinutes] = useState<number>(25);
  const [secondsLeft, setSecondsLeft] = useState<number>(25 * 60);
  const [timerStatus, setTimerStatus] = useState<TimerStatus>('idle');
  const [sessionLabel, setSessionLabel] = useState<string>('গভীর অধ্যয়ন সেশন');
  const [timerBannerMsg, setTimerBannerMsg] = useState<string | null>(null);
  const [pomoPhase, setPomoPhase] = useState<'focus' | 'break'>('focus');

  // Stopwatch State
  const [swElapsedSec, setSwElapsedSec] = useState<number>(0);
  const [swRunning, setSwRunning] = useState<boolean>(false);
  const [swLaps, setSwLaps] = useState<number[]>([]);

  // Custom Time Settings Form State
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newStart, setNewStart] = useState(timeSettings.studyStartTime || '18:00');
  const [newEnd, setNewEnd] = useState(timeSettings.studyEndTime || '19:30');
  const [newReminder, setNewReminder] = useState(true);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  );

  const completedRef = useRef(false);

  // Switch Tool Mode safely
  const handleSwitchToolMode = (nextMode: ClockToolMode) => {
    setToolMode(nextMode);
    setTimerStatus('idle');
    setSwRunning(false);
    completedRef.current = false;
    setTimerBannerMsg(null);
    if (nextMode === 'pomodoro') {
      setPomoPhase('focus');
      setPlannedMinutes(25);
      setSecondsLeft(25 * 60);
    } else if (nextMode === 'countdown') {
      setPlannedMinutes(25);
      setSecondsLeft(25 * 60);
    }
  };

  // Countdown / Pomodoro interval
  useEffect(() => {
    if (timerStatus !== 'running' || toolMode === 'stopwatch') return;
    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerStatus, toolMode]);

  // Stopwatch interval
  useEffect(() => {
    if (!swRunning) return;
    const interval = window.setInterval(() => {
      setSwElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [swRunning]);

  // Handle Timer Completion
  useEffect(() => {
    if (timerStatus === 'running' && secondsLeft === 0 && !completedRef.current && toolMode !== 'stopwatch') {
      completedRef.current = true;
      playCompletionBeep();

      if (toolMode === 'pomodoro') {
        if (pomoPhase === 'focus') {
          const entry: CompletedTimerSession = {
            id: `pomo-${Date.now()}`,
            label: `${sessionLabel.trim() || 'Pomodoro Focus'} (25m)`,
            plannedMinutes: 25,
            completedMinutes: 25,
            mode: 'pomodoro',
            completedAt: new Date().toISOString(),
          };
          onAddCompletedTimerSession(entry);
          onTriggerNotification(
            'Polytechnic Hub — Pomodoro Focus Complete!',
            '25 minutes completed. Starting 5-minute break.'
          );
          setPomoPhase('break');
          setPlannedMinutes(5);
          setSecondsLeft(5 * 60);
          setTimerStatus('idle');
          setTimerBannerMsg(
            bi(language, '২৫ মিনিটের ফোকাস শেষ! এখন ৫ মিনিট বিরতি নিতে পারেন।', '25m Focus finished! 5m Break ready.')
          );
        } else {
          onTriggerNotification('Polytechnic Hub — Break Finished!', 'Ready for your next 25m focus cycle.');
          setPomoPhase('focus');
          setPlannedMinutes(25);
          setSecondsLeft(25 * 60);
          setTimerStatus('idle');
          setTimerBannerMsg(
            bi(language, 'বিরতি শেষ! পরবর্তী ফোকাস সেশন শুরু করুন।', 'Break finished! Start next focus session.')
          );
        }
        return;
      }

      setTimerStatus('idle');
      const entry: CompletedTimerSession = {
        id: `timer-${Date.now()}`,
        label: sessionLabel.trim() || 'অধ্যয়ন সেশন',
        plannedMinutes,
        completedMinutes: plannedMinutes,
        mode: 'countdown',
        completedAt: new Date().toISOString(),
      };
      onAddCompletedTimerSession(entry);
      setTimerBannerMsg(
        bi(
          language,
          `অভিনন্দন! "${entry.label}" (${toBnDigits(plannedMinutes)} মিনিট) সম্পন্ন হয়েছে।`,
          `Completed "${entry.label}" (${plannedMinutes} minutes)!`
        )
      );
      onTriggerNotification(
        'Polytechnic Hub — Study Timer Complete',
        `${entry.label} (${plannedMinutes} min) completed.`
      );
      setSecondsLeft(plannedMinutes * 60);
    }
  }, [
    timerStatus,
    secondsLeft,
    plannedMinutes,
    sessionLabel,
    toolMode,
    pomoPhase,
    language,
    onAddCompletedTimerSession,
    onTriggerNotification,
  ]);

  const handleSelectDuration = (mins: number) => {
    const safeMins = Math.max(1, Math.min(180, mins));
    setPlannedMinutes(safeMins);
    setSecondsLeft(safeMins * 60);
    setTimerStatus('idle');
    completedRef.current = false;
  };

  const handleSaveStopwatchSession = () => {
    const mins = Math.max(1, Math.round(swElapsedSec / 60));
    onAddCompletedTimerSession({
      id: `sw-${Date.now()}`,
      label: `${sessionLabel.trim() || 'স্টপওয়াচ সেশন'} (Stopwatch)`,
      plannedMinutes: mins,
      completedMinutes: mins,
      mode: 'stopwatch',
      completedAt: new Date().toISOString(),
    });
    setSwRunning(false);
    setSwElapsedSec(0);
    setSwLaps([]);
    setTimerBannerMsg(
      bi(
        language,
        `স্টপওয়াচ সেশন (${toBnDigits(mins)} মিনিট) ইতিহাসে সংরক্ষিত হয়েছে।`,
        `Stopwatch session (${mins}m) saved to history.`
      )
    );
  };

  const handleRequestNotifications = async () => {
    if (typeof Notification === 'undefined') {
      setPermissionState('unsupported');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPermissionState(result);
      if (result === 'granted') {
        onUpdateTimeSettings({ notificationsEnabled: true });
        onTriggerNotification(
          'Polytechnic Hub Notifications Active',
          'You will receive study schedule reminders.'
        );
        setSavedToast(bi(language, 'ব্রাউজার নোটিফিকেশন সক্রিয় হয়েছে।', 'Notifications enabled.'));
      } else {
        onUpdateTimeSettings({ notificationsEnabled: false });
        setSavedToast(bi(language, 'ব্রাউজার নোটিফিকেশন অনুমতি পাওয়া যায়নি।', 'Notification permission denied.'));
      }
    } catch {
      setSavedToast('Could not update notification permissions.');
    }
    window.setTimeout(() => setSavedToast(null), 3000);
  };

  const handleToggleNotifications = async () => {
    if (!timeSettings.notificationsEnabled) {
      if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
        await handleRequestNotifications();
        return;
      }
      onUpdateTimeSettings({ notificationsEnabled: true });
      setSavedToast(bi(language, 'রিমাইন্ডার নোটিফিকেশন চালু হয়েছে।', 'Reminders enabled.'));
    } else {
      onUpdateTimeSettings({ notificationsEnabled: false });
      setSavedToast(bi(language, 'রিমাইন্ডার নোটিফিকেশন বন্ধ করা হয়েছে।', 'Reminders disabled.'));
    }
    window.setTimeout(() => setSavedToast(null), 2500);
  };

  const handleSaveSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;

    if (editingSessionId) {
      const updated = timeSettings.sessions.map((s) =>
        s.id === editingSessionId
          ? {
              ...s,
              label: newLabel.trim(),
              startTime: newStart,
              endTime: newEnd,
              reminderEnabled: newReminder,
            }
          : s
      );
      onUpdateTimeSettings({ sessions: updated });
      setEditingSessionId(null);
      setSavedToast(bi(language, 'নির্ধারিত সেশন আপডেট হয়েছে।', 'Session updated.'));
    } else {
      const created: ScheduledStudySession = {
        id: `sched-${Date.now()}`,
        label: newLabel.trim(),
        startTime: newStart,
        endTime: newEnd,
        reminderEnabled: newReminder,
      };
      onUpdateTimeSettings({ sessions: [...timeSettings.sessions, created] });
      setSavedToast(bi(language, 'নতুন সেশন সংরক্ষিত হয়েছে।', 'Session added.'));
    }
    setNewLabel('');
    window.setTimeout(() => setSavedToast(null), 2500);
  };

  const totalSeconds = plannedMinutes * 60;
  const progressRatio = totalSeconds > 0 ? (totalSeconds - secondsLeft) / totalSeconds : 0;
  const ringRadius = 74;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const strokeDashoffset = ringCircumference * (1 - progressRatio);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
            {bi(language, 'লাইভ ক্লক, পোমোডোরো, স্টপওয়াচ ও টাইমার', 'Live Clock, Pomodoro, Stopwatch & Timer')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {bi(
              language,
              'বাংলাদেশ লাইভ সময় (অফলাইনেও চলে), কাউন্টডাউন, পোমোডোরো, স্টপওয়াচ ও কাস্টম সেশন রিমাইন্ডার',
              'Bangladesh Live Clock (works offline), Countdown, Pomodoro cycles, Stopwatch & Reminders'
            )}
          </p>
        </div>

        {savedToast && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            <span>{savedToast}</span>
          </div>
        )}
      </div>

      <LiveBangladeshClock />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Timer / Pomodoro / Stopwatch Panel */}
        <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          {/* Tool Mode Switcher */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {(
              [
                { id: 'countdown', label: bi(language, 'টাইমার', 'Timer') },
                { id: 'pomodoro', label: 'Pomodoro' },
                { id: 'stopwatch', label: bi(language, 'স্টপওয়াচ', 'Stopwatch') },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleSwitchToolMode(m.id)}
                className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                  toolMode === m.id
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {timerBannerMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/12 border border-emerald-500/30 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {timerBannerMsg}
            </div>
          )}

          {toolMode === 'stopwatch' ? (
            <div className="space-y-5">
              <div className="flex flex-col items-center py-6 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                <span className="font-mono text-4xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {formatTimerSeconds(swElapsedSec)}
                </span>
                <span className="text-xs text-slate-500 mt-1">
                  {swRunning ? bi(language, 'চলমান', 'Running') : bi(language, 'প্রস্তুত', 'Ready')}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSwRunning((r) => !r)}
                  className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl text-white text-xs font-semibold ${
                    swRunning ? 'bg-amber-600 hover:bg-amber-500' : 'bg-cyan-600 hover:bg-cyan-500'
                  }`}
                >
                  {swRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  <span>{swRunning ? 'Pause' : 'Start'}</span>
                </button>
                <button
                  type="button"
                  disabled={swElapsedSec === 0}
                  onClick={() => setSwLaps((prev) => [swElapsedSec, ...prev])}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold disabled:opacity-40"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>Lap</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSwRunning(false);
                    setSwElapsedSec(0);
                    setSwLaps([]);
                  }}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              </div>

              {swElapsedSec >= 5 && (
                <button
                  type="button"
                  onClick={handleSaveStopwatchSession}
                  className="min-h-[42px] w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                >
                  <Save className="w-4 h-4" />
                  <span>{bi(language, 'সেশন ইতিহাসে সংরক্ষণ করুন', 'Save Session to History')}</span>
                </button>
              )}

              {swLaps.length > 0 && (
                <div className="max-h-36 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800">
                  {swLaps.map((lapSec, idx) => (
                    <div key={idx} className="py-2 flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-500">Lap #{swLaps.length - idx}</span>
                      <span className="font-semibold text-cyan-600 dark:text-cyan-400">
                        {formatTimerSeconds(lapSec)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {toolMode === 'pomodoro' && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs">
                  <span className="font-semibold text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5">
                    {pomoPhase === 'break' ? <Coffee className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                    <span>
                      {pomoPhase === 'focus'
                        ? bi(language, 'ফোকাস চক্র (২৫ মিনিট)', 'Focus Cycle (25m)')
                        : bi(language, 'বিরতি চক্র (৫ মিনিট)', 'Break Cycle (5m)')}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = pomoPhase === 'focus' ? 'break' : 'focus';
                      setPomoPhase(next);
                      const mins = next === 'focus' ? 25 : 5;
                      setPlannedMinutes(mins);
                      setSecondsLeft(mins * 60);
                      setTimerStatus('idle');
                    }}
                    className="text-cyan-600 dark:text-cyan-400 font-semibold hover:underline"
                  >
                    Switch
                  </button>
                </div>
              )}

              <div className="flex flex-col items-center py-2">
                <div className="relative w-44 h-44 flex items-center justify-center">
                  <svg className="w-44 h-44 -rotate-90" viewBox="0 0 176 176">
                    <circle
                      cx="88"
                      cy="88"
                      r={ringRadius}
                      fill="none"
                      strokeWidth="8"
                      className="stroke-slate-200 dark:stroke-slate-800"
                    />
                    <circle
                      cx="88"
                      cy="88"
                      r={ringRadius}
                      fill="none"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={strokeDashoffset}
                      className="stroke-cyan-500 transition-all duration-300"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
                      {language === 'bn'
                        ? toBnDigits(formatTimerSeconds(secondsLeft))
                        : formatTimerSeconds(secondsLeft)}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {timerStatus === 'running'
                        ? bi(language, 'চলমান', 'Running')
                        : timerStatus === 'paused'
                          ? bi(language, 'বিরতি', 'Paused')
                          : bi(language, 'প্রস্তুত', 'Ready')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  value={sessionLabel}
                  onChange={(e) => setSessionLabel(e.target.value)}
                  placeholder={bi(language, 'সেশনের নাম...', 'Session label...')}
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                />

                {toolMode === 'countdown' && (
                  <div className="grid grid-cols-4 gap-2">
                    {[15, 25, 45, 60].map((m) => (
                      <button
                        key={m}
                        type="button"
                        disabled={timerStatus !== 'idle'}
                        onClick={() => handleSelectDuration(m)}
                        className={`min-h-[38px] rounded-xl border text-xs font-semibold tabular-nums disabled:opacity-50 ${
                          plannedMinutes === m
                            ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                            : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                {timerStatus === 'idle' && (
                  <button
                    type="button"
                    onClick={() => {
                      completedRef.current = false;
                      setTimerBannerMsg(null);
                      if (secondsLeft <= 0) setSecondsLeft(plannedMinutes * 60);
                      setTimerStatus('running');
                    }}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold"
                  >
                    <Play className="w-4 h-4" />
                    <span>{bi(language, 'শুরু করুন', 'Start')}</span>
                  </button>
                )}

                {timerStatus === 'running' && (
                  <button
                    type="button"
                    onClick={() => setTimerStatus('paused')}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold"
                  >
                    <Pause className="w-4 h-4" />
                    <span>{bi(language, 'বিরতি', 'Pause')}</span>
                  </button>
                )}

                {timerStatus === 'paused' && (
                  <button
                    type="button"
                    onClick={() => {
                      completedRef.current = false;
                      setTimerStatus('running');
                    }}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
                  >
                    <Play className="w-4 h-4" />
                    <span>{bi(language, 'পুনরায় শুরু', 'Resume')}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    completedRef.current = false;
                    setTimerStatus('idle');
                    setSecondsLeft(plannedMinutes * 60);
                    setTimerBannerMsg(null);
                  }}
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{bi(language, 'রিসেট', 'Reset')}</span>
                </button>
              </div>
            </>
          )}
        </section>

        {/* Custom Time Settings + Scheduled Sessions */}
        <div className="lg:col-span-7 space-y-6">
          <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 lg:p-6 space-y-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {bi(language, 'কাস্টম সময় সেটিংস ও নোটিফিকেশন', 'Custom Study Window & Notifications')}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  {bi(language, 'শুরু করার সময়', 'Study Start')}
                </label>
                <input
                  type="time"
                  value={timeSettings.studyStartTime}
                  onChange={(e) => onUpdateTimeSettings({ studyStartTime: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  {bi(language, 'শেষ করার সময়', 'Study End')}
                </label>
                <input
                  type="time"
                  value={timeSettings.studyEndTime}
                  onChange={(e) => onUpdateTimeSettings({ studyEndTime: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  {bi(language, 'দৈনিক লক্ষ্য (মিনিট)', 'Daily Goal (min)')}
                </label>
                <input
                  type="number"
                  min={15}
                  max={720}
                  step={15}
                  value={timeSettings.dailyDurationMinutes}
                  onChange={(e) =>
                    onUpdateTimeSettings({
                      dailyDurationMinutes: Math.max(15, Number(e.target.value) || 60),
                    })
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm tabular-nums"
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  {timeSettings.notificationsEnabled ? (
                    <Bell className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <BellOff className="w-4 h-4 text-slate-400" />
                  )}
                  <span>{bi(language, 'ব্রাউজার নোটিফিকেশন ও রিমাইন্ডার', 'Browser Reminders')}</span>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Permission: {permissionState}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleToggleNotifications()}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold ${
                  timeSettings.notificationsEnabled
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                }`}
              >
                {timeSettings.notificationsEnabled
                  ? bi(language, 'সক্রিয় (বন্ধ করুন)', 'Active (Disable)')
                  : bi(language, 'নোটিফিকেশন চালু করুন', 'Enable Reminders')}
              </button>
            </div>
          </section>

          <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 lg:p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {bi(language, 'নির্ধারিত স্টাডি সেশন', 'Scheduled Study Sessions')}
            </h2>

            <form onSubmit={handleSaveSession} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
              <input
                type="text"
                required
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder={bi(language, 'সেশনের নাম...', 'Session label...')}
                className="sm:col-span-5 min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
              <input
                type="time"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                className="sm:col-span-2 min-h-[40px] px-2 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs tabular-nums"
              />
              <input
                type="time"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                className="sm:col-span-2 min-h-[40px] px-2 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs tabular-nums"
              />
              <button
                type="submit"
                className="sm:col-span-3 min-h-[40px] inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
              >
                <Plus className="w-4 h-4" />
                <span>{editingSessionId ? 'Update' : 'Add'}</span>
              </button>
            </form>

            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {timeSettings.sessions.map((s) => (
                <li key={s.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{s.label}</p>
                    <p className="text-xs text-slate-500 tabular-nums">
                      {s.startTime} – {s.endTime}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSessionId(s.id);
                        setNewLabel(s.label);
                        setNewStart(s.startTime);
                        setNewEnd(s.endTime);
                        setNewReminder(s.reminderEnabled);
                      }}
                      className="p-2 text-slate-400 hover:text-cyan-500"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateTimeSettings({
                          sessions: timeSettings.sessions.filter((item) => item.id !== s.id),
                        })
                      }
                      className="p-2 text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {/* Timer History */}
      <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 lg:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {bi(language, 'সম্পন্ন স্টাডি সেশন ইতিহাস', 'Completed Study Sessions History')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {timerHistory.length} sessions recorded locally (works offline)
            </p>
          </div>
          {timerHistory.length > 0 && (
            <button
              type="button"
              onClick={onClearTimerHistory}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
            >
              Clear
            </button>
          )}
        </div>

        {timerHistory.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2">Session</th>
                  <th className="py-2 text-right">Duration</th>
                  <th className="py-2 text-right">Completed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {timerHistory.slice(0, 12).map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 font-medium text-slate-900 dark:text-white">{item.label}</td>
                    <td className="py-2 text-right font-semibold text-emerald-500 tabular-nums">
                      {item.completedMinutes} min
                    </td>
                    <td className="py-2 text-right text-slate-500 tabular-nums">
                      {formatDateBn(item.completedAt)} · {formatTimeBn(item.completedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
