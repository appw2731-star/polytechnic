import React, { useCallback, useEffect, useState } from 'react';
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  Edit3,
  Send,
  Smartphone,
  Trash2,
  Users,
} from 'lucide-react';
import { DEPARTMENTS, SEMESTER_LABELS, SEMESTER_LABELS_EN } from '../data/curriculum';
import { getCategoryMeta, NOTIFICATION_CATEGORIES } from '../data/notificationCategories';
import { bi } from '../i18n/translations';
import { apiClient } from '../services/apiClient';
import type {
  AdminPushDashboardData,
  AuthUser,
  LanguageMode,
  PushAudienceType,
  PushCategory,
  PushSoundMode,
  ScheduledPushNotification,
} from '../types/study';

interface AdminNotificationManagerProps {
  language: LanguageMode;
  users: AuthUser[];
  onNotify: (msg: string) => void;
  onError: (msg: string) => void;
}

const TARGET_VIEW_OPTIONS = [
  { id: 'notifications', label: 'Notification Center (Inbox)' },
  { id: 'dashboard', label: 'Home Dashboard' },
  { id: 'formulas', label: 'Formula Hub (Physics & Math)' },
  { id: 'pdf-library', label: 'My PDF Library' },
  { id: 'result', label: 'BTEB Result Portal' },
  { id: 'ai', label: 'AI Study Tutor' },
  { id: 'quiz', label: 'MCQ & Model Test' },
  { id: 'notes', label: 'Notes & Shared PDFs' },
  { id: 'community', label: 'Student Community' },
  { id: 'install', label: 'Install App (PWA & APK Update)' },
];

export const AdminNotificationManager: React.FC<AdminNotificationManagerProps> = ({
  language,
  users,
  onNotify,
  onError,
}) => {
  const [data, setData] = useState<AdminPushDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Composer Form
  const [editingScheduledId, setEditingScheduledId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<PushCategory>('EDUCATION');
  const [imageUrl, setImageUrl] = useState('');
  const [targetView, setTargetView] = useState('notifications');
  const [soundMode, setSoundMode] = useState<PushSoundMode>('custom');
  const [audienceType, setAudienceType] = useState<PushAudienceType>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [targetDepartment, setTargetDepartment] = useState('power');
  const [targetSemester, setTargetSemester] = useState<string>('');
  const [deliveryMode, setDeliveryMode] = useState<'now' | 'schedule'>('now');
  const [scheduledForLocal, setScheduledForLocal] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.adminGetNotifications();
      setData(res);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load push notifications');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const resetForm = () => {
    setEditingScheduledId(null);
    setTitle('');
    setBody('');
    setCategory('EDUCATION');
    setImageUrl('');
    setTargetView('notifications');
    setSoundMode('custom');
    setAudienceType('all');
    setSelectedUserIds([]);
    setTargetDepartment('power');
    setTargetSemester('');
    setDeliveryMode('now');
    setScheduledForLocal('');
  };

  const toggleUserSelection = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (audienceType === 'selected_users' && selectedUserIds.length === 0) {
      onError(
        bi(
          language,
          'কমপক্ষে একজন ব্যবহারকারী নির্বাচন করুন।',
          'Please select at least one recipient user.'
        )
      );
      return;
    }
    setSending(true);
    try {
      const parsedSem = targetSemester ? Number(targetSemester) : null;
      const scheduledIso =
        deliveryMode === 'schedule' && scheduledForLocal
          ? new Date(scheduledForLocal).toISOString()
          : null;

      const resolvedTargetIds =
        audienceType === 'selected_users'
          ? Array.from(
              new Set(
                selectedUserIds.flatMap((id) => {
                  const found = users.find((u) => u.id === id);
                  return found?.firebaseUid ? [id, found.firebaseUid] : [id];
                })
              )
            )
          : [];

      if (editingScheduledId) {
        await apiClient.adminUpdateScheduledNotification(editingScheduledId, {
          title,
          body,
          category,
          imageUrl,
          targetView,
          audienceType,
          targetUserIds: resolvedTargetIds,
          targetDepartment: audienceType === 'department_semester' ? targetDepartment : '',
          targetSemester: audienceType === 'department_semester' ? parsedSem : null,
          soundMode,
          scheduledFor: scheduledIso ?? undefined,
        });
        onNotify(bi(language, 'শিডিউল করা নোটিফিকেশন আপডেট হয়েছে।', 'Scheduled notification updated.'));
      } else {
        const res = await apiClient.adminSendNotification({
          title,
          body,
          category,
          imageUrl,
          targetView,
          audienceType,
          targetUserIds: resolvedTargetIds,
          targetDepartment: audienceType === 'department_semester' ? targetDepartment : '',
          targetSemester: audienceType === 'department_semester' ? parsedSem : null,
          soundMode,
          scheduledFor: scheduledIso,
        });

        if (res.scheduled) {
          onNotify(
            bi(language, 'নোটিফিকেশন সফলভাবে শিডিউল করা হয়েছে!', 'Notification scheduled successfully!')
          );
        } else {
          const sentN = res.campaign?.totalRecipients ?? 0;
          const fcmSent = res.campaign?.fcmSentCount ?? 0;
          onNotify(
            bi(
              language,
              `নোটিফিকেশন পাঠানো হয়েছে! প্রাপক: ${sentN} · FCM পুশ: ${fcmSent}`,
              `Notification dispatched! Recipients: ${sentN} · FCM Pushes: ${fcmSent}`
            )
          );
        }
      }

      resetForm();
      await loadDashboard();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  const handleStartEditScheduled = (item: ScheduledPushNotification) => {
    setEditingScheduledId(item.id);
    setTitle(item.title);
    setBody(item.body);
    setCategory(item.category);
    setImageUrl(item.imageUrl);
    setTargetView(item.targetView || 'notifications');
    setSoundMode(item.soundMode);
    setAudienceType(item.audienceType);
    setSelectedUserIds(item.targetUserIds ?? []);
    setTargetDepartment(item.targetDepartment || 'power');
    setTargetSemester(item.targetSemester ? String(item.targetSemester) : '');
    setDeliveryMode('schedule');
    const localDate = new Date(item.scheduledFor);
    const offset = localDate.getTimezoneOffset() * 60000;
    setScheduledForLocal(new Date(localDate.getTime() - offset).toISOString().slice(0, 16));
  };

  const handleDeleteScheduled = async (id: string) => {
    try {
      await apiClient.adminDeleteScheduledNotification(id);
      await loadDashboard();
      onNotify(bi(language, 'শিডিউল করা নোটিফিকেশন মুছে ফেলা হয়েছে।', 'Scheduled notification deleted.'));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.department.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Delivery Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
          <p className="text-[11px] text-slate-500">Campaigns Sent</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white tabular-nums">
            {data?.stats.totalCampaigns ?? 0}
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
          <p className="text-[11px] text-slate-500">Recipients Reached</p>
          <p className="mt-1 text-xl font-bold text-cyan-500 tabular-nums">
            {data?.stats.totalRecipientsReached ?? 0}
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
          <p className="text-[11px] text-slate-500">FCM Pushes (OK / Fail)</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white tabular-nums">
            {data?.stats.totalFcmSent ?? 0} / {data?.stats.totalFcmFailed ?? 0}
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
          <p className="text-[11px] text-slate-500">Active Devices (Web / Android)</p>
          <p className="mt-1 text-xl font-bold text-emerald-500 tabular-nums">
            {data?.stats.activeWebDevices ?? 0} / {data?.stats.activeAndroidDevices ?? 0}
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
          <p className="text-[11px] text-slate-500">Scheduled Queue</p>
          <p className="mt-1 text-xl font-bold text-amber-500 tabular-nums">
            {data?.stats.totalPendingScheduled ?? 0}
          </p>
        </div>
      </div>

      {/* FCM Server Status Banner */}
      <div
        className={`p-3.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
          data?.fcmConfigured
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
        }`}
      >
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 shrink-0" />
          <span>
            {data?.fcmConfigured
              ? bi(
                  language,
                  'Firebase Admin Service Account কনফিগার করা আছে — Web ও Android-এ আসল FCM পুশ পাঠানো হবে।',
                  'Firebase Service Account configured on server — real FCM HTTP v1 pushes active for Web & Android.'
                )
              : bi(
                  language,
                  'FIREBASE_SERVICE_ACCOUNT_JSON সার্ভারে সেট করা নেই — ইনবক্স ও রিয়েল-টাইম ডেলিভারি কাজ করবে, তবে ব্যাকগ্রাউন্ড FCM পুশের জন্য সার্ভিস অ্যাকাউন্ট সেট করুন।',
                  'FIREBASE_SERVICE_ACCOUNT_JSON is not set yet — In-app Inbox & Realtime work immediately; configure the server secret for background FCM delivery.'
                )}
          </span>
        </div>
        {loading && <span className="text-[11px] opacity-80">Refreshing...</span>}
      </div>

      {/* Compose / Send / Schedule Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 lg:p-6 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BellRing className="w-4 h-4 text-cyan-500" />
            <span>
              {editingScheduledId
                ? bi(language, 'শিডিউল করা নোটিফিকেশন এডিট করুন', 'Edit Scheduled Notification')
                : bi(language, 'নতুন পুশ নোটিফিকেশন পাঠান', 'Compose & Send Push Notification')}
            </span>
          </h3>
          {editingScheduledId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              Cancel Edit
            </button>
          )}
        </div>

        {/* Category Selector */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Notification Category
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {NOTIFICATION_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const active = category === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`p-2.5 rounded-xl border text-left transition-colors flex items-center gap-2 ${
                    active
                      ? cat.badgeClass
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-bold truncate">{cat.labelEn}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Notification Title *
            </label>
            <input
              required
              maxLength={140}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. ৪র্থ সেমিস্টার ফাইনাল পরীক্ষার রুটিন প্রকাশিত"
              className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Click Action Target Page
            </label>
            <select
              value={targetView}
              onChange={(e) => setTargetView(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
            >
              {TARGET_VIEW_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Message Body *
          </label>
          <textarea
            required
            rows={3}
            maxLength={1000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a clear announcement message..."
            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Optional Banner Image URL (HTTPS)
            </label>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/banner.jpg"
              className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Channel / Delivery Sound Mode
            </label>
            <select
              value={soundMode}
              onChange={(e) => setSoundMode(e.target.value as PushSoundMode)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
            >
              <option value="custom">Custom Polytechnic Chime (when supported)</option>
              <option value="default">Default System Sound</option>
              <option value="silent">Silent Notification</option>
            </select>
          </div>
        </div>

        {/* Audience Targeting */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-3">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-cyan-500" />
            <span>Target Audience</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                { id: 'all', label: 'All Registered Users' },
                { id: 'department_semester', label: 'By Department & Semester' },
                { id: 'selected_users', label: 'Selected Specific Users' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setAudienceType(opt.id)}
                className={`min-h-[38px] px-3 py-2 rounded-lg border text-xs font-semibold ${
                  audienceType === opt.id
                    ? 'border-cyan-500 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {audienceType === 'department_semester' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <select
                value={targetDepartment}
                onChange={(e) => setTargetDepartment(e.target.value)}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              >
                <option value="">All Departments</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.shortName} · {d.nameEn}
                  </option>
                ))}
              </select>
              <select
                value={targetSemester}
                onChange={(e) => setTargetSemester(e.target.value)}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              >
                <option value="">All Semesters</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                  <option key={sem} value={sem}>
                    {language === 'en'
                      ? SEMESTER_LABELS_EN[sem as 1]
                      : SEMESTER_LABELS[sem as 1]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {audienceType === 'selected_users' && (
            <div className="space-y-2 pt-1">
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search users by name, email, or department..."
                className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {filteredUsers.map((u) => {
                  const checked = selectedUserIds.includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleUserSelection(u.id)}
                          className="accent-cyan-600"
                        />
                        <span className="font-semibold truncate">{u.fullName}</span>
                        <span className="text-slate-500 truncate">({u.email})</span>
                      </div>
                      <span className="text-[11px] text-slate-400 uppercase shrink-0">
                        {u.department} · S{u.semester}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] text-cyan-600 dark:text-cyan-400 font-semibold">
                {selectedUserIds.length} user(s) selected
              </p>
            </div>
          )}
        </div>

        {/* Immediate vs Schedule */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDeliveryMode('now')}
              className={`min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                deliveryMode === 'now'
                  ? 'border-cyan-500 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Immediately</span>
            </button>
            <button
              type="button"
              onClick={() => setDeliveryMode('schedule')}
              className={`min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                deliveryMode === 'schedule'
                  ? 'border-amber-500 bg-amber-500/12 text-amber-700 dark:text-amber-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <CalendarClock className="w-3.5 h-3.5" />
              <span>Schedule Later</span>
            </button>

            {deliveryMode === 'schedule' && (
              <input
                required
                type="datetime-local"
                value={scheduledForLocal}
                onChange={(e) => setScheduledForLocal(e.target.value)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            )}
          </div>

          <button
            type="submit"
            disabled={sending}
            className="min-h-[42px] inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {sending
                ? 'Processing...'
                : editingScheduledId
                  ? 'Update Scheduled Notification'
                  : deliveryMode === 'schedule'
                    ? 'Schedule Push Campaign'
                    : 'Send Push Notification Now'}
            </span>
          </button>
        </div>
      </form>

      {/* Scheduled Notifications Queue */}
      <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-amber-500" />
          <span>Scheduled Notifications ({data?.scheduled.length ?? 0})</span>
        </h3>

        {!data?.scheduled.length ? (
          <p className="text-xs text-slate-500">No scheduled notifications in queue.</p>
        ) : (
          <div className="space-y-2.5">
            {data.scheduled.map((job) => {
              const meta = getCategoryMeta(job.category);
              return (
                <div
                  key={job.id}
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${meta.badgeClass}`}>
                        {meta.labelEn}
                      </span>
                      <span className="text-[11px] font-bold uppercase text-amber-500">
                        {job.status}
                      </span>
                      <span className="text-[11px] text-slate-400 tabular-nums">
                        For: {new Date(job.scheduledFor).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{job.title}</p>
                    <p className="text-[11px] text-slate-500 line-clamp-2">{job.body}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {job.status !== 'sent' && (
                      <button
                        type="button"
                        onClick={() => handleStartEditScheduled(job)}
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-cyan-600 hover:bg-cyan-500/10"
                        title="Edit scheduled notification"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDeleteScheduled(job.id)}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-red-500 hover:bg-red-500/10"
                      title="Delete scheduled notification"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Sent Notification History & Delivery Stats */}
      <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          Delivery History ({data?.history.length ?? 0})
        </h3>
        {!data?.history.length ? (
          <p className="text-xs text-slate-500">No push campaigns sent yet.</p>
        ) : (
          <div className="space-y-2.5">
            {data.history.map((item) => {
              const meta = getCategoryMeta(item.category);
              return (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${meta.badgeClass}`}>
                        {meta.labelEn}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        Audience: {item.audienceType}
                        {item.targetDepartment ? ` (${item.targetDepartment})` : ''}
                        {item.targetSemester ? ` S${item.targetSemester}` : ''}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{item.title}</p>
                  <p className="text-[11px] text-slate-500">{item.body}</p>
                  <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-slate-500 tabular-nums">
                    <span>Recipients: <strong>{item.totalRecipients}</strong></span>
                    <span>FCM Sent: <strong className="text-emerald-500">{item.fcmSentCount}</strong></span>
                    <span>FCM Failed: <strong className="text-red-500">{item.fcmFailedCount}</strong></span>
                    <span>Target Page: <strong>/{item.targetView}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
