import React from 'react';
import {
  CheckCircle2,
  Download,
  RefreshCw,
  Share,
  Smartphone,
  Terminal,
  WifiOff,
} from 'lucide-react';
import { bi } from '../i18n/translations';
import { AppReleaseConfig, LanguageMode } from '../types/study';

interface InstallAppViewProps {
  language: LanguageMode;
  canPromptPwa: boolean;
  isPwaInstalled: boolean;
  isIos: boolean;
  onPromptPwa: () => void;
  appConfig: AppReleaseConfig;
  needSwRefresh: boolean;
  onUpdateSw: () => void;
}

export const InstallAppView: React.FC<InstallAppViewProps> = ({
  language,
  canPromptPwa,
  isPwaInstalled,
  isIos,
  onPromptPwa,
  appConfig,
  needSwRefresh,
  onUpdateSw,
}) => {
  const apkAvailable =
    appConfig.apkStatus === 'available' && Boolean(appConfig.apkDownloadUrl.trim());

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
          {bi(language, 'Polytechnic Hub অ্যাপ ইনস্টল', 'Install Polytechnic Hub App')}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {bi(
            language,
            'PWA হিসেবে মোবাইল বা পিসিতে ইনস্টল করুন এবং Android APK রিলিজ স্ট্যাটাস দেখুন',
            'Install as an offline-capable PWA on Mobile/Desktop and view Capacitor Android APK status'
          )}
        </p>
      </div>

      {needSwRefresh && (
        <div className="p-4 rounded-2xl bg-cyan-500/12 border border-cyan-500/40 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-medium text-cyan-800 dark:text-cyan-200">
            {bi(
              language,
              'Polytechnic Hub-এর নতুন ভার্সন প্রস্তুত আছে!',
              'A new update for Polytechnic Hub is ready!'
            )}
          </div>
          <button
            type="button"
            onClick={onUpdateSw}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{bi(language, 'আপডেট ও রিলোড', 'Update & Reload')}</span>
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Option A: PWA Install */}
        <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-cyan-500/12 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {bi(language, 'অপশন A: PWA ওয়েব অ্যাপ ইনস্টল', 'Option A: PWA App Install')}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Android · iOS Safari · Windows · macOS
                  </p>
                </div>
              </div>
              {isPwaInstalled && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Installed</span>
                </span>
              )}
            </div>

            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-cyan-500 shrink-0" />
                <span>{bi(language, 'হোম স্ক্রিনে অ্যাপ আইকন ও ফুল-স্ক্রিন লঞ্চ', 'Home screen app icon & standalone launch')}</span>
              </li>
              <li className="flex items-center gap-2">
                <WifiOff className="w-4 h-4 text-cyan-500 shrink-0" />
                <span>{bi(language, 'অফলাইন নোটস, PDF ভল্ট, ক্লক ও পাওয়ার টুলস ক্যাশিং', 'Offline Notes, PDF Vault, Clock & Power Tools')}</span>
              </li>
              <li className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-cyan-500 shrink-0" />
                <span>{bi(language, 'সার্ভিস ওয়ার্কার অটো-ক্যাশ ও তাৎক্ষণিক আপডেট', 'Service Worker caching & seamless updates')}</span>
              </li>
            </ul>

            {isIos && !isPwaInstalled && (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Share className="w-3.5 h-3.5 text-cyan-500" />
                  <span>iOS Safari Install Guide:</span>
                </p>
                <p>
                  Tap the <strong>Share</strong> icon in Safari, then choose{' '}
                  <strong>"Add to Home Screen"</strong>.
                </p>
              </div>
            )}

            {!canPromptPwa && !isPwaInstalled && !isIos && (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                {bi(
                  language,
                  'ব্রাউজার মেনু (⋮) থেকে "Install App" বা "Add to Home Screen" নির্বাচন করে ইনস্টল করুন। (প্রিভিউ iframe মোডের বাইরে ডিরেক্ট URL-এ ওয়ান-ক্লিক প্রম্পট সক্রিয় হয়)।',
                  'Open browser menu (⋮) and choose "Install App" / "Add to Home Screen". (One-tap prompt triggers automatically when opened outside an iframe).'
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={!canPromptPwa || isPwaInstalled}
            onClick={onPromptPwa}
            className="min-h-[46px] w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>
              {isPwaInstalled
                ? bi(language, 'ইতিমধ্যেই ইনস্টল করা আছে', 'Already Installed')
                : canPromptPwa
                  ? bi(language, 'এখনই PWA অ্যাপ ইনস্টল করুন', 'Install Polytechnic Hub Now')
                  : bi(language, 'ব্রাউজার মেনু থেকে ইনস্টল করুন', 'Install via Browser Menu')}
            </span>
          </button>
        </section>

        {/* Option B: Android APK */}
        <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {bi(language, 'অপশন B: Android APK', 'Option B: Android APK')}
                  </h2>
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    v{appConfig.appVersion} · com.polytechnichub.app
                  </p>
                </div>
              </div>
              <span
                className={`text-xs font-semibold ${
                  apkAvailable ? 'text-emerald-500' : 'text-amber-500'
                }`}
              >
                {apkAvailable
                  ? bi(language, 'ডাউনলোডের জন্য প্রস্তুত', 'Available')
                  : bi(language, 'শীঘ্রই আসছে', 'Coming Soon')}
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {appConfig.apkReleaseNotes}
            </p>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 space-y-1">
              <p className="text-cyan-400 font-semibold"># Capacitor Android Build Commands</p>
              <p>npm run build</p>
              <p>npx cap add android</p>
              <p>npm run cap:sync</p>
              <p>npm run cap:open:android</p>
            </div>
          </div>

          {apkAvailable ? (
            <a
              href={appConfig.apkDownloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[46px] w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>
                {bi(language, `Android APK ডাউনলোড (v${appConfig.appVersion})`, `Download Android APK (v${appConfig.appVersion})`)}
              </span>
            </a>
          ) : (
            <div className="min-h-[46px] w-full flex items-center justify-center px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
              {bi(
                language,
                'APK Coming Soon — Admin প্যানেলে APK লিংক প্রকাশ হলে এখানে ডাউনলোড সক্রিয় হবে',
                'APK Coming Soon — Download activates once Admin publishes a signed APK URL'
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
