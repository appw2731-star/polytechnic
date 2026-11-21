import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Flag,
  MessageSquare,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
  WifiOff,
} from 'lucide-react';
import { DEPARTMENTS } from '../data/curriculum';
import { bi } from '../i18n/translations';
import { apiClient } from '../services/apiClient';
import {
  AppView,
  AuthUser,
  CommunityPost,
  DepartmentId,
  LanguageMode,
  SemesterNumber,
} from '../types/study';
import { formatDateBn } from '../utils/formatBn';

interface CommunityViewProps {
  language: LanguageMode;
  currentUser: AuthUser | null;
  defaultDepartment: DepartmentId;
  defaultSemester: SemesterNumber;
  isOnline: boolean;
  onNavigate: (view: AppView) => void;
}

export const CommunityView: React.FC<CommunityViewProps> = ({
  language,
  currentUser,
  defaultDepartment,
  defaultSemester,
  isOnline,
  onNavigate,
}) => {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [showComposer, setShowComposer] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [subjectTag, setSubjectTag] = useState('');
  const [postDept, setPostDept] = useState<string>(defaultDepartment);
  const [postSem, setPostSem] = useState<number>(defaultSemester);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

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

  const showNotice = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 3000);
  };

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return posts.filter((p) => {
      if (deptFilter !== 'all' && p.department !== deptFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.body.toLowerCase().includes(q) ||
        p.subjectTag.toLowerCase().includes(q) ||
        p.authorName.toLowerCase().includes(q)
      );
    });
  }, [posts, deptFilter, searchQuery]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    try {
      const res = await apiClient.createCommunityPost({
        title,
        body,
        department: postDept,
        semester: postSem,
        subjectTag,
      });
      setPosts((prev) => [res.post, ...prev]);
      setTitle('');
      setBody('');
      setSubjectTag('');
      setShowComposer(false);
      showNotice(bi(language, 'পোস্ট সফলভাবে প্রকাশিত হয়েছে।', 'Post published successfully.'));
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Failed to publish post');
    }
  };

  const handleReply = async (postId: string) => {
    const draft = (replyDrafts[postId] || '').trim();
    if (!draft || !currentUser) return;
    try {
      const res = await apiClient.replyCommunityPost(postId, draft);
      setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
      setReplyDrafts((prev) => ({ ...prev, [postId]: '' }));
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Failed to send reply');
    }
  };

  const handleReport = async (postId: string) => {
    if (reportedIds.has(postId)) return;
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
            {bi(language, 'স্টুডেন্ট কমিউনিটি ও প্রশ্ন-উত্তর', 'Student Community & Q&A')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {bi(
              language,
              'সহপাঠী ও সিনিয়রদের সাথে বিষয়ভিত্তিক প্রশ্ন, ল্যাব সমাধান ও বোর্ড পরীক্ষার প্রস্তুতি শেয়ার করুন',
              'Discuss coursework, share lab solutions, and ask peer engineering questions'
            )}
          </p>
        </div>

        {currentUser ? (
          <button
            type="button"
            disabled={!isOnline}
            onClick={() => setShowComposer((prev) => !prev)}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-semibold self-start sm:self-auto whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{bi(language, 'নতুন প্রশ্ন লিখুন', 'Ask Question')}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold self-start sm:self-auto whitespace-nowrap"
          >
            <UserCheck className="w-4 h-4" />
            <span>{bi(language, 'পোস্ট করতে সাইন ইন করুন', 'Sign In to Post')}</span>
          </button>
        )}
      </div>

      {!isOnline && (
        <div className="p-3.5 rounded-xl bg-amber-500/12 border border-amber-500/30 flex items-center gap-2.5 text-xs text-amber-700 dark:text-amber-300">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>
            {bi(
              language,
              'কমিউনিটি ফোরাম সিঙ্ক করতে ইন্টারনেট সংযোগ প্রয়োজন।',
              'Internet connection is required to post or sync community discussions.'
            )}
          </span>
        </div>
      )}

      {feedback && (
        <div className="p-3 rounded-xl bg-cyan-500/12 border border-cyan-500/30 text-xs font-medium text-cyan-800 dark:text-cyan-200">
          {feedback}
        </div>
      )}

      {/* Post Composer */}
      {showComposer && currentUser && (
        <form
          onSubmit={(e) => void handleCreatePost(e)}
          className="rounded-2xl bg-white dark:bg-[#111827] border border-cyan-500/40 p-5 space-y-4"
        >
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {bi(language, 'নতুন আলোচনা বা প্রশ্ন তৈরি করুন', 'Create New Question or Discussion')}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={postDept}
              onChange={(e) => setPostDept(e.target.value)}
              className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
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
              className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                <option key={s} value={s}>
                  Semester {s}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={subjectTag}
              onChange={(e) => setSubjectTag(e.target.value)}
              placeholder={bi(language, 'বিষয় কোড (যেমন: 27141)', 'Subject Tag (e.g. 27141)')}
              className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
            />
          </div>

          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={bi(language, 'আপনার প্রশ্নের শিরোনাম লিখুন...', 'Question title...')}
            className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
          />

          <textarea
            rows={3}
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={bi(language, 'বিস্তারিত লিখুন...', 'Describe your question clearly...')}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowComposer(false)}
              className="min-h-[40px] px-4 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
            >
              {bi(language, 'বাতিল', 'Cancel')}
            </button>
            <button
              type="submit"
              className="min-h-[40px] px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
            >
              {bi(language, 'প্রকাশ করুন', 'Publish Post')}
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-7 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={bi(language, 'কমিউনিটি পোস্ট খুঁজুন...', 'Search community posts...')}
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
        <div className="p-8 text-center text-sm text-slate-500">Loading discussions...</div>
      ) : filteredPosts.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">
          {bi(language, 'এখনো কোনো আলোচনা পাওয়া যায়নি। প্রথম প্রশ্নটি করুন!', 'No discussions yet. Start the first thread!')}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPosts.map((post) => {
            const deptLabel = DEPARTMENTS.find((d) => d.id === post.department);
            const canDelete =
              currentUser && (currentUser.id === post.authorId || currentUser.role === 'admin');
            return (
              <article
                key={post.id}
                className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1">
                        {post.authorName}
                        {post.authorRole === 'admin' && (
                          <ShieldCheck className="w-3.5 h-3.5 text-cyan-500" />
                        )}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{language === 'en' ? deptLabel?.nameEn : deptLabel?.nameBn}</span>
                      <span aria-hidden="true">·</span>
                      <span>Sem {post.semester}</span>
                      {post.subjectTag && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-cyan-600 dark:text-cyan-400">
                            {post.subjectTag}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{formatDateBn(post.createdAt)}</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {post.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleReport(post.id)}
                      disabled={reportedIds.has(post.id)}
                      title="Report post"
                      className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 disabled:opacity-40"
                    >
                      <Flag className="w-3.5 h-3.5" />
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(post.id)}
                        title="Delete post"
                        className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {post.body}
                </p>

                {/* Replies */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>
                      {post.replies.length} {bi(language, 'টি উত্তর', 'Replies')}
                    </span>
                  </p>

                  {post.replies.length > 0 && (
                    <div className="space-y-2 pl-3 border-l-2 border-slate-200 dark:border-slate-800">
                      {post.replies.map((rep) => (
                        <div key={rep.id} className="text-xs space-y-0.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1">
                            {rep.authorName}
                            {rep.authorRole === 'admin' && (
                              <ShieldCheck className="w-3 h-3 text-cyan-500" />
                            )}
                          </p>
                          <p className="text-slate-600 dark:text-slate-300">{rep.body}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {currentUser && isOnline && (
                    <div className="flex items-center gap-2">
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
                        placeholder={bi(language, 'আপনার উত্তর লিখুন...', 'Write a helpful reply...')}
                        className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => void handleReply(post.id)}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{bi(language, 'উত্তর', 'Reply')}</span>
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
