import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  Mail,
  Shield,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { DEPARTMENTS, SEMESTER_LABELS, SEMESTER_LABELS_EN } from '../data/curriculum';
import { bi } from '../i18n/translations';
import {
  isSupabaseConfigured,
  mapSupabaseProfileToAuthUser,
  supabase,
} from '../lib/supabaseClient';
import { apiClient, setStoredToken } from '../services/apiClient';
import {
  AppView,
  AuthUser,
  DepartmentId,
  LanguageMode,
  SemesterNumber,
  UserSettings,
} from '../types/study';

interface ProfileAuthViewProps {
  language: LanguageMode;
  currentUser: AuthUser | null;
  hasAdmin: boolean;
  localSettings: UserSettings;
  isPasswordRecovery: boolean;
  onClearPasswordRecovery: () => void;
  onAuthSuccess: (user: AuthUser) => void;
  onLogout: () => Promise<void> | void;
  onUpdateLocalSettings: (partial: Partial<UserSettings>) => void;
  onNavigate: (view: AppView) => void;
  onAdminClaimed: () => void;
}

const DEFAULT_AVATAR = '/src/assets/images/student_scholar_avatar_1794839047562.jpg';

export const ProfileAuthView: React.FC<ProfileAuthViewProps> = ({
  language,
  currentUser,
  hasAdmin,
  localSettings,
  isPasswordRecovery,
  onClearPasswordRecovery,
  onAuthSuccess,
  onLogout,
  onUpdateLocalSettings,
  onNavigate,
  onAdminClaimed,
}) => {
  const [authTab, setAuthTab] = useState<'login' | 'register' | 'forgot' | 'claim-admin'>('login');
  const [fullName, setFullName] = useState(localSettings.studentName || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState<DepartmentId>(localSettings.department);
  const [semester, setSemester] = useState<SemesterNumber>(localSettings.semester);
  const [collegeName, setCollegeName] = useState('');
  const [rollNumber, setRollNumber] = useState('');

  // Password recovery reset field
  const [newPassword, setNewPassword] = useState('');

  // Editable Profile State
  const [editName, setEditName] = useState(currentUser?.fullName || '');
  const [editDept, setEditDept] = useState(currentUser?.department || localSettings.department);
  const [editSem, setEditSem] = useState(currentUser?.semester || localSettings.semester);
  const [editCollege, setEditCollege] = useState(
    currentUser?.collegeName || currentUser?.instituteName || ''
  );
  const [editRoll, setEditRoll] = useState(currentUser?.rollNumber || '');
  const [editBio, setEditBio] = useState(currentUser?.bio || '');
  const [editGender, setEditGender] = useState<'' | 'male' | 'female'>(currentUser?.gender || '');
  const [editShowGender, setEditShowGender] = useState<boolean>(Boolean(currentUser?.showGender));
  const [editVisibility, setEditVisibility] = useState<'public' | 'department' | 'private'>(
    currentUser?.profileVisibility || 'department'
  );
  const [editAvatarUrl, setEditAvatarUrl] = useState(currentUser?.avatarUrl || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    setEditName(currentUser.fullName);
    setEditDept(currentUser.department);
    setEditSem(currentUser.semester);
    setEditCollege(currentUser.collegeName || currentUser.instituteName || '');
    setEditRoll(currentUser.rollNumber || '');
    setEditBio(currentUser.bio || '');
    setEditGender(currentUser.gender || '');
    setEditShowGender(Boolean(currentUser.showGender));
    setEditVisibility(currentUser.profileVisibility || 'department');
    setEditAvatarUrl(currentUser.avatarUrl || '');
  }, [currentUser]);

  const isSupabaseUser = Boolean(
    isSupabaseConfigured && supabase && currentUser && !currentUser.id.startsWith('usr-')
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (!error && data.user) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .maybeSingle();
          const mapped = mapSupabaseProfileToAuthUser(
            (prof as Record<string, unknown> | null) ?? null,
            data.user
          );
          onAuthSuccess(mapped);
          setSuccessMsg(bi(language, 'সফলভাবে সাইন ইন হয়েছে!', 'Signed in successfully!'));
          return;
        }
        // Fallback to local server login if local account exists (e.g., bootstrap admin)
        try {
          const res = await apiClient.login(email, password);
          setStoredToken(res.token);
          onAuthSuccess(res.user);
          setSuccessMsg(bi(language, 'সফলভাবে সাইন ইন হয়েছে!', 'Signed in successfully!'));
          return;
        } catch {
          throw error ?? new Error('Invalid email or password.');
        }
      } else {
        const res = await apiClient.login(email, password);
        setStoredToken(res.token);
        onAuthSuccess(res.user);
        setSuccessMsg(bi(language, 'সফলভাবে সাইন ইন হয়েছে!', 'Signed in successfully!'));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: fullName.trim(),
              department,
              semester,
              college_name: collegeName.trim(),
            },
          },
        });
        if (error) throw error;
        if (data.user) {
          // Ensure profile row exists if session is immediately active
          if (data.session) {
            await supabase.from('profiles').upsert({
              id: data.user.id,
              full_name: fullName.trim(),
              email: email.trim().toLowerCase(),
              department,
              semester,
              college_name: collegeName.trim(),
              institute_name: collegeName.trim(),
              roll_number: rollNumber.trim(),
            });
            onAuthSuccess(
              mapSupabaseProfileToAuthUser(
                {
                  id: data.user.id,
                  full_name: fullName.trim(),
                  email: email.trim().toLowerCase(),
                  role: 'student',
                  department,
                  semester,
                  college_name: collegeName.trim(),
                  roll_number: rollNumber.trim(),
                },
                data.user
              )
            );
            setSuccessMsg(bi(language, 'নতুন অ্যাকাউন্ট তৈরি ও লগইন সম্পন্ন!', 'Account created & signed in!'));
          } else {
            setSuccessMsg(
              bi(
                language,
                'অ্যাকাউন্ট তৈরি হয়েছে! আপনার ইমেইলে পাঠানো ভেরিফিকেশন লিংকে ক্লিক করে লগইন করুন।',
                'Account created! Please check your email inbox to confirm your address before signing in.'
              )
            );
          }
        }
      } else {
        const res = await apiClient.register({
          fullName,
          email,
          password,
          department,
          semester,
          instituteName: collegeName,
          rollNumber,
        });
        setStoredToken(res.token);
        onAuthSuccess(res.user);
        setSuccessMsg(bi(language, 'নতুন অ্যাকাউন্ট তৈরি হয়েছে!', 'Student account created!'));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!supabase) {
      setErrorMsg('Supabase is not configured in environment variables.');
      return;
    }
    setErrorMsg(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google sign-in failed');
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setErrorMsg(
        bi(
          language,
          'পাসওয়ার্ড রিসেট ইমেইল পাঠাতে Supabase Auth কনফিগার থাকতে হবে।',
          'Password reset emails require Supabase Auth.'
        )
      );
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setSuccessMsg(
        bi(
          language,
          'পাসওয়ার্ড রিসেট লিংক আপনার ইমেইলে পাঠানো হয়েছে।',
          'Password reset link sent! Check your email inbox.'
        )
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRecoveredPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || newPassword.length < 6) {
      setErrorMsg(bi(language, 'নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।', 'Password must be at least 6 characters.'));
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      onClearPasswordRecovery();
      setSuccessMsg(bi(language, 'পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে!', 'Password updated successfully!'));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Password update failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg(bi(language, 'শুধুমাত্র ইমেজ ফাইল (JPG/PNG/WebP) নির্বাচন করুন।', 'Please select an image file.'));
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setErrorMsg(bi(language, 'ছবির আকার ৩ MB-এর কম হতে হবে।', 'Avatar image must be under 3 MB.'));
      return;
    }
    if (!isSupabaseUser || !supabase || !currentUser) {
      setErrorMsg(
        bi(
          language,
          'Supabase অ্যাকাউন্ট দিয়ে লগইন করলে সরাসরি ক্লাউড প্রোফাইল ছবি আপলোড করা যাবে।',
          'Sign in with a Supabase account to upload profile avatars to cloud storage.'
        )
      );
      return;
    }

    setUploadingAvatar(true);
    setErrorMsg(null);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${currentUser.id}/avatar-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadErr) throw uploadErr;

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const nextUrl = pub.publicUrl;
      setEditAvatarUrl(nextUrl);

      await supabase
        .from('profiles')
        .update({ avatar_url: nextUrl, updated_at: new Date().toISOString() })
        .eq('id', currentUser.id);

      onAuthSuccess({ ...currentUser, avatarUrl: nextUrl });
      setSuccessMsg(bi(language, 'প্রোফাইল ছবি আপডেট হয়েছে!', 'Profile photo updated!'));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Avatar upload failed');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      if (isSupabaseUser && supabase) {
        const now = new Date().toISOString();
        const { error } = await supabase.from('profiles').upsert({
          id: currentUser.id,
          email: currentUser.email,
          full_name: editName.trim() || currentUser.fullName,
          department: editDept,
          semester: Number(editSem),
          college_name: editCollege.trim(),
          institute_name: editCollege.trim(),
          roll_number: editRoll.trim(),
          bio: editBio.trim().slice(0, 400),
          gender: editGender,
          show_gender: editShowGender,
          profile_visibility: editVisibility,
          avatar_url: editAvatarUrl,
          updated_at: now,
        });
        if (error) throw error;

        onAuthSuccess({
          ...currentUser,
          fullName: editName.trim() || currentUser.fullName,
          department: editDept,
          semester: Number(editSem),
          collegeName: editCollege.trim(),
          instituteName: editCollege.trim(),
          rollNumber: editRoll.trim(),
          bio: editBio.trim().slice(0, 400),
          gender: editGender,
          showGender: editShowGender,
          profileVisibility: editVisibility,
          avatarUrl: editAvatarUrl,
          updatedAt: now,
        });
      } else {
        const res = await apiClient.updateProfile({
          fullName: editName,
          department: editDept,
          semester: Number(editSem),
          collegeName: editCollege,
          instituteName: editCollege,
          rollNumber: editRoll,
          bio: editBio,
          gender: editGender,
          showGender: editShowGender,
          profileVisibility: editVisibility,
          avatarUrl: editAvatarUrl,
        });
        onAuthSuccess(res.user);
      }

      onUpdateLocalSettings({
        studentName: editName.trim() || currentUser.fullName,
        department: editDept as DepartmentId,
        semester: Number(editSem) as SemesterNumber,
      });
      setSuccessMsg(bi(language, 'প্রোফাইল সংরক্ষণ সম্পন্ন হয়েছে!', 'Profile updated!'));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Profile update failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimFirstAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await apiClient.bootstrapAdmin({
        fullName,
        email,
        password,
      });
      setStoredToken(res.token);
      onAuthSuccess(res.user);
      onAdminClaimed();
      setSuccessMsg(
        bi(
          language,
          'অ্যাডমিন অ্যাকাউন্ট তৈরি হয়েছে! এখন আপনি Admin Panel পরিচালনা করতে পারবেন।',
          'Admin account initialized! You can now manage Polytechnic Hub.'
        )
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Admin setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
          {bi(language, 'শিক্ষার্থী প্রোফাইল ও অ্যাকাউন্ট', 'Student Profile & Account')}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {bi(
            language,
            'Supabase Auth, Google Sign-in, প্রোফাইল ছবি, প্রাইভেসি নিয়ন্ত্রণ এবং অ্যাডমিন পোর্টাল',
            'Supabase Auth, Google Sign-in, profile avatar, privacy controls & Admin access'
          )}
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-300">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {isPasswordRecovery && (
        <form
          onSubmit={handleUpdateRecoveredPassword}
          className="rounded-2xl bg-cyan-500/10 border border-cyan-500/40 p-5 space-y-3"
        >
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-cyan-500" />
            <span>{bi(language, 'নতুন পাসওয়ার্ড সেট করুন', 'Set New Password')}</span>
          </h2>
          <input
            type="password"
            required
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={bi(language, 'নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)', 'New password (min 6 chars)')}
            className="w-full min-h-[42px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold"
          >
            {bi(language, 'পাসওয়ার্ড আপডেট করুন', 'Update Password')}
          </button>
        </form>
      )}

      {currentUser ? (
        <div className="space-y-6">
          {/* Active Profile Card */}
          <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <img
                  src={editAvatarUrl || currentUser.avatarUrl || DEFAULT_AVATAR}
                  alt={currentUser.fullName}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.src = DEFAULT_AVATAR;
                  }}
                  className="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 bg-slate-800"
                />
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleAvatarUpload(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  disabled={uploadingAvatar}
                  onClick={() => avatarInputRef.current?.click()}
                  title={bi(language, 'ছবি পরিবর্তন করুন', 'Change avatar')}
                  className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center shadow"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {currentUser.fullName}
                  </h2>
                  {currentUser.role === 'admin' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-600 dark:text-cyan-400">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Admin
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">{currentUser.email}</p>
                {currentUser.showGender && currentUser.gender && (
                  <p className="text-[11px] text-slate-400 mt-0.5 capitalize">
                    {currentUser.gender}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {currentUser.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => onNavigate('admin')}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold"
                >
                  <Shield className="w-4 h-4" />
                  <span>{bi(language, 'অ্যাডমিন প্যানেল', 'Open Admin Panel')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => void onLogout()}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <LogOut className="w-4 h-4" />
                <span>{bi(language, 'লগ আউট', 'Logout')}</span>
              </button>
            </div>
          </div>

          {/* Update Profile Form */}
          <form
            onSubmit={handleSaveProfile}
            className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {bi(language, 'প্রোফাইল ও প্রাইভেসি তথ্য হালনাগাদ', 'Update Profile & Privacy')}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">
                  {bi(language, 'পূর্ণ নাম', 'Full Name')}
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">
                  {bi(language, 'ডিপার্টমেন্ট / টেকনোলজি', 'Department')}
                </label>
                <select
                  value={editDept}
                  onChange={(e) => setEditDept(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {language === 'en' ? d.nameEn : d.nameBn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">
                  {bi(language, 'সেমিস্টার', 'Semester')}
                </label>
                <select
                  value={editSem}
                  onChange={(e) => setEditSem(Number(e.target.value))}
                  className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                >
                  {([1, 2, 3, 4, 5, 6, 7, 8] as SemesterNumber[]).map((s) => (
                    <option key={s} value={s}>
                      {language === 'en' ? SEMESTER_LABELS_EN[s] : SEMESTER_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">
                  {bi(language, 'বোর্ড রোল নম্বর', 'BTEB Roll Number')}
                </label>
                <input
                  type="text"
                  value={editRoll}
                  onChange={(e) => setEditRoll(e.target.value)}
                  placeholder="654321"
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-mono"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-slate-500">
                  {bi(language, 'পলিটেকনিক ইনস্টিটিউটের নাম', 'College / Polytechnic Institute')}
                </label>
                <input
                  type="text"
                  value={editCollege}
                  onChange={(e) => setEditCollege(e.target.value)}
                  placeholder="e.g. Dhaka Polytechnic Institute"
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-slate-500">
                  {bi(language, 'বায়ো (সংক্ষিপ্ত পরিচয়)', 'Bio')}
                </label>
                <textarea
                  rows={2}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder={bi(language, 'আপনার লক্ষ্য ও আগ্রহের বিষয় লিখুন...', 'Your diploma focus & goals...')}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">
                  {bi(language, 'লিঙ্গ (ঐচ্ছিক)', 'Gender (Optional)')}
                </label>
                <select
                  value={editGender}
                  onChange={(e) => setEditGender(e.target.value as '' | 'male' | 'female')}
                  className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                >
                  <option value="">{bi(language, 'নির্বাচন না করা', 'Prefer not to say')}</option>
                  <option value="male">{bi(language, 'পুরুষ (Male)', 'Male')}</option>
                  <option value="female">{bi(language, 'নারী (Female)', 'Female')}</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" />
                  <span>{bi(language, 'প্রোফাইল প্রাইভেসি', 'Profile Visibility')}</span>
                </label>
                <select
                  value={editVisibility}
                  onChange={(e) =>
                    setEditVisibility(e.target.value as 'public' | 'department' | 'private')
                  }
                  className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                >
                  <option value="public">{bi(language, 'সবার জন্য দৃশ্যমান (Public)', 'Public')}</option>
                  <option value="department">
                    {bi(language, 'ডিপার্টমেন্ট ভিত্তিক (Department)', 'Department Only')}
                  </option>
                  <option value="private">{bi(language, 'শুধু নিজে (Private)', 'Private')}</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={editShowGender}
                onChange={(e) => setEditShowGender(e.target.checked)}
                className="rounded border-slate-400"
              />
              {editShowGender ? (
                <Eye className="w-3.5 h-3.5 text-cyan-500" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>
                {bi(language, 'প্রোফাইলে লিঙ্গ তথ্য প্রদর্শন করুন', 'Display gender on my profile')}
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold"
            >
              {bi(language, 'পরিবর্তন সংরক্ষণ করুন', 'Save Profile')}
            </button>
          </form>
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
          {/* Tabs */}
          <div className="flex flex-wrap gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setAuthTab('login')}
              className={`flex-1 min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold ${
                authTab === 'login'
                  ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <LogIn className="w-3.5 h-3.5 inline mr-1" />
              {bi(language, 'সাইন ইন', 'Sign In')}
            </button>
            <button
              type="button"
              onClick={() => setAuthTab('register')}
              className={`flex-1 min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold ${
                authTab === 'register'
                  ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 inline mr-1" />
              {bi(language, 'নতুন অ্যাকাউন্ট', 'Sign Up')}
            </button>
            <button
              type="button"
              onClick={() => setAuthTab('forgot')}
              className={`flex-1 min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold ${
                authTab === 'forgot'
                  ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Mail className="w-3.5 h-3.5 inline mr-1" />
              {bi(language, 'পাসওয়ার্ড ভুলে গেছি', 'Forgot')}
            </button>
            {!hasAdmin && (
              <button
                type="button"
                onClick={() => setAuthTab('claim-admin')}
                className={`flex-1 min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  authTab === 'claim-admin'
                    ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5 inline mr-1" />
                Admin Setup
              </button>
            )}
          </div>

          {/* Google OAuth Sign-In */}
          {isSupabaseConfigured && (authTab === 'login' || authTab === 'register') && (
            <div className="space-y-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleGoogleSignIn()}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-cyan-500/50 text-sm font-semibold text-slate-800 dark:text-white transition-colors"
              >
                <span className="font-bold text-cyan-500">G</span>
                <span>{bi(language, 'Google দিয়ে সাইন ইন করুন', 'Continue with Google')}</span>
              </button>
              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                <span>{bi(language, 'অথবা ইমেইল ব্যবহার করুন', 'OR USE EMAIL')}</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
              </div>
            </div>
          )}

          {authTab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@example.com"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-bold"
              >
                {loading
                  ? bi(language, 'প্রক্রিয়া চলছে...', 'Signing in...')
                  : bi(language, 'সাইন ইন করুন', 'Sign In')}
              </button>
            </form>
          )}

          {authTab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">
                    {bi(language, 'পূর্ণ নাম', 'Full Name')}
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">
                    {bi(language, 'পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)', 'Password (min 6 chars)')}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">
                    {bi(language, 'ডিপার্টমেন্ট', 'Department')}
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value as DepartmentId)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {language === 'en' ? d.nameEn : d.nameBn}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">
                    {bi(language, 'সেমিস্টার', 'Semester')}
                  </label>
                  <select
                    value={semester}
                    onChange={(e) => setSemester(Number(e.target.value) as SemesterNumber)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                  >
                    {([1, 2, 3, 4, 5, 6, 7, 8] as SemesterNumber[]).map((s) => (
                      <option key={s} value={s}>
                        {language === 'en' ? SEMESTER_LABELS_EN[s] : SEMESTER_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">
                    {bi(language, 'কলেজ / পলিটেকনিক', 'College / Institute')}
                  </label>
                  <input
                    type="text"
                    value={collegeName}
                    onChange={(e) => setCollegeName(e.target.value)}
                    placeholder="e.g. Dhaka Polytechnic Institute"
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-bold"
              >
                {loading
                  ? bi(language, 'অ্যাকাউন্ট তৈরি হচ্ছে...', 'Creating account...')
                  : bi(language, 'নিবন্ধন সম্পন্ন করুন', 'Create Account')}
              </button>
            </form>
          )}

          {authTab === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-3.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {bi(
                  language,
                  'আপনার নিবন্ধিত ইমেইল লিখুন। পাসওয়ার্ড রিসেট করার লিংক পাঠানো হবে।',
                  'Enter your registered email address to receive a password reset link.'
                )}
              </p>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-bold"
              >
                {bi(language, 'রিসেট লিংক পাঠান', 'Send Password Reset Link')}
              </button>
            </form>
          )}

          {authTab === 'claim-admin' && !hasAdmin && (
            <form onSubmit={handleClaimFirstAdmin} className="space-y-3.5">
              <p className="text-xs text-amber-600 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl">
                {bi(
                  language,
                  'প্ল্যাটফর্মে এখনো কোনো লোকাল অ্যাডমিন নেই। প্রথম অ্যাডমিন অ্যাকাউন্ট তৈরি করলে আপনি Formula Hub, AI Config, Notices ও User Roles পরিচালনা করতে পারবেন।',
                  'No local administrator is configured yet. Claim the first Admin role to manage Formulas, AI Config, Notices & Users.'
                )}
              </p>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Admin Name"
                className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
              />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@polytechnichub.com"
                className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
              />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Strong Admin Password (min 6 chars)"
                className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold"
              >
                Claim First Admin Account
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
