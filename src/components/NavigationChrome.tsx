import React, { useEffect, useRef, useState } from 'react';
import {
  Award,
  BarChart3,
  Bell,
  BookMarked,
  Bot,
  CalendarCheck2,
  CheckCircle2,
  Download,
  ExternalLink,
  FolderOpen,
  HelpCircle,
  Home,
  Languages,
  Menu,
  MessageSquare,
  Moon,
  NotebookPen,
  RefreshCw,
  Settings,
  Shield,
  Sigma,
  Sun,
  Timer,
  User,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react';
import { getCategoryMeta } from '../data/notificationCategories';
import { DEPARTMENTS, SEMESTER_LABELS, SEMESTER_LABELS_EN } from '../data/curriculum';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { bi, VIEW_TITLES } from '../i18n/translations';
import {
  formatBytesShort,
  inspectCachedOfflineResources,
  OfflineCachedResourcesSnapshot,
} from '../services/offlineCacheInventory';
import {
  AppView,
  AuthUser,
  DepartmentId,
  LanguageMode,
  PlatformNotice,
  SemesterNumber,
  ThemeMode,
  UserNotificationItem,
} from '../types/study';
import { toBnDigits } from '../utils/formatBn';
import {
  OfflineStatusBadge,
  PolytechnicHubLogo,
  PWAInstallButton,
} from './PolytechnicHubLogo';

export interface NavItem {
  id: AppView;
  labelBn: string;
  labelEn: string;
  shortLabelBn: string;
  shortLabelEn: string;
  group: 'main' | 'study' | 'platform';
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  // Main Nav
  { id: 'dashboard', labelBn: 'হোম', labelEn: 'Home', shortLabelBn: 'হোম', shortLabelEn: 'Home', group: 'main', icon: Home },
  { id: 'notifications', labelBn: 'নোটিফিকেশন', labelEn: 'Notifications', shortLabelBn: 'ইনবক্স', shortLabelEn: 'Inbox', group: 'main', icon: Bell },
  { id: 'pdf-library', labelBn: 'আমার PDF লাইব্রেরি', labelEn: 'My PDF Library', shortLabelBn: 'PDF', shortLabelEn: 'PDFs', group: 'main', icon: FolderOpen },
  { id: 'formulas', labelBn: 'ফর্মুলা হাব', labelEn: 'Formula Hub', shortLabelBn: 'ফর্মুলা', shortLabelEn: 'Formulas', group: 'main', icon: Sigma },
  { id: 'result', labelBn: 'BTEB রেজাল্ট', labelEn: 'BTEB Result', shortLabelBn: 'রেজাল্ট', shortLabelEn: 'Result', group: 'main', icon: Award },
  { id: 'ai', labelBn: 'এআই টিউটর', labelEn: 'AI Tutor', shortLabelBn: 'এআই', shortLabelEn: 'AI', group: 'main', icon: Bot },
  { id: 'tools', labelBn: 'পাওয়ার টুলস', labelEn: 'Power Tools', shortLabelBn: 'টুলস', shortLabelEn: 'Tools', group: 'main', icon: Wrench },
  { id: 'profile', labelBn: 'প্রোফাইল', labelEn: 'Profile', shortLabelBn: 'প্রোফাইল', shortLabelEn: 'Profile', group: 'main', icon: User },
  // Study Modules
  { id: 'subjects', labelBn: 'অধ্যায় ও সিলেবাস', labelEn: 'Chapters', shortLabelBn: 'অধ্যায়', shortLabelEn: 'Chapters', group: 'study', icon: BookMarked },
  { id: 'notes', labelBn: 'নোটস ও শেয়ার্ড PDF', labelEn: 'Notes', shortLabelBn: 'নোটস', shortLabelEn: 'Notes', group: 'study', icon: NotebookPen },
  { id: 'quiz', labelBn: 'MCQ ও মডেল টেস্ট', labelEn: 'MCQ & Quiz', shortLabelBn: 'কুইজ', shortLabelEn: 'Quiz', group: 'study', icon: HelpCircle },
  { id: 'routine', labelBn: 'স্টাডি রুটিন', labelEn: 'Routine', shortLabelBn: 'রুটিন', shortLabelEn: 'Routine', group: 'study', icon: CalendarCheck2 },
  { id: 'timer', labelBn: 'অ্যালার্ম ও টাইমার', labelEn: 'Alarm & Timer', shortLabelBn: 'অ্যালার্ম', shortLabelEn: 'Alarm', group: 'study', icon: Timer },
  { id: 'progress', labelBn: 'অগ্রগতি রিপোর্ট', labelEn: 'Progress', shortLabelBn: 'অগ্রগতি', shortLabelEn: 'Progress', group: 'study', icon: BarChart3 },
  // Platform
  { id: 'community', labelBn: 'স্টুডেন্ট কমিউনিটি', labelEn: 'Community', shortLabelBn: 'কমিউনিটি', shortLabelEn: 'Community', group: 'platform', icon: MessageSquare },
  { id: 'install', labelBn: 'অ্যাপ ইনস্টল (PWA/APK)', labelEn: 'Install App', shortLabelBn: 'ইনস্টল', shortLabelEn: 'Install', group: 'platform', icon: Download },
  { id: 'settings', labelBn: 'সেটিংস', labelEn: 'Settings', shortLabelBn: 'সেটিংস', shortLabelEn: 'Settings', group: 'platform', icon: Settings },
  { id: 'admin', labelBn: 'অ্যাডমিন প্যানেল', labelEn: 'Admin Panel', shortLabelBn: 'অ্যাডমিন', shortLabelEn: 'Admin', group: 'platform', icon: Shield },
];

const DEFAULT_AVATAR = '/src/assets/images/student_scholar_avatar_1794839047562.jpg';

interface DesktopSidebarProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  department: DepartmentId;
  semester: SemesterNumber;
  theme: ThemeMode;
  language: LanguageMode;
  onToggleTheme: () => void;
  studentName: string;
  currentUser: AuthUser | null;
  unreadPushCount?: number;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeView,
  onSelectView,
  department,
  semester,
  theme,
  language,
  onToggleTheme,
  studentName,
  currentUser,
  unreadPushCount = 0,
}) => {
  const deptInfo = DEPARTMENTS.find((d) => d.id === department);
  const visibleItems = NAV_ITEMS.filter(
    (item) => item.id !== 'admin' || currentUser?.role === 'admin'
  );

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 lg:fixed lg:inset-y-0 lg:left-0 bg-white dark:bg-[#0A1020] border-r border-slate-200 dark:border-slate-800/90 z-30 no-print">
      <div className="h-16 px-4 flex items-center gap-3 border-b border-slate-200 dark:border-slate-800/90">
        <PolytechnicHubLogo />
        <div className="min-w-0">
          <span className="block text-base font-bold tracking-tight text-slate-900 dark:text-white leading-none truncate">
            Polytechnic Hub
          </span>
          <span className="block text-[10px] font-semibold tracking-wider text-cyan-600 dark:text-cyan-400 mt-1 truncate">
            Learn • Practice • Achieve
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onSelectView('profile')}
        className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800/90 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <img
            src={currentUser?.avatarUrl || DEFAULT_AVATAR}
            alt={currentUser?.fullName || studentName}
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.src = DEFAULT_AVATAR;
            }}
            className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-800"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {currentUser?.fullName || studentName}
            </p>
            {currentUser?.email && (
              <p className="text-[11px] text-cyan-600 dark:text-cyan-400 truncate">
                {currentUser.email}
              </p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {deptInfo?.shortName ?? 'PT'} ·{' '}
              {language === 'en' ? SEMESTER_LABELS_EN[semester] : SEMESTER_LABELS[semester]}
            </p>
          </div>
        </div>
      </button>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1" aria-label="Main Menu">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              className={`w-full min-h-[40px] flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
                isActive
                  ? 'bg-cyan-500/12 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-cyan-600 dark:text-cyan-400' : ''}`} />
              <span className="truncate flex-1">{bi(language, item.labelBn, item.labelEn)}</span>
              {item.id === 'notifications' && unreadPushCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-cyan-500 text-slate-950 text-[10px] font-bold tabular-nums">
                  {unreadPushCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3.5 border-t border-slate-200 dark:border-slate-800/90">
        <button
          type="button"
          onClick={onToggleTheme}
          className="w-full min-h-[42px] flex items-center justify-between px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
        >
          <span>
            {theme === 'dark'
              ? bi(language, 'ডার্ক থিম সক্রিয়', 'Dark Theme Active')
              : bi(language, 'লাইট থিম সক্রিয়', 'Light Theme Active')}
          </span>
          {theme === 'dark' ? (
            <Moon className="w-4 h-4 text-cyan-400" />
          ) : (
            <Sun className="w-4 h-4 text-amber-500" />
          )}
        </button>
      </div>
    </aside>
  );
};

interface TopBarProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  theme: ThemeMode;
  language: LanguageMode;
  onToggleTheme: () => void;
  onToggleLanguage: () => void;
  isOnline: boolean;
  canPromptPwa: boolean;
  isPwaInstalled: boolean;
  onPromptPwa: () => void;
  notices: PlatformNotice[];
  readNoticeIds: string[];
  onMarkNoticesRead: () => void;
  inboxNotifications?: UserNotificationItem[];
  unreadPushCount?: number;
}

export const TopHeader: React.FC<TopBarProps> = ({
  activeView,
  onSelectView,
  theme,
  language,
  onToggleTheme,
  onToggleLanguage,
  isOnline,
  canPromptPwa,
  isPwaInstalled,
  onPromptPwa,
  notices,
  readNoticeIds,
  onMarkNoticesRead,
  inboxNotifications = [],
  unreadPushCount = 0,
}) => {
  const navigatorOnline = useOnlineStatus();
  const effectiveOnline = isOnline && navigatorOnline;

  const [notifOpen, setNotifOpen] = useState(false);
  const [offlineInfoOpen, setOfflineInfoOpen] = useState(false);
  const [cacheSnapshot, setCacheSnapshot] = useState<OfflineCachedResourcesSnapshot | null>(null);
  const [inspectingCache, setInspectingCache] = useState(false);
  const headerActionsRef = useRef<HTMLDivElement | null>(null);
  const unreadNoticesCount = notices.filter((n) => !readNoticeIds.includes(n.id)).length;
  const unreadCount = unreadNoticesCount + unreadPushCount;
  const viewTitle = VIEW_TITLES[activeView];

  const refreshCacheInventory = React.useCallback(async () => {
    setInspectingCache(true);
    try {
      const snap = await inspectCachedOfflineResources();
      setCacheSnapshot(snap);
    } finally {
      setInspectingCache(false);
    }
  }, []);

  useEffect(() => {
    if (effectiveOnline) {
      setOfflineInfoOpen(false);
    } else {
      void refreshCacheInventory();
    }
  }, [effectiveOnline, refreshCacheInventory]);

  useEffect(() => {
    if (offlineInfoOpen && !effectiveOnline) {
      void refreshCacheInventory();
    }
  }, [offlineInfoOpen, effectiveOnline, refreshCacheInventory]);

  useEffect(() => {
    if (!offlineInfoOpen && !notifOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        headerActionsRef.current &&
        !headerActionsRef.current.contains(event.target as Node)
      ) {
        setOfflineInfoOpen(false);
        setNotifOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOfflineInfoOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [offlineInfoOpen, notifOpen]);

  const fmtCount = (n: number) => (language === 'bn' ? toBnDigits(n) : String(n));

  const offlineAvailableFeatures: {
    view: AppView;
    titleBn: string;
    titleEn: string;
    detailBn: string;
    detailEn: string;
    cachedReady: boolean;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      view: 'pdf-library',
      titleBn: 'ক্যাশড PDF লাইব্রেরি',
      titleEn: 'Cached PDF Library',
      detailBn: cacheSnapshot
        ? cacheSnapshot.cachedPdfCount > 0
          ? `${fmtCount(cacheSnapshot.cachedPdfCount)}টি PDF সংরক্ষিত (${formatBytesShort(cacheSnapshot.cachedPdfBytes)})`
          : 'এখনো কোনো PDF ক্যাশ করা হয়নি'
        : 'সংরক্ষিত লোকাল PDF',
      detailEn: cacheSnapshot
        ? cacheSnapshot.cachedPdfCount > 0
          ? `${cacheSnapshot.cachedPdfCount} cached PDFs (${formatBytesShort(cacheSnapshot.cachedPdfBytes)})`
          : 'No PDFs saved offline yet'
        : 'Saved local PDFs',
      cachedReady: (cacheSnapshot?.cachedPdfCount ?? 0) > 0,
      icon: FolderOpen,
    },
    {
      view: 'formulas',
      titleBn: 'ফর্মুলা হাব',
      titleEn: 'Formula Hub',
      detailBn: cacheSnapshot
        ? `${fmtCount(cacheSnapshot.totalFormulasCount)}টি Physics ও Math সূত্র ক্যাশড`
        : 'Physics ও Math সূত্রসমূহ',
      detailEn: cacheSnapshot
        ? `${cacheSnapshot.totalFormulasCount} Physics & Math formulas cached`
        : 'Cached Physics & Math formulas',
      cachedReady: true,
      icon: Sigma,
    },
    {
      view: 'notes',
      titleBn: 'সংরক্ষিত নোটস',
      titleEn: 'Saved Study Notes',
      detailBn: cacheSnapshot
        ? `${fmtCount(cacheSnapshot.savedNotesCount)}টি লোকাল নোট অফলাইনে উপলব্ধ`
        : 'লোকাল নোট পড়া ও এডিট',
      detailEn: cacheSnapshot
        ? `${cacheSnapshot.savedNotesCount} local notes ready offline`
        : 'Read & edit local notes',
      cachedReady: true,
      icon: NotebookPen,
    },
    {
      view: 'subjects',
      titleBn: 'অধ্যায় ও সিলেবাস',
      titleEn: 'Chapters & Syllabus',
      detailBn: cacheSnapshot
        ? `${fmtCount(cacheSnapshot.departmentsCount)}টি ডিপার্টমেন্টের সিলেবাস`
        : 'সব ডিপার্টমেন্ট ও সেমিস্টার',
      detailEn: cacheSnapshot
        ? `${cacheSnapshot.departmentsCount} departments bundled offline`
        : 'All departments & semesters',
      cachedReady: true,
      icon: BookMarked,
    },
    {
      view: 'routine',
      titleBn: 'স্টাডি রুটিন',
      titleEn: 'Study Routine',
      detailBn: cacheSnapshot
        ? `${fmtCount(cacheSnapshot.routineTasksCount)}টি টাস্ক লোকাল স্টোরেজে`
        : 'দৈনিক টাস্ক ও চেকলিস্ট',
      detailEn: cacheSnapshot
        ? `${cacheSnapshot.routineTasksCount} tasks cached locally`
        : 'Daily tasks & checklist',
      cachedReady: true,
      icon: CalendarCheck2,
    },
    {
      view: 'timer',
      titleBn: 'অ্যালার্ম ও টাইমার',
      titleEn: 'Alarms & Study Timer',
      detailBn: cacheSnapshot
        ? `${fmtCount(cacheSnapshot.alarmsCount)}টি অ্যালার্ম · ${fmtCount(cacheSnapshot.timerSessionsCount)} সেশন`
        : 'অ্যালার্ম, পোমোডোরো ও স্টপওয়াচ',
      detailEn: cacheSnapshot
        ? `${cacheSnapshot.alarmsCount} alarms · ${cacheSnapshot.timerSessionsCount} sessions`
        : 'Alarms, Pomodoro & Stopwatch',
      cachedReady: true,
      icon: Timer,
    },
    {
      view: 'tools',
      titleBn: 'পাওয়ার ক্যালকুলেটর',
      titleEn: 'Engineering Calculators',
      detailBn: 'ওহম, পাওয়ার ও এনার্জি টুলস',
      detailEn: "Ohm's Law, Power & Energy",
      cachedReady: true,
      icon: Wrench,
    },
    {
      view: 'progress',
      titleBn: 'অগ্রগতি রিপোর্ট',
      titleEn: 'Progress Report',
      detailBn: 'লোকাল কুইজ ও অধ্যায় তথ্য',
      detailEn: 'Local quiz & chapter stats',
      cachedReady: true,
      icon: BarChart3,
    },
  ];

  return (
    <header className="sticky top-0 z-20 h-14 lg:h-16 px-4 lg:px-8 flex items-center justify-between gap-4 bg-white/90 dark:bg-[#060B16]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/90 no-print">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="lg:hidden flex items-center gap-2">
          <PolytechnicHubLogo size="sm" />
          <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
            Polytechnic Hub
          </span>
        </div>
        <span className="hidden lg:inline text-base font-semibold text-slate-900 dark:text-white whitespace-nowrap shrink-0">
          {viewTitle ? bi(language, viewTitle.bn, viewTitle.en) : 'Polytechnic Hub'}
        </span>
      </div>

      {/* Main 6 Navigation Links on Desktop */}
      <nav
        className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-600 dark:text-slate-400"
        aria-label="Main Navigation"
      >
        {(['dashboard', 'pdf-library', 'formulas', 'result', 'ai', 'profile'] as AppView[]).map((viewId) => {
          const item = NAV_ITEMS.find((n) => n.id === viewId)!;
          const active = activeView === viewId;
          return (
            <button
              key={viewId}
              type="button"
              onClick={() => onSelectView(viewId)}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors hover:text-slate-900 dark:hover:text-white ${
                active
                  ? 'text-cyan-600 dark:text-cyan-400 underline underline-offset-8 decoration-2'
                  : ''
              }`}
            >
              {bi(language, item.shortLabelBn, item.shortLabelEn)}
            </button>
          );
        })}
      </nav>

      <div ref={headerActionsRef} className="flex items-center gap-2 shrink-0 relative">
        <OfflineStatusBadge
          isOnline={effectiveOnline}
          language={language}
          isOpen={offlineInfoOpen}
          onToggle={() => {
            setNotifOpen(false);
            setOfflineInfoOpen((prev) => !prev);
          }}
        />

        <button
          type="button"
          onClick={onToggleLanguage}
          aria-label="Switch Language"
          className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
        >
          <Languages className="w-3.5 h-3.5 text-cyan-500" />
          <span>{language === 'bn' ? 'EN' : 'বাং'}</span>
        </button>

        {/* Notifications Bell */}
        <button
          type="button"
          onClick={() => {
            setOfflineInfoOpen(false);
            setNotifOpen((prev) => !prev);
            onMarkNoticesRead();
          }}
          aria-label="Notifications"
          className="relative min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-cyan-500 text-[10px] font-bold text-slate-950 flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>

        <PWAInstallButton
          canPrompt={canPromptPwa}
          isInstalled={isPwaInstalled}
          onPrompt={onPromptPwa}
          onOpenInstallView={() => onSelectView('install')}
          language={language}
        />

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label="Toggle Theme"
          className="lg:hidden min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        {!effectiveOnline && offlineInfoOpen && (
          <div
            id="offline-mode-popover"
            role="region"
            aria-label={bi(language, 'অফলাইন মোডে উপলব্ধ ক্যাশড রিসোর্স', 'Cached resources available offline')}
            className="absolute right-0 top-12 w-[calc(100vw-2rem)] max-w-md rounded-2xl bg-white dark:bg-[#0D1426] border border-amber-500/40 shadow-2xl p-4 space-y-3 z-50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0">
                  <WifiOff className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {bi(language, 'অফলাইন মোড সক্রিয়', 'Offline Mode Active')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    {bi(
                      language,
                      'ইন্টারনেট সংযোগ বিচ্ছিন্ন। আপনার ডিভাইসে বর্তমানে ক্যাশ করা রিসোর্সসমূহ:',
                      'No internet connection detected. Cached resources currently ready on this device:'
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => void refreshCacheInventory()}
                  disabled={inspectingCache}
                  title={bi(language, 'ক্যাশ আবার যাচাই করুন', 'Re-scan cached resources')}
                  aria-label={bi(language, 'ক্যাশ আবার যাচাই করুন', 'Re-scan cached resources')}
                  className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-slate-400 hover:text-cyan-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${inspectingCache ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setOfflineInfoOpen(false)}
                  aria-label={bi(language, 'বন্ধ করুন', 'Close')}
                  className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {cacheSnapshot && (
              <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  {cacheSnapshot.swCacheAvailable
                    ? bi(
                        language,
                        `অ্যাপ শেল ক্যাশড (${fmtCount(cacheSnapshot.swCachedAssetsCount)} ফাইল)`,
                        `App Shell Cached (${cacheSnapshot.swCachedAssetsCount} files)`
                      )
                    : bi(language, 'লোকাল স্টোরেজ ও IndexedDB সক্রিয়', 'Local Storage & IndexedDB active')}
                </span>
                {cacheSnapshot.cachedNoticesCount > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      {bi(
                        language,
                        `${fmtCount(cacheSnapshot.cachedNoticesCount)}টি নোটিশ ক্যাশড`,
                        `${cacheSnapshot.cachedNoticesCount} cached notices`
                      )}
                    </span>
                  </>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
              {offlineAvailableFeatures.map((feat) => {
                const FeatIcon = feat.icon;
                return (
                  <button
                    key={feat.view}
                    type="button"
                    onClick={() => {
                      setOfflineInfoOpen(false);
                      onSelectView(feat.view);
                    }}
                    className="min-h-[44px] flex items-start gap-2 p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left transition-colors"
                  >
                    <FeatIcon className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1">
                        <span className="truncate">{bi(language, feat.titleBn, feat.titleEn)}</span>
                        {feat.cachedReady && (
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {bi(language, feat.detailBn, feat.detailEn)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-1">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {bi(language, 'ইন্টারনেট প্রয়োজন:', 'Requires internet to resume:')}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {bi(
                  language,
                  'এআই টিউটর · কমিউনিটি ফোরাম · BTEB লাইভ রেজাল্ট · ক্লাউড সিঙ্ক',
                  'AI Tutor · Student Community · Live BTEB Result · Cloud Sync'
                )}
              </p>
            </div>
          </div>
        )}

        {notifOpen && (
          <div className="absolute right-0 top-12 w-80 sm:w-96 rounded-2xl bg-white dark:bg-[#0D1426] border border-slate-200 dark:border-slate-800 shadow-2xl p-4 space-y-3 z-50">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {bi(language, 'পুশ ইনবক্স ও নোটিশ', 'Push Inbox & Notices')}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen(false);
                    onSelectView('notifications');
                  }}
                  className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  {bi(language, 'সব দেখুন', 'Open Center')}
                </button>
                <button
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {inboxNotifications.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {inboxNotifications.slice(0, 4).map((item) => {
                  const meta = getCategoryMeta(item.category);
                  const CatIcon = meta.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setNotifOpen(false);
                        onSelectView((item.targetView as AppView) || 'notifications');
                      }}
                      className={`w-full text-left p-2.5 rounded-xl border transition-colors ${
                        item.isRead
                          ? 'bg-slate-50/60 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800'
                          : 'bg-cyan-500/8 dark:bg-cyan-500/10 border-cyan-500/35'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${meta.iconBgClass}`}>
                          <CatIcon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {item.title}
                          </p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2">
                            {item.body}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {notices.length === 0 && inboxNotifications.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                {bi(language, 'কোনো নোটিশ বা বার্তা নেই।', 'No notifications available.')}
              </p>
            ) : (
              notices.length > 0 && (
                <div className="space-y-2 max-h-44 overflow-y-auto border-t border-slate-200 dark:border-slate-800 pt-2">
                  {notices.slice(0, 3).map((n) => (
                    <div
                      key={n.id}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1"
                    >
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{n.title}</p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                        {n.body}
                      </p>
                      {n.officialLink && (
                        <a
                          href={n.officialLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
                        >
                          <span>Open Link</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </header>
  );
};

interface MobileBottomNavProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  language: LanguageMode;
  currentUser: AuthUser | null;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeView,
  onSelectView,
  language,
  currentUser,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const primaryTabs: AppView[] = ['dashboard', 'pdf-library', 'formulas', 'ai'];
  const secondaryActive = !primaryTabs.includes(activeView);

  const visibleItems = NAV_ITEMS.filter(
    (item) => item.id !== 'admin' || currentUser?.role === 'admin'
  );

  const handleNavigate = (view: AppView) => {
    onSelectView(view);
    setDrawerOpen(false);
  };

  return (
    <>
      <nav
        aria-label="Mobile Bottom Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-white/95 dark:bg-[#0A1020]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center no-print"
      >
        {primaryTabs.map((id) => {
          const item = NAV_ITEMS.find((n) => n.id === id)!;
          const Icon = item.icon;
          const isActive = activeView === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => handleNavigate(id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-medium leading-none">
                {bi(language, item.shortLabelBn, item.shortLabelEn)}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
            secondaryActive || drawerOpen ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Menu className="w-5 h-5" />
          <span className="text-[11px] font-medium leading-none">
            {bi(language, 'আরও', 'More')}
          </span>
        </button>
      </nav>

      {drawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-end"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="w-full max-h-[82vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-[#0D1426] border-t border-slate-200 dark:border-slate-800 p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {bi(language, 'Polytechnic Hub মেনু', 'Polytechnic Hub Menu')}
              </h3>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigate(item.id)}
                    className={`min-h-[46px] flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-medium text-left transition-colors ${
                      active
                        ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{bi(language, item.labelBn, item.labelEn)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
