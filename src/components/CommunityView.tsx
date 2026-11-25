import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Flag,
  GraduationCap,
  ImagePlus,
  Layers,
  MessageSquare,
  Search,
  Send,
  ShieldCheck,
  ThumbsUp,
  Trash2,
  User,
  UserPlus,
  WifiOff,
  X,
} from 'lucide-react';
import { DEPARTMENTS, SEMESTER_LABELS, SEMESTER_LABELS_EN } from '../data/curriculum';
import { bi } from '../i18n/translations';
import { apiClient } from '../services/apiClient';
import {
  CommunityAuthorProfile,
  fetchCommunityAuthorProfiles,
} from '../services/communityProfilesService';
import {
  AppView,
  AuthUser,
  CommunityPost,
  DepartmentId,
  LanguageMode,
  PublicStudentProfile,
  SemesterNumber,
} from '../types/study';
import { formatDateBn, toBnDigits } from '../utils/formatBn';
import { compressImageFile } from '../utils/imageCompress';

interface CommunityViewProps {
  language: LanguageMode;
  currentUser: AuthUser | null;
  defaultDepartment: DepartmentId;
  defaultSemester: SemesterNumber;
  isOnline: boolean;
  onNavigate: (view: AppView) => void;
}

const DEFAULT_AVATAR = '/src/assets/images/student_scholar_avatar_1794839047562.jpg';

export const CommunityView: React.FC<CommunityViewProps> = ({
  language,
  currentUser,
  defaultDepartment,
  defaultSemester,
  isOnline,
  onNavigate,
}) => {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [authorProfiles, setAuthorProfiles] = useState<Record<string, CommunityAuthorProfile>>({});
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Always-visible Facebook-style Composer state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [subjectTag, setSubjectTag] = useState('');
  const [postImage, setPostImage] = useState('');
  const [postDept, setPostDept] = useState<string>(currentUser?.department || defaultDepartment);
  const [postSem, setPostSem] = useState<number>(currentUser?.semester || defaultSemester);
  const [showAdvancedTags, setShowAdvancedTags] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

  // Public Student Profile Viewer Modal (Facebook-style)
  const [viewingProfile, setViewingProfile] = useState<{
    loading: boolean;
    profile: PublicStudentProfile | null;
    posts: CommunityPost[];
    error?: string;
  } | null>(null);

  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (currentUser?.department) setPostDept(currentUser.department);
    if (currentUser?.semester) setPostSem(currentUser.semester);
  }, [currentUser?.department, currentUser?.semester]);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getCommunityPosts(false);
      setPosts(res.posts);
    } catch {
      // Handled gracefully offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  // Fetch author profile cards (name, department, semester, college, avatar, bio) from Supabase `profiles` table
  useEffect(() => {
    if (posts.length === 0) return;
    let active = true;
    setProfilesLoading(true);
    void fetchCommunityAuthorProfiles(posts, currentUser?.id)
      .then((map) => {
        if (active) {
          setAuthorProfiles((prev) => ({ ...prev, ...map }));
        }
      })
      .finally(() => {
        if (active) setProfilesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [posts, currentUser?.id]);

  const showNotice = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 3200);
  };

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return posts.filter((p) => {
      const authorProfile = authorProfiles[p.authorId];
      const effectiveDept = authorProfile?.department || p.department;
      if (deptFilter !== 'all' && p.department !== deptFilter && effectiveDept !== deptFilter) {
        return false;
      }
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.body.toLowerCase().includes(q) ||
        p.subjectTag.toLowerCase().includes(q) ||
        (authorProfile?.fullName || p.authorName).toLowerCase().includes(q) ||
        (authorProfile?.collegeName || p.authorCollegeName || '').toLowerCase().includes(q)
      );
    });
  }, [posts, authorProfiles, deptFilter, searchQuery]);

  const handleAttachPhoto = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file, {
        maxWidth: 840,
        maxHeight: 840,
        quality: 0.74,
        maxChars: 420000,
      });
      setPostImage(dataUrl);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Failed to attach image');
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!currentUser) {
      onNavigate('profile');
      return;
    }
    if (!isOnline) {
      setErrorMsg(
        bi(
          language,
          'কমিউনিটিতে পোস্ট করতে ইন্টারনেট সংযোগ চালু করুন।',
          'Please connect to the internet to publish a community post.'
        )
      );
      return;
    }
    if (!body.trim() && !postImage) {
      setErrorMsg(bi(language, 'পোস্টের লেখা বা একটি ছবি যোগ করুন।', 'Write something or attach a photo.'));
      return;
    }

    setPublishing(true);
    try {
      const res = await apiClient.createCommunityPost({
        title: title.trim() || undefined,
        body: body.trim(),
        imageUrl: postImage || undefined,
        department: postDept || currentUser.department || defaultDepartment,
        semester: postSem || currentUser.semester || defaultSemester,
        subjectTag: subjectTag.trim(),
      });
      setPosts((prev) => [res.post, ...prev]);
      setAuthorProfiles((prev) => ({
        ...prev,
        [res.post.authorId]: {
          id: currentUser.id,
          fullName: currentUser.fullName,
          department: currentUser.department || defaultDepartment,
          semester: currentUser.semester || defaultSemester,
          collegeName: currentUser.collegeName || currentUser.instituteName || '',
          avatarUrl: currentUser.avatarUrl || '',
          bio: currentUser.bio || '',
          role: currentUser.role,
          source: 'server',
        },
      }));
      setTitle('');
      setBody('');
      setSubjectTag('');
      setPostImage('');
      setShowAdvancedTags(false);
      showNotice(bi(language, 'আপনার পোস্ট সফলভাবে প্রকাশিত হয়েছে!', 'Post published successfully!'));
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : bi(language, 'পোস্ট প্রকাশ করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।', 'Failed to publish post')
      );
    } finally {
      setPublishing(false);
    }
  };

  const handleToggleLike = async (postId: string) => {
    if (!currentUser) {
      showNotice(
        bi(language, 'লাইক দিতে আগে প্রোফাইল খুলুন বা সাইন ইন করুন।', 'Sign in to like posts.')
      );
      return;
    }
    try {
      const res = await apiClient.toggleLikeCommunityPost(postId);
      setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
    } catch {
      // ignore
    }
  };

  const handleReply = async (postId: string) => {
    const draft = (replyDrafts[postId] || '').trim();
    if (!draft) return;
    if (!currentUser) {
      onNavigate('profile');
      return;
    }
    try {
      const res = await apiClient.replyCommunityPost(postId, draft);
      setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
      setReplyDrafts((prev) => ({ ...prev, [postId]: '' }));
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Failed to send reply');
    }
  };

  const handleReport = async (postId: string) => {
    if (reportedIds.has(postId) || !currentUser) return;
    try {
      await apiClient.reportCommunityPost(postId);
      setReportedIds((prev) => new Set(prev).add(postId));
      showNotice(
        bi(
          language,
          'রিপোর্ট গ্রহণ করা হয়েছে। Admin মডারেশন টিম পর্যালোচনা করবে।',
          'Reported for Admin moderation review.'
        )
      );
    } catch {
      // ignore
    }
  };

  const handleDelete = async (postId: string) => {
    try {
      await apiClient.deleteCommunityPost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      showNotice(bi(language, 'পোস্ট মুছে ফেলা হয়েছে।', 'Post deleted.'));
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleOpenAuthorProfile = async (userId: string) => {
    if (
      currentUser &&
      (currentUser.id === userId ||
        (currentUser.firebaseUid && currentUser.firebaseUid === userId))
    ) {
      onNavigate('profile');
      return;
    }
    setViewingProfile({ loading: true, profile: null, posts: [] });
    try {
      const res = await apiClient.getPublicProfile(userId);
      setViewingProfile({ loading: false, profile: res.profile, posts: res.posts });
    } catch (err) {
      setViewingProfile({
        loading: false,
        profile: null,
        posts: [],
        error: err instanceof Error ? err.message : 'Could not load profile',
      });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
            {bi(language, 'স্টুডেন্ট কমিউনিটি ফিড', 'Student Community Feed')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {bi(
              language,
              'সহপাঠীদের সাথে পড়াশোনা, নোট, ছবি, প্রশ্ন ও পরীক্ষার প্রস্তুতি শেয়ার করুন',
              'Share study posts, photos, lab solutions, and peer questions across polytechnics'
            )}
          </p>
        </div>
        {currentUser && (
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="min-h-[40px] inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-cyan-500/60 self-start sm:self-auto"
          >
            <img
              src={currentUser.avatarUrl || DEFAULT_AVATAR}
              alt={currentUser.fullName}
              className="w-6 h-6 rounded-full object-cover"
            />
            <span>{bi(language, 'আমার প্রোফাইল', 'My Profile')}</span>
          </button>
        )}
      </div>

      {!isOnline && (
        <div className="p-3.5 rounded-xl bg-amber-500/12 border border-amber-500/30 flex items-center gap-2.5 text-xs text-amber-700 dark:text-amber-300">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>
            {bi(
              language,
              'কমিউনিটিতে নতুন পোস্ট করতে ইন্টারনেট সংযোগ প্রয়োজন।',
              'Internet connection is required to publish or refresh community posts.'
            )}
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-500/12 border border-red-500/30 text-xs font-medium text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} aria-label="Close error">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-500/12 border border-emerald-500/30 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          {feedback}
        </div>
      )}

      {/* Always-Visible Facebook-Style Post Composer Card */}
      {currentUser ? (
        <form
          onSubmit={(e) => void handleCreatePost(e)}
          className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3.5 shadow-xs"
        >
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            >
              <img
                src={currentUser.avatarUrl || DEFAULT_AVATAR}
                alt={currentUser.fullName}
                onError={(e) => {
                  e.currentTarget.src = DEFAULT_AVATAR;
                }}
                className="w-10 h-10 rounded-full object-cover bg-slate-800"
              />
            </button>
            <div className="flex-1 space-y-2.5">
              <textarea
                rows={3}
                disabled={!isOnline}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={bi(
                  language,
                  `${currentUser.fullName.split(' ')[0]}, স্টুডেন্ট কমিউনিটিতে কী লিখতে চান? প্রশ্ন, নোট বা সাজেশন পোস্ট করুন...`,
                  `What's on your mind, ${currentUser.fullName.split(' ')[0]}? Post a question, note, or photo...`
                )}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white resize-none focus:outline-none focus:border-cyan-500"
              />

              {showAdvancedTags && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={bi(language, 'শিরোনাম (ঐচ্ছিক)', 'Headline (optional)')}
                    className="sm:col-span-3 min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                  <select
                    value={postDept}
                    onChange={(e) => setPostDept(e.target.value)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {language === 'en' ? d.nameEn : d.nameBn}
                      </option>
                    ))}
                  </select>
                  <select
                    value={postSem}
                    onChange={(e) => setPostSem(Number(e.target.value))}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    {([1, 2, 3, 4, 5, 6, 7, 8] as SemesterNumber[]).map((s) => (
                      <option key={s} value={s}>
                        {language === 'en' ? SEMESTER_LABELS_EN[s] : SEMESTER_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={subjectTag}
                    onChange={(e) => setSubjectTag(e.target.value)}
                    placeholder={bi(language, 'বিষয় কোড (যেমন: 27141)', 'Subject code (e.g. 27141)')}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
              )}

              {postImage && (
                <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
                  <img
                    src={postImage}
                    alt="Post preview"
                    className="w-full max-h-80 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPostImage('')}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-slate-950/75 text-white flex items-center justify-center hover:bg-slate-950"
                    aria-label="Remove attached photo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void handleAttachPhoto(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={!isOnline}
                onClick={() => photoInputRef.current?.click()}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-semibold text-emerald-600 dark:text-emerald-400 disabled:opacity-50"
              >
                <ImagePlus className="w-4 h-4" />
                <span>{bi(language, 'ছবি যোগ করুন', 'Add Photo')}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAdvancedTags((prev) => !prev)}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300"
              >
                <GraduationCap className="w-4 h-4 text-cyan-500" />
                <span>
                  {showAdvancedTags
                    ? bi(language, 'ট্যাগ লুকান', 'Hide Tags')
                    : bi(language, 'ডিপার্টমেন্ট ও বিষয় ট্যাগ', 'Dept & Subject Tag')}
                </span>
              </button>
            </div>

            <button
              type="submit"
              disabled={!isOnline || publishing || (!body.trim() && !postImage)}
              className="min-h-[42px] inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {publishing
                  ? bi(language, 'প্রকাশ হচ্ছে...', 'Publishing...')
                  : bi(language, 'পোস্ট করুন', 'Publish Post')}
              </span>
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-[#111827] border border-blue-500/35 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {bi(
                language,
                'কমিউনিটিতে পোস্ট করতে আপনার স্টুডেন্ট প্রোফাইল খুলুন',
                'Create your Student Profile to post in the Community'
              )}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {bi(
                language,
                'ফেসবুকের মতো প্রোফাইল খুলে পড়াশোনার প্রশ্ন, নোট ও ছবি পোস্ট করুন এবং সহপাঠীদের পোস্টে লাইক-মন্তব্য করুন।',
                'Create a Facebook-style student profile to post photos, ask questions, like, and reply.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>{bi(language, 'প্রোফাইল খুলুন / সাইন ইন', 'Create Profile / Sign In')}</span>
          </button>
        </div>
      )}

      {/* Search & Department Filter */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-7 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={bi(language, 'পোস্ট, শিক্ষার্থী বা কলেজ খুঁজুন...', 'Search posts, students, or college...')}
            className="w-full min-h-[42px] pl-10 pr-3.5 py-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-sm"
          />
        </div>
        <div className="sm:col-span-5">
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-sm"
          >
            <option value="all">{bi(language, 'সব ডিপার্টমেন্ট', 'All Departments')}</option>
            {DEPARTMENTS.map((d) => (
              <option key={d.id} value={d.id}>
                {language === 'en' ? d.nameEn : d.nameBn}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Posts Feed */}
      {loading ? (
        <div className="p-8 text-center text-sm text-slate-500">
          {bi(language, 'কমিউনিটি পোস্ট লোড হচ্ছে...', 'Loading community posts...')}
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">
          {bi(language, 'এখনো কোনো পোস্ট পাওয়া যায়নি। প্রথম পোস্টটি করুন!', 'No posts yet. Share the first post!')}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPosts.map((post) => {
            const authorProfile = authorProfiles[post.authorId];
            const authorName = authorProfile?.fullName || post.authorName;
            const authorAvatar = authorProfile?.avatarUrl || post.authorAvatarUrl || DEFAULT_AVATAR;
            const authorRole = authorProfile?.role || post.authorRole;
            const authorDeptId = authorProfile?.department || post.authorDepartment || post.department;
            const authorDeptInfo = DEPARTMENTS.find((d) => d.id === authorDeptId);
            const authorSem = (authorProfile?.semester || post.semester) as SemesterNumber;
            const authorCollege = authorProfile?.collegeName || post.authorCollegeName || '';
            const authorBio = authorProfile?.bio || '';

            const postDeptLabel = DEPARTMENTS.find((d) => d.id === post.department);
            const canDelete = Boolean(
              currentUser &&
                (currentUser.id === post.authorId ||
                  (currentUser.firebaseUid && currentUser.firebaseUid === post.authorId) ||
                  currentUser.role === 'admin')
            );
            const likedUsers = post.likedByUserIds || [];
            const isLiked = Boolean(
              currentUser &&
                (likedUsers.includes(currentUser.id) ||
                  (currentUser.firebaseUid && likedUsers.includes(currentUser.firebaseUid)))
            );
            const showDistinctTitle =
              post.title &&
              post.body &&
              !post.body.trim().startsWith(post.title.trim()) &&
              post.title !== 'ফটো পোস্ট';

            return (
              <article
                key={post.id}
                className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-4 sm:p-5"
              >
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                  {/* Author Profile Card (Fetched from Supabase `profiles` table) */}
                  <aside
                    aria-label={bi(language, 'শিক্ষার্থীর প্রোফাইল কার্ড', 'Student profile card')}
                    className="md:col-span-4 lg:col-span-3 rounded-2xl bg-slate-50 dark:bg-slate-900/75 border border-slate-200/90 dark:border-slate-800 p-4 flex flex-col justify-between gap-3"
                  >
                    <div className="flex md:flex-col items-center md:items-start gap-3">
                      <button
                        type="button"
                        onClick={() => void handleOpenAuthorProfile(post.authorId)}
                        className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                      >
                        <img
                          src={authorAvatar}
                          alt={authorName}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.src = DEFAULT_AVATAR;
                          }}
                          className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover bg-slate-800 ring-2 ring-white dark:ring-slate-800 shadow-xs"
                        />
                      </button>

                      <div className="min-w-0 flex-1 w-full">
                        <button
                          type="button"
                          onClick={() => void handleOpenAuthorProfile(post.authorId)}
                          className="text-sm font-bold text-slate-900 dark:text-white hover:underline inline-flex items-center gap-1.5 text-left max-w-full"
                        >
                          <span className="truncate">{authorName}</span>
                          {authorRole === 'admin' && (
                            <ShieldCheck className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                          )}
                        </button>

                        {profilesLoading && !authorProfile ? (
                          <div className="mt-2 space-y-1.5 animate-pulse">
                            <div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-800" />
                            <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-800" />
                          </div>
                        ) : (
                          <dl className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                            <div className="flex items-start gap-2">
                              <GraduationCap className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                              <div className="min-w-0">
                                <dt className="sr-only">
                                  {bi(language, 'ডিপার্টমেন্ট', 'Department')}
                                </dt>
                                <dd className="font-medium text-slate-800 dark:text-slate-200 leading-snug break-words">
                                  {authorDeptInfo
                                    ? language === 'en'
                                      ? authorDeptInfo.nameEn
                                      : authorDeptInfo.nameBn
                                    : authorDeptId}
                                </dd>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                              <div className="min-w-0">
                                <dt className="sr-only">
                                  {bi(language, 'সেমিস্টার', 'Semester')}
                                </dt>
                                <dd className="text-slate-700 dark:text-slate-300 font-medium">
                                  {language === 'en'
                                    ? SEMESTER_LABELS_EN[authorSem] || `Semester ${authorSem}`
                                    : SEMESTER_LABELS[authorSem] || `${toBnDigits(authorSem)}ম সেমিস্টার`}
                                </dd>
                              </div>
                            </div>

                            {authorCollege && (
                              <div className="flex items-start gap-2">
                                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                                <dd className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                                  {authorCollege}
                                </dd>
                              </div>
                            )}
                          </dl>
                        )}
                      </div>
                    </div>

                    {authorBio && (
                      <p className="hidden md:line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-200/80 dark:border-slate-800 pt-2">
                        {authorBio}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleOpenAuthorProfile(post.authorId)}
                      className="w-full min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800/90 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                    >
                      <User className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      <span>{bi(language, 'প্রোফাইল দেখুন', 'View Profile')}</span>
                    </button>
                  </aside>

                  {/* Post Content & Interactions Column */}
                  <div className="md:col-span-8 lg:col-span-9 min-w-0 space-y-3.5">
                    {/* Post Meta & Moderation Header */}
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-800">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span>{formatDateBn(post.createdAt)}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {language === 'en' ? postDeptLabel?.nameEn : postDeptLabel?.nameBn}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {language === 'en'
                            ? SEMESTER_LABELS_EN[post.semester as SemesterNumber] || `Sem ${post.semester}`
                            : SEMESTER_LABELS[post.semester as SemesterNumber] || `${toBnDigits(post.semester)}ম সেমিস্টার`}
                        </span>
                        {post.subjectTag && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-cyan-600 dark:text-cyan-400">
                              {post.subjectTag}
                            </span>
                          </>
                        )}
                      </p>

                      <div className="flex items-center gap-1 shrink-0">
                        {currentUser && (
                          <button
                            type="button"
                            onClick={() => void handleReport(post.id)}
                            disabled={reportedIds.has(post.id)}
                            title={bi(language, 'রিপোর্ট করুন', 'Report post')}
                            className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 disabled:opacity-40"
                          >
                            <Flag className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => void handleDelete(post.id)}
                            title={bi(language, 'পোস্ট মুছুন', 'Delete post')}
                            className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Post Body */}
                    <div className="space-y-2.5">
                      {showDistinctTitle && (
                        <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                          {post.title}
                        </h3>
                      )}
                      {post.body && (
                        <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                          {post.body}
                        </p>
                      )}
                      {post.imageUrl && (
                        <img
                          src={post.imageUrl}
                          alt={post.title}
                          className="w-full max-h-[440px] object-cover rounded-2xl border border-slate-200 dark:border-slate-800"
                        />
                      )}
                    </div>

                    {/* Like & Comment Action Bar */}
                    <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void handleToggleLike(post.id)}
                        className={`min-h-[40px] rounded-xl inline-flex items-center justify-center gap-2 text-xs font-semibold transition-colors ${
                          isLiked
                            ? 'text-blue-600 dark:text-cyan-400 bg-blue-500/10'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <ThumbsUp className="w-4 h-4" />
                        <span>
                          {bi(language, 'লাইক', 'Like')}
                          {likedUsers.length > 0
                            ? ` (${language === 'bn' ? toBnDigits(likedUsers.length) : likedUsers.length})`
                            : ''}
                        </span>
                      </button>

                      <div className="min-h-[40px] rounded-xl inline-flex items-center justify-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        <MessageSquare className="w-4 h-4" />
                        <span>
                          {language === 'bn' ? toBnDigits(post.replies.length) : post.replies.length}{' '}
                          {bi(language, 'টি মন্তব্য', 'Comments')}
                        </span>
                      </div>
                    </div>

                    {/* Replies / Comments */}
                    <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-3">
                      {post.replies.length > 0 && (
                        <div className="space-y-2.5">
                          {post.replies.map((rep) => (
                            <div key={rep.id} className="flex items-start gap-2.5">
                              <button
                                type="button"
                                onClick={() => void handleOpenAuthorProfile(rep.authorId)}
                                className="shrink-0 rounded-full mt-0.5"
                              >
                                <img
                                  src={rep.authorAvatarUrl || DEFAULT_AVATAR}
                                  alt={rep.authorName}
                                  onError={(e) => {
                                    e.currentTarget.src = DEFAULT_AVATAR;
                                  }}
                                  className="w-7 h-7 rounded-full object-cover bg-slate-800"
                                />
                              </button>
                              <div className="flex-1 rounded-2xl bg-slate-50 dark:bg-slate-900/90 px-3 py-2 text-xs space-y-0.5">
                                <button
                                  type="button"
                                  onClick={() => void handleOpenAuthorProfile(rep.authorId)}
                                  className="font-bold text-slate-900 dark:text-white hover:underline inline-flex items-center gap-1"
                                >
                                  <span>{rep.authorName}</span>
                                  {rep.authorRole === 'admin' && (
                                    <ShieldCheck className="w-3 h-3 text-cyan-500" />
                                  )}
                                </button>
                                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                                  {rep.body}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {currentUser && isOnline ? (
                        <div className="flex items-center gap-2">
                          <img
                            src={currentUser.avatarUrl || DEFAULT_AVATAR}
                            alt={currentUser.fullName}
                            className="w-8 h-8 rounded-full object-cover shrink-0 bg-slate-800"
                          />
                          <input
                            type="text"
                            value={replyDrafts[post.id] || ''}
                            onChange={(e) =>
                              setReplyDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleReply(post.id);
                              }
                            }}
                            placeholder={bi(language, 'আপনার মন্তব্য লিখুন...', 'Write a comment...')}
                            className="flex-1 min-h-[40px] px-3.5 py-1.5 rounded-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => void handleReply(post.id)}
                            className="min-h-[40px] px-3.5 py-1.5 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>{bi(language, 'পাঠান', 'Send')}</span>
                          </button>
                        </div>
                      ) : (
                        !currentUser && (
                          <button
                            type="button"
                            onClick={() => onNavigate('profile')}
                            className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
                          >
                            {bi(
                              language,
                              'মন্তব্য করতে প্রোফাইল খুলুন বা সাইন ইন করুন',
                              'Create a profile or sign in to comment'
                            )}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Facebook-Style Student Profile Viewer Modal */}
      {viewingProfile && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setViewingProfile(null)}
        >
          <div
            className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {viewingProfile.loading ? (
              <div className="p-10 text-center text-sm text-slate-500">
                {bi(language, 'প্রোফাইল লোড হচ্ছে...', 'Loading student profile...')}
              </div>
            ) : viewingProfile.error || !viewingProfile.profile ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {viewingProfile.error || 'Profile unavailable.'}
                </p>
                <button
                  type="button"
                  onClick={() => setViewingProfile(null)}
                  className="min-h-[40px] px-4 rounded-xl bg-slate-200 dark:bg-slate-800 text-xs font-semibold"
                >
                  {bi(language, 'বন্ধ করুন', 'Close')}
                </button>
              </div>
            ) : (
              <div>
                {/* Cover + Close */}
                <div className="relative h-32 bg-gradient-to-br from-[#0f172a] via-[#134e6f] to-[#0e7490]">
                  {viewingProfile.profile.coverUrl && (
                    <img
                      src={viewingProfile.profile.coverUrl}
                      alt={viewingProfile.profile.fullName}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setViewingProfile(null)}
                    aria-label="Close profile"
                    className="absolute top-3 right-3 w-9 h-9 rounded-full bg-slate-950/70 text-white flex items-center justify-center hover:bg-slate-950"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="px-5 pb-5">
                  <div className="-mt-10 relative z-10 flex items-end gap-3.5">
                    <img
                      src={viewingProfile.profile.avatarUrl || DEFAULT_AVATAR}
                      alt={viewingProfile.profile.fullName}
                      onError={(e) => {
                        e.currentTarget.src = DEFAULT_AVATAR;
                      }}
                      className="w-20 h-20 rounded-full object-cover ring-4 ring-white dark:ring-[#0f172a] bg-slate-800"
                    />
                    <div className="pb-1">
                      <h2 className="text-lg font-extrabold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                        <span>{viewingProfile.profile.fullName}</span>
                        {viewingProfile.profile.role === 'admin' && (
                          <ShieldCheck className="w-4 h-4 text-cyan-500" />
                        )}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {viewingProfile.profile.postsCount}{' '}
                        {bi(language, 'টি কমিউনিটি পোস্ট', 'community posts')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                    {viewingProfile.profile.bio && (
                      <p className="leading-relaxed">{viewingProfile.profile.bio}</p>
                    )}
                    {viewingProfile.profile.collegeName && (
                      <p className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>{viewingProfile.profile.collegeName}</span>
                      </p>
                    )}
                    <p className="flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>
                        {DEPARTMENTS.find((d) => d.id === viewingProfile.profile?.department)?.[
                          language === 'en' ? 'nameEn' : 'nameBn'
                        ] || viewingProfile.profile.department}
                        {' · '}
                        {language === 'en'
                          ? SEMESTER_LABELS_EN[viewingProfile.profile.semester as SemesterNumber] ||
                            `Semester ${viewingProfile.profile.semester}`
                          : SEMESTER_LABELS[viewingProfile.profile.semester as SemesterNumber] ||
                            `${toBnDigits(viewingProfile.profile.semester)}ম সেমিস্টার`}
                      </span>
                    </p>
                  </div>

                  {viewingProfile.posts.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {bi(language, 'সাম্প্রতিক পোস্টসমূহ', 'Recent Posts')}
                      </h3>
                      {viewingProfile.posts.slice(0, 5).map((p) => (
                        <div
                          key={p.id}
                          className="rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 space-y-1.5"
                        >
                          <p className="text-[11px] text-slate-500">
                            {formatDateBn(p.createdAt)}
                            {p.subjectTag ? ` · ${p.subjectTag}` : ''}
                          </p>
                          <p className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap line-clamp-4">
                            {p.body || p.title}
                          </p>
                          {p.imageUrl && (
                            <img
                              src={p.imageUrl}
                              alt={p.title}
                              className="w-full max-h-48 object-cover rounded-lg"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
