import React, { useEffect, useRef, useState } from 'react';
import {
  BookmarkPlus,
  BookOpenCheck,
  Bot,
  Calculator,
  Check,
  Compass,
  History,
  MessageSquarePlus,
  MessageSquareText,
  RotateCcw,
  Send,
  Square,
  Trash2,
  User,
  WifiOff,
  Zap,
} from 'lucide-react';
import { DEPARTMENTS, SEMESTER_LABELS, SEMESTER_LABELS_EN } from '../data/curriculum';
import { bi } from '../i18n/translations';
import { aiService } from '../services/aiService';
import {
  AiAssistantMode,
  AiChatMessage,
  AiChatSession,
  DepartmentId,
  LanguageMode,
  SemesterNumber,
} from '../types/study';
import { FormattedAiText } from './FormattedAiText';

interface AiAssistantViewProps {
  sessions: AiChatSession[];
  activeSessionId: string;
  department: DepartmentId;
  semester: SemesterNumber;
  language: LanguageMode;
  isOnline: boolean;
  onUpdateSessionMessages: (
    sessionId: string,
    updater: (prev: AiChatMessage[]) => AiChatMessage[],
    titleOverride?: string
  ) => void;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onClearActiveSession: () => void;
  onSaveAsNote: (title: string, content: string) => void;
}

const MODE_OPTIONS: {
  id: AiAssistantMode;
  labelBn: string;
  labelEn: string;
  placeholderBn: string;
  placeholderEn: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'general',
    labelBn: 'সাধারণ',
    labelEn: 'General',
    placeholderBn: 'যেকোনো ডিপ্লোমা বিষয় নিয়ে প্রশ্ন লিখুন...',
    placeholderEn: 'Ask any Diploma engineering question...',
    icon: MessageSquareText,
  },
  {
    id: 'explain',
    labelBn: 'সহজ ব্যাখ্যা',
    labelEn: 'Explain',
    placeholderBn: 'যে জটিল টপিকটি সহজভাবে বুঝতে চান তা লিখুন...',
    placeholderEn: 'Enter a complex topic to break down step-by-step...',
    icon: BookOpenCheck,
  },
  {
    id: 'math',
    labelBn: 'গণিত',
    labelEn: 'Math Solve',
    placeholderBn: 'গণিত বা সার্কিট/মেকানিক্সের সমস্যাটি লিখুন...',
    placeholderEn: 'Enter a math, circuit, or mechanics numerical...',
    icon: Calculator,
  },
  {
    id: 'power',
    labelBn: 'পাওয়ার টেক',
    labelEn: 'Power Tech',
    placeholderBn: 'বয়লার, আইসি ইঞ্জিন, টারবাইন বা গ্রিড নিয়ে প্রশ্ন লিখুন...',
    placeholderEn: 'Ask about boilers, IC engines, substations, or turbines...',
    icon: Zap,
  },
  {
    id: 'recommend',
    labelBn: 'স্টাডি প্ল্যান',
    labelEn: 'Study Plan',
    placeholderBn: 'সেমিস্টার পরীক্ষার প্রস্তুতি ও সাজেশন জানতে লিখুন...',
    placeholderEn: 'Ask for exam preparation strategy and priority topics...',
    icon: Compass,
  },
];

export const AiAssistantView: React.FC<AiAssistantViewProps> = ({
  sessions,
  activeSessionId,
  department,
  semester,
  language,
  isOnline,
  onUpdateSessionMessages,
  onCreateSession,
  onSelectSession,
  onDeleteSession,
  onClearActiveSession,
  onSaveAsNote,
}) => {
  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const activeSession = safeSessions.find((s) => s.id === activeSessionId) ?? safeSessions[0];
  const messages = Array.isArray(activeSession?.messages) ? activeSession.messages : [];

  const [mode, setMode] = useState<AiAssistantMode>('explain');
  const [conciseMode, setConciseMode] = useState(true);
  const [showSessions, setShowSessions] = useState(false);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [waitingFirstToken, setWaitingFirstToken] = useState(false);
  const [savedMsgId, setSavedMsgId] = useState<string | null>(null);
  const [lastPromptInfo, setLastPromptInfo] = useState<{
    text: string;
    mode: AiAssistantMode;
  } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const endOfChatRef = useRef<HTMLDivElement | null>(null);

  const deptInfo = DEPARTMENTS.find((d) => d.id === department);
  const departmentName =
    language === 'en'
      ? deptInfo?.nameEn ?? 'Power Technology'
      : deptInfo?.nameBn ?? 'পাওয়ার টেকনোলজি';
  const semesterLabel =
    language === 'en' ? SEMESTER_LABELS_EN[semester] : SEMESTER_LABELS[semester];

  useEffect(() => {
    endOfChatRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const starterPrompts: { mode: AiAssistantMode; textBn: string; textEn: string }[] = [
    {
      mode: 'power',
      textBn: 'ওয়াটার-টিউব ও ফায়ার-টিউব বয়লারের প্রধান পার্থক্য বাংলায় বুঝিয়ে দাও',
      textEn: 'Compare water-tube and fire-tube boilers with industrial applications',
    },
    {
      mode: 'math',
      textBn: 'একটি থ্রি-ফেজ 400V লোড 15A কারেন্ট ও 0.85 PF নিলে Active Power (kW) নির্ণয় করো',
      textEn: 'Calculate 3-phase active power in kW for 400V, 15A at 0.85 power factor',
    },
    {
      mode: 'explain',
      textBn: 'ট্রান্সফরমারে কেন ডিসি সাপ্লাই দেওয়া যায় না? সহজ উদাহরণসহ ব্যাখ্যা করো',
      textEn: 'Why can a transformer not operate on DC supply? Explain step-by-step',
    },
    {
      mode: 'recommend',
      textBn: `${semesterLabel}-এর ফাইনাল বোর্ড পরীক্ষার জন্য ৭ দিনের স্মার্ট রিভিশন রুটিন দাও`,
      textEn: `Create a 7-day board exam revision plan for ${semesterLabel}`,
    },
  ];

  const handleStopGenerating = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
    setWaitingFirstToken(false);
  };

  const sendPrompt = async (
    promptText: string,
    chosenMode: AiAssistantMode = mode,
    isRetry = false
  ) => {
    const trimmed = promptText.trim();
    if (!trimmed || isStreaming || !isOnline || !activeSession) return;

    const targetSessionId = activeSession.id;
    setLastPromptInfo({ text: trimmed, mode: chosenMode });

    const historyBefore = isRetry
      ? messages.filter((_, i) => i < messages.length - 1)
      : messages;

    const userMsg: AiChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      mode: chosenMode,
      timestamp: new Date().toISOString(),
    };

    const assistantMsgId = `msg-a-${Date.now() + 1}`;
    const placeholderAssistant: AiChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      text: '',
      mode: chosenMode,
      timestamp: new Date().toISOString(),
    };

    const sessionTitle =
      historyBefore.length === 0 ? trimmed.slice(0, 42) : undefined;

    onUpdateSessionMessages(
      targetSessionId,
      (prev) => {
        const safePrev = Array.isArray(prev) ? prev : [];
        const base = isRetry ? safePrev.slice(0, -1) : safePrev;
        return isRetry
          ? [...base, placeholderAssistant]
          : [...base, userMsg, placeholderAssistant];
      },
      sessionTitle
    );

    if (!isRetry) setInput('');
    setIsStreaming(true);
    setWaitingFirstToken(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let accumulated = '';
    try {
      await aiService.streamAssistant(
        {
          message: trimmed,
          mode: chosenMode,
          language,
          departmentName,
          semesterLabel,
          concise: conciseMode,
          history: isRetry ? historyBefore : [...historyBefore, userMsg],
        },
        (delta) => {
          setWaitingFirstToken(false);
          accumulated += delta;
          onUpdateSessionMessages(targetSessionId, (prev) => {
            const safePrev = Array.isArray(prev) ? prev : [];
            return safePrev.map((m) => (m.id === assistantMsgId ? { ...m, text: accumulated } : m));
          });
        },
        controller.signal
      );

      if (!accumulated.trim()) {
        throw new Error(
          bi(language, 'এআই থেকে কোনো উত্তর পাওয়া যায়নি।', 'Empty response received from AI.')
        );
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (!accumulated.trim()) {
          onUpdateSessionMessages(targetSessionId, (prev) => {
            const safePrev = Array.isArray(prev) ? prev : [];
            return safePrev.filter((m) => m.id !== assistantMsgId);
          });
        }
        return;
      }

      const errorText =
        error instanceof Error
          ? error.message
          : bi(
              language,
              'এআই টিউটরের সাথে সংযোগে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।',
              'Failed to connect with AI Tutor. Please try again.'
            );

      onUpdateSessionMessages(targetSessionId, (prev) => {
        const safePrev = Array.isArray(prev) ? prev : [];
        return safePrev.map((m) =>
          m.id === assistantMsgId ? { ...m, text: errorText, isError: true } : m
        );
      });
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
      setWaitingFirstToken(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendPrompt(input, mode);
  };

  const handleSaveReplyToNotes = (msg: AiChatMessage) => {
    const firstLine = msg.text.split('\n').find((l) => l.trim().length > 0) ?? 'AI Tutor Note';
    const cleanTitle = firstLine.replace(/^#+\s*/, '').replace(/\*\*/g, '').slice(0, 70);
    onSaveAsNote(cleanTitle, msg.text);
    setSavedMsgId(msg.id);
    window.setTimeout(() => setSavedMsgId(null), 2500);
  };

  const activeModeConfig = MODE_OPTIONS.find((m) => m.id === mode) ?? MODE_OPTIONS[0];

  return (
    <div className="flex flex-col h-[calc(100vh-11rem)] lg:h-[calc(100vh-8.5rem)] space-y-3">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
            {bi(language, 'Polytechnic Hub এআই টিউটর', 'Polytechnic Hub AI Tutor')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {departmentName} · {semesterLabel} —{' '}
            {bi(language, 'দ্রুত রিয়েল-টাইম স্ট্রিমিং সহায়ক', 'Fast Streaming Bilingual Tutor')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setConciseMode((prev) => !prev)}
            className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
              conciseMode
                ? 'border-cyan-500 bg-cyan-500/12 text-cyan-600 dark:text-cyan-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {conciseMode
              ? bi(language, 'সংক্ষিপ্ত মোড: চালু', 'Concise: ON')
              : bi(language, 'বিস্তারিত মোড', 'Detailed Mode')}
          </button>

          <button
            type="button"
            onClick={() => setShowSessions((prev) => !prev)}
            className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <History className="w-3.5 h-3.5" />
            <span>
              {bi(language, `ইতিহাস (${safeSessions.length})`, `History (${safeSessions.length})`)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleStopGenerating();
              onCreateSession();
            }}
            className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            <span>{bi(language, 'নতুন চ্যাট', 'New Chat')}</span>
          </button>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                handleStopGenerating();
                onClearActiveSession();
              }}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{bi(language, 'পরিষ্কার', 'Clear')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Session History Drawer */}
      {showSessions && (
        <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-3 flex flex-wrap gap-2 shrink-0 max-h-36 overflow-y-auto">
          {safeSessions.map((s) => (
            <div
              key={s.id}
              className={`inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-lg border text-xs ${
                s.id === activeSession?.id
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  handleStopGenerating();
                  onSelectSession(s.id);
                  setShowSessions(false);
                }}
                className="truncate max-w-[180px] text-left"
              >
                {s.title}
              </button>
              {safeSessions.length > 1 && (
                <button
                  type="button"
                  onClick={() => onDeleteSession(s.id)}
                  aria-label="Delete session"
                  className="p-1 rounded text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!isOnline && (
        <div className="p-3 rounded-xl bg-amber-500/12 border border-amber-500/30 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 shrink-0">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>
            {bi(
              language,
              'এআই টিউটর ব্যবহারের জন্য ইন্টারনেট সংযোগ প্রয়োজন। অফলাইনে নোটস, ফর্মুলা ও পাওয়ার টুলস ব্যবহার করুন।',
              'AI Tutor requires an active internet connection. Offline Notes, Formulas & Power Tools remain available.'
            )}
          </span>
        </div>
      )}

      {/* 5-Mode Switcher */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0">
        {MODE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = mode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMode(opt.id)}
              className={`min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                active
                  ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{bi(language, opt.labelBn, opt.labelEn)}</span>
            </button>
          );
        })}
      </div>

      {/* Chat Viewport */}
      <div className="flex-1 overflow-y-auto rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-4 lg:p-6 space-y-5">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center text-center max-w-2xl mx-auto space-y-5 py-6">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/12 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
              <Bot className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {bi(
                  language,
                  'ডিপ্লোমা ইঞ্জিনিয়ারিংয়ের যেকোনো প্রশ্ন করুন',
                  'Ask Any Diploma Engineering Question'
                )}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {bi(
                  language,
                  'কঠিন টপিক, গাণিতিক সমস্যা, পাওয়ার টেকনোলজি বা পরীক্ষার স্টাডি প্ল্যান সম্পর্কে জানতে নিচের উদাহরণে ক্লিক করুন।',
                  'Tap a starter prompt or type your own theory, math, Power Tech, or exam prep question.'
                )}
              </p>
            </div>

            <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
              {starterPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={!isOnline}
                  onClick={() => {
                    setMode(prompt.mode);
                    void sendPrompt(bi(language, prompt.textBn, prompt.textEn), prompt.mode);
                  }}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-xs text-slate-700 dark:text-slate-200 leading-relaxed transition-colors disabled:opacity-50"
                >
                  {bi(language, prompt.textBn, prompt.textEn)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            const isLast = idx === messages.length - 1;
            const showTypingDots = isLast && !isUser && isStreaming && waitingFirstToken && !msg.text;

            return (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/12 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-4 py-3 ${
                    isUser
                      ? 'bg-cyan-600 text-white text-sm'
                      : msg.isError
                        ? 'bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-sm'
                        : 'bg-slate-100 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800'
                  }`}
                >
                  {isUser ? (
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  ) : showTypingDots ? (
                    <div className="flex items-center gap-1.5 py-1.5 px-1">
                      <span className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce" />
                      <span
                        className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      />
                      <span
                        className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      />
                    </div>
                  ) : msg.isError ? (
                    <div className="space-y-2">
                      <p className="leading-relaxed">{msg.text}</p>
                      {lastPromptInfo && isLast && (
                        <button
                          type="button"
                          onClick={() => void sendPrompt(lastPromptInfo.text, lastPromptInfo.mode, true)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-300 hover:underline"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>{bi(language, 'পুনরায় চেষ্টা করুন', 'Retry')}</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <FormattedAiText text={msg.text} />
                      {(!isStreaming || !isLast) && (
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                          {isLast && lastPromptInfo && (
                            <button
                              type="button"
                              onClick={() => void sendPrompt(lastPromptInfo.text, lastPromptInfo.mode, true)}
                              className="min-h-[32px] inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-slate-500 hover:text-cyan-500"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>{bi(language, 'আবার উত্তর দিন', 'Regenerate')}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleSaveReplyToNotes(msg)}
                            className="min-h-[32px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 ml-auto"
                          >
                            {savedMsgId === msg.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  {bi(language, 'নোটে সেভ হয়েছে', 'Saved to Notes')}
                                </span>
                              </>
                            ) : (
                              <>
                                <BookmarkPlus className="w-3.5 h-3.5" />
                                <span>{bi(language, 'নোটে সেভ করুন', 'Save as Note')}</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={endOfChatRef} />
      </div>

      {/* Input Form with Stop Generating button during stream */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2.5 shrink-0">
        <textarea
          rows={1}
          disabled={!isOnline}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void sendPrompt(input, mode);
            }
          }}
          placeholder={bi(language, activeModeConfig.placeholderBn, activeModeConfig.placeholderEn)}
          className="flex-1 min-h-[48px] max-h-32 px-4 py-3 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none disabled:opacity-60"
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={handleStopGenerating}
            className="min-h-[48px] px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold inline-flex items-center justify-center gap-2 transition-colors shrink-0"
          >
            <Square className="w-4 h-4 fill-current" />
            <span className="hidden sm:inline text-sm">{bi(language, 'থামান', 'Stop')}</span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() || !isOnline}
            aria-label="Send message"
            className="min-h-[48px] min-w-[48px] px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-45 text-white font-semibold inline-flex items-center justify-center gap-2 transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline text-sm">{bi(language, 'পাঠান', 'Send')}</span>
          </button>
        )}
      </form>
    </div>
  );
};
