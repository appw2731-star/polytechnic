import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  GraduationCap,
  HelpCircle,
  ImagePlus,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  Mail,
  MessageSquare,
  Pencil,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { DEPARTMENTS, SEMESTER_LABELS, SEMESTER_LABELS_EN } from '../data/curriculum';
import { BANGLADESH_POLYTECHNICS } from '../data/polytechnics';
import { bi } from '../i18n/translations';
import {
  FIREBASE_OAUTH_REDIRECT_URI,
  formatFirebaseAuthError,
  isFirebaseAuthConfigured,
  registerWithEmailFirebase,
  sendPasswordResetFirebase,
  signInWithEmailFirebase,
  signInWithFacebookUnified,
  signInWithGoogleUnified,
  syncFirebaseUserToSupabaseProfile,
} from '../lib/firebaseAuth';
import { apiClient, setStoredToken } from '../services/apiClient';
import {
  AppView,
  AuthUser,
  CommunityPost,
  DepartmentId,
  LanguageMode,
  SemesterNumber,
  UserSettings,
} from '../types/study';
import { formatDateBn, toBnDigits } from '../utils/formatBn';
import { compressImageFile } from '../utils/imageCompress';

interface ProfileAuthViewProps {
  language: LanguageMode;
  currentUser: AuthUser | null;
  hasAdmin: boolean;
  localSettings: UserSettings;
  isPasswordRecovery: boolean;
  onClearPasswordRecovery: () => void;
  onAuthSuccess: (user: AuthUser) => void;
  onProfileUpdated?: (user: AuthUser) => void;
  onLogout: () => Promise<void> | void;
  onUpdateLocalSettings: (partial: Partial<UserSettings>) => void;
  onNavigate: (view: AppView) => void;
  onAdminClaimed: () => void;
}

const DEFAULT_AVATAR = '/src/assets/images/student_scholar_avatar_1794839047562.jpg';
const PROFILE_SETUP_DISMISSED_KEY = 'polytechnic_hub_profile_setup_dismissed_v1';

function readDismissedSetupUserIds(): string[] {
  try {
    const raw = localStorage.getItem(PROFILE_SETUP_DISMISSED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function markProfileSetupDismissed(userId: string): void {
  try {
    const existing = readDismissedSetupUserIds();
    if (!existing.includes(userId)) {
      localStorage.setItem(PROFILE_SETUP_DISMISSED_KEY, JSON.stringify([...existing, userId]));
    }
  } catch {
    // ignore storage quota errors
  }
}

export const ProfileAuthView: React.FC<ProfileAuthViewProps> = ({
  language,
  currentUser,
  hasAdmin: _hasAdmin,
  localSettings,
  isPasswordRecovery,
  onClearPasswordRecovery,
  onAuthSuccess,
  onProfileUpdated,
  onLogout,
  onUpdateLocalSettings,
  onNavigate,
  onAdminClaimed: _onAdminClaimed,
}) => {
  const [authTab, setAuthTab] = useState<'register' | 'login' | 'forgot'>('register');
  const [profileTab, setProfileTab] = useState<'posts' | 'about'>('posts');

  // Auth form fields — always start blank (zero demo pre-fill)
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState<DepartmentId>(localSettings.department);
  const [semester, setSemester] = useState<SemesterNumber>(localSettings.semester);
  const [collegeName, setCollegeName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
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
    currentUser?.profileVisibility || 'public'
  );
  const [editAvatarUrl, setEditAvatarUrl] = useState(
    currentUser?.avatarUrl || localSettings.avatarDataUrl || ''
  );
  const [editCoverUrl, setEditCoverUrl] = useState(
    currentUser?.coverUrl || localSettings.coverDataUrl || ''
  );
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Facebook-style Profile Timeline Posts
  const [myPosts, setMyPosts] = useState<CommunityPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postBody, setPostBody] = useState('');
  const [postSubjectTag, setPostSubjectTag] = useState('');
  const [postImage, setPostImage] = useState<string>('');
  const [posting, setPosting] = useState(false);

  const [loading, setLoading] = useState(false);
  const [activeSocialProvider, setActiveSocialProvider] = useState<'google' | 'facebook' | null>(null);
  const [showFacebookGuide, setShowFacebookGuide] = useState(false);
  const [copiedRedirectUri, setCopiedRedirectUri] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState<boolean>(() =>
    currentUser ? readDismissedSetupUserIds().includes(currentUser.id) : false
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const postImageInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const lastSyncedUserKeyRef = useRef<string>('');
  const autoOpenedSetupForUserRef = useRef<string>('');

  const applyProfileUpdated = useCallback(
    (updatedUser: AuthUser) => {
      if (onProfileUpdated) {
        onProfileUpdated(updatedUser);
      } else {
        onAuthSuccess(updatedUser);
      }
    },
    [onProfileUpdated, onAuthSuccess]
  );

  useEffect(() => {
    if (!currentUser) {
      lastSyncedUserKeyRef.current = '';
      autoOpenedSetupForUserRef.current = '';
      setSetupDismissed(false);
      return;
    }
    const isDismissed = readDismissedSetupUserIds().includes(currentUser.id);
    setSetupDismissed(isDismissed);

    const hasInstitute = Boolean((currentUser.collegeName || currentUser.instituteName || '').trim());
    if (
      currentUser.firebaseUid &&
      !hasInstitute &&
      !isDismissed &&
      autoOpenedSetupForUserRef.current !== currentUser.id
    ) {
      autoOpenedSetupForUserRef.current = currentUser.id;
      setProfileTab('about');
    }

    const syncKey = `${currentUser.id}:${currentUser.updatedAt || ''}:${currentUser.fullName}:${currentUser.department}:${currentUser.semester}`;
    if (lastSyncedUserKeyRef.current === syncKey) return;
    lastSyncedUserKeyRef.current = syncKey;

    setEditName(currentUser.fullName || '');
    setEditDept(currentUser.department || localSettings.department);
    setEditSem(currentUser.semester || localSettings.semester);
    setEditCollege(currentUser.collegeName || currentUser.instituteName || '');
    setEditRoll(currentUser.rollNumber || '');
    setEditBio(currentUser.bio || '');
    setEditGender(currentUser.gender || '');
    setEditShowGender(Boolean(currentUser.showGender));
    setEditVisibility(currentUser.profileVisibility || 'public');
    setEditAvatarUrl(currentUser.avatarUrl || localSettings.avatarDataUrl || '');
    setEditCoverUrl(currentUser.coverUrl || localSettings.coverDataUrl || '');
  }, [currentUser, localSettings.department, localSettings.semester, localSettings.avatarDataUrl, localSettings.coverDataUrl]);

  const loadMyPosts = useCallback(async () => {
    if (!currentUser) {
      setMyPosts([]);
      return;
    }
    setPostsLoading(true);
    try {
      const res = await apiClient.getPublicProfile(currentUser.id);
      setMyPosts(res.posts || []);
    } catch {
      try {
        const all = await apiClient.getCommunityPosts(false);
        setMyPosts(all.posts.filter((p) => p.authorId === currentUser.id));
      } catch {
        // Offline or unavailable
      }
    } finally {
      setPostsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void loadMyPosts();
  }, [loadMyPosts]);

  const isFirebaseEmailFallbackError = (err: unknown): boolean => {
    const code =
      err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : '';
    return (
      !code ||
      code === 'auth/operation-not-allowed' ||
      code === 'auth/configuration-not-found' ||
      code === 'auth/unauthorized-domain' ||
      code === 'auth/network-request-failed' ||
      code === 'auth/internal-error' ||
      code === 'auth/invalid-api-key' ||
      code === 'auth/user-not-found' ||
      code === 'auth/invalid-credential' ||
      code === 'auth/wrong-password'
    );
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      if (isFirebaseAuthConfigured) {
        try {
          const cred = await signInWithEmailFirebase(email, password);
          const synced = await syncFirebaseUserToSupabaseProfile(cred.user);
          setStoredToken(synced.token);
          onAuthSuccess(synced.user);
          setSuccessMsg(bi(language, 'সফলভাবে সাইন ইন হয়েছে!', 'Signed in successfully!'));
          return;
        } catch (fbErr: unknown) {
          if (isFirebaseEmailFallbackError(fbErr)) {
            try {
              const res = await apiClient.login(email, password);
              setStoredToken(res.token);
              onAuthSuccess(res.user);
              setSuccessMsg(bi(language, 'সফলভাবে সাইন ইন হয়েছে!', 'Signed in successfully!'));
              return;
            } catch (localErr) {
              const fbCode =
                fbErr && typeof fbErr === 'object' && 'code' in fbErr
                  ? String((fbErr as { code?: string }).code)
                  : '';
              if (
                fbCode === 'auth/operation-not-allowed' ||
                fbCode === 'auth/configuration-not-found' ||
                fbCode === 'auth/unauthorized-domain'
              ) {
                throw localErr;
              }
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
        try {
          const cred = await registerWithEmailFirebase(email, password, fullName);
          const synced = await syncFirebaseUserToSupabaseProfile(cred.user, {
            fullName: fullName.trim(),
            department,
            semester,
            collegeName: collegeName.trim(),
            rollNumber: rollNumber.trim(),
          });
          setStoredToken(synced.token);
          onAuthSuccess(synced.user);
          setSuccessMsg(
            bi(
              language,
              'আপনার স্টুডেন্ট প্রোফাইল তৈরি হয়েছে! এখন কমিউনিটিতে পোস্ট করতে পারবেন।',
              'Your student profile is ready! You can now post in the community.'
            )
          );
          return;
        } catch (fbErr: unknown) {
          const fbCode =
            fbErr && typeof fbErr === 'object' && 'code' in fbErr
              ? String((fbErr as { code?: string }).code)
              : '';
          // Preserve real validation errors like weak-password or email-already-in-use
          if (fbCode === 'auth/email-already-in-use' || fbCode === 'auth/weak-password' || fbCode === 'auth/invalid-email') {
            throw new Error(formatFirebaseAuthError(fbErr, language));
          }
          // Fall back cleanly to built-in Polytechnic Hub account registration
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
          setSuccessMsg(
            bi(
              language,
              'আপনার স্টুডেন্ট প্রোফাইল তৈরি হয়েছে! এখন কমিউনিটিতে পোস্ট করতে পারবেন।',
              'Your student profile is ready! You can now post in the community.'
            )
          );
          return;
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
        setSuccessMsg(
          bi(
            language,
            'আপনার স্টুডেন্ট প্রোফাইল তৈরি হয়েছে! এখন কমিউনিটিতে পোস্ট করতে পারবেন।',
            'Your student profile is ready! You can now post in the community.'
          )
        );
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : bi(language, 'অ্যাকাউন্ট তৈরি করতে সমস্যা হয়েছে।', 'Registration failed')
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
          'Google সাইন-ইন কনফিগার করা নেই — নিচের ফর্ম দিয়ে দ্রুত নতুন প্রোফাইল খুলুন অথবা লগইন করুন।',
          'Google Sign-In is not configured — use the Email form below to create your profile.'
        )
      );
      return;
    }

    setLoading(true);
    setActiveSocialProvider('google');
    try {
      const outcome = await signInWithGoogleUnified();
      if (outcome.redirected) return;
      if (!outcome.syncedUser || !outcome.token) {
        throw new Error('Missing synced user profile after Google Sign-In.');
      }
      setStoredToken(outcome.token);
      onAuthSuccess(outcome.syncedUser);
      if (!outcome.syncedUser.collegeName && !outcome.syncedUser.instituteName) {
        setProfileTab('about');
      }
      setSuccessMsg(
        bi(
          language,
          `স্বাগতম ${outcome.syncedUser.fullName}! আপনার Google নাম ও ছবি যুক্ত হয়েছে — নিচে থেকে প্রোফাইল কাস্টমাইজ করতে বা স্কিপ করতে পারেন।`,
          `Welcome ${outcome.syncedUser.fullName}! Your Google name & photo are imported — customize your profile below or skip for now.`
        )
      );
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : '';
      if (code === 'auth/unauthorized-domain' || code === 'auth/operation-not-allowed') {
        setErrorMsg(
          bi(
            language,
            `${formatFirebaseAuthError(err, language)} — বিকল্প হিসেবে নিচের ইমেইল ফর্ম দিয়ে সাথে সাথে নতুন প্রোফাইল খুলতে বা লগইন করতে পারবেন।`,
            `${formatFirebaseAuthError(err, language)} — You can still create your profile or sign in immediately using the Email form below.`
          )
        );
      } else {
        setErrorMsg(formatFirebaseAuthError(err, language));
      }
    } finally {
      setLoading(false);
      setActiveSocialProvider(null);
    }
  };

  const handleFacebookSignIn = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!isFirebaseAuthConfigured) {
      setShowFacebookGuide(true);
      setErrorMsg(
        bi(
          language,
          'Facebook লগইন চালু করতে Firebase Authentication কনফিগার থাকতে হবে। নিচের সেটআপ গাইড দেখুন।',
          'Firebase Authentication must be configured for Facebook Login. See the setup guide below.'
        )
      );
      return;
    }

    setLoading(true);
    setActiveSocialProvider('facebook');
    try {
      const outcome = await signInWithFacebookUnified();
      if (outcome.redirected) return;
      if (!outcome.syncedUser || !outcome.token) {
        throw new Error('Missing synced user profile after Facebook Sign-In.');
      }
      setStoredToken(outcome.token);
      onAuthSuccess(outcome.syncedUser);
      if (!outcome.syncedUser.collegeName && !outcome.syncedUser.instituteName) {
        setProfileTab('about');
      }
      setSuccessMsg(
        bi(
          language,
          `স্বাগতম ${outcome.syncedUser.fullName}! আপনার Facebook নাম ও ছবি যুক্ত হয়েছে — নিচে থেকে প্রোফাইল কাস্টমাইজ করতে বা স্কিপ করতে পারেন।`,
          `Welcome ${outcome.syncedUser.fullName}! Your Facebook name & photo are imported — customize your profile below or skip for now.`
        )
      );
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : '';
      if (
        code === 'auth/operation-not-allowed' ||
        code === 'auth/configuration-not-found' ||
        code === 'auth/unauthorized-domain'
      ) {
        setShowFacebookGuide(true);
      }
      setErrorMsg(formatFirebaseAuthError(err, language));
    } finally {
      setLoading(false);
      setActiveSocialProvider(null);
    }
  };

  const handleCopyRedirectUri = async () => {
    try {
      await navigator.clipboard.writeText(FIREBASE_OAUTH_REDIRECT_URI);
      setCopiedRedirectUri(true);
      window.setTimeout(() => setCopiedRedirectUri(false), 2000);
    } catch {
      // clipboard blocked
    }
  };

  const handleSkipInitialSetup = () => {
    if (currentUser) {
      markProfileSetupDismissed(currentUser.id);
    }
    setSetupDismissed(true);
    setProfileTab('posts');
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
          'পাসওয়ার্ড রিসেট লিংক আপনার ইমেইলে পাঠানো হয়েছে।',
          'Password reset link sent to your email.'
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
    if (!file || !currentUser) return;
    setUploadingAvatar(true);
    setErrorMsg(null);
    try {
      const dataUrl = await compressImageFile(file, { maxWidth: 280, maxHeight: 280, quality: 0.84 });
      const res = await apiClient.updateProfile({ avatarUrl: dataUrl });
      setEditAvatarUrl(res.user.avatarUrl || dataUrl);
      applyProfileUpdated(res.user);
      onUpdateLocalSettings({ avatarDataUrl: dataUrl });
      setSuccessMsg(bi(language, 'প্রোফাইল ছবি আপডেট হয়েছে!', 'Profile photo updated!'));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Avatar upload failed');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleCoverUpload = async (file: File | null) => {
    if (!file || !currentUser) return;
    setUploadingCover(true);
    setErrorMsg(null);
    try {
      const dataUrl = await compressImageFile(file, { maxWidth: 1100, maxHeight: 420, quality: 0.8 });
      const res = await apiClient.updateProfile({ coverUrl: dataUrl });
      setEditCoverUrl(res.user.coverUrl || dataUrl);
      applyProfileUpdated(res.user);
      onUpdateLocalSettings({ coverDataUrl: dataUrl });
      setSuccessMsg(bi(language, 'কভার ফটো আপডেট হয়েছে!', 'Cover photo updated!'));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Cover upload failed');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSelectPostPhoto = async (file: File | null) => {
    if (!file) return;
    setErrorMsg(null);
    try {
      const dataUrl = await compressImageFile(file, { maxWidth: 960, maxHeight: 960, quality: 0.78 });
      setPostImage(dataUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not attach image');
    }
  };

  const handlePublishFromProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!postBody.trim() && !postImage) {
      setErrorMsg(bi(language, 'পোস্টের লেখা বা একটি ছবি যোগ করুন।', 'Write something or add a photo.'));
      return;
    }

    setPosting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await apiClient.createCommunityPost({
        body: postBody.trim(),
        imageUrl: postImage || undefined,
        department: currentUser.department || localSettings.department,
        semester: currentUser.semester || localSettings.semester,
        subjectTag: postSubjectTag.trim(),
      });
      setMyPosts((prev) => [res.post, ...prev]);
      setPostBody('');
      setPostSubjectTag('');
      setPostImage('');
      setSuccessMsg(
        bi(
          language,
          'পোস্টটি আপনার প্রোফাইল ও স্টুডেন্ট কমিউনিটিতে প্রকাশিত হয়েছে!',
          'Published to your profile and Student Community!'
        )
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not publish post');
    } finally {
      setPosting(false);
    }
  };

  const handleToggleLikeMyPost = async (postId: string) => {
    try {
      const res = await apiClient.toggleLikeCommunityPost(postId);
      setMyPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
    } catch {
      // ignore
    }
  };

  const handleDeleteMyPost = async (postId: string) => {
    try {
      await apiClient.deleteCommunityPost(postId);
      setMyPosts((prev) => prev.filter((p) => p.id !== postId));
      setSuccessMsg(bi(language, 'পোস্ট মুছে ফেলা হয়েছে।', 'Post deleted.'));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not delete post');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setErrorMsg(bi(language, 'আপনার পূর্ণ নাম লিখুন।', 'Please enter your full name.'));
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await apiClient.updateProfile({
        fullName: trimmedName,
        department: editDept,
        semester: Number(editSem),
        collegeName: editCollege.trim(),
        instituteName: editCollege.trim(),
        rollNumber: editRoll.trim(),
        bio: editBio.trim(),
        gender: editGender,
        showGender: editShowGender,
        profileVisibility: editVisibility,
        avatarUrl: editAvatarUrl,
        coverUrl: editCoverUrl,
      });
      const updatedUser: AuthUser = {
        ...res.user,
        email: res.user.email || currentUser.email,
        firebaseUid: res.user.firebaseUid || currentUser.firebaseUid,
        authProvider: res.user.authProvider || currentUser.authProvider,
      };
      markProfileSetupDismissed(updatedUser.id);
      setSetupDismissed(true);
      applyProfileUpdated(updatedUser);

      onUpdateLocalSettings({
        studentName: updatedUser.fullName || trimmedName,
        collegeName: updatedUser.collegeName || updatedUser.instituteName || editCollege.trim(),
        department: (updatedUser.department || editDept) as DepartmentId,
        semester: Number(updatedUser.semester || editSem) as SemesterNumber,
        avatarDataUrl: updatedUser.avatarUrl || editAvatarUrl || localSettings.avatarDataUrl,
        coverDataUrl: updatedUser.coverUrl || editCoverUrl || localSettings.coverDataUrl,
      });
      setSuccessMsg(
        bi(
          language,
          'প্রোফাইল কাস্টমাইজেশন সংরক্ষণ সম্পন্ন হয়েছে! এখন স্টুডেন্ট কমিউনিটিতে পোস্ট করতে পারবেন।',
          'Profile changes saved! You can now post in Student Community.'
        )
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Profile update failed');
    } finally {
      setLoading(false);
    }
  };

  const currentDeptObj = DEPARTMENTS.find(
    (d) => d.id === (currentUser?.department || localSettings.department)
  );
  const currentSemNum = (currentUser?.semester || localSettings.semester) as SemesterNumber;
  const connectedProviderLabel = currentUser
    ? currentUser.authProvider === 'facebook'
      ? 'Facebook'
      : currentUser.authProvider === 'google' || currentUser.firebaseUid
      ? 'Google'
      : ''
    : '';
  const needsFirstTimeSetup = Boolean(
    currentUser &&
      !setupDismissed &&
      currentUser.firebaseUid &&
      !(currentUser.collegeName || currentUser.instituteName || '').trim()
  );

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-300 flex items-center justify-between gap-2">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} aria-label="Close error">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </span>
          <div className="flex items-center gap-2">
            {currentUser && (
              <button
                type="button"
                onClick={() => onNavigate('community')}
                className="min-h-[34px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
              >
                {bi(language, 'কমিউনিটিতে যান', 'Go to Community')}
              </button>
            )}
            <button type="button" onClick={() => setSuccessMsg(null)} aria-label="Close notice">
              <X className="w-4 h-4" />
            </button>
          </div>
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
        <div className="space-y-5">
          {/* Facebook-Style Cover + Avatar Header Card */}
          <section className="rounded-3xl overflow-hidden bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-sm">
            {/* Cover Banner */}
            <div className="relative h-40 sm:h-52 w-full bg-gradient-to-br from-[#0f172a] via-[#134e6f] to-[#0e7490]">
              {editCoverUrl && (
                <img
                  src={editCoverUrl}
                  alt={bi(language, 'কভার ফটো', 'Cover photo')}
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />

              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleCoverUpload(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                disabled={uploadingCover}
                onClick={() => coverInputRef.current?.click()}
                className="absolute bottom-3 right-3 min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-950/75 hover:bg-slate-950/90 text-white text-xs font-semibold backdrop-blur-xs border border-white/15"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>
                  {uploadingCover
                    ? bi(language, 'আপলোড হচ্ছে...', 'Uploading...')
                    : bi(language, 'কভার ফটো পরিবর্তন', 'Edit Cover Photo')}
                </span>
              </button>
            </div>

            {/* Avatar + Name + Action Row */}
            <div className="px-5 sm:px-6 pb-5">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-12 sm:-mt-14 relative z-10">
                <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                  <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0">
                    <img
                      src={editAvatarUrl || currentUser.avatarUrl || DEFAULT_AVATAR}
                      alt={currentUser.fullName}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.src = DEFAULT_AVATAR;
                      }}
                      className="w-full h-full rounded-full object-cover ring-4 ring-white dark:ring-[#111827] bg-slate-800 shadow-lg"
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
                      title={bi(language, 'প্রোফাইল ছবি পরিবর্তন করুন', 'Change profile photo')}
                      className="absolute bottom-0.5 right-0.5 w-9 h-9 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center shadow-md ring-2 ring-white dark:ring-[#111827]"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-1 pb-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                        {currentUser.fullName}
                      </h1>
                      {currentUser.role === 'admin' && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-cyan-600 dark:text-cyan-400">
                          <ShieldCheck className="w-4 h-4" />
                          Admin
                        </span>
                      )}
                    </div>
                    {(currentUser.email || connectedProviderLabel) && (
                      <p className="text-xs font-medium text-cyan-700 dark:text-cyan-400 flex items-center gap-1.5 break-all">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {currentUser.email ||
                            bi(
                              language,
                              `${connectedProviderLabel} অ্যাকাউন্ট সংযুক্ত`,
                              `Connected via ${connectedProviderLabel}`
                            )}
                        </span>
                        {currentUser.email && connectedProviderLabel && (
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            · {connectedProviderLabel}
                          </span>
                        )}
                      </p>
                    )}
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                      {currentUser.collegeName || currentUser.instituteName || bi(language, 'পলিটেকনিক শিক্ষার্থী', 'Polytechnic Student')}
                      {' · '}
                      {language === 'en' ? currentDeptObj?.nameEn : currentDeptObj?.nameBn}
                      {' · '}
                      {language === 'en' ? SEMESTER_LABELS_EN[currentSemNum] : SEMESTER_LABELS[currentSemNum]}
                    </p>
                    {currentUser.bio && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">
                        {currentUser.bio}
                      </p>
                    )}
                  </div>
                </div>

                {/* Primary Profile Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileTab('posts');
                      window.setTimeout(() => composerRef.current?.focus(), 60);
                    }}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{bi(language, 'নতুন পোস্ট লিখুন', 'Create Post')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfileTab(profileTab === 'about' ? 'posts' : 'about')}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>{bi(language, 'প্রোফাইল এডিট', 'Edit Profile')}</span>
                  </button>
                  {currentUser.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => onNavigate('admin')}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>Admin</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void onLogout()}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{bi(language, 'লগ আউট', 'Logout')}</span>
                  </button>
                </div>
              </div>

              {/* Facebook-Style Profile Tabs */}
              <div className="mt-5 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setProfileTab('posts')}
                    className={`min-h-[42px] px-4 text-xs sm:text-sm font-bold border-b-2 transition-colors ${
                      profileTab === 'posts'
                        ? 'border-blue-600 text-blue-600 dark:text-cyan-400 dark:border-cyan-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {bi(language, 'পোস্টসমূহ', 'Posts')} ({language === 'bn' ? toBnDigits(myPosts.length) : myPosts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfileTab('about')}
                    className={`min-h-[42px] px-4 text-xs sm:text-sm font-bold border-b-2 transition-colors ${
                      profileTab === 'about'
                        ? 'border-blue-600 text-blue-600 dark:text-cyan-400 dark:border-cyan-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {bi(language, 'পরিচিতি ও এডিট', 'About & Edit')}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('community')}
                  className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline inline-flex items-center gap-1"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{bi(language, 'কমিউনিটি ফিড দেখুন', 'Community Feed')}</span>
                </button>
              </div>
            </div>
          </section>

          {profileTab === 'posts' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Intro Card (Facebook-style Sidebar) */}
              <aside className="lg:col-span-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3.5">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {bi(language, 'পরিচিতি (Intro)', 'Intro')}
                </h2>
                {currentUser.bio && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {currentUser.bio}
                  </p>
                )}
                <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                  {(currentUser.email || connectedProviderLabel) && (
                    <li className="flex items-start gap-2.5">
                      <Mail className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
                      <span className="break-all">
                        <strong className="text-slate-900 dark:text-white font-medium">
                          {currentUser.email ||
                            bi(
                              language,
                              `${connectedProviderLabel} অ্যাকাউন্ট`,
                              `${connectedProviderLabel} Account`
                            )}
                        </strong>
                        {currentUser.email && connectedProviderLabel ? ` · ${connectedProviderLabel}` : ''}
                      </span>
                    </li>
                  )}
                  <li className="flex items-start gap-2.5">
                    <Building2 className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      {bi(language, 'অধ্যয়নরত:', 'Studies at')}{' '}
                      <strong className="text-slate-900 dark:text-white">
                        {currentUser.collegeName || currentUser.instituteName || bi(language, 'পলিটেকনিক ইনস্টিটিউট', 'Polytechnic Institute')}
                      </strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <GraduationCap className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      {language === 'en' ? currentDeptObj?.nameEn : currentDeptObj?.nameBn}
                      {' · '}
                      {language === 'en' ? SEMESTER_LABELS_EN[currentSemNum] : SEMESTER_LABELS[currentSemNum]}
                    </span>
                  </li>
                  {currentUser.rollNumber && (
                    <li className="flex items-start gap-2.5">
                      <BookOpen className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <span>
                        {bi(language, 'বোর্ড রোল:', 'BTEB Roll:')}{' '}
                        <span className="font-mono font-semibold text-slate-900 dark:text-white">
                          {currentUser.rollNumber}
                        </span>
                      </span>
                    </li>
                  )}
                </ul>
                <button
                  type="button"
                  onClick={() => setProfileTab('about')}
                  className="w-full min-h-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  {bi(language, 'পরিচিতি হালনাগাদ করুন', 'Edit Details')}
                </button>
              </aside>

              {/* Right Timeline: Composer + Own Posts */}
              <div className="lg:col-span-8 space-y-4">
                {/* Facebook-style Quick Post Composer */}
                <form
                  onSubmit={(e) => void handlePublishFromProfile(e)}
                  className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3.5"
                >
                  <div className="flex items-start gap-3">
                    <img
                      src={editAvatarUrl || currentUser.avatarUrl || DEFAULT_AVATAR}
                      alt={currentUser.fullName}
                      className="w-10 h-10 rounded-full object-cover shrink-0 bg-slate-800"
                    />
                    <textarea
                      ref={composerRef}
                      rows={3}
                      value={postBody}
                      onChange={(e) => setPostBody(e.target.value)}
                      placeholder={bi(
                        language,
                        `${currentUser.fullName.split(' ')[0]}, স্টুডেন্ট কমিউনিটিতে কী শেয়ার করতে চান? প্রশ্ন, নোট বা পড়াশোনার আপডেট লিখুন...`,
                        `What's on your mind, ${currentUser.fullName.split(' ')[0]}? Share a question, lab note, or study tip...`
                      )}
                      className="flex-1 px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white resize-none focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {postImage && (
                    <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
                      <img src={postImage} alt="Attachment" className="w-full max-h-72 object-cover" />
                      <button
                        type="button"
                        onClick={() => setPostImage('')}
                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-slate-950/75 text-white flex items-center justify-center hover:bg-slate-950"
                        aria-label="Remove image"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={postImageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          void handleSelectPostPhoto(e.target.files?.[0] ?? null);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => postImageInputRef.current?.click()}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                      >
                        <ImagePlus className="w-4 h-4" />
                        <span>{bi(language, 'ছবি যোগ করুন', 'Photo')}</span>
                      </button>
                      <input
                        type="text"
                        value={postSubjectTag}
                        onChange={(e) => setPostSubjectTag(e.target.value)}
                        placeholder={bi(language, 'বিষয় কোড (ঐচ্ছিক)', 'Subject tag (optional)')}
                        className="min-h-[38px] w-40 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={posting || (!postBody.trim() && !postImage)}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {posting
                          ? bi(language, 'প্রকাশ হচ্ছে...', 'Posting...')
                          : bi(language, 'পোস্ট করুন', 'Post')}
                      </span>
                    </button>
                  </div>
                </form>

                {/* User's Own Posts Feed */}
                {postsLoading ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    {bi(language, 'আপনার পোস্ট লোড হচ্ছে...', 'Loading your posts...')}
                  </div>
                ) : myPosts.length === 0 ? (
                  <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-8 text-center space-y-2">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {bi(language, 'আপনি এখনো কোনো পোস্ট করেননি', 'You have not posted yet')}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {bi(
                        language,
                        'উপরের বক্সে আপনার পড়াশোনার প্রশ্ন, নোট বা ছবি পোস্ট করলে তা স্টুডেন্ট কমিউনিটিতে সবার কাছে পৌঁছে যাবে।',
                        'Share a study question, note, or photo above and it will appear on your timeline and in Student Community.'
                      )}
                    </p>
                  </div>
                ) : (
                  myPosts.map((post) => {
                    const likes = post.likedByUserIds || [];
                    const hasLiked = likes.includes(currentUser.id);
                    return (
                      <article
                        key={post.id}
                        className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <img
                              src={editAvatarUrl || currentUser.avatarUrl || DEFAULT_AVATAR}
                              alt={post.authorName}
                              className="w-10 h-10 rounded-full object-cover bg-slate-800"
                            />
                            <div>
                              <p className="text-sm font-bold text-slate-900 dark:text-white">
                                {post.authorName}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {formatDateBn(post.createdAt)}
                                {post.subjectTag ? ` · ${post.subjectTag}` : ''}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleDeleteMyPost(post.id)}
                            title={bi(language, 'পোস্ট মুছুন', 'Delete post')}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {post.body && (
                          <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                            {post.body}
                          </p>
                        )}
                        {post.imageUrl && (
                          <img
                            src={post.imageUrl}
                            alt={post.title}
                            className="w-full max-h-96 object-cover rounded-2xl border border-slate-200 dark:border-slate-800"
                          />
                        )}

                        <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center gap-3 text-xs">
                          <button
                            type="button"
                            onClick={() => void handleToggleLikeMyPost(post.id)}
                            className={`min-h-[36px] px-3 rounded-xl inline-flex items-center gap-1.5 font-semibold transition-colors ${
                              hasLiked
                                ? 'text-blue-600 dark:text-cyan-400 bg-blue-500/10'
                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                            <span>
                              {bi(language, 'লাইক', 'Like')} ({likes.length})
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onNavigate('community')}
                            className="min-h-[36px] px-3 rounded-xl inline-flex items-center gap-1.5 font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>
                              {post.replies.length} {bi(language, 'মন্তব্য', 'Comments')}
                            </span>
                          </button>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            /* About & Edit Profile Form */
            <form
              onSubmit={handleSaveProfile}
              className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4"
            >
              {needsFirstTimeSetup && (
                <div className="rounded-2xl bg-cyan-500/8 border border-cyan-500/30 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                    <Sparkles className="w-4 h-4 text-cyan-500 shrink-0" />
                    <span>
                      {bi(
                        language,
                        'প্রোফাইল সেটআপ / কাস্টমাইজ করুন',
                        'Complete or Customize Your Profile'
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {bi(
                      language,
                      `আপনার ${connectedProviderLabel || 'অ্যাকাউন্টের'} নাম (${currentUser.fullName}) ও ছবি যুক্ত হয়েছে। চাইলে এখন নাম এডিট করে আপনার ইনস্টিটিউট, ডিপার্টমেন্ট ও সেমিস্টার যোগ করুন — অথবা এখন স্কিপ করে পরে যেকোনো সময় এডিট করুন।`,
                      `Your ${connectedProviderLabel || 'account'} name (${currentUser.fullName}) and photo are ready. Edit your name and add your institute, department, and semester now — or skip and edit anytime later.`
                    )}
                  </p>
                </div>
              )}

              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {bi(language, 'প্রোফাইল ও প্রাইভেসি তথ্য হালনাগাদ', 'Update Profile & Privacy')}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {(currentUser.email || connectedProviderLabel) && (
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-cyan-500" />
                      <span>
                        {connectedProviderLabel
                          ? bi(
                              language,
                              `সংযুক্ত ${connectedProviderLabel} অ্যাকাউন্ট`,
                              `Connected ${connectedProviderLabel} Account`
                            )
                          : bi(language, 'সংযুক্ত ইমেইল অ্যাকাউন্ট', 'Connected Email Account')}
                      </span>
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={
                        currentUser.email ||
                        bi(
                          language,
                          `${connectedProviderLabel} আইডি দিয়ে সাইন-ইন করা`,
                          `Signed in with ${connectedProviderLabel}`
                        )
                      }
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300 cursor-not-allowed"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">
                    {bi(language, 'পূর্ণ নাম (এডিট করতে পারবেন)', 'Full Name (Editable)')}
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder={bi(language, 'আপনার পূর্ণ নাম লিখুন', 'Enter your full name')}
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
                    placeholder={bi(language, 'আপনার বোর্ড রোল (ঐচ্ছিক)', 'Your BTEB roll (optional)')}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-mono"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-medium text-slate-500">
                    {bi(language, 'পলিটেকনিক ইনস্টিটিউটের নাম', 'College / Polytechnic Institute')}
                  </label>
                  <input
                    type="text"
                    list="bd-polytechnics-list"
                    value={editCollege}
                    onChange={(e) => setEditCollege(e.target.value)}
                    placeholder={bi(
                      language,
                      'আপনার পলিটেকনিক ইনস্টিটিউটের নাম লিখুন বা তালিকা থেকে বাছুন',
                      'Type or choose your Polytechnic Institute'
                    )}
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

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold"
                >
                  {needsFirstTimeSetup
                    ? bi(language, 'সেভ করে শুরু করুন', 'Save & Continue')
                    : bi(language, 'পরিবর্তন সংরক্ষণ করুন', 'Save Profile')}
                </button>
                {needsFirstTimeSetup && (
                  <button
                    type="button"
                    onClick={handleSkipInitialSetup}
                    className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold"
                  >
                    {bi(language, 'এখন স্কিপ করুন', 'Skip for Now')}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      ) : (
        /* Facebook-Style Split Create Profile / Sign In View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 space-y-4 lg:pt-4">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {bi(language, 'আপনার পলিটেকনিক স্টুডেন্ট প্রোফাইল খুলুন', 'Create Your Polytechnic Student Profile')}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {bi(
                language,
                'ফেসবুকের মতো নিজের কভার ফটো, প্রোফাইল ছবি, ইনস্টিটিউট ও ডিপার্টমেন্ট পরিচিতি সাজান এবং স্টুডেন্ট কমিউনিটিতে প্রশ্ন, নোট ও ছবি পোস্ট করুন।',
                'Set up your cover photo, avatar, institute & department profile like Facebook, and share posts, photos, and questions in the Student Community.'
              )}
            </p>
            <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300 pt-1">
              <li className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-cyan-500 shrink-0" />
                <span>{bi(language, 'নিজস্ব কভার ফটো, প্রোফাইল ছবি ও বায়ো', 'Custom cover photo, profile avatar & bio')}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-cyan-500 shrink-0" />
                <span>{bi(language, 'স্টুডেন্ট কমিউনিটিতে পোস্ট, ছবি, লাইক ও মন্তব্য', 'Post text & photos, like & comment in Community')}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-cyan-500 shrink-0" />
                <span>{bi(language, 'বাংলাদেশের সব পলিটেকনিক ও ১৫টি ডিপার্টমেন্ট সাপোর্ট', 'Supports all Bangladesh Polytechnics & 15 departments')}</span>
              </li>
            </ul>
          </div>

          <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-sm">
            {/* Tabs */}
            <div className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setAuthTab('register')}
                className={`flex-1 min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-bold ${
                  authTab === 'register'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5 inline mr-1" />
                {bi(language, 'নতুন প্রোফাইল খুলুন', 'Create Profile')}
              </button>
              <button
                type="button"
                onClick={() => setAuthTab('login')}
                className={`flex-1 min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-bold ${
                  authTab === 'login'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <LogIn className="w-3.5 h-3.5 inline mr-1" />
                {bi(language, 'সাইন ইন', 'Sign In')}
              </button>
              <button
                type="button"
                onClick={() => setAuthTab('forgot')}
                className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  authTab === 'forgot'
                    ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Mail className="w-3.5 h-3.5 inline mr-1" />
                {bi(language, 'রিসেট', 'Reset')}
              </button>
            </div>

            {/* Google & Facebook OAuth Sign-In */}
            {(authTab === 'login' || authTab === 'register') && (
              <div className="space-y-2.5">
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
                    {activeSocialProvider === 'google'
                      ? bi(language, 'Google-এ সংযুক্ত হচ্ছে...', 'Connecting with Google...')
                      : bi(language, 'Google দিয়ে লগইন / প্রোফাইল খুলুন', 'Continue with Google')}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleFacebookSignIn()}
                  className="w-full min-h-[46px] inline-flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#1877F2] hover:bg-[#166FE5] text-white text-sm font-semibold shadow-xs transition-colors disabled:opacity-60"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 fill-current" aria-hidden="true">
                    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
                  </svg>
                  <span>
                    {activeSocialProvider === 'facebook'
                      ? bi(language, 'Facebook-এ সংযুক্ত হচ্ছে...', 'Connecting with Facebook...')
                      : bi(language, 'Facebook দিয়ে লগইন / প্রোফাইল খুলুন', 'Continue with Facebook')}
                  </span>
                </button>

                {/* Collapsible Facebook Setup Guide */}
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => setShowFacebookGuide((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400"
                  >
                    <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {bi(
                        language,
                        'Facebook লগইন সেটআপ গাইড (Meta + Firebase)',
                        'Facebook Login Setup Guide (Meta + Firebase)'
                      )}
                    </span>
                    {showFacebookGuide ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {showFacebookGuide && (
                    <div className="mt-2 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {bi(
                          language,
                          'Facebook লগইন চালু করতে নিচের ৩টি ধাপ সম্পন্ন করুন:',
                          'Complete these 3 steps to activate Facebook Login:'
                        )}
                      </p>
                      <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                        <li>
                          {bi(
                            language,
                            'Meta for Developers (developers.facebook.com)-এ একটি Consumer/Facebook Login অ্যাপ তৈরি করে App ID ও App Secret কপি করুন।',
                            'Create an app with Facebook Login at Meta for Developers (developers.facebook.com) and copy your App ID & App Secret.'
                          )}
                        </li>
                        <li>
                          {bi(
                            language,
                            'Firebase Console → Authentication → Sign-in method → Facebook চালু করুন এবং App ID ও App Secret বসিয়ে Save করুন।',
                            'Open Firebase Console → Authentication → Sign-in method → Enable Facebook, paste App ID & App Secret, and Save.'
                          )}
                        </li>
                        <li>
                          {bi(
                            language,
                            'Meta Developers → Facebook Login → Settings → Valid OAuth Redirect URIs-এ নিচের লিংকটি যোগ করুন:',
                            'Add this exact URL to Meta Developers → Facebook Login → Settings → Valid OAuth Redirect URIs:'
                          )}
                        </li>
                      </ol>
                      <div className="flex items-center gap-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2.5 py-2">
                        <code className="flex-1 text-[11px] font-mono text-cyan-700 dark:text-cyan-400 break-all">
                          {FIREBASE_OAUTH_REDIRECT_URI}
                        </code>
                        <button
                          type="button"
                          onClick={() => void handleCopyRedirectUri()}
                          className="min-h-[32px] px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 shrink-0"
                        >
                          {copiedRedirectUri ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                              <span>{bi(language, 'কপি হয়েছে', 'Copied')}</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>{bi(language, 'কপি', 'Copy')}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1">
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                  <span>{bi(language, 'অথবা ইমেইল দিয়ে', 'OR WITH EMAIL')}</span>
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
                  className="w-full min-h-[46px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold"
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
                      placeholder={bi(language, 'আপনার পূর্ণ নাম লিখুন', 'Enter your full name')}
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
                      placeholder="student@example.com"
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
                      {bi(language, 'পলিটেকনিক ইনস্টিটিউট', 'Polytechnic Institute')}
                    </label>
                    <input
                      type="text"
                      list="bd-polytechnics-list"
                      value={collegeName}
                      onChange={(e) => setCollegeName(e.target.value)}
                      placeholder={bi(
                        language,
                        'আপনার পলিটেকনিক ইনস্টিটিউটের নাম লিখুন',
                        'Enter your Polytechnic Institute'
                      )}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[46px] rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold"
                >
                  {loading
                    ? bi(language, 'প্রোফাইল তৈরি হচ্ছে...', 'Creating profile...')
                    : bi(language, 'নতুন স্টুডেন্ট প্রোফাইল খুলুন', 'Create New Student Profile')}
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
          </div>
        </div>
      )}

      <datalist id="bd-polytechnics-list">
        {BANGLADESH_POLYTECHNICS.map((poly) => (
          <option key={poly.id} value={language === 'en' ? poly.nameEn : poly.nameBn} />
        ))}
      </datalist>
    </div>
  );
};
