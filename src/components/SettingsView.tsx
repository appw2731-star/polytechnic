import React, { useState } from 'react';
import {
  BellRing,
  Check,
  Clock,
  Database,
  Download,
  Languages,
  Moon,
  RotateCcw,
  Sun,
  Trash2,
  Volume2,
} from 'lucide-react';
import { DEPARTMENTS, SEMESTER_LABELS, SEMESTER_LABELS_EN } from '../data/curriculum';
import { bi } from '../i18n/translations';
import {
  NOTIFICATION_SOUND_OPTIONS,
  NotificationSoundStyle,
  playNotificationSound,
} from '../services/notificationSound';
import {
  AppView,
  AuthUser,
  DepartmentId,
  LanguageMode,
  NotificationPreferences,
  SemesterNumber,
  StudyMateState,
  ThemeMode,
  UserSettings,
} from '../types/study';
import { toBnDigits } from '../utils/formatBn';

interface SettingsViewProps {
  state: StudyMateState;
  currentUser: AuthUser | null;
  pushPreferences: NotificationPreferences;
  onUpdateSettings: (partial: Partial<UserSettings>) => void;
  onUpdatePushPreferences: (partial: Partial<NotificationPreferences>) => Promise<void>;
  onNavigate: (view: AppView) => void;
  onResetDemo: () => void;
  onClearAll: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  state,
  currentUser,
  pushPreferences,
  onUpdateSettings,
  onUpdatePushPreferences,
  onNavigate,
  onResetDemo,
  onClearAll,
}) => {
  const { settings } = state;
  const lang = settings.language;
  const [confirmClear, setConfirmClear] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [savingSound, setSavingSound] = useState(false);

  const notify = (msg: string) => {
    setStatusMessage(msg);
    window.setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleExportBackup = () => {
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `polytechnic_hub_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify(bi(lang, 'ব্যাকআপ JSON ফাইল ডাউনলোড হয়েছে।', 'Backup JSON downloaded.'));
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
            {bi(lang, 'সেটিংস ও প্রেফারেন্স', 'Settings & Preferences')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {bi(
              lang,
              '১৫টি টেকনোলজি, সেমিস্টার, ভাষা (বাংলা/English), থিম এবং ব্যাকআপ পরিচালনা করুন',
              'Configure your technology, semester, language (Bengali/English), theme & backups'
            )}
          </p>
        </div>

        {statusMessage && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
            <Check className="w-4 h-4" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* Academic Profile */}
      <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 lg:p-6 space-y-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          {bi(lang, 'শিক্ষার্থীর একাডেমিক তথ্য', 'Academic Information')}
        </h2>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            {bi(lang, 'শিক্ষার্থীর নাম', 'Student Name')}
          </label>
          <input
            type="text"
            value={settings.studentName}
            onChange={(e) => onUpdateSettings({ studentName: e.target.value })}
            className="w-full max-w-md min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
          />
        </div>

        <div>
          <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
            {bi(
              lang,
              `ডিপার্টমেন্ট / টেকনোলজি নির্বাচন করুন (${toBnDigits(DEPARTMENTS.length)}টি BTEB প্রযুক্তি)`,
              `Select Technology (${DEPARTMENTS.length} BTEB Technologies)`
            )}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {DEPARTMENTS.map((dept) => {
              const active = settings.department === dept.id;
              return (
                <button
                  key={dept.id}
                  type="button"
                  onClick={() => {
                    onUpdateSettings({ department: dept.id as DepartmentId });
                    notify(`${dept.shortName} (${lang === 'en' ? dept.nameEn : dept.nameBn}) selected.`);
                  }}
                  className={`min-h-[58px] p-3 rounded-xl border text-left transition-colors ${
                    active
                      ? 'border-cyan-500 bg-cyan-500/10 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <p className="text-xs font-bold">
                    {dept.shortName} · {lang === 'en' ? dept.nameEn : dept.nameBn}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                    {lang === 'en' ? dept.descriptionEn : dept.descriptionBn}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
            {bi(lang, 'সেমিস্টার নির্বাচন করুন', 'Select Semester')}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([1, 2, 3, 4, 5, 6, 7, 8] as SemesterNumber[]).map((sem) => {
              const active = settings.semester === sem;
              return (
                <button
                  key={sem}
                  type="button"
                  onClick={() => {
                    onUpdateSettings({ semester: sem });
                    notify(`${lang === 'en' ? SEMESTER_LABELS_EN[sem] : SEMESTER_LABELS[sem]} selected.`);
                  }}
                  className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-semibold tabular-nums ${
                    active
                      ? 'border-cyan-500 bg-cyan-600 text-white'
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  {lang === 'en' ? SEMESTER_LABELS_EN[sem] : SEMESTER_LABELS[sem]}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Theme & Language Preferences */}
      <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 lg:p-6 space-y-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          {bi(lang, 'থিম ও ভাষা সেটিংস', 'Theme & Language')}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
              {bi(lang, 'অ্যাপ থিম', 'App Theme')}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  { id: 'dark', label: bi(lang, 'ডার্ক থিম', 'Dark'), icon: Moon },
                  { id: 'light', label: bi(lang, 'লাইট থিম', 'Light'), icon: Sun },
                ] as { id: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }> }[]
              ).map((item) => {
                const Icon = item.icon;
                const active = settings.theme === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onUpdateSettings({ theme: item.id })}
                    className={`min-h-[46px] px-4 py-2 rounded-xl border flex items-center justify-center gap-2 text-sm font-semibold ${
                      active
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
              {bi(lang, 'ইন্টারফেস ভাষা', 'Interface Language')}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  { id: 'bn', label: 'বাংলা (Bengali)' },
                  { id: 'en', label: 'English' },
                ] as { id: LanguageMode; label: string }[]
              ).map((l) => {
                const active = settings.language === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => onUpdateSettings({ language: l.id })}
                    className={`min-h-[46px] px-4 py-2 rounded-xl border flex items-center justify-center gap-2 text-sm font-semibold ${
                      active
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Languages className="w-4 h-4" />
                    <span>{l.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Notification Sound & Push Preferences */}
      <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 lg:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <BellRing className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {bi(lang, 'পুশ নোটিফিকেশন ও কাস্টম সাউন্ড', 'Push Notifications & Custom Sound')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {bi(
                  lang,
                  'পছন্দের নোটিফিকেশন সাউন্ড নির্বাচন করুন এবং Supabase প্রোফাইল প্রেফারেন্সে সংরক্ষণ করুন',
                  'Select your notification sound tone and sync to notification preferences'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('notifications')}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold whitespace-nowrap self-start sm:self-auto"
          >
            {bi(lang, 'নোটিফিকেশন সেন্টার খুলুন', 'Open Notification Center')}
          </button>
        </div>

        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
          <div className="sm:col-span-6 space-y-1.5">
            <label
              htmlFor="settings-sound-style"
              className="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              {bi(lang, 'নোটিফিকেশন সাউন্ড নির্বাচন করুন', 'Notification Sound Tone')}
            </label>
            <select
              id="settings-sound-style"
              disabled={!pushPreferences.soundEnabled || savingSound}
              value={pushPreferences.soundStyle}
              onChange={async (e) => {
                const nextStyle = e.target.value as NotificationSoundStyle;
                setSavingSound(true);
                try {
                  await onUpdatePushPreferences({ soundStyle: nextStyle });
                  if (pushPreferences.soundEnabled) {
                    void playNotificationSound(nextStyle, true);
                  }
                  notify(
                    currentUser
                      ? bi(lang, 'সাউন্ড প্রেফারেন্স অ্যাকাউন্ট ও ডেটাবেসে সেভ হয়েছে।', 'Notification sound preference saved.')
                      : bi(lang, 'সাউন্ড টোন এই ডিভাইসের জন্য সেভ হয়েছে।', 'Sound preference updated locally.')
                  );
                } finally {
                  setSavingSound(false);
                }
              }}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white disabled:opacity-50"
            >
              {NOTIFICATION_SOUND_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {lang === 'bn' ? `${opt.labelBn} (${opt.id})` : `${opt.labelEn}`}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3 flex items-center gap-2 min-h-[44px]">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={pushPreferences.soundEnabled}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  void onUpdatePushPreferences({ soundEnabled: enabled }).then(() => {
                    notify(
                      enabled
                        ? bi(lang, 'নোটিফিকেশন সাউন্ড চালু হয়েছে।', 'Notification sound enabled.')
                        : bi(lang, 'নোটিফিকেশন সাউন্ড মিউট করা হয়েছে।', 'Notification sound muted.')
                    );
                  });
                }}
                className="w-4 h-4 accent-cyan-600 rounded"
              />
              <span>{bi(lang, 'সাউন্ড চালু রাখুন', 'Sound Enabled')}</span>
            </label>
          </div>

          <div className="sm:col-span-3">
            <button
              type="button"
              disabled={!pushPreferences.soundEnabled}
              onClick={() => void playNotificationSound(pushPreferences.soundStyle, true)}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <Volume2 className="w-4 h-4 text-cyan-500" />
              <span>{bi(lang, 'প্রিভিউ শুনুন', 'Preview Sound')}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Quick link to Time Settings */}
      <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {bi(lang, 'সময়, পোমোডোরো ও স্টপওয়াচ', 'Clock, Pomodoro & Study Timer')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {state.timeSettings.studyStartTime} – {state.timeSettings.studyEndTime} ·{' '}
              {state.timeSettings.sessions.length} sessions
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('timer')}
          className="min-h-[42px] px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold whitespace-nowrap"
        >
          {bi(lang, 'সময় ও টাইমার খুলুন', 'Open Clock & Timer')}
        </button>
      </section>

      {/* Local Data & Backup */}
      <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 lg:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Database className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {bi(lang, 'ডেটা ব্যাকআপ ও রিসেট', 'Data Backup & Reset')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {state.tasks.length} tasks · {state.notes.length} notes · {state.quizHistory.length} quizzes stored locally.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportBackup}
            className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Download className="w-4 h-4" />
            <span>{bi(lang, 'ব্যাকআপ ডাউনলোড (JSON)', 'Export Backup JSON')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onResetDemo();
              notify(bi(lang, 'নমুনা ডেটা পুনরুদ্ধার করা হয়েছে।', 'Demo data restored.'));
            }}
            className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{bi(lang, 'ডেমো ডেটা রিসেট', 'Reset Demo Data')}</span>
          </button>

          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/30 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
              <span>{bi(lang, 'সব ডেটা মুছুন', 'Clear All Local Data')}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onClearAll();
                  setConfirmClear(false);
                  notify(bi(lang, 'সব স্থানীয় ডেটা পরিষ্কার করা হয়েছে।', 'All local data cleared.'));
                }}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
              >
                Confirm Clear
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
