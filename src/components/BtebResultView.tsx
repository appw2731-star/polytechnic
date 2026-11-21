import React, { useState } from 'react';
import {
  AlertTriangle,
  Award,
  ExternalLink,
  Globe,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { bi } from '../i18n/translations';
import { LanguageMode } from '../types/study';

interface BtebResultViewProps {
  btebResultUrl: string;
  language: LanguageMode;
  isOnline: boolean;
}

export const BtebResultView: React.FC<BtebResultViewProps> = ({
  btebResultUrl,
  language,
  isOnline,
}) => {
  const officialUrl = btebResultUrl || 'https://result.bteb.gov.bd/result-search';
  const [showInAppFrame, setShowInAppFrame] = useState(false);
  const [frameKey, setFrameKey] = useState(0);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-blue-950 via-[#0D1930] to-cyan-950 border border-cyan-500/30 p-6 lg:p-8 text-white space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-300">
              <Award className="w-4 h-4" />
              <span>{bi(language, 'অফিশিয়াল বোর্ড রেজাল্ট পোর্টাল', 'Official BTEB Result Portal')}</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
              {bi(language, 'BTEB ডিপ্লোমা রেজাল্ট যাচাই', 'BTEB Official Result Check')}
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              {bi(
                language,
                'বাংলাদেশ কারিগরি শিক্ষা বোর্ডের (BTEB) আসল ও অফিসিয়াল ওয়েবসাইট থেকে আপনার সেমিস্টার পরীক্ষার ফলাফল সরাসরি দেখুন। আমরা কখনোই ভুয়া বা অনুমানভিত্তিক রেজাল্ট দেখাই না।',
                'Check your official Diploma-in-Engineering semester examination results directly from the Bangladesh Technical Education Board (BTEB) portal. Polytechnic Hub never fabricates exam results.'
              )}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <a
              href={officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-bold transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-4 h-4" />
              <span>{bi(language, 'অফিশিয়াল BTEB রেজাল্ট খুলুন', 'Open Official BTEB Result')}</span>
            </a>

            <button
              type="button"
              disabled={!isOnline}
              onClick={() => setShowInAppFrame((prev) => !prev)}
              className="min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <Globe className="w-4 h-4" />
              <span>
                {showInAppFrame
                  ? bi(language, 'ইন-অ্যাপ ভিউ লুকান', 'Hide In-App View')
                  : bi(language, 'অ্যাপের ভেতরে দেখুন', 'Try In-App View')}
              </span>
            </button>
          </div>
        </div>

        <p className="text-xs font-mono text-cyan-200/80 break-all">
          URL: {officialUrl}
        </p>
      </div>

      {!isOnline && (
        <div className="p-4 rounded-xl bg-amber-500/12 border border-amber-500/30 flex items-start gap-3 text-sm text-amber-800 dark:text-amber-300">
          <WifiOff className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">
              {bi(language, 'ইন্টারনেট সংযোগ প্রয়োজন', 'Internet Connection Required')}
            </p>
            <p className="text-xs mt-0.5">
              {bi(
                language,
                'BTEB অফিশিয়াল রেজাল্ট সার্ভারে সংযোগ করতে আপনার ডিভাইসে ইন্টারনেট সক্রিয় থাকতে হবে।',
                'Checking live BTEB results requires an active internet connection.'
              )}
            </p>
          </div>
        </div>
      )}

      {showInAppFrame && isOnline && (
        <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                {bi(
                  language,
                  'যদি BTEB সার্ভার সিকিউরিটি কারণে ইন-অ্যাপ এম্বেড ব্লক করে, তাহলে ডান পাশের অফিশিয়াল বাটন ব্যবহার করুন।',
                  'If the BTEB server blocks embedding via browser security policy, use the Open Official Website button.'
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFrameKey((k) => k + 1)}
                className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{bi(language, 'রিলোড', 'Reload')}</span>
              </button>
              <a
                href={officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{bi(language, 'অফিশিয়াল ওয়েবসাইটে যান', 'Open Official Website')}</span>
              </a>
            </div>
          </div>

          <iframe
            key={frameKey}
            src={officialUrl}
            title="BTEB Official Result Portal"
            className="w-full h-[640px] bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </section>
      )}

      {/* Helpful Instructions */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 space-y-2.5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-500" />
            <span>{bi(language, 'ফলাফল দেখার ধাপসমূহ', 'How to Check Your Result')}</span>
          </h2>
          <ol className="list-decimal pl-5 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
            <li>{bi(language, 'উপরের "অফিশিয়াল BTEB রেজাল্ট খুলুন" বাটনে ক্লিক করুন।', 'Tap "Open Official BTEB Result" above.')}</li>
            <li>{bi(language, 'Exam Type হিসেবে "Diploma in Engineering" নির্বাচন করুন।', 'Select "Diploma in Engineering" as Exam Type.')}</li>
            <li>{bi(language, 'সঠিক Regulation (যেমন: 2022 বা 2016) এবং আপনার ৬-অঙ্কের Board Roll দিন।', 'Choose your Regulation (e.g. 2022 or 2016) and enter your 6-digit Board Roll.')}</li>
            <li>{bi(language, 'View Result চাপুন এবং মার্কস/রেফার্ড বিষয় যাচাই করুন।', 'Submit to view official GPA and referred subject details.')}</li>
          </ol>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 space-y-2.5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {bi(language, 'অফিশিয়াল BTEB গুরুত্বপূর্ণ লিংক', 'Official BTEB Links')}
          </h2>
          <div className="space-y-2">
            <a
              href={officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/40 text-sm font-medium text-slate-800 dark:text-slate-200"
            >
              <span>result.bteb.gov.bd — Individual Result Search</span>
              <ExternalLink className="w-4 h-4 text-cyan-500 shrink-0" />
            </a>
            <a
              href="https://bteb.gov.bd/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/40 text-sm font-medium text-slate-800 dark:text-slate-200"
            >
              <span>bteb.gov.bd — Official BTEB Notices & Syllabus</span>
              <ExternalLink className="w-4 h-4 text-cyan-500 shrink-0" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};
