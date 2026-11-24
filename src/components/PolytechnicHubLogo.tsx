import React from 'react';
import { Download, CheckCircle2, ChevronDown, WifiOff } from 'lucide-react';
import { LanguageMode } from '../types/study';
import { bi } from '../i18n/translations';

export const PolytechnicHubLogo: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const dim = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-14 h-14' : 'w-9 h-9';
  return (
    <div
      className={`${dim} rounded-xl bg-gradient-to-br from-blue-600 via-sky-500 to-cyan-400 p-0.5 shadow-sm shadow-cyan-500/20 shrink-0`}
    >
      <div className="w-full h-full rounded-[10px] bg-[#060B16] flex items-center justify-center">
        <svg viewBox="0 0 64 64" className="w-5/6 h-5/6" aria-hidden="true">
          <defs>
            <linearGradient id="phHexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#22D3EE" />
            </linearGradient>
          </defs>
          <polygon
            points="32,6 56,19 56,45 32,58 8,45 8,19"
            fill="none"
            stroke="url(#phHexGrad)"
            strokeWidth="3.2"
          />
          <path
            d="M21 43V21h12c5.2 0 9 3.2 9 7.8s-3.8 7.8-9 7.8H27.5V43H21zm6.5-11.2h5.2c2.1 0 3.6-1.2 3.6-3s-1.5-3-3.6-3h-5.2v6z"
            fill="#F8FAFC"
          />
          <circle cx="44" cy="43" r="3.5" fill="#22D3EE" />
        </svg>
      </div>
    </div>
  );
};

export const SplashScreen: React.FC<{ visible: boolean }> = ({ visible }) => {
  if (!visible) return null;
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-50 bg-[#060B16] flex flex-col items-center justify-center p-6 transition-opacity duration-300"
    >
      <div className="flex flex-col items-center text-center space-y-4">
        <PolytechnicHubLogo size="lg" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Polytechnic Hub</h1>
          <p className="text-xs tracking-widest uppercase text-cyan-400 mt-1">
            Learn • Practice • Achieve
          </p>
        </div>
        <div className="w-36 h-1 rounded-full bg-slate-800 overflow-hidden mt-2">
          <div className="h-full w-2/3 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full animate-pulse" />
        </div>
      </div>
    </div>
  );
};

export const OfflineStatusBadge: React.FC<{
  isOnline: boolean;
  language: LanguageMode;
  isOpen?: boolean;
  onToggle?: () => void;
}> = ({ isOnline, language, isOpen = false, onToggle }) => {
  if (isOnline) {
    return null;
  }
  return (
    <div role="status" aria-live="polite" className="inline-flex shrink-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls="offline-mode-popover"
        title={bi(
          language,
          'অফলাইন মোড চালু — ক্যাশড রিসোর্স দেখতে ক্লিক করুন',
          'Offline Mode active — click to inspect cached resources'
        )}
        className="min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-xs font-semibold text-amber-800 dark:text-amber-200 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300 shrink-0" />
        <span>{bi(language, 'অফলাইন মোড', 'Offline Mode')}</span>
        {onToggle && (
          <ChevronDown
            className={`w-3.5 h-3.5 text-amber-600 dark:text-amber-300 shrink-0 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>
    </div>
  );
};

export const PWAInstallButton: React.FC<{
  canPrompt: boolean;
  isInstalled: boolean;
  onPrompt: () => void;
  onOpenInstallView: () => void;
  language: LanguageMode;
}> = ({ canPrompt, isInstalled, onPrompt, onOpenInstallView, language }) => {
  if (isInstalled) {
    return (
      <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-cyan-600 dark:text-cyan-400 whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>{bi(language, 'অ্যাপ ইনস্টলড', 'App Installed')}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={canPrompt ? onPrompt : onOpenInstallView}
      className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
    >
      <Download className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{bi(language, 'অ্যাপ ইনস্টল', 'Install App')}</span>
    </button>
  );
};
