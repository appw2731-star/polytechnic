import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Atom,
  Bell,
  Bot,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  HelpCircle,
  MessageSquare,
  Plus,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sigma,
  Trash2,
  Users,
} from 'lucide-react';
import { DEPARTMENTS } from '../data/curriculum';
import { MATHEMATICS_CHAPTERS, PHYSICS_CHAPTERS } from '../data/formulas';
import { bi } from '../i18n/translations';
import { apiClient } from '../services/apiClient';
import {
  AdminAiConfig,
  AdminUsageMetrics,
  AppReleaseConfig,
  AuthUser,
  CommunityPost,
  FormulaItem,
  LanguageMode,
  McqQuestion,
  PlatformNotice,
  SharedPdfNote,
} from '../types/study';
import { MathFormula } from './MathFormula';

interface AdminDashboardViewProps {
  language: LanguageMode;
  currentUser: AuthUser | null;
  formulas: FormulaItem[];
  notices: PlatformNotice[];
  sharedNotes: SharedPdfNote[];
  mcqs: (McqQuestion & { semester?: number })[];
  appConfig: AppReleaseConfig;
  onRefreshBootstrap: () => Promise<void>;
}

type AdminTab =
  | 'overview'
  | 'physics'
  | 'mathematics'
  | 'ai-config'
  | 'notices'
  | 'notes'
  | 'mcqs'
  | 'community'
  | 'config'
  | 'users';

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  language,
  currentUser,
  formulas,
  notices,
  sharedNotes,
  mcqs,
  appConfig,
  onRefreshBootstrap,
}) => {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Usage Metrics & AI Config
  const [metrics, setMetrics] = useState<AdminUsageMetrics | null>(null);
  const [aiConfig, setAiConfig] = useState<AdminAiConfig>({
    activeModel: 'gemini-3.1-flash-lite',
    thinkingLevel: 'LOW',
    conciseByDefault: false,
    maxHistoryTurns: 8,
    customSystemAddon: '',
    updatedAt: '',
  });

  // Formula Form State (shared for Physics & Math tabs)
  const [editingFormulaId, setEditingFormulaId] = useState<string | undefined>(undefined);
  const [fChapter, setFChapter] = useState(PHYSICS_CHAPTERS[0].id);
  const [fNameEn, setFNameEn] = useState('');
  const [fNameBn, setFNameBn] = useState('');
  const [fLatex, setFLatex] = useState('');
  const [fPlain, setFPlain] = useState('');
  const [fExpBn, setFExpBn] = useState('');
  const [fExpEn, setFExpEn] = useState('');
  const [fProbBn, setFProbBn] = useState('');
  const [fSolBn, setFSolBn] = useState('');

  // Notice Form
  const [nTitle, setNTitle] = useState('');
  const [nBody, setNBody] = useState('');
  const [nCat, setNCat] = useState<PlatformNotice['category']>('general');
  const [nLink, setNLink] = useState('');
  const [nPinned, setNPinned] = useState(false);

  // Shared PDF Note Form
  const [snTitle, setSnTitle] = useState('');
  const [snDept, setSnDept] = useState('power');
  const [snSem, setSnSem] = useState(4);
  const [snCode, setSnCode] = useState('');
  const [snSummary, setSnSummary] = useState('');
  const [snPdfUrl, setSnPdfUrl] = useState('');
  const [snPermitted, setSnPermitted] = useState(true);

  // MCQ Form
  const [mCat, setMCat] = useState('পাওয়ার টেকনোলজি');
  const [mDept, setMDept] = useState('power');
  const [mSem, setMSem] = useState(4);
  const [mQuestion, setMQuestion] = useState('');
  const [mOpt0, setMOpt0] = useState('');
  const [mOpt1, setMOpt1] = useState('');
  const [mOpt2, setMOpt2] = useState('');
  const [mOpt3, setMOpt3] = useState('');
  const [mCorrect, setMCorrect] = useState<0 | 1 | 2 | 3>(0);
  const [mExp, setMExp] = useState('');

  // App Config Form
  const [cfgVersion, setCfgVersion] = useState(appConfig.appVersion);
  const [cfgApkStatus, setCfgApkStatus] = useState<'coming_soon' | 'available'>(appConfig.apkStatus);
  const [cfgApkUrl, setCfgApkUrl] = useState(appConfig.apkDownloadUrl);
  const [cfgApkNotes, setCfgApkNotes] = useState(appConfig.apkReleaseNotes);
  const [cfgResultUrl, setCfgResultUrl] = useState(appConfig.btebResultUrl);
  const [cfgOfficialUrl, setCfgOfficialUrl] = useState(appConfig.officialWebsiteUrl);

  // Users & Community Moderation State
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [modPosts, setModPosts] = useState<CommunityPost[]>([]);

  const notify = (msg: string) => {
    setErrorMsg(null);
    setStatusMsg(msg);
    window.setTimeout(() => setStatusMsg(null), 3200);
  };

  const loadAdminLists = useCallback(async () => {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
      const [uRes, cRes, mRes, aiRes] = await Promise.all([
        apiClient.adminListUsers(),
        apiClient.getCommunityPosts(true),
        apiClient.adminGetMetrics(),
        apiClient.adminGetAiConfig(),
      ]);
      setUsers(uRes.users);
      setModPosts(cRes.posts);
      setMetrics(mRes.metrics);
      setAiConfig(aiRes.aiConfig);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load admin data');
    }
  }, [currentUser]);

  useEffect(() => {
    void loadAdminLists();
  }, [loadAdminLists]);

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="max-w-lg mx-auto rounded-2xl bg-white dark:bg-[#111827] border border-red-500/30 p-8 text-center space-y-3">
        <ShieldAlert className="w-10 h-10 text-red-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {bi(language, 'অ্যাডমিন অনুমোদন প্রয়োজন', 'Administrator Access Required')}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {bi(
            language,
            'এই প্যানেল শুধুমাত্র সার্ভার-ভেরিফাইড Admin অ্যাকাউন্টের জন্য সংরক্ষিত।',
            'This control panel is restricted strictly to server-verified Admin accounts.'
          )}
        </p>
      </div>
    );
  }

  const handleSaveFormula = async (subject: 'physics' | 'mathematics', e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const chapters = subject === 'physics' ? PHYSICS_CHAPTERS : MATHEMATICS_CHAPTERS;
    const chInfo = chapters.find((c) => c.id === fChapter);
    try {
      await apiClient.adminSaveFormula({
        id: editingFormulaId,
        subject,
        chapter: fChapter,
        chapterBn: chInfo?.bn ?? fChapter,
        nameEn: fNameEn,
        nameBn: fNameBn || fNameEn,
        expressionLatex: fLatex,
        expressionPlain: fPlain || fLatex,
        symbols: [],
        explanationBn: fExpBn || fExpEn,
        explanationEn: fExpEn || fExpBn,
        exampleProblemBn: fProbBn,
        exampleProblemEn: fProbBn,
        exampleSolutionBn: fSolBn,
        exampleSolutionEn: fSolBn,
      });
      setEditingFormulaId(undefined);
      setFNameEn('');
      setFNameBn('');
      setFLatex('');
      setFPlain('');
      setFExpBn('');
      setFExpEn('');
      setFProbBn('');
      setFSolBn('');
      await onRefreshBootstrap();
      notify(bi(language, 'সূত্র সংরক্ষণ সম্পন্ন হয়েছে!', 'Formula saved to Formula Hub!'));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const handleSaveAiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const res = await apiClient.adminUpdateAiConfig(aiConfig);
      setAiConfig(res.aiConfig);
      notify(bi(language, 'এআই কনফিগারেশন সংরক্ষিত হয়েছে!', 'AI tutor settings saved!'));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'AI config update failed');
    }
  };

  const handleAddNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await apiClient.adminCreateNotice({
        title: nTitle,
        body: nBody,
        category: nCat,
        officialLink: nLink,
        pinned: nPinned,
      });
      setNTitle('');
      setNBody('');
      setNLink('');
      await onRefreshBootstrap();
      notify('Notice published!');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleAddSharedNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await apiClient.adminCreateSharedNote({
        title: snTitle,
        department: snDept,
        semester: snSem,
        subjectCode: snCode,
        summary: snSummary,
        pdfUrl: snPdfUrl,
        downloadPermitted: snPermitted,
      });
      setSnTitle('');
      setSnCode('');
      setSnSummary('');
      setSnPdfUrl('');
      await onRefreshBootstrap();
      notify('Shared PDF Note added!');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleAddMcq = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await apiClient.adminCreateMcq({
        category: mCat,
        department: mDept,
        semester: mSem,
        questionBn: mQuestion,
        optionsBn: [mOpt0, mOpt1, mOpt2, mOpt3],
        correctIndex: mCorrect,
        explanationBn: mExp,
      });
      setMQuestion('');
      setMOpt0('');
      setMOpt1('');
      setMOpt2('');
      setMOpt3('');
      setMExp('');
      await onRefreshBootstrap();
      notify('MCQ Question published!');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await apiClient.adminUpdateConfig({
        appVersion: cfgVersion,
        apkStatus: cfgApkStatus,
        apkDownloadUrl: cfgApkUrl,
        apkReleaseNotes: cfgApkNotes,
        btebResultUrl: cfgResultUrl,
        officialWebsiteUrl: cfgOfficialUrl,
      });
      await onRefreshBootstrap();
      notify('Platform configuration updated!');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed');
    }
  };

  const tabs: { id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'overview', label: 'Overview & Usage', icon: Activity },
    { id: 'physics', label: 'Physics Formulas', icon: Atom },
    { id: 'mathematics', label: 'Math Formulas', icon: Sigma },
    { id: 'ai-config', label: 'AI API Config', icon: Bot },
    { id: 'users', label: 'Users & Roles', icon: Users },
    { id: 'notices', label: 'Notices', icon: Bell },
    { id: 'notes', label: 'Shared Notes', icon: FileText },
    { id: 'mcqs', label: 'MCQs', icon: HelpCircle },
    { id: 'community', label: 'Moderation', icon: MessageSquare },
    { id: 'config', label: 'App & APK', icon: Settings },
  ];

  const switchTab = (nextTab: AdminTab) => {
    setTab(nextTab);
    setEditingFormulaId(undefined);
    if (nextTab === 'physics') setFChapter(PHYSICS_CHAPTERS[0].id);
    if (nextTab === 'mathematics') setFChapter(MATHEMATICS_CHAPTERS[0].id);
  };

  const activeSubject: 'physics' | 'mathematics' = tab === 'mathematics' ? 'mathematics' : 'physics';
  const activeChapters = activeSubject === 'physics' ? PHYSICS_CHAPTERS : MATHEMATICS_CHAPTERS;
  const activeFormulaList = formulas.filter((f) => f.subject === activeSubject);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-cyan-500" />
            <span>{bi(language, 'অ্যাডমিন কন্ট্রোল প্যানেল', 'Admin Control Panel')}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {bi(
              language,
              'ফর্মুলা হাব, এআই মডেল কনফিগারেশন, ব্যবহারের পরিসংখ্যান ও প্ল্যাটফর্ম পরিচালনা',
              'Manage Formula Hub, AI model runtime settings, analytics, users, and notices'
            )}
          </p>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              className={`min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                active
                  ? 'border-cyan-500 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] text-slate-600 dark:text-slate-400'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* OVERVIEW & USAGE METRICS */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500">Registered Users</p>
              <p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {metrics?.totalLocalUsers ?? users.length}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500">Total Physics + Math Formulas</p>
              <p className="mt-1.5 text-2xl font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">
                {formulas.length}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500">AI Requests / Errors</p>
              <p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {metrics?.totalAiRequests ?? 0} / {metrics?.aiErrorsCount ?? 0}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500">Avg AI Latency</p>
              <p className="mt-1.5 text-2xl font-bold text-emerald-500 tabular-nums">
                {metrics?.averageAiLatencyMs ?? 0} ms
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-slate-500">Private User PDFs (Cloud)</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                {metrics?.totalUserPdfs ?? 0}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Community Posts</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                {metrics?.totalCommunityPosts ?? modPosts.length}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Admin MCQs</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                {mcqs.length}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Server Uptime</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                {metrics?.serverUptimeSeconds ?? 0}s
              </p>
            </div>
          </div>
        </div>
      )}

      {/* PHYSICS & MATHEMATICS FORMULAS CRUD */}
      {(tab === 'physics' || tab === 'mathematics') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={(e) => void handleSaveFormula(activeSubject, e)}
            className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3"
          >
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {editingFormulaId
                ? `Edit ${activeSubject === 'physics' ? 'Physics' : 'Math'} Formula`
                : `Add ${activeSubject === 'physics' ? 'Physics' : 'Math'} Formula`}
            </h2>

            <select
              value={fChapter}
              onChange={(e) => setFChapter(e.target.value)}
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            >
              {activeChapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.en} ({c.bn})
                </option>
              ))}
            </select>

            <input
              required
              value={fNameEn}
              onChange={(e) => setFNameEn(e.target.value)}
              placeholder="Formula Name (English)"
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <input
              value={fNameBn}
              onChange={(e) => setFNameBn(e.target.value)}
              placeholder="Formula Name (Bengali)"
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <input
              required
              value={fLatex}
              onChange={(e) => setFLatex(e.target.value)}
              placeholder="KaTeX LaTeX e.g. F = ma"
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono"
            />
            {fLatex && (
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <MathFormula latex={fLatex} displayMode />
              </div>
            )}
            <input
              value={fPlain}
              onChange={(e) => setFPlain(e.target.value)}
              placeholder="Plain Copy Expression e.g. F = m * a"
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono"
            />
            <textarea
              rows={2}
              value={fExpBn}
              onChange={(e) => setFExpBn(e.target.value)}
              placeholder="Short Explanation (Bengali)"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <textarea
              rows={2}
              value={fExpEn}
              onChange={(e) => setFExpEn(e.target.value)}
              placeholder="Short Explanation (English)"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <input
              value={fProbBn}
              onChange={(e) => setFProbBn(e.target.value)}
              placeholder="Example Problem"
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <textarea
              rows={2}
              value={fSolBn}
              onChange={(e) => setFSolBn(e.target.value)}
              placeholder="Example Solution"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold"
              >
                <Plus className="w-4 h-4" />
                <span>{editingFormulaId ? 'Update Formula' : 'Save Formula'}</span>
              </button>
              {editingFormulaId && (
                <button
                  type="button"
                  onClick={() => setEditingFormulaId(undefined)}
                  className="px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3 max-h-[680px] overflow-y-auto">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {activeSubject === 'physics' ? 'Physics' : 'Mathematics'} Formulas ({activeFormulaList.length})
            </h2>
            {activeFormulaList.map((f) => (
              <div
                key={f.id}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-cyan-500">{f.chapter}</p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {f.nameEn}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 truncate">
                    {f.expressionPlain}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFormulaId(f.id);
                      setFChapter(f.chapter);
                      setFNameEn(f.nameEn);
                      setFNameBn(f.nameBn);
                      setFLatex(f.expressionLatex);
                      setFPlain(f.expressionPlain);
                      setFExpBn(f.explanationBn);
                      setFExpEn(f.explanationEn);
                      setFProbBn(f.exampleProblemBn);
                      setFSolBn(f.exampleSolutionBn);
                    }}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void apiClient
                        .adminDeleteFormula(f.subject, f.id)
                        .then(onRefreshBootstrap)
                        .then(() => notify('Formula deleted!'))
                    }
                    className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI API CONFIGURATION (No API key input UI — server-managed via Secrets) */}
      {tab === 'ai-config' && (
        <form
          onSubmit={handleSaveAiConfig}
          className="max-w-xl rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4"
        >
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            AI Tutor Model & Latency Configuration
          </h2>
          <p className="text-xs text-slate-500">
            Configure server-side streaming Gemini model, thinking budget, and system prompt guidance.
            API credentials remain securely managed via server environment secrets.
          </p>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">Active Gemini Model</label>
            <select
              value={aiConfig.activeModel}
              onChange={(e) =>
                setAiConfig((prev) => ({
                  ...prev,
                  activeModel: e.target.value as AdminAiConfig['activeModel'],
                }))
              }
              className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            >
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Ultra-Fast Low Latency)</option>
              <option value="gemini-4-hydrogen">gemini-4-hydrogen (Balanced Reasoning)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">Thinking Level</label>
            <select
              value={aiConfig.thinkingLevel}
              onChange={(e) =>
                setAiConfig((prev) => ({
                  ...prev,
                  thinkingLevel: e.target.value as 'LOW' | 'MEDIUM',
                }))
              }
              className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            >
              <option value="LOW">LOW (Fastest First-Token Response)</option>
              <option value="MEDIUM">MEDIUM (Deeper Math/Power Steps)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">
              Max Context History Turns (2–20)
            </label>
            <input
              type="number"
              min={2}
              max={20}
              value={aiConfig.maxHistoryTurns}
              onChange={(e) =>
                setAiConfig((prev) => ({ ...prev, maxHistoryTurns: Number(e.target.value) || 8 }))
              }
              className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={aiConfig.conciseByDefault}
              onChange={(e) =>
                setAiConfig((prev) => ({ ...prev, conciseByDefault: e.target.checked }))
              }
            />
            <span>Enforce Concise Mode by default on server responses</span>
          </label>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">
              Custom System Instruction Add-on
            </label>
            <textarea
              rows={3}
              value={aiConfig.customSystemAddon}
              onChange={(e) =>
                setAiConfig((prev) => ({ ...prev, customSystemAddon: e.target.value }))
              }
              placeholder="Optional extra guidance for BTEB Diploma students..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
          </div>

          <button
            type="submit"
            className="min-h-[42px] px-5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold"
          >
            Save AI Runtime Settings
          </button>
        </form>
      )}

      {/* NOTICES */}
      {tab === 'notices' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleAddNotice}
            className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3"
          >
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Publish Notice</h2>
            <input
              required
              value={nTitle}
              onChange={(e) => setNTitle(e.target.value)}
              placeholder="Notice Title"
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <textarea
              required
              rows={3}
              value={nBody}
              onChange={(e) => setNBody(e.target.value)}
              placeholder="Notice Details"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <select
              value={nCat}
              onChange={(e) => setNCat(e.target.value as PlatformNotice['category'])}
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            >
              <option value="general">General</option>
              <option value="exam">Exam</option>
              <option value="result">Result</option>
              <option value="urgent">Urgent</option>
            </select>
            <input
              type="url"
              value={nLink}
              onChange={(e) => setNLink(e.target.value)}
              placeholder="Official Link (optional)"
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={nPinned}
                onChange={(e) => setNPinned(e.target.checked)}
              />
              Pin to top
            </label>
            <button
              type="submit"
              className="w-full min-h-[42px] rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold"
            >
              Publish Notice
            </button>
          </form>

          <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Active Notices ({notices.length})
            </h2>
            {notices.map((n) => (
              <div
                key={n.id}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2"
              >
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{n.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{n.body}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void apiClient.adminDeleteNotice(n.id).then(onRefreshBootstrap)}
                  className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SHARED NOTES */}
      {tab === 'notes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleAddSharedNote}
            className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3"
          >
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Add Shared PDF Note</h2>
            <input
              required
              value={snTitle}
              onChange={(e) => setSnTitle(e.target.value)}
              placeholder="Note Title"
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={snDept}
                onChange={(e) => setSnDept(e.target.value)}
                className="min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.shortName}
                  </option>
                ))}
              </select>
              <select
                value={snSem}
                onChange={(e) => setSnSem(Number(e.target.value))}
                className="min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>
                    Sem {s}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={snCode}
              onChange={(e) => setSnCode(e.target.value)}
              placeholder="Subject Code (optional)"
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono"
            />
            <textarea
              rows={2}
              value={snSummary}
              onChange={(e) => setSnSummary(e.target.value)}
              placeholder="Summary"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <input
              type="url"
              value={snPdfUrl}
              onChange={(e) => setSnPdfUrl(e.target.value)}
              placeholder="Permitted PDF URL"
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={snPermitted}
                onChange={(e) => setSnPermitted(e.target.checked)}
              />
              Allow Download
            </label>
            <button
              type="submit"
              className="w-full min-h-[42px] rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold"
            >
              Publish Shared Note
            </button>
          </form>

          <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Shared Notes ({sharedNotes.length})
            </h2>
            {sharedNotes.map((sn) => (
              <div
                key={sn.id}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
              >
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{sn.title}</p>
                  <p className="text-[11px] text-slate-500">
                    {sn.department} · Sem {sn.semester} · {sn.subjectCode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void apiClient.adminDeleteSharedNote(sn.id).then(onRefreshBootstrap)}
                  className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MCQs */}
      {tab === 'mcqs' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleAddMcq}
            className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3"
          >
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Add MCQ Question</h2>
            <input
              required
              value={mCat}
              onChange={(e) => setMCat(e.target.value)}
              placeholder="Category"
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={mDept}
                onChange={(e) => setMDept(e.target.value)}
                className="min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.shortName}
                  </option>
                ))}
              </select>
              <select
                value={mSem}
                onChange={(e) => setMSem(Number(e.target.value))}
                className="min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>
                    Sem {s}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              required
              rows={2}
              value={mQuestion}
              onChange={(e) => setMQuestion(e.target.value)}
              placeholder="Question (Bengali/English)"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <input
              required
              value={mOpt0}
              onChange={(e) => setMOpt0(e.target.value)}
              placeholder="Option A"
              className="w-full min-h-[38px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <input
              required
              value={mOpt1}
              onChange={(e) => setMOpt1(e.target.value)}
              placeholder="Option B"
              className="w-full min-h-[38px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <input
              required
              value={mOpt2}
              onChange={(e) => setMOpt2(e.target.value)}
              placeholder="Option C"
              className="w-full min-h-[38px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <input
              required
              value={mOpt3}
              onChange={(e) => setMOpt3(e.target.value)}
              placeholder="Option D"
              className="w-full min-h-[38px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <select
              value={mCorrect}
              onChange={(e) => setMCorrect(Number(e.target.value) as 0 | 1 | 2 | 3)}
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            >
              <option value={0}>Correct: Option A</option>
              <option value={1}>Correct: Option B</option>
              <option value={2}>Correct: Option C</option>
              <option value={3}>Correct: Option D</option>
            </select>
            <textarea
              rows={2}
              value={mExp}
              onChange={(e) => setMExp(e.target.value)}
              placeholder="Explanation"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <button
              type="submit"
              className="w-full min-h-[42px] rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold"
            >
              Publish MCQ
            </button>
          </form>

          <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Admin-Added MCQs ({mcqs.length})
            </h2>
            {mcqs.map((m) => (
              <div
                key={m.id}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2"
              >
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{m.questionBn}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{m.category}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void apiClient.adminDeleteMcq(m.id).then(onRefreshBootstrap)}
                  className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* COMMUNITY MODERATION */}
      {tab === 'community' && (
        <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Community Posts & Reports ({modPosts.length})
          </h2>
          {modPosts.map((p) => (
            <div
              key={p.id}
              className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white">{p.title}</p>
                <p className="text-[11px] text-slate-500">
                  by {p.authorName} · Reports: {p.reportsCount} ·{' '}
                  {p.isHidden ? 'HIDDEN' : 'VISIBLE'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void apiClient
                      .adminModeratePost(p.id, { isHidden: !p.isHidden })
                      .then(loadAdminLists)
                  }
                  className="min-h-[34px] inline-flex items-center gap-1 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                >
                  {p.isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>{p.isHidden ? 'Unhide' : 'Hide'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void apiClient.deleteCommunityPost(p.id).then(loadAdminLists)}
                  className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* APP & APK RELEASE */}
      {tab === 'config' && (
        <form
          onSubmit={handleSaveConfig}
          className="max-w-xl rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3.5"
        >
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            App Version, BTEB Links & Android APK Release
          </h2>
          <div className="space-y-1">
            <label className="text-xs text-slate-500">App Version</label>
            <input
              value={cfgVersion}
              onChange={(e) => setCfgVersion(e.target.value)}
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Android APK Status</label>
            <select
              value={cfgApkStatus}
              onChange={(e) => setCfgApkStatus(e.target.value as 'coming_soon' | 'available')}
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            >
              <option value="coming_soon">Coming Soon</option>
              <option value="available">Available (Download Active)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Hosted APK Download URL</label>
            <input
              type="url"
              value={cfgApkUrl}
              onChange={(e) => setCfgApkUrl(e.target.value)}
              placeholder="https://github.com/.../polytechnic-hub-v2.0.0.apk"
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-500">APK Release Notes</label>
            <textarea
              rows={2}
              value={cfgApkNotes}
              onChange={(e) => setCfgApkNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-500">BTEB Result Portal URL</label>
            <input
              type="url"
              value={cfgResultUrl}
              onChange={(e) => setCfgResultUrl(e.target.value)}
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-500">BTEB Official Website URL</label>
            <input
              type="url"
              value={cfgOfficialUrl}
              onChange={(e) => setCfgOfficialUrl(e.target.value)}
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
          </div>
          <button
            type="submit"
            className="min-h-[42px] px-5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold"
          >
            Save Configuration
          </button>
        </form>
      )}

      {/* USERS & ROLES */}
      {tab === 'users' && (
        <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Registered Accounts ({users.length})
          </h2>
          {users.map((u) => (
            <div
              key={u.id}
              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  {u.fullName} ({u.role})
                </p>
                <p className="text-[11px] text-slate-500">
                  {u.email} · {u.department} · Sem {u.semester}
                </p>
              </div>
              {u.id !== currentUser.id && (
                <button
                  type="button"
                  onClick={() =>
                    void apiClient
                      .adminSetUserRole(u.id, u.role === 'admin' ? 'student' : 'admin')
                      .then(loadAdminLists)
                  }
                  className="min-h-[34px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  {u.role === 'admin' ? 'Demote to Student' : 'Promote to Admin'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
