import { LanguageMode } from '../types/study';

export function bi(lang: LanguageMode, bn: string, en: string): string {
  return lang === 'en' ? en : bn;
}

export const VIEW_TITLES: Record<string, { bn: string; en: string; subBn: string; subEn: string }> = {
  dashboard: {
    bn: 'হোম ড্যাশবোর্ড',
    en: 'Home Dashboard',
    subBn: 'আজকের পড়াশোনা, ব্যক্তিগত PDF, ফর্মুলা ও বোর্ড আপডেট',
    subEn: 'Daily study progress, personal PDFs, formulas & notices',
  },
  notifications: {
    bn: 'নোটিফিকেশন সেন্টার',
    en: 'Notification Center',
    subBn: 'পুশ নোটিফিকেশন ইনবক্স, সাউন্ড ও ক্যাটাগরি প্রেফারেন্স',
    subEn: 'Push notification inbox, sound settings & category preferences',
  },
  'pdf-library': {
    bn: 'আমার PDF লাইব্রেরি',
    en: 'My PDF Library',
    subBn: 'ব্যক্তিগত প্রাইভেট PDF আপলোড, নামকরণ ও ইন-অ্যাপ রিডার',
    subEn: 'Private personal PDF uploads, custom titles & in-app reader',
  },
  formulas: {
    bn: 'ফর্মুলা হাব (Physics & Math)',
    en: 'Formula Hub (Physics & Math)',
    subBn: 'পদার্থবিজ্ঞান (১১ অধ্যায়) ও গণিত (১২ অধ্যায়) · KaTeX ও উদাহরণসহ',
    subEn: 'Physics (11 chapters) & Mathematics (12 chapters) · KaTeX & examples',
  },
  result: {
    bn: 'BTEB রেজাল্ট পোর্টাল',
    en: 'BTEB Official Result',
    subBn: 'বাংলাদেশ কারিগরি শিক্ষা বোর্ডের ফলাফল যাচাই',
    subEn: 'Official Bangladesh Technical Education Board Result Portal',
  },
  ai: {
    bn: 'এআই স্টাডি টিউটর',
    en: 'AI Study Tutor',
    subBn: 'বাংলা ও ইংরেজিতে দ্রুত রিয়েল-টাইম স্ট্রিমিং ডিপ্লোমা সহায়তা',
    subEn: 'Fast streaming bilingual Bengali & English engineering mentor',
  },
  tools: {
    bn: 'পাওয়ার ও ইঞ্জিনিয়ারিং টুলস',
    en: 'Power & Engineering Tools',
    subBn: 'ওহম, পাওয়ার, এনার্জি বিল, রেজিস্ট্যান্স ও সূত্র',
    subEn: "Ohm's Law, AC/DC Power, Energy Bill, Resistors & Formulas",
  },
  profile: {
    bn: 'প্রোফাইল ও অ্যাকাউন্ট',
    en: 'Profile & Account',
    subBn: 'Supabase সাইন ইন, Google OAuth, প্রোফাইল ও অ্যাডমিন পোর্টাল',
    subEn: 'Supabase Auth, Google Sign-in, profile privacy & Admin access',
  },
  subjects: {
    bn: 'অধ্যায় ও সিলেবাস',
    en: 'Chapters & Curriculum',
    subBn: 'সেমিস্টারভিত্তিক অধ্যায় ও প্র্যাকটিক্যাল গাইড',
    subEn: 'Semester chapters, practical guides & formulas',
  },
  routine: {
    bn: 'স্টাডি রুটিন',
    en: 'Study Routine',
    subBn: 'সাপ্তাহিক পড়ার তালিকা ও অগ্রাধিকার',
    subEn: 'Weekly study tasks & priority planner',
  },
  timer: {
    bn: 'ক্লক ও স্টাডি টাইমার',
    en: 'Clock & Study Timer',
    subBn: 'বাংলাদেশ সময়, পোমোডোরো, স্টপওয়াচ ও রিমাইন্ডার',
    subEn: 'Dhaka Clock, Pomodoro, Stopwatch & Reminders',
  },
  quiz: {
    bn: 'MCQ ও মডেল টেস্ট',
    en: 'MCQ & Model Test',
    subBn: 'বিষয়ভিত্তিক কুইজ ও ফলাফল বিশ্লেষণ',
    subEn: 'Subject quizzes, explanations & score analytics',
  },
  notes: {
    bn: 'নোটস ও শেয়ার্ড PDF',
    en: 'Notes & Shared PDFs',
    subBn: 'ব্যক্তিগত নোটস ও কমিউনিটি/অ্যাডমিন শেয়ার্ড নোটস',
    subEn: 'Personal study notes & shared resources',
  },
  community: {
    bn: 'স্টুডেন্ট কমিউনিটি',
    en: 'Student Community',
    subBn: 'প্রশ্ন-উত্তর ও ডিপার্টমেন্টভিত্তিক আলোচনা',
    subEn: 'Q&A forum & peer technical discussions',
  },
  progress: {
    bn: 'অগ্রগতি পরিসংখ্যান',
    en: 'Study Progress',
    subBn: 'অধ্যায়, কুইজ ও স্টাডি আওয়ার বিশ্লেষণ',
    subEn: 'Chapter completion, quiz & study metrics',
  },
  install: {
    bn: 'অ্যাপ ইনস্টল (PWA ও APK)',
    en: 'Install App (PWA & APK)',
    subBn: 'অফলাইন PWA অ্যাপ ও Android APK স্ট্যাটাস',
    subEn: 'Installable Web App & Capacitor Android status',
  },
  settings: {
    bn: 'সেটিংস ও প্রেফারেন্স',
    en: 'Settings & Preferences',
    subBn: 'ডিপার্টমেন্ট, ভাষা, থিম ও ডেটা ম্যানেজমেন্ট',
    subEn: 'Department, language, theme & backup controls',
  },
  admin: {
    bn: 'অ্যাডমিন কন্ট্রোল প্যানেল',
    en: 'Admin Control Panel',
    subBn: 'ফর্মুলা হাব, এআই কনফিগ, নোটিশ, MCQ, ব্যবহারকারী ও অ্যাপ পরিচালনা',
    subEn: 'Manage Formulas, AI Config, Notices, MCQs, Users & Releases',
  },
};
