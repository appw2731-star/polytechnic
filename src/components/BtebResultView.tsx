import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Bell,
  BookCheck,
  ExternalLink,
  FileCheck2,
  Globe,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { bi } from '../i18n/translations';
import { LanguageMode, PlatformNotice } from '../types/study';
import { formatDateBn } from '../utils/formatBn';

interface BtebResultViewProps {
  btebResultUrl: string;
  officialWebsiteUrl?: string;
  notices?: PlatformNotice[];
  language: LanguageMode;
  isOnline: boolean;
}

export const BtebResultView: React.FC<BtebResultViewProps> = ({
  btebResultUrl,
  officialWebsiteUrl,
  notices = [],
  language,
  isOnline,
}) => {
  const primaryResultUrl =
    btebResultUrl && btebResultUrl.startsWith('http')
      ? btebResultUrl
      : 'https://result.bteb.gov.bd/';
  const mainBtebUrl =
    officialWebsiteUrl && officialWebsiteUrl.startsWith('http')
      ? officialWebsiteUrl
      : 'https://bteb.gov.bd/';
  const eshebaUrl = 'https://btebesheba.gov.bd/';

  const [showInAppFrame, setShowInAppFrame] = useState(false);
  const [frameKey, setFrameKey] = useState(0);

  const resultNotices = useMemo(
    () => notices.filter((n) => n.category === 'result' || n.category === 'exam'),
    [notices]
  );

  const officialPortals = [
    {
      titleBn: 'BTEB অফিশিয়াল রেজাল্ট পোর্টাল',
      titleEn: 'BTEB Individual Result Portal',
      url: 'https://result.bteb.gov.bd/',
      descBn:
        'ডিপ্লোমা-ইন-ইঞ্জিনিয়ারিংয়ের সেমিস্টার ফলাফল, GPA এবং রেফার্ড বিষয় দেখার মূল সরকারি পোর্টাল।',
      descEn:
        'Primary official portal for checking Diploma-in-Engineering semester GPA and referred subjects.',
      primary: true,
    },
    {
      titleBn: 'বাংলাদেশ কারিগরি শিক্ষা বোর্ড (BTEB)',
      titleEn: 'BTEB Official Website',
      url: mainBtebUrl,
      descBn:
        'অফিশিয়াল বোর্ড নোটিশ, পরীক্ষার রুটিন, প্রবিধান ২০২২ সিলেবাস এবং একাডেমিক ক্যালেন্ডার।',
      descEn:
        'Official BTEB board notices, exam schedules, Probidhan 2022 curriculum, and circulars.',
      primary: false,
    },
    {
      titleBn: 'BTEB ই-সেবা (e-Sheba)',
      titleEn: 'BTEB e-Sheba Portal',
      url: eshebaUrl,
      descBn:
        'অনলাইন নম্বরপত্র (Marksheet), রেজিস্ট্রেশন ও সনদ সংক্রান্ত সরকারি ডিজিটাল সেবা পোর্টাল।',
      descEn:
        'Official digital portal for marksheet verification, registration, and certificate services.',
      primary: false,
    },
  ];

  return (
    <div className="max-w-5xl space-y-6">
      {/* Hero Banner */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-950 via-[#0D1930] to-cyan-950 border border-cyan-500/30 p-6 lg:p-8 text-white space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-300">
              <Award className="w-4 h-4" />
              <span>{bi(language, 'অফিশিয়াল রেজাল্ট সেন্টার', 'Official BTEB Result Center')}</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
              {bi(language, 'BTEB ডিপ্লোমা রেজাল্ট ও সেবা কেন্দ্র', 'BTEB Official Result & Notice Center')}
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              {bi(
                language,
                'বাংলাদেশ কারিগরি শিক্ষা বোর্ডের (BTEB) অফিশিয়াল সরকারি ওয়েবসাইট থেকে সরাসরি আপনার রেজাল্ট যাচাই করুন। আপনার নিরাপত্তা ও গোপনীয়তার জন্য এই অ্যাপ কখনো রোল বা রেজিস্ট্রেশন নম্বর সংগ্রহ করে না এবং কোনো ভুয়া ফলাফল দেখায় না।',
                'Verify your Diploma-in-Engineering results directly on official Bangladesh Technical Education Board (BTEB) websites. For privacy and integrity, Polytechnic Hub never collects roll/registration numbers and never fabricates results.'
              )}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <a
              href={primaryResultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-bold transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-4 h-4" />
              <span>{bi(language, 'অফিশিয়াল রেজাল্ট পোর্টাল খুলুন', 'Check Result on Official Site')}</span>
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
                  ? bi(language, 'ইন-অ্যাপ ভিউ লুকান', 'Hide In-App Frame')
                  : bi(language, 'অ্যাপে প্রিভিউ দেখুন', 'Preview In-App')}
              </span>
            </button>
          </div>
        </div>
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
                'BTEB-এর লাইভ সরকারি ওয়েবসাইটে প্রবেশ করতে ডিভাইসে সক্রিয় ইন্টারনেট থাকতে হবে।',
                'Connecting to official live BTEB websites requires an active internet connection.'
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
                  'BTEB সার্ভার যদি ব্রাউজার সিকিউরিটি নীতিমালার কারণে এম্বেড ব্লক করে, তাহলে "Open Official Website" বাটনে ক্লিক করুন।',
                  'If the government server blocks iframe embedding via browser security policy, use Open Official Website.'
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
                href={primaryResultUrl}
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
            src={primaryResultUrl}
            title="BTEB Official Result Portal"
            className="w-full h-[620px] bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </section>
      )}

      {/* Official Portals Grid */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Globe className="w-4 h-4 text-cyan-500" />
          <span>{bi(language, 'অফিশিয়াল BTEB ওয়েবসাইটসমূহ', 'Official External Websites')}</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {officialPortals.map((portal) => (
            <a
              key={portal.url}
              href={portal.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`p-5 rounded-2xl border flex flex-col justify-between gap-4 transition-colors ${
                portal.primary
                  ? 'bg-cyan-500/8 border-cyan-500/40 hover:border-cyan-400'
                  : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 hover:border-cyan-500/40'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-700 dark:text-cyan-300">
                    {bi(language, 'অফিশিয়াল বাহ্যিক ওয়েবসাইট', 'Official External Website')}
                  </span>
                  <ExternalLink className="w-4 h-4 text-cyan-500 shrink-0" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {bi(language, portal.titleBn, portal.titleEn)}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {bi(language, portal.descBn, portal.descEn)}
                </p>
              </div>
              <p className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 break-all">
                {portal.url}
              </p>
            </a>
          ))}
        </div>
      </section>

      {/* Official Result & Exam Notices */}
      <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bell className="w-4 h-4 text-cyan-500" />
            <span>
              {bi(language, 'রেজাল্ট ও পরীক্ষা সংক্রান্ত সাম্প্রতিক নোটিশ', 'Official Result & Exam Notices')}
            </span>
          </h2>
          <a
            href="https://bteb.gov.bd/site/view/notices"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline inline-flex items-center gap-1"
          >
            <span>{bi(language, 'সব বোর্ড নোটিশ', 'All BTEB Notices')}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {resultNotices.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {bi(
              language,
              'নতুন কোনো বোর্ড রেজাল্ট বা পরীক্ষার নোটিশ প্রকাশ হলে এখানে এবং নোটিফিকেশন সেন্টারে প্রদর্শিত হবে।',
              'Published exam schedules and result circulars from Admin will appear here and in your Notification Center.'
            )}
          </p>
        ) : (
          <div className="space-y-2.5">
            {resultNotices.map((n) => (
              <div
                key={n.id}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-700 dark:text-cyan-300">
                      {n.category}
                    </span>
                    <span className="text-[11px] text-slate-500">{formatDateBn(n.createdAt)}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{n.title}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{n.body}</p>
                </div>
                {n.officialLink && (
                  <a
                    href={n.officialLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shrink-0 self-start sm:self-center"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{bi(language, 'লিংক দেখুন', 'Open Link')}</span>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Guides: Checking Result + Marksheet / Diploma Exam Info */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 space-y-2.5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-500" />
            <span>{bi(language, 'ফলাফল দেখার ধাপসমূহ', 'How to Check Your Result')}</span>
          </h2>
          <ol className="list-decimal pl-5 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
            <li>
              {bi(
                language,
                '"অফিশিয়াল রেজাল্ট পোর্টাল খুলুন" বাটনে ক্লিক করে result.bteb.gov.bd-এ যান।',
                'Open result.bteb.gov.bd using the official button above.'
              )}
            </li>
            <li>
              {bi(
                language,
                'Exam Type হিসেবে "Diploma in Engineering" নির্বাচন করুন।',
                'Select "Diploma in Engineering" as the Examination Type.'
              )}
            </li>
            <li>
              {bi(
                language,
                'সঠিক Regulation (যেমন: 2022 বা 2016) এবং আপনার ৬-অঙ্কের Board Roll দিন।',
                'Pick your Regulation (e.g. 2022 or 2016) and enter your 6-digit Board Roll.'
              )}
            </li>
            <li>
              {bi(
                language,
                'Submit চাপুন এবং GPA ও রেফার্ড (যদি থাকে) বিষয়ের কোড যাচাই করুন।',
                'Submit to view your official GPA and any referred subject codes.'
              )}
            </li>
          </ol>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 space-y-2.5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-cyan-500" />
            <span>
              {bi(language, 'মার্কশিট, রেফার্ড ও পুনঃনিরীক্ষণ নির্দেশিকা', 'Marksheet & Exam Guide')}
            </span>
          </h2>
          <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            <li className="flex items-start gap-2">
              <BookCheck className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
              <span>
                {bi(
                  language,
                  'ডিপ্লোমা প্রবিধান ২০২২ অনুযায়ী ১ম থেকে ৭ম সেমিস্টার তাত্ত্বিক ও ব্যবহারিক এবং ৮ম সেমিস্টার ইন্ডাস্ট্রিয়াল অ্যাটাচমেন্ট হিসেবে পরিচালিত হয়।',
                  'Under BTEB Probidhan 2022, semesters 1–7 cover theory & lab subjects and semester 8 is Industrial Attachment.'
                )}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <BookCheck className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
              <span>
                {bi(
                  language,
                  'বিস্তারিত মার্কশিট ও রেফার্ড ফলাফলের PDF প্রকাশের পর আপনার নিজ ইনস্টিটিউটের অফিসিয়াল নোটিশ বা bteb.gov.bd থেকে ডাউনলোড করা যায়।',
                  'Detailed institute-wise result sheets (PDF) are published on bteb.gov.bd and distributed by your Polytechnic Institute.'
                )}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <BookCheck className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
              <span>
                {bi(
                  language,
                  'ফলাফল পুনঃনিরীক্ষণের (Re-scrutiny) জন্য নির্দিষ্ট সময়ের মধ্যে BTEB ই-সেবা বা আপনার কলেজের মাধ্যমে আবেদন করতে হয়।',
                  'For board re-scrutiny applications, apply within the published deadline through BTEB e-Sheba or your institute.'
                )}
              </span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
};
