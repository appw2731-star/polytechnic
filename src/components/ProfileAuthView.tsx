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
  formatFirebaseAuthError,
  isFirebaseAuthConfigured,
  registerWithEmailFirebase,
  sendPasswordResetFirebase,
  signInWithEmailFirebase,
  signInWithGoogleUnified,
} from '../lib/firebaseAuth';
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      if (isFirebaseAuthConfigured) {
        try {
          const cred = await signInWithEmailFirebase(email, password);
          const synced = await apiClient.firebaseSync({ idToken: cred.idToken });
          setStoredToken(synced.token);
          onAuthSuccess(synced.user);
          setSuccessMsg(bi(language, 'সফলভাবে সাইন ইন হয়েছে!', 'Signed in successfully!'));
          return;
        } catch (fbErr: unknown) {
          const code =
            fbErr && typeof fbErr === 'object' && 'code' in fbErr
              ? String((fbErr as { code?: string }).code)
              : '';
          if (
            code === 'auth/user-not-found' ||
            code === 'auth/invalid-credential' ||
            code === 'auth/wrong-password'
          ) {
            try {
              const res = await apiClient.login(email, password);
              setStoredToken(res.token);
              onAuthSuccess(res.user);
              setSuccessMsg(bi(language, 'সফলভাবে সাইন ইন হয়েছে!', 'Signed in successfully!'));
              return;
            } catch {
              throw new Error(formatFirebaseAuthError(fbErr, language));
            }
          }
          throw new Error(formatFirebaseAuthError(fbErr, language));
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
      if (isFirebaseAuthConfigured) {
        const cred = await registerWithEmailFirebase(email, password, fullName);
        const synced = await apiClient.firebaseSync({
          idToken: cred.idToken,
          fullName: fullName.trim(),
          department,
          semester,
          collegeName: collegeName.trim(),
          rollNumber: rollNumber.trim(),
        });
        setStoredToken(synced.token);
        onAuthSuccess(synced.user);
        setSuccessMsg(
          bi(language, 'নতুন অ্যাকাউন্ট তৈরি ও সাইন ইন সম্পন্ন!', 'Account created & signed in!')
        );
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
      setErrorMsg(
        isFirebaseAuthConfigured
          ? formatFirebaseAuthError(err, language)
          : err instanceof Error
            ? err.message
            : 'Registration failed'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!isFirebaseAuthConfigured) {
      setErrorMsg(
        bi(
          language,
          'Google সাইন-ইন চালু করতে .env-এ Firebase Web Config (VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID) যোগ করুন এবং Firebase Console-এ বর্তমান ডোমেইন Authorized domains-এ যুক্ত করুন।',
          'To enable Google Sign-In, configure VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_APP_ID in .env and add your app domain under Firebase Console -> Authentication -> Authorized domains.'
        )
      );
      return;
    }

    setLoading(true);
    try {
      const outcome = await signInWithGoogleUnified();
      if (outcome.redirected) {
        // Browser will navigate to Google OAuth and return via consumeGoogleRedirectResult
        return;
      }
      if (!outcome.idToken) {
        throw new Error('Missing Firebase ID token after Google Sign-In.');
      }
      const synced = await apiClient.firebaseSync({
        idToken: outcome.idToken,
        department,
        semester,
        collegeName: collegeName.trim(),
        rollNumber: rollNumber.trim(),
      });
      setStoredToken(synced.token);
      onAuthSuccess(synced.user);
      setSuccessMsg(
        bi(language, 'Google অ্যাকাউন্ট দিয়ে সফলভাবে লগইন হয়েছে!', 'Signed in with Google!')
      );
    } catch (err) {
      setErrorMsg(formatFirebaseAuthError(err, language));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFirebaseAuthConfigured) {
      setErrorMsg(
        bi(
          language,
          'পাসওয়ার্ড রিসেট ইমেইল পাঠাতে Firebase Authentication কনফিগার থাকতে হবে।',
          'Password reset emails require Firebase Authentication.'
        )
      );
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      await sendPasswordResetFirebase(email.trim());
      setSuccessMsg(
        bi(
          language,
          'পাসওয়ার্ড রিসেট লিংক আপনার ইমেইলে পাঠানো হয়েছে। ইনবক্স বা স্প্যাম ফোল্ডার দেখুন।',
          'Password reset link sent! Check your email inbox or spam folder.'
        )
      );
    } catch (err) {
      setErrorMsg(formatFirebaseAuthError(err, language));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRecoveredPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setNewPassword('');
    onClearPasswordRecovery();
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
    if (!currentUser) return;

    setUploadingAvatar(true);
    setErrorMsg(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const maxDim = 256;
            const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Canvas unavailable'));
              return;
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
          };
          img.onerror = () => reject(new Error('Invalid image file'));
          img.src = String(reader.result || '');
        };
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
      });

      const res = await apiClient.updateProfile({ avatarUrl: dataUrl });
      setEditAvatarUrl(res.user.avatarUrl || dataUrl);
      onAuthSuccess(res.user);
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
            'Firebase Auth, Google Sign-in, প্রোফাইল ছবি, প্রাইভেসি নিয়ন্ত্রণ এবং অ্যাডমিন পোর্টাল',
            'Firebase Auth, Google Sign-in, profile avatar, privacy controls & Admin access'
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

          {/* Google OAuth Sign-In (Visible on both Sign In and Sign Up) */}
          {(authTab === 'login' || authTab === 'register') && (
            <div className="space-y-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleGoogleSignIn()}
                className="w-full min-h-[46px] inline-flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-cyan-500 text-sm font-semibold text-slate-800 dark:text-white shadow-xs transition-colors disabled:opacity-60"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                <span>
                  {loading
                    ? bi(language, 'Google-এ সংযুক্ত হচ্ছে...', 'Connecting with Google...')
                    : bi(language, 'Google দিয়ে চালিয়ে যান', 'Continue with Google')}
                </span>
              </button>
              {!isFirebaseAuthConfigured && (
                <p className="text-[11px] text-amber-600 dark:text-amber-300 text-center">
                  {bi(
                    language,
                    'Google Sign-In সক্রিয় করতে Firebase Web Env Keys প্রয়োজন — নিচে ইমেইল ও পাসওয়ার্ড দিয়ে এখনই লগইন/সাইনআপ করা যাবে।',
                    'Google Sign-In requires Firebase Web Env Keys; Email & Password login works immediately below.'
                  )}
                </p>
              )}
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
