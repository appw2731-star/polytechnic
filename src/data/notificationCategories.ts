import type React from 'react';
import {
  AlertCircle,
  GraduationCap,
  Info,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type { PushCategory } from '../types/study';

export interface NotificationCategoryMeta {
  id: PushCategory;
  labelBn: string;
  labelEn: string;
  descBn: string;
  descEn: string;
  androidChannelId: string;
  androidChannelName: string;
  androidImportance: 1 | 2 | 3 | 4 | 5;
  badgeClass: string;
  iconBgClass: string;
  borderClass: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NOTIFICATION_CATEGORIES: NotificationCategoryMeta[] = [
  {
    id: 'APP_UPDATE',
    labelBn: 'অ্যাপ আপডেট',
    labelEn: 'APP UPDATE',
    descBn: 'নতুন ফিচার, ভার্সন ও APK আপডেট',
    descEn: 'New features, releases & version updates',
    androidChannelId: 'polytechnic_app_update',
    androidChannelName: 'App Updates',
    androidImportance: 4,
    badgeClass: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
    iconBgClass: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
    borderClass: 'border-cyan-500/35',
    icon: Sparkles,
  },
  {
    id: 'IMPORTANT',
    labelBn: 'গুরুত্বপূর্ণ',
    labelEn: 'IMPORTANT',
    descBn: 'জরুরি একাডেমিক ও প্ল্যাটফর্ম ঘোষণা',
    descEn: 'Important announcements & policy notices',
    androidChannelId: 'polytechnic_important',
    androidChannelName: 'Important Announcements',
    androidImportance: 5,
    badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    iconBgClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    borderClass: 'border-amber-500/35',
    icon: AlertCircle,
  },
  {
    id: 'EDUCATION',
    labelBn: 'শিক্ষা ও পরীক্ষা',
    labelEn: 'EDUCATION',
    descBn: 'পরীক্ষা, রুটিন, ফর্মুলা ও স্টাডি আপডেট',
    descEn: 'Exam, class routine & study updates',
    androidChannelId: 'polytechnic_education',
    androidChannelName: 'Education & Exams',
    androidImportance: 4,
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    iconBgClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    borderClass: 'border-emerald-500/35',
    icon: GraduationCap,
  },
  {
    id: 'EMERGENCY',
    labelBn: 'জরুরি সতর্কতা',
    labelEn: 'EMERGENCY',
    descBn: 'অতি জরুরি ও নিরাপত্তা সংক্রান্ত বিজ্ঞপ্তি',
    descEn: 'Urgent announcements & security alerts',
    androidChannelId: 'polytechnic_emergency',
    androidChannelName: 'Emergency Alerts',
    androidImportance: 5,
    badgeClass: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40',
    iconBgClass: 'bg-red-500/15 text-red-600 dark:text-red-400',
    borderClass: 'border-red-500/45',
    icon: ShieldAlert,
  },
  {
    id: 'GENERAL',
    labelBn: 'সাধারণ তথ্য',
    labelEn: 'GENERAL',
    descBn: 'সাধারণ তথ্য ও কমিউনিটি বার্তা',
    descEn: 'General information & tips',
    androidChannelId: 'polytechnic_general',
    androidChannelName: 'General Information',
    androidImportance: 3,
    badgeClass: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
    iconBgClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
    borderClass: 'border-indigo-500/35',
    icon: Info,
  },
];

export function getCategoryMeta(category: PushCategory | string): NotificationCategoryMeta {
  return (
    NOTIFICATION_CATEGORIES.find((c) => c.id === category) ??
    NOTIFICATION_CATEGORIES[NOTIFICATION_CATEGORIES.length - 1]
  );
}
