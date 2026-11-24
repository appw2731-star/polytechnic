import React, { useEffect, useRef, useState } from 'react';
import {
  AlarmClock,
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
  Volume2,
} from 'lucide-react';
import { DAYS_OF_WEEK } from '../data/curriculum';
import { bi } from '../i18n/translations';
import { previewAlarmTone } from '../services/alarmAudio';
import {
  AlarmTone,
  CompletedTimerSession,
  DayOfWeek,
  LanguageMode,
  ScheduledStudySession,
  StudyAlarm,
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
  onTestAlarm?: (alarm: StudyAlarm) => void;
}

type TimerStatus = 'idle' | 'running' | 'paused';
type ClockToolMode = 'alarm' | 'countdown' | 'pomodoro' | 'stopwatch';

const DAY_SHORT_BN: Record<DayOfWeek, string> = {
  শনিবার: 'শনি',
  রবিবার: 'রবি',
  সোমবার: 'সোম',
  মঙ্গলবার: 'মঙ্গল',
  বুধবার: 'বুধ',
  বৃহস্পতিবার: 'বৃহঃ',
  শুক্রবার: 'শুক্র',
};

function formatTime12h(hhmm: string, lang: LanguageMode): string {
  const [rawH, rawM] = hhmm.split(':').map(Number);
  if (Number.isNaN(rawH) || Number.isNaN(rawM)) return hhmm;
  const period = rawH >= 12 ? (lang === 'bn' ? 'PM' : 'PM') : 'AM';
  const h12 = rawH % 12 === 0 ? 12 : rawH % 12;
  const formatted = `${String(h12).padStart(2, '0')}:${String(rawM).padStart(2, '0')} ${period}`;
  return lang === 'bn' ? toBnDigits(formatted) : formatted;
}

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
  onTestAlarm,
}) => {
  const [toolMode, setToolMode] = useState<ClockToolMode>('alarm');

  // Alarm Manager State
  const alarms = timeSettings.alarms || [];
  const [editingAlarmId, setEditingAlarmId] = useState<string | null>(null);
  const [alarmTime, setAlarmTime] = useState<string>('06:00');
  const [alarmLabel, setAlarmLabel] = useState<string>('');
  const [alarmDays, setAlarmDays] = useState<DayOfWeek[]>([]);
  const [alarmTone, setAlarmTone] = useState<AlarmTone>('chime');

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

  const toggleAlarmDay = (day: DayOfWeek) => {
    setAlarmDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSaveAlarm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!alarmTime) return;
    const cleanLabel =
      alarmLabel.trim() || bi(language, 'পড়ার অ্যালার্ম', 'Study Alarm');

    if (editingAlarmId) {
      const updated = alarms.map((item) =>
        item.id === editingAlarmId
          ? {
              ...item,
              time: alarmTime,
              label: cleanLabel,
              days: alarmDays,
              tone: alarmTone,
              enabled: true,
              snoozedUntil: null,
            }
          : item
      );
      onUpdateTimeSettings({ alarms: updated });
      setEditingAlarmId(null);
      setSavedToast(bi(language, 'অ্যালার্ম আপডেট ও চালু হয়েছে।', 'Alarm updated and enabled.'));
    } else {
      const created: StudyAlarm = {
        id: `alarm-${Date.now()}`,
        time: alarmTime,
        label: cleanLabel,
        enabled: true,
        days: alarmDays,
        tone: alarmTone,
        snoozedUntil: null,
        createdAt: new Date().toISOString(),
      };
      onUpdateTimeSettings({ alarms: [created, ...alarms] });
      setSavedToast(bi(language, 'নতুন অ্যালার্ম সেট হয়েছে!', 'New alarm set!'));
    }

    setAlarmLabel('');
    setAlarmDays([]);
    window.setTimeout(() => setSavedToast(null), 2600);
  };

  const handleToggleAlarm = (alarmId: string) => {
    const updated = alarms.map((a) =>
      a.id === alarmId
        ? { ...a, enabled: !a.enabled, snoozedUntil: null }
        : a
    );
    onUpdateTimeSettings({ alarms: updated });
  };

  const handleDeleteAlarm = (alarmId: string) => {
    onUpdateTimeSettings({
      alarms: alarms.filter((a) => a.id !== alarmId),
    });
    if (editingAlarmId === alarmId) {
      setEditingAlarmId(null);
      setAlarmLabel('');
      setAlarmDays([]);
    }
    setSavedToast(bi(language, 'অ্যালার্ম মুছে ফেলা হয়েছে।', 'Alarm deleted.'));
    window.setTimeout(() => setSavedToast(null), 2200);
  };

  const handleEditAlarm = (alarm: StudyAlarm) => {
    setToolMode('alarm');
    setEditingAlarmId(alarm.id);
    setAlarmTime(alarm.time);
    setAlarmLabel(alarm.label);
    setAlarmDays(alarm.days || []);
    setAlarmTone(alarm.tone || 'chime');
  };

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
    if (timerStatus !== 'running' || toolMode === 'stopwatch' || toolMode === 'alarm') return;
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
    if (
      timerStatus === 'running' &&
      secondsLeft === 0 &&
      !completedRef.current &&
      toolMode !== 'stopwatch' &&
      toolMode !== 'alarm'
    ) {
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
            {bi(language, 'অ্যালার্ম, লাইভ ক্লক, পোমোডোরো ও টাইমার', 'Study Alarm, Live Clock, Pomodoro & Timer')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {bi(
              language,
              'পড়ার অ্যালার্ম (স্নুজ ও রিংটোনসহ), বাংলাদেশ লাইভ সময়, কাউন্টডাউন, পোমোডোরো ও স্টপওয়াচ',
              'Study Alarms with snooze & ringtones, Bangladesh Live Clock, Countdown, Pomodoro & Stopwatch'
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
        {/* Alarm / Timer / Pomodoro / Stopwatch Panel */}
        <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
          {/* Tool Mode Switcher */}
          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {(
              [
                { id: 'alarm', label: bi(language, 'অ্যালার্ম', 'Alarm') },
                { id: 'countdown', label: bi(language, 'টাইমার', 'Timer') },
                { id: 'pomodoro', label: 'Pomodoro' },
                { id: 'stopwatch', label: bi(language, 'স্টপওয়াচ', 'Stopwatch') },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleSwitchToolMode(m.id)}
                className={`min-h-[40px] rounded-lg text-xs font-semibold transition-colors px-1.5 ${
                  toolMode === m.id
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
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

          {toolMode === 'alarm' ? (
            <div className="space-y-5">
              <form onSubmit={handleSaveAlarm} className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <AlarmClock className="w-4 h-4 text-cyan-500" />
                    <span>
                      {editingAlarmId
                        ? bi(language, 'অ্যালার্ম এডিট করুন', 'Edit Study Alarm')
                        : bi(language, 'নতুন অ্যালার্ম সেট করুন', 'Set New Study Alarm')}
                    </span>
                  </h2>
                  {editingAlarmId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAlarmId(null);
                        setAlarmLabel('');
                        setAlarmDays([]);
                      }}
                      className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    >
                      {bi(language, 'বাতিল', 'Cancel')}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                      {bi(language, 'সময় (বাংলাদেশ সময়)', 'Time (Bangladesh Time)')}
                    </label>
                    <input
                      type="time"
                      required
                      value={alarmTime}
                      onChange={(e) => setAlarmTime(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-base font-mono font-bold text-slate-900 dark:text-white tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                      {bi(language, 'অ্যালার্মের নাম', 'Alarm Label')}
                    </label>
                    <input
                      type="text"
                      value={alarmLabel}
                      onChange={(e) => setAlarmLabel(e.target.value)}
                      placeholder={bi(language, 'যেমন: ফজর ও সকালের পড়া', 'e.g. Morning Revision')}
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Repeat Days */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {bi(language, 'কোন কোন দিন বাজবে', 'Repeat Days')}
                    </span>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setAlarmDays([...DAYS_OF_WEEK])}
                        className="text-cyan-600 dark:text-cyan-400 font-semibold hover:underline"
                      >
                        {bi(language, 'প্রতিদিন', 'Everyday')}
                      </button>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <button
                        type="button"
                        onClick={() => setAlarmDays([])}
                        className="text-slate-500 dark:text-slate-400 hover:underline"
                      >
                        {bi(language, 'একবার', 'Once')}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {DAYS_OF_WEEK.map((day) => {
                      const active = alarmDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleAlarmDay(day)}
                          className={`min-h-[38px] rounded-xl text-[11px] font-semibold border transition-colors ${
                            active
                              ? 'bg-cyan-600 border-cyan-600 text-white'
                              : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-cyan-500/60'
                          }`}
                        >
                          {DAY_SHORT_BN[day]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Alarm Tone */}
                <div className="space-y-1.5">
                  <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                    {bi(language, 'অ্যালার্ম সাউন্ড', 'Alarm Ringtone')}
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'chime', label: bi(language, 'মেলোডি', 'Chime') },
                        { id: 'classic', label: bi(language, 'ক্লাসিক', 'Classic') },
                        { id: 'gentle', label: bi(language, 'সফট বেল', 'Gentle') },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setAlarmTone(t.id);
                          previewAlarmTone(t.id);
                        }}
                        className={`min-h-[40px] px-2.5 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                          alarmTone === t.id
                            ? 'border-cyan-500 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold"
                  >
                    <Plus className="w-4 h-4" />
                    <span>
                      {editingAlarmId
                        ? bi(language, 'অ্যালার্ম আপডেট করুন', 'Update Alarm')
                        : bi(language, 'অ্যালার্ম সেট করুন', 'Add Alarm')}
                    </span>
                  </button>
                  {onTestAlarm && (
                    <button
                      type="button"
                      onClick={() =>
                        onTestAlarm({
                          id: 'alarm-preview-test',
                          time: alarmTime,
                          label: alarmLabel.trim() || bi(language, 'টেস্ট স্টাডি অ্যালার্ম', 'Test Study Alarm'),
                          enabled: true,
                          days: alarmDays,
                          tone: alarmTone,
                          createdAt: new Date().toISOString(),
                        })
                      }
                      className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {bi(language, 'টেস্ট', 'Test')}
                    </button>
                  )}
                </div>
              </form>

              {/* Alarm List */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {bi(language, 'আপনার অ্যালার্মসমূহ', 'Your Alarms')} ({language === 'bn' ? toBnDigits(alarms.length) : alarms.length})
                  </span>
                  <span>
                    {alarms.filter((a) => a.enabled).length}{' '}
                    {bi(language, 'টি চালু', 'active')}
                  </span>
                </div>

                {alarms.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                    {bi(
                      language,
                      'এখনো কোনো অ্যালার্ম সেট করা হয়নি। উপরে সময় দিয়ে নতুন অ্যালার্ম যোগ করুন।',
                      'No alarms set yet. Pick a time above to add your first study alarm.'
                    )}
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                    {alarms.map((alarm) => {
                      const repeatSummary =
                        !alarm.days || alarm.days.length === 0
                          ? bi(language, 'একবার', 'Once')
                          : alarm.days.length === 7
                            ? bi(language, 'প্রতিদিন', 'Everyday')
                            : alarm.days.map((d) => DAY_SHORT_BN[d]).join(', ');

                      return (
                        <li
                          key={alarm.id}
                          className={`py-3 flex items-center justify-between gap-3 ${
                            alarm.enabled ? '' : 'opacity-60'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-lg font-mono font-bold text-slate-900 dark:text-white tabular-nums leading-tight">
                              {formatTime12h(alarm.time, language)}
                            </p>
                            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate mt-0.5">
                              {alarm.label}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {repeatSummary}
                              {alarm.snoozedUntil && (
                                <>
                                  {' · '}
                                  <span className="text-amber-500 font-semibold">
                                    {bi(language, 'স্নুজ চালু', 'Snoozed')}
                                  </span>
                                </>
                              )}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={alarm.enabled}
                              aria-label={bi(language, 'অ্যালার্ম চালু বা বন্ধ করুন', 'Toggle alarm')}
                              onClick={() => handleToggleAlarm(alarm.id)}
                              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                                alarm.enabled
                                  ? 'bg-cyan-600'
                                  : 'bg-slate-300 dark:bg-slate-700'
                              }`}
                            >
                              <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                  alarm.enabled ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEditAlarm(alarm)}
                              title={bi(language, 'এডিট', 'Edit')}
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-cyan-500 hover:bg-cyan-500/10"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAlarm(alarm.id)}
                              title={bi(language, 'মুছুন', 'Delete')}
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          ) : toolMode === 'stopwatch' ? (
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
