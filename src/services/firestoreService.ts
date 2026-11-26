import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, isFirebaseConfigured, OperationType } from '../firebase';
import type {
  AppReleaseConfig,
  AuthUser,
  CommunityPost,
  CommunityReply,
  FormulaItem,
  McqQuestion,
  PlatformNotice,
  PublicStudentProfile,
  PushAudienceType,
  PushCategory,
  PushNotificationCampaign,
  PushSoundMode,
  SemesterNumber,
  SharedPdfNote,
  StudyNote,
  UserPdfRecord,
  UserRole,
} from '../types/study';

// Constants synchronized verbatim with firebase-blueprint.json & firestore.rules
const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const VALID_DEPT_REGEX = /^[a-z0-9_-]+$/;

const LIMITS = {
  idMax: 128,
  fullNameMin: 2,
  fullNameMax: 100,
  emailMax: 160,
  departmentMax: 40,
  collegeMax: 160,
  rollMax: 40,
  bioMax: 400,
  avatarMax: 250000,
  coverMax: 350000,
  postTitleMax: 160,
  postBodyMax: 4000,
  postSubjectTagMax: 60,
  postImageMax: 450000,
  maxLikes: 500,
  maxReplies: 100,
  noteTitleMin: 2,
  noteTitleMax: 160,
  noteContentMax: 12000,
  subjectNameMax: 120,
  pdfCustomNameMax: 180,
  pdfFileNameMax: 200,
  subjectCodeMax: 40,
  maxPdfBytes: 52428800,
};

// Serialize concurrent writes per document path so parallel auth/profile hooks never race
const inFlightSyncQueue = new Map<string, Promise<void>>();

function enqueueDocSync(key: string, task: () => Promise<void>): Promise<void> {
  const previous = inFlightSyncQueue.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  const tracked = next.finally(() => {
    if (inFlightSyncQueue.get(key) === tracked) {
      inFlightSyncQueue.delete(key);
    }
  });
  inFlightSyncQueue.set(key, tracked);
  return tracked;
}

function sanitizeId(raw: string, fallbackPrefix = 'item'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, LIMITS.idMax);
  if (cleaned && VALID_ID_REGEX.test(cleaned)) return cleaned;
  return `${fallbackPrefix}_${Date.now()}`.slice(0, LIMITS.idMax);
}

function sanitizeDepartment(raw: string | undefined): string {
  const cleaned = (raw || 'power')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .slice(0, LIMITS.departmentMax);
  return cleaned.length >= 2 && VALID_DEPT_REGEX.test(cleaned) ? cleaned : 'power';
}

function sanitizeSemester(raw: number | undefined): number {
  const num = Math.trunc(Number(raw) || 1);
  return Math.min(8, Math.max(1, num));
}

function sanitizeImageDataOrUrl(raw: string | undefined, maxLen: number): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (!trimmed.startsWith('data:image/') && !trimmed.startsWith('https://')) return '';
  if (trimmed.length > maxLen) return '';
  return trimmed;
}

function toIsoTimestamp(val: unknown): string {
  if (
    val &&
    typeof val === 'object' &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string' && val.trim()) return val;
  return new Date().toISOString();
}

export function isVerifiedFirebaseSession(): boolean {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.uid) return false;
  if (!VALID_ID_REGEX.test(fbUser.uid) || fbUser.uid.length > LIMITS.idMax) return false;
  const isFacebook = fbUser.providerData?.some((p) => p.providerId === 'facebook.com');
  return Boolean(fbUser.emailVerified || isFacebook);
}

function ensureVerifiedFirebaseUid(): string | null {
  if (!isFirebaseConfigured || !isVerifiedFirebaseSession()) return null;
  return auth.currentUser?.uid || null;
}

function isPrimaryOwnerAdmin(): boolean {
  const fbUser = auth.currentUser;
  return Boolean(
    fbUser?.emailVerified && fbUser.email?.trim().toLowerCase() === 'webrokib@gmail.com'
  );
}

export async function fetchUserProfileFromFirestore(
  uidOverride?: string
): Promise<Partial<AuthUser> | null> {
  if (!isFirebaseConfigured) return null;
  const uid = uidOverride || auth.currentUser?.uid;
  if (!uid || !VALID_ID_REGEX.test(uid)) return null;

  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    const college = typeof data.collegeName === 'string' ? data.collegeName : '';
    const gender =
      data.gender === 'male' || data.gender === 'female' ? data.gender : '';
    const profileVisibility =
      data.profileVisibility === 'public' ||
      data.profileVisibility === 'department' ||
      data.profileVisibility === 'private'
        ? data.profileVisibility
        : 'public';
    const authProvider =
      data.authProvider === 'google' ||
      data.authProvider === 'facebook' ||
      data.authProvider === 'email'
        ? data.authProvider
        : undefined;

    return {
      firebaseUid: uid,
      fullName: typeof data.fullName === 'string' ? data.fullName : undefined,
      email: typeof data.email === 'string' ? data.email : undefined,
      department: typeof data.department === 'string' ? data.department : undefined,
      semester: typeof data.semester === 'number' ? data.semester : undefined,
      collegeName: college,
      instituteName: college,
      rollNumber: typeof data.rollNumber === 'string' ? data.rollNumber : '',
      bio: typeof data.bio === 'string' ? data.bio : '',
      avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : '',
      coverUrl: typeof data.coverUrl === 'string' ? data.coverUrl : '',
      gender,
      showGender: Boolean(data.showGender),
      profileVisibility,
      authProvider,
      role: data.role === 'admin' || isPrimaryOwnerAdmin() ? 'admin' : 'student',
      createdAt: toIsoTimestamp(data.createdAt),
      updatedAt: toIsoTimestamp(data.updatedAt),
    };
  } catch {
    return null;
  }
}

export async function syncUserProfileToFirestore(user: AuthUser): Promise<void> {
  const uid = ensureVerifiedFirebaseUid();
  if (!uid) return;

  const docPath = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  const publicRef = doc(db, 'publicProfiles', uid);

  const safeFullName = (user.fullName || 'Student').trim().slice(0, LIMITS.fullNameMax);
  const finalName = safeFullName.length >= LIMITS.fullNameMin ? safeFullName : 'Student';
  const safeEmail = (user.email || auth.currentUser?.email || '')
    .trim()
    .slice(0, LIMITS.emailMax);
  const safeDept = sanitizeDepartment(user.department);
  const safeSem = sanitizeSemester(user.semester);
  const safeCollege = (user.collegeName || user.instituteName || '')
    .trim()
    .slice(0, LIMITS.collegeMax);
  const safeRoll = (user.rollNumber || '').trim().slice(0, LIMITS.rollMax);
  const safeBio = (user.bio || '').trim().slice(0, LIMITS.bioMax);
  const safeAvatar = sanitizeImageDataOrUrl(user.avatarUrl, LIMITS.avatarMax);
  const safeCover = sanitizeImageDataOrUrl(user.coverUrl, LIMITS.coverMax);
  const safeGender: '' | 'male' | 'female' =
    user.gender === 'male' || user.gender === 'female' ? user.gender : '';
  const safeShowGender = Boolean(user.showGender);
  const safeVisibility: 'public' | 'department' | 'private' =
    user.profileVisibility === 'private' || user.profileVisibility === 'department'
      ? user.profileVisibility
      : 'public';
  const safeProvider: 'google' | 'facebook' | 'email' =
    user.authProvider === 'facebook' || user.authProvider === 'google' || user.authProvider === 'email'
      ? user.authProvider
      : auth.currentUser?.providerData?.some((p) => p.providerId === 'facebook.com')
        ? 'facebook'
        : 'google';
  const firestoreRole: 'student' | 'admin' =
    user.role === 'admin' && isPrimaryOwnerAdmin() ? 'admin' : 'student';

  return enqueueDocSync(docPath, async () => {
    let opType: OperationType = OperationType.WRITE;
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) {
          opType = OperationType.CREATE;
          tx.set(ref, {
            uid,
            fullName: finalName,
            email: safeEmail,
            department: safeDept,
            semester: safeSem,
            collegeName: safeCollege,
            rollNumber: safeRoll,
            bio: safeBio,
            avatarUrl: safeAvatar,
            coverUrl: safeCover,
            gender: safeGender,
            showGender: safeShowGender,
            profileVisibility: safeVisibility,
            authProvider: safeProvider,
            role: firestoreRole,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          return;
        }

        const existing = snap.data() as Record<string, unknown>;
        const unchanged =
          existing.fullName === finalName &&
          existing.department === safeDept &&
          existing.semester === safeSem &&
          (existing.collegeName ?? '') === safeCollege &&
          (existing.rollNumber ?? '') === safeRoll &&
          (existing.bio ?? '') === safeBio &&
          (existing.avatarUrl ?? '') === safeAvatar &&
          (existing.coverUrl ?? '') === safeCover &&
          (existing.gender ?? '') === safeGender &&
          Boolean(existing.showGender) === safeShowGender &&
          (existing.profileVisibility ?? 'public') === safeVisibility &&
          (existing.authProvider ?? safeProvider) === safeProvider;
        if (unchanged) return;

        opType = OperationType.UPDATE;
        const updatePayload: Record<string, unknown> = {
          fullName: finalName,
          department: safeDept,
          semester: safeSem,
          collegeName: safeCollege,
          rollNumber: safeRoll,
          bio: safeBio,
          avatarUrl: safeAvatar,
          coverUrl: safeCover,
          gender: safeGender,
          showGender: safeShowGender,
          profileVisibility: safeVisibility,
          authProvider: safeProvider,
          updatedAt: serverTimestamp(),
        };
        if (isPrimaryOwnerAdmin() && existing.role !== 'admin') {
          updatePayload.role = 'admin';
        }
        tx.update(ref, updatePayload);
      });
    } catch (error) {
      handleFirestoreError(error, opType, docPath);
    }

    // Also mirror non-PII profile card to /publicProfiles/{uid}
    try {
      await runTransaction(db, async (tx) => {
        const pubSnap = await tx.get(publicRef);
        if (!pubSnap.exists()) {
          tx.set(publicRef, {
            uid,
            fullName: finalName,
            department: safeDept,
            semester: safeSem,
            collegeName: safeCollege,
            bio: safeBio,
            avatarUrl: safeAvatar,
            coverUrl: safeCover,
            role: firestoreRole,
            profileVisibility: safeVisibility,
            updatedAt: serverTimestamp(),
          });
          return;
        }
        const existing = pubSnap.data() as Record<string, unknown>;
        const unchanged =
          existing.fullName === finalName &&
          existing.department === safeDept &&
          existing.semester === safeSem &&
          (existing.collegeName ?? '') === safeCollege &&
          (existing.bio ?? '') === safeBio &&
          (existing.avatarUrl ?? '') === safeAvatar &&
          (existing.coverUrl ?? '') === safeCover &&
          (existing.profileVisibility ?? 'public') === safeVisibility;
        if (unchanged) return;

        const pubUpdate: Record<string, unknown> = {
          fullName: finalName,
          department: safeDept,
          semester: safeSem,
          collegeName: safeCollege,
          bio: safeBio,
          avatarUrl: safeAvatar,
          coverUrl: safeCover,
          profileVisibility: safeVisibility,
          updatedAt: serverTimestamp(),
        };
        if (isPrimaryOwnerAdmin() && existing.role !== 'admin') {
          pubUpdate.role = 'admin';
        }
        tx.update(publicRef, pubUpdate);
      });
    } catch {
      // Non-blocking mirror
    }
  });
}

// ---------------------------------------------------------------------------
// Community Posts in Cloud Firestore (works everywhere — preview & published!)
// ---------------------------------------------------------------------------
function mapDocToCommunityPost(docId: string, data: Record<string, unknown>): CommunityPost {
  const rawReplies = Array.isArray(data.replies) ? data.replies : [];
  const replies: CommunityReply[] = rawReplies
    .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
    .map((r) => ({
      id: String(r.id || `rep-${Date.now()}`),
      authorId: String(r.authorId || ''),
      authorName: String(r.authorName || 'Student'),
      authorAvatarUrl: typeof r.authorAvatarUrl === 'string' ? r.authorAvatarUrl : '',
      authorRole: r.authorRole === 'admin' ? 'admin' : 'student',
      body: String(r.body || ''),
      createdAt: toIsoTimestamp(r.createdAt),
    }));

  return {
    id: String(data.id || docId),
    authorId: String(data.authorId || ''),
    authorName: String(data.authorName || 'Student'),
    authorAvatarUrl: typeof data.authorAvatarUrl === 'string' ? data.authorAvatarUrl : '',
    authorCollegeName: typeof data.authorCollegeName === 'string' ? data.authorCollegeName : '',
    authorDepartment: String(data.authorDepartment || data.department || 'power'),
    authorRole: data.authorRole === 'admin' ? 'admin' : 'student',
    department: String(data.department || 'power'),
    semester: sanitizeSemester(typeof data.semester === 'number' ? data.semester : 4),
    subjectTag: typeof data.subjectTag === 'string' ? data.subjectTag : '',
    title: String(data.title || 'পোস্ট'),
    body: String(data.body || ''),
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
    likedByUserIds: Array.isArray(data.likedByUserIds)
      ? data.likedByUserIds.map((x) => String(x))
      : [],
    replies,
    reportsCount: typeof data.reportsCount === 'number' ? data.reportsCount : 0,
    isHidden: Boolean(data.isHidden),
    createdAt: toIsoTimestamp(data.createdAt),
  };
}

export async function fetchCommunityPostsFromFirestore(
  includeHidden = false
): Promise<CommunityPost[]> {
  if (!isFirebaseConfigured) return [];
  const colRef = collection(db, 'communityPosts');
  const q =
    includeHidden && isPrimaryOwnerAdmin()
      ? query(colRef, orderBy('createdAt', 'desc'), limit(80))
      : query(colRef, where('isHidden', '==', false), limit(80));

  try {
    const snap = await getDocs(q);
    const posts = snap.docs.map((d) =>
      mapDocToCommunityPost(d.id, d.data() as Record<string, unknown>)
    );
    return posts.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'communityPosts');
  }
}

export async function createCommunityPostInFirestore(
  author: AuthUser,
  payload: {
    title?: string;
    body: string;
    imageUrl?: string;
    department: string;
    semester: number;
    subjectTag?: string;
  }
): Promise<CommunityPost> {
  const uid = ensureVerifiedFirebaseUid();
  if (!uid) {
    throw new Error('পোস্ট করতে Google বা Facebook দিয়ে সাইন ইন করুন।');
  }

  const cleanBody = (payload.body || '').trim().slice(0, LIMITS.postBodyMax);
  const cleanImage = sanitizeImageDataOrUrl(payload.imageUrl, LIMITS.postImageMax);
  if (!cleanBody && !cleanImage) {
    throw new Error('পোস্টের লেখা বা একটি ছবি যোগ করুন।');
  }

  const rawTitle = (payload.title || '').trim();
  const cleanTitle = (
    rawTitle ||
    cleanBody.split('\n')[0]?.trim().slice(0, 80) ||
    'ফটো পোস্ট'
  ).slice(0, LIMITS.postTitleMax);

  const postId = sanitizeId(`post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, 'post');
  const docPath = `communityPosts/${postId}`;
  const ref = doc(db, 'communityPosts', postId);

  const safeAuthorName = (author.fullName || auth.currentUser?.displayName || 'Student')
    .trim()
    .slice(0, LIMITS.fullNameMax);
  const safeAuthorAvatar = sanitizeImageDataOrUrl(
    author.avatarUrl || auth.currentUser?.photoURL || '',
    LIMITS.avatarMax
  );
  const safeAuthorCollege = (author.collegeName || author.instituteName || '')
    .trim()
    .slice(0, LIMITS.collegeMax);
  const safeAuthorDept = sanitizeDepartment(author.department);
  const safeDept = sanitizeDepartment(payload.department || author.department);
  const safeSem = sanitizeSemester(payload.semester || author.semester);
  const safeSubjectTag = (payload.subjectTag || '').trim().slice(0, LIMITS.postSubjectTagMax);
  const safeRole: 'student' | 'admin' =
    author.role === 'admin' && isPrimaryOwnerAdmin() ? 'admin' : 'student';

  try {
    await runTransaction(db, async (tx) => {
      tx.set(ref, {
        id: postId,
        authorId: uid,
        authorName: safeAuthorName || 'Student',
        authorAvatarUrl: safeAuthorAvatar,
        authorCollegeName: safeAuthorCollege,
        authorDepartment: safeAuthorDept,
        authorRole: safeRole,
        department: safeDept,
        semester: safeSem,
        subjectTag: safeSubjectTag,
        title: cleanTitle,
        body: cleanBody,
        imageUrl: cleanImage,
        likedByUserIds: [],
        replies: [],
        isHidden: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    const nowIso = new Date().toISOString();
    return {
      id: postId,
      authorId: uid,
      authorName: safeAuthorName || 'Student',
      authorAvatarUrl: safeAuthorAvatar,
      authorCollegeName: safeAuthorCollege,
      authorDepartment: safeAuthorDept,
      authorRole: safeRole,
      department: safeDept,
      semester: safeSem,
      subjectTag: safeSubjectTag,
      title: cleanTitle,
      body: cleanBody,
      imageUrl: cleanImage,
      likedByUserIds: [],
      replies: [],
      reportsCount: 0,
      isHidden: false,
      createdAt: nowIso,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function toggleLikeCommunityPostInFirestore(postIdRaw: string): Promise<CommunityPost> {
  const uid = ensureVerifiedFirebaseUid();
  if (!uid) {
    throw new Error('লাইক দিতে সাইন ইন করুন।');
  }
  const postId = sanitizeId(postIdRaw, 'post');
  const docPath = `communityPosts/${postId}`;
  const ref = doc(db, 'communityPosts', postId);

  try {
    let updatedPost: CommunityPost | null = null;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new Error('Post not found.');
      }
      const data = snap.data() as Record<string, unknown>;
      const currentLikes = Array.isArray(data.likedByUserIds)
        ? data.likedByUserIds.map((x) => String(x))
        : [];
      const nextLikes = currentLikes.includes(uid)
        ? currentLikes.filter((id) => id !== uid)
        : [...currentLikes, uid].slice(0, LIMITS.maxLikes);

      tx.update(ref, {
        likedByUserIds: nextLikes,
        updatedAt: serverTimestamp(),
      });

      updatedPost = mapDocToCommunityPost(postId, {
        ...data,
        likedByUserIds: nextLikes,
      });
    });
    return updatedPost!;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function replyCommunityPostInFirestore(
  postIdRaw: string,
  author: AuthUser,
  bodyRaw: string
): Promise<CommunityPost> {
  const uid = ensureVerifiedFirebaseUid();
  if (!uid) {
    throw new Error('মন্তব্য করতে সাইন ইন করুন।');
  }
  const cleanBody = bodyRaw.trim().slice(0, 1000);
  if (!cleanBody) {
    throw new Error('মন্তব্য লিখুন।');
  }
  const postId = sanitizeId(postIdRaw, 'post');
  const docPath = `communityPosts/${postId}`;
  const ref = doc(db, 'communityPosts', postId);

  const newReply: CommunityReply = {
    id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    authorId: uid,
    authorName: (author.fullName || auth.currentUser?.displayName || 'Student').trim().slice(0, 100),
    authorAvatarUrl: sanitizeImageDataOrUrl(author.avatarUrl, LIMITS.avatarMax),
    authorRole: author.role === 'admin' && isPrimaryOwnerAdmin() ? 'admin' : 'student',
    body: cleanBody,
    createdAt: new Date().toISOString(),
  };

  try {
    let updatedPost: CommunityPost | null = null;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new Error('Post not found.');
      }
      const data = snap.data() as Record<string, unknown>;
      const existingReplies = Array.isArray(data.replies) ? data.replies : [];
      const nextReplies = [...existingReplies, newReply].slice(-LIMITS.maxReplies);

      tx.update(ref, {
        replies: nextReplies,
        updatedAt: serverTimestamp(),
      });

      updatedPost = mapDocToCommunityPost(postId, {
        ...data,
        replies: nextReplies,
      });
    });
    return updatedPost!;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function deleteCommunityPostInFirestore(postIdRaw: string): Promise<void> {
  const uid = ensureVerifiedFirebaseUid();
  if (!uid) {
    throw new Error('পোস্ট মুছতে সাইন ইন করুন।');
  }
  const postId = sanitizeId(postIdRaw, 'post');
  const docPath = `communityPosts/${postId}`;
  try {
    await deleteDoc(doc(db, 'communityPosts', postId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function fetchPublicProfileFromFirestore(
  userIdRaw: string
): Promise<{ profile: PublicStudentProfile; posts: CommunityPost[] } | null> {
  if (!isFirebaseConfigured || !userIdRaw || !VALID_ID_REGEX.test(userIdRaw)) return null;
  try {
    const [pubSnap, postsSnap] = await Promise.all([
      getDoc(doc(db, 'publicProfiles', userIdRaw)).catch(() => null),
      getDocs(
        query(
          collection(db, 'communityPosts'),
          where('isHidden', '==', false),
          where('authorId', '==', userIdRaw),
          limit(40)
        )
      ).catch(() => null),
    ]);

    const userPosts = postsSnap
      ? postsSnap.docs
          .map((d) => mapDocToCommunityPost(d.id, d.data() as Record<string, unknown>))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      : [];

    if (!pubSnap || !pubSnap.exists()) {
      if (userPosts.length === 0) return null;
      const first = userPosts[0];
      return {
        profile: {
          id: userIdRaw,
          fullName: first.authorName,
          role: first.authorRole,
          avatarUrl: first.authorAvatarUrl || '',
          coverUrl: '',
          bio: '',
          department: first.authorDepartment,
          semester: first.semester,
          collegeName: first.authorCollegeName || '',
          gender: '',
          showGender: false,
          profileVisibility: 'public',
          createdAt: first.createdAt,
          postsCount: userPosts.length,
        },
        posts: userPosts,
      };
    }

    const d = pubSnap.data() as Record<string, unknown>;
    return {
      profile: {
        id: userIdRaw,
        fullName: String(d.fullName || 'Student'),
        role: d.role === 'admin' ? 'admin' : 'student',
        avatarUrl: typeof d.avatarUrl === 'string' ? d.avatarUrl : '',
        coverUrl: typeof d.coverUrl === 'string' ? d.coverUrl : '',
        bio: typeof d.bio === 'string' ? d.bio : '',
        department: String(d.department || 'power'),
        semester: sanitizeSemester(typeof d.semester === 'number' ? d.semester : 4),
        collegeName: typeof d.collegeName === 'string' ? d.collegeName : '',
        gender: '',
        showGender: false,
        profileVisibility:
          d.profileVisibility === 'private' || d.profileVisibility === 'department'
            ? d.profileVisibility
            : 'public',
        createdAt: toIsoTimestamp(d.updatedAt),
        postsCount: userPosts.length,
      },
      posts: userPosts,
    };
  } catch {
    return null;
  }
}

export async function syncStudyNoteToFirestore(
  note: StudyNote,
  department: string,
  semester: number
): Promise<void> {
  const uid = ensureVerifiedFirebaseUid();
  if (!uid) return;

  const noteId = sanitizeId(note.id, 'note');
  const docPath = `users/${uid}/studyNotes/${noteId}`;
  const ref = doc(db, 'users', uid, 'studyNotes', noteId);

  const rawTitle = (note.title || 'Untitled Note').trim().slice(0, LIMITS.noteTitleMax);
  const safeTitle = rawTitle.length >= LIMITS.noteTitleMin ? rawTitle : 'Study Note';
  const safeContent = (note.content || '-').trim().slice(0, LIMITS.noteContentMax) || '-';
  const safeSubject = (note.subjectName || '').trim().slice(0, LIMITS.subjectNameMax);
  const safeDept = sanitizeDepartment(department);
  const safeSem = sanitizeSemester(semester);

  return enqueueDocSync(docPath, async () => {
    const parentSync = inFlightSyncQueue.get(`users/${uid}`);
    if (parentSync) {
      await parentSync.catch(() => {});
    }
    let opType: OperationType = OperationType.WRITE;
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) {
          opType = OperationType.CREATE;
          tx.set(ref, {
            id: noteId,
            userId: uid,
            title: safeTitle,
            content: safeContent,
            subjectName: safeSubject,
            department: safeDept,
            semester: safeSem,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          opType = OperationType.UPDATE;
          tx.update(ref, {
            title: safeTitle,
            content: safeContent,
            subjectName: safeSubject,
            department: safeDept,
            semester: safeSem,
            updatedAt: serverTimestamp(),
          });
        }
      });
    } catch (error) {
      handleFirestoreError(error, opType, docPath);
    }
  });
}

export async function deleteStudyNoteFromFirestore(noteIdRaw: string): Promise<void> {
  const uid = ensureVerifiedFirebaseUid();
  if (!uid) return;

  const noteId = sanitizeId(noteIdRaw, 'note');
  const docPath = `users/${uid}/studyNotes/${noteId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'studyNotes', noteId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function syncPdfMetadataToFirestore(pdf: UserPdfRecord): Promise<void> {
  const uid = ensureVerifiedFirebaseUid();
  if (!uid) return;

  const pdfId = sanitizeId(pdf.id, 'pdf');
  const docPath = `users/${uid}/pdfCatalog/${pdfId}`;
  const ref = doc(db, 'users', uid, 'pdfCatalog', pdfId);

  const safeCustomName = (pdf.customTitle || pdf.originalFilename || 'Document')
    .trim()
    .slice(0, LIMITS.pdfCustomNameMax);
  const safeFileName = (pdf.originalFilename || 'document.pdf')
    .trim()
    .slice(0, LIMITS.pdfFileNameMax);
  const safeDept = sanitizeDepartment(pdf.department);
  const safeSem = sanitizeSemester(pdf.semester);
  const safeSubjectCode = (pdf.subjectName || '').trim().slice(0, LIMITS.subjectCodeMax);
  const safeSize = Math.min(
    LIMITS.maxPdfBytes,
    Math.max(0, Math.trunc(Number(pdf.fileSizeBytes) || 0))
  );

  return enqueueDocSync(docPath, async () => {
    const parentSync = inFlightSyncQueue.get(`users/${uid}`);
    if (parentSync) {
      await parentSync.catch(() => {});
    }
    let opType: OperationType = OperationType.WRITE;
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) {
          opType = OperationType.CREATE;
          tx.set(ref, {
            id: pdfId,
            userId: uid,
            customName: safeCustomName,
            fileName: safeFileName,
            department: safeDept,
            semester: safeSem,
            subjectCode: safeSubjectCode,
            fileSizeBytes: safeSize,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          opType = OperationType.UPDATE;
          tx.update(ref, {
            customName: safeCustomName,
            department: safeDept,
            semester: safeSem,
            subjectCode: safeSubjectCode,
            updatedAt: serverTimestamp(),
          });
        }
      });
    } catch (error) {
      handleFirestoreError(error, opType, docPath);
    }
  });
}

export async function deletePdfMetadataFromFirestore(pdfIdRaw: string): Promise<void> {
  const uid = ensureVerifiedFirebaseUid();
  if (!uid) return;

  const pdfId = sanitizeId(pdfIdRaw, 'pdf');
  const docPath = `users/${uid}/pdfCatalog/${pdfId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'pdfCatalog', pdfId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export function subscribeUserStudyNotes(
  onNotes: (notes: StudyNote[]) => void
): Unsubscribe {
  const uid = ensureVerifiedFirebaseUid();
  if (!uid) return () => {};

  const collectionPath = `users/${uid}/studyNotes`;
  const q = query(
    collection(db, 'users', uid, 'studyNotes'),
    where('userId', '==', uid),
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const notes: StudyNote[] = snapshot.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: String(data.id || d.id),
          title: String(data.title || ''),
          content: String(data.content || ''),
          subjectName: data.subjectName ? String(data.subjectName) : undefined,
          pinned: false,
          createdAt: toIsoTimestamp(data.createdAt),
          updatedAt: toIsoTimestamp(data.updatedAt),
        };
      });
      onNotes(notes);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, collectionPath);
    }
  );
}

// ============================================================================
// ADMIN MANAGEMENT & REAL-TIME PUSH NOTIFICATIONS (CLOUD FIRESTORE)
// ============================================================================

export function isVerifiedAdminFirebaseSession(): boolean {
  if (!isFirebaseConfigured) return false;
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.uid || !fbUser.emailVerified) return false;
  return VALID_ID_REGEX.test(fbUser.uid) && fbUser.uid.length <= LIMITS.idMax;
}

function mapNoticeDoc(id: string, data: Record<string, unknown>): PlatformNotice {
  const rawCat = String(data.category || 'general');
  const category: PlatformNotice['category'] =
    rawCat === 'exam' || rawCat === 'result' || rawCat === 'urgent' ? rawCat : 'general';
  return {
    id: String(data.id || id),
    title: String(data.title || ''),
    body: String(data.body || ''),
    category,
    officialLink: String(data.officialLink || ''),
    pinned: Boolean(data.pinned),
    createdAt: toIsoTimestamp(data.createdAt),
  };
}

function mapCampaignDoc(id: string, data: Record<string, unknown>): PushNotificationCampaign {
  const rawCat = String(data.category || 'GENERAL');
  const validCats: PushCategory[] = ['APP_UPDATE', 'IMPORTANT', 'EDUCATION', 'EMERGENCY', 'GENERAL'];
  const category: PushCategory = validCats.includes(rawCat as PushCategory)
    ? (rawCat as PushCategory)
    : 'GENERAL';
  const rawAudience = String(data.audienceType || 'all');
  const audienceType: PushAudienceType =
    rawAudience === 'selected_users' || rawAudience === 'department_semester'
      ? rawAudience
      : 'all';
  const rawSound = String(data.soundMode || 'custom');
  const soundMode: PushSoundMode =
    rawSound === 'default' || rawSound === 'silent' ? rawSound : 'custom';
  const rawStatus = String(data.status || 'sent');
  const status: PushNotificationCampaign['status'] =
    rawStatus === 'partial' || rawStatus === 'failed' ? rawStatus : 'sent';
  const rawSem = Number(data.targetSemester || 0);

  return {
    id: String(data.id || id),
    title: String(data.title || ''),
    body: String(data.body || ''),
    category,
    imageUrl: String(data.imageUrl || ''),
    targetView: String(data.targetView || 'notifications'),
    actionUrl: String(data.actionUrl || ''),
    audienceType,
    targetUserIds: Array.isArray(data.targetUserIds) ? data.targetUserIds.map(String) : [],
    targetDepartment: String(data.targetDepartment || ''),
    targetSemester: rawSem >= 1 && rawSem <= 8 ? rawSem : null,
    soundMode,
    status,
    totalRecipients: Math.max(0, Math.trunc(Number(data.totalRecipients) || 0)),
    fcmSentCount: 0,
    fcmFailedCount: 0,
    createdBy: String(data.createdBy || ''),
    createdAt: toIsoTimestamp(data.createdAt),
  };
}

export async function fetchAllUsersForAdminFromFirestore(): Promise<AuthUser[]> {
  if (!isVerifiedAdminFirebaseSession()) return [];
  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(300)));
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const uid = String(data.uid || d.id);
      const college = String(data.collegeName || '');
      const gender: '' | 'male' | 'female' =
        data.gender === 'male' || data.gender === 'female' ? data.gender : '';
      const profileVisibility: 'public' | 'department' | 'private' =
        data.profileVisibility === 'private' || data.profileVisibility === 'department'
          ? data.profileVisibility
          : 'public';
      const authProvider =
        data.authProvider === 'google' ||
        data.authProvider === 'facebook' ||
        data.authProvider === 'email'
          ? data.authProvider
          : undefined;
      return {
        id: uid,
        firebaseUid: uid,
        authProvider,
        fullName: String(data.fullName || 'Student'),
        email: String(data.email || ''),
        role: data.role === 'admin' ? 'admin' : 'student',
        avatarUrl: String(data.avatarUrl || ''),
        coverUrl: String(data.coverUrl || ''),
        gender,
        showGender: Boolean(data.showGender),
        bio: String(data.bio || ''),
        department: String(data.department || 'power'),
        semester: sanitizeSemester(typeof data.semester === 'number' ? data.semester : 4),
        collegeName: college,
        instituteName: college,
        rollNumber: String(data.rollNumber || ''),
        profileVisibility,
        isDisabled: Boolean(data.isDisabled),
        createdAt: toIsoTimestamp(data.createdAt),
        updatedAt: toIsoTimestamp(data.updatedAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
  }
}

export async function adminSetUserRoleInFirestore(
  userIdRaw: string,
  role: UserRole,
  emailHint = ''
): Promise<void> {
  if (!isVerifiedAdminFirebaseSession()) return;
  const uid = sanitizeId(userIdRaw, 'usr');
  const userRef = doc(db, 'users', uid);
  const publicRef = doc(db, 'publicProfiles', uid);
  const adminMarkerRef = doc(db, 'admins', uid);

  try {
    const snap = await getDoc(userRef);
    const resolvedEmail =
      (snap.exists() ? String((snap.data() as Record<string, unknown>).email || '') : '') ||
      emailHint;
    if (snap.exists()) {
      await updateDoc(userRef, {
        role,
        updatedAt: serverTimestamp(),
      });
    }
    const pubSnap = await getDoc(publicRef);
    if (pubSnap.exists()) {
      await updateDoc(publicRef, {
        role,
        updatedAt: serverTimestamp(),
      });
    }
    if (role === 'admin' && resolvedEmail && resolvedEmail.length >= 3) {
      await setDoc(adminMarkerRef, {
        uid,
        email: resolvedEmail.trim().slice(0, LIMITS.emailMax),
        grantedAt: serverTimestamp(),
      });
    } else if (role === 'student') {
      await deleteDoc(adminMarkerRef).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function adminSetUserStatusInFirestore(
  userIdRaw: string,
  isDisabled: boolean
): Promise<void> {
  if (!isVerifiedAdminFirebaseSession()) return;
  const uid = sanitizeId(userIdRaw, 'usr');
  const userRef = doc(db, 'users', uid);
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;
    await updateDoc(userRef, {
      isDisabled: Boolean(isDisabled),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function adminModerateCommunityPostInFirestore(
  postIdRaw: string,
  payload: { isHidden?: boolean }
): Promise<CommunityPost | null> {
  if (!isVerifiedAdminFirebaseSession()) return null;
  const postId = sanitizeId(postIdRaw, 'post');
  const ref = doc(db, 'communityPosts', postId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const nextHidden =
      typeof payload.isHidden === 'boolean'
        ? payload.isHidden
        : Boolean((snap.data() as Record<string, unknown>).isHidden);
    await updateDoc(ref, {
      isHidden: nextHidden,
      updatedAt: serverTimestamp(),
    });
    const updatedSnap = await getDoc(ref);
    if (!updatedSnap.exists()) return null;
    const d = updatedSnap.data() as Record<string, unknown>;
    return {
      id: String(d.id || postId),
      authorId: String(d.authorId || ''),
      authorName: String(d.authorName || 'Student'),
      authorAvatarUrl: String(d.authorAvatarUrl || ''),
      authorCollegeName: String(d.authorCollegeName || ''),
      authorDepartment: String(d.authorDepartment || d.department || 'power'),
      authorRole: d.authorRole === 'admin' ? 'admin' : 'student',
      department: String(d.department || 'power'),
      semester: sanitizeSemester(typeof d.semester === 'number' ? d.semester : 4),
      subjectTag: String(d.subjectTag || ''),
      title: String(d.title || ''),
      body: String(d.body || ''),
      imageUrl: String(d.imageUrl || ''),
      likedByUserIds: Array.isArray(d.likedByUserIds) ? d.likedByUserIds.map(String) : [],
      reportsCount: 0,
      isHidden: Boolean(d.isHidden),
      replies: Array.isArray(d.replies) ? (d.replies as CommunityReply[]) : [],
      createdAt: toIsoTimestamp(d.createdAt),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `communityPosts/${postId}`);
  }
}

// --- Platform Notices ---
export async function fetchPlatformNoticesFromFirestore(): Promise<PlatformNotice[]> {
  if (!isFirebaseConfigured) return [];
  try {
    const snap = await getDocs(
      query(collection(db, 'platformNotices'), orderBy('createdAt', 'desc'), limit(50))
    );
    return snap.docs.map((d) => mapNoticeDoc(d.id, d.data() as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function adminCreateNoticeInFirestore(
  input: Omit<PlatformNotice, 'id' | 'createdAt'>,
  idOverride?: string
): Promise<PlatformNotice> {
  const uid = auth.currentUser?.uid;
  if (!uid || !isVerifiedAdminFirebaseSession()) {
    throw new Error('Admin Firebase session is required to publish notices.');
  }
  const noticeId = sanitizeId(idOverride || `ntc-${Date.now()}`, 'ntc');
  const title = (input.title || '').trim().slice(0, 180);
  const body = (input.body || '').trim().slice(0, 4000);
  if (title.length < 2 || body.length < 2) {
    throw new Error('Notice title and body must be at least 2 characters.');
  }
  const category: PlatformNotice['category'] =
    input.category === 'exam' || input.category === 'result' || input.category === 'urgent'
      ? input.category
      : 'general';
  const officialLink = (input.officialLink || '').trim().slice(0, 500);

  try {
    await setDoc(doc(db, 'platformNotices', noticeId), {
      id: noticeId,
      title,
      body,
      category,
      officialLink,
      pinned: Boolean(input.pinned),
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
    return {
      id: noticeId,
      title,
      body,
      category,
      officialLink,
      pinned: Boolean(input.pinned),
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `platformNotices/${noticeId}`);
  }
}

export async function adminDeleteNoticeInFirestore(noticeIdRaw: string): Promise<void> {
  if (!isVerifiedAdminFirebaseSession()) return;
  const noticeId = sanitizeId(noticeIdRaw, 'ntc');
  try {
    await deleteDoc(doc(db, 'platformNotices', noticeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `platformNotices/${noticeId}`);
  }
}

// --- Push Notifications (Real-Time Broadcasts) ---
export async function fetchPushNotificationsFromFirestore(): Promise<PushNotificationCampaign[]> {
  if (!isFirebaseConfigured || !auth.currentUser) return [];
  try {
    const snap = await getDocs(
      query(collection(db, 'pushNotifications'), orderBy('createdAt', 'desc'), limit(60))
    );
    return snap.docs.map((d) => mapCampaignDoc(d.id, d.data() as Record<string, unknown>));
  } catch {
    return [];
  }
}

export function subscribePushNotificationsFromFirestore(
  onCampaigns: (campaigns: PushNotificationCampaign[]) => void
): Unsubscribe {
  if (!isFirebaseConfigured || !auth.currentUser) return () => {};
  const q = query(collection(db, 'pushNotifications'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(
    q,
    (snapshot) => {
      onCampaigns(snapshot.docs.map((d) => mapCampaignDoc(d.id, d.data() as Record<string, unknown>)));
    },
    (error) => {
      console.warn('Firestore pushNotifications listener warning:', error.message);
    }
  );
}

export async function adminCreatePushNotificationInFirestore(
  input: {
    id?: string;
    title: string;
    body: string;
    category: PushCategory;
    imageUrl?: string;
    targetView?: string;
    actionUrl?: string;
    audienceType: PushAudienceType;
    targetUserIds?: string[];
    targetDepartment?: string;
    targetSemester?: number | null;
    soundMode?: PushSoundMode;
    totalRecipients?: number;
  }
): Promise<PushNotificationCampaign> {
  const uid = auth.currentUser?.uid;
  if (!uid || !isVerifiedAdminFirebaseSession()) {
    throw new Error('Admin Firebase session is required to send notifications.');
  }
  const campaignId = sanitizeId(input.id || `push-${Date.now()}`, 'push');
  const title = (input.title || '').trim().slice(0, 140);
  const body = (input.body || '').trim().slice(0, 1000);
  if (title.length < 2 || body.length < 2) {
    throw new Error('Notification title and message must be at least 2 characters.');
  }
  const validCats: PushCategory[] = ['APP_UPDATE', 'IMPORTANT', 'EDUCATION', 'EMERGENCY', 'GENERAL'];
  const category: PushCategory = validCats.includes(input.category) ? input.category : 'GENERAL';
  const audienceType: PushAudienceType =
    input.audienceType === 'selected_users' || input.audienceType === 'department_semester'
      ? input.audienceType
      : 'all';
  const targetUserIds = Array.isArray(input.targetUserIds)
    ? input.targetUserIds.map(String).filter(Boolean).slice(0, 200)
    : [];
  const targetDepartment = (input.targetDepartment || '').trim().slice(0, 40);
  const rawSem = Number(input.targetSemester || 0);
  const targetSemester = rawSem >= 1 && rawSem <= 8 ? Math.trunc(rawSem) : 0;
  const soundMode: PushSoundMode =
    input.soundMode === 'default' || input.soundMode === 'silent' ? input.soundMode : 'custom';
  const imageUrl = (input.imageUrl || '').trim().slice(0, 500);
  const targetView = (input.targetView || 'notifications').trim().slice(0, 60) || 'notifications';
  const actionUrl = (input.actionUrl || '').trim().slice(0, 500);
  const totalRecipients = Math.min(
    100000,
    Math.max(0, Math.trunc(Number(input.totalRecipients) || (audienceType === 'selected_users' ? targetUserIds.length : 1)))
  );

  try {
    await setDoc(doc(db, 'pushNotifications', campaignId), {
      id: campaignId,
      title,
      body,
      category,
      imageUrl,
      targetView,
      actionUrl,
      audienceType,
      targetUserIds,
      targetDepartment,
      targetSemester,
      soundMode,
      status: 'sent',
      totalRecipients,
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
    return {
      id: campaignId,
      title,
      body,
      category,
      imageUrl,
      targetView,
      actionUrl,
      audienceType,
      targetUserIds,
      targetDepartment,
      targetSemester: targetSemester > 0 ? targetSemester : null,
      soundMode,
      status: 'sent',
      totalRecipients,
      fcmSentCount: 0,
      fcmFailedCount: 0,
      createdBy: uid,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `pushNotifications/${campaignId}`);
  }
}

// --- Platform Formulas ---
export async function fetchPlatformFormulasFromFirestore(): Promise<FormulaItem[]> {
  if (!isFirebaseConfigured) return [];
  try {
    const snap = await getDocs(query(collection(db, 'platformFormulas'), limit(200)));
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: String(data.id || d.id),
        subject: data.subject === 'mathematics' ? 'mathematics' : 'physics',
        chapter: String(data.chapter || ''),
        chapterBn: String(data.chapterBn || data.chapter || ''),
        nameEn: String(data.nameEn || ''),
        nameBn: String(data.nameBn || data.nameEn || ''),
        expressionLatex: String(data.expressionLatex || ''),
        expressionPlain: String(data.expressionPlain || data.expressionLatex || ''),
        symbols: [],
        explanationBn: String(data.explanationBn || ''),
        explanationEn: String(data.explanationEn || ''),
        exampleProblemBn: String(data.exampleProblemBn || ''),
        exampleProblemEn: String(data.exampleProblemEn || ''),
        exampleSolutionBn: String(data.exampleSolutionBn || ''),
        exampleSolutionEn: String(data.exampleSolutionEn || ''),
        isCustom: true,
        updatedAt: toIsoTimestamp(data.updatedAt),
      };
    });
  } catch {
    return [];
  }
}

export async function adminSaveFormulaInFirestore(
  formula: Omit<FormulaItem, 'id'> & { id?: string }
): Promise<FormulaItem> {
  if (!isVerifiedAdminFirebaseSession()) {
    throw new Error('Admin Firebase session is required to save formulas.');
  }
  const formulaId = sanitizeId(
    formula.id || `${formula.subject === 'mathematics' ? 'math' : 'phy'}-custom-${Date.now()}`,
    'frm'
  );
  const subject: 'physics' | 'mathematics' =
    formula.subject === 'mathematics' ? 'mathematics' : 'physics';
  const payload = {
    id: formulaId,
    subject,
    chapter: (formula.chapter || 'general').trim().slice(0, 100) || 'general',
    chapterBn: (formula.chapterBn || formula.chapter || '').trim().slice(0, 140),
    nameEn: (formula.nameEn || formula.nameBn || 'Formula').trim().slice(0, 180) || 'Formula',
    nameBn: (formula.nameBn || formula.nameEn || '').trim().slice(0, 180),
    expressionLatex: (formula.expressionLatex || '').trim().slice(0, 500),
    expressionPlain: (formula.expressionPlain || formula.expressionLatex || '').trim().slice(0, 500),
    explanationBn: (formula.explanationBn || '').trim().slice(0, 2000),
    explanationEn: (formula.explanationEn || '').trim().slice(0, 2000),
    exampleProblemBn: (formula.exampleProblemBn || '').trim().slice(0, 1500),
    exampleProblemEn: (formula.exampleProblemEn || '').trim().slice(0, 1500),
    exampleSolutionBn: (formula.exampleSolutionBn || '').trim().slice(0, 2000),
    exampleSolutionEn: (formula.exampleSolutionEn || '').trim().slice(0, 2000),
    isCustom: true,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'platformFormulas', formulaId), payload);
    return {
      ...payload,
      symbols: formula.symbols ?? [],
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `platformFormulas/${formulaId}`);
  }
}

export async function adminDeleteFormulaInFirestore(formulaIdRaw: string): Promise<void> {
  if (!isVerifiedAdminFirebaseSession()) return;
  const formulaId = sanitizeId(formulaIdRaw, 'frm');
  try {
    await deleteDoc(doc(db, 'platformFormulas', formulaId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `platformFormulas/${formulaId}`);
  }
}

// --- Platform Shared Notes / PDFs ---
export async function fetchPlatformSharedNotesFromFirestore(): Promise<SharedPdfNote[]> {
  if (!isFirebaseConfigured) return [];
  try {
    const snap = await getDocs(
      query(collection(db, 'platformSharedNotes'), orderBy('createdAt', 'desc'), limit(150))
    );
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: String(data.id || d.id),
        title: String(data.title || ''),
        department: String(data.department || 'power'),
        semester: sanitizeSemester(typeof data.semester === 'number' ? data.semester : 4),
        subjectCode: String(data.subjectCode || ''),
        summary: String(data.summary || ''),
        pdfUrl: String(data.pdfUrl || ''),
        downloadPermitted: data.downloadPermitted !== false,
        createdAt: toIsoTimestamp(data.createdAt),
      };
    });
  } catch {
    return [];
  }
}

export async function adminSaveSharedNoteInFirestore(
  note: Omit<SharedPdfNote, 'id' | 'createdAt'> & { id?: string }
): Promise<SharedPdfNote> {
  if (!isVerifiedAdminFirebaseSession()) {
    throw new Error('Admin Firebase session is required to save shared notes.');
  }
  const noteId = sanitizeId(note.id || `sn-${Date.now()}`, 'sn');
  const ref = doc(db, 'platformSharedNotes', noteId);
  const safeFields = {
    id: noteId,
    title: (note.title || '').trim().slice(0, 200),
    department: sanitizeDepartment(note.department),
    semester: sanitizeSemester(note.semester),
    subjectCode: (note.subjectCode || '').trim().slice(0, 40),
    summary: (note.summary || '').trim().slice(0, 1000),
    pdfUrl: (note.pdfUrl || '').trim().slice(0, 1000),
    downloadPermitted: note.downloadPermitted !== false,
  };
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        title: safeFields.title,
        department: safeFields.department,
        semester: safeFields.semester,
        subjectCode: safeFields.subjectCode,
        summary: safeFields.summary,
        pdfUrl: safeFields.pdfUrl,
        downloadPermitted: safeFields.downloadPermitted,
      });
      return {
        ...safeFields,
        createdAt: toIsoTimestamp((snap.data() as Record<string, unknown>).createdAt),
      };
    }
    await setDoc(ref, {
      ...safeFields,
      createdAt: serverTimestamp(),
    });
    return {
      ...safeFields,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `platformSharedNotes/${noteId}`);
  }
}

export async function adminDeleteSharedNoteInFirestore(noteIdRaw: string): Promise<void> {
  if (!isVerifiedAdminFirebaseSession()) return;
  const noteId = sanitizeId(noteIdRaw, 'sn');
  try {
    await deleteDoc(doc(db, 'platformSharedNotes', noteId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `platformSharedNotes/${noteId}`);
  }
}

// --- Platform MCQs ---
export async function fetchPlatformMcqsFromFirestore(): Promise<(McqQuestion & { semester?: number })[]> {
  if (!isFirebaseConfigured) return [];
  try {
    const snap = await getDocs(
      query(collection(db, 'platformMcqs'), orderBy('createdAt', 'desc'), limit(200))
    );
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const rawOpts = Array.isArray(data.optionsBn) ? data.optionsBn.map(String) : ['', '', '', ''];
      const optionsBn: [string, string, string, string] = [
        rawOpts[0] || '',
        rawOpts[1] || '',
        rawOpts[2] || '',
        rawOpts[3] || '',
      ];
      const ci = Math.min(3, Math.max(0, Math.trunc(Number(data.correctIndex) || 0))) as 0 | 1 | 2 | 3;
      return {
        id: String(data.id || d.id),
        category: String(data.category || 'পাওয়ার টেকনোলজি'),
        department: sanitizeDepartment(typeof data.department === 'string' ? data.department : 'power') as McqQuestion['department'],
        semester: sanitizeSemester(typeof data.semester === 'number' ? data.semester : 4) as SemesterNumber,
        questionBn: String(data.questionBn || ''),
        optionsBn,
        correctIndex: ci,
        explanationBn: String(data.explanationBn || ''),
      };
    });
  } catch {
    return [];
  }
}

export async function adminCreateMcqInFirestore(
  mcq: {
    id?: string;
    category: string;
    department: string;
    semester: number;
    questionBn: string;
    optionsBn: [string, string, string, string];
    correctIndex: 0 | 1 | 2 | 3;
    explanationBn: string;
  }
): Promise<McqQuestion & { semester?: number }> {
  if (!isVerifiedAdminFirebaseSession()) {
    throw new Error('Admin Firebase session is required to publish MCQs.');
  }
  const mcqId = sanitizeId(mcq.id || `mcq-${Date.now()}`, 'mcq');
  const department = sanitizeDepartment(mcq.department);
  const semester = sanitizeSemester(mcq.semester) as SemesterNumber;
  const optionsBn: [string, string, string, string] = [
    String(mcq.optionsBn[0] || '').trim(),
    String(mcq.optionsBn[1] || '').trim(),
    String(mcq.optionsBn[2] || '').trim(),
    String(mcq.optionsBn[3] || '').trim(),
  ];
  const correctIndex = Math.min(3, Math.max(0, Math.trunc(Number(mcq.correctIndex) || 0))) as 0 | 1 | 2 | 3;
  try {
    await setDoc(doc(db, 'platformMcqs', mcqId), {
      id: mcqId,
      category: (mcq.category || 'General').trim().slice(0, 100) || 'General',
      department,
      semester,
      questionBn: (mcq.questionBn || '').trim().slice(0, 600),
      optionsBn,
      correctIndex,
      explanationBn: (mcq.explanationBn || '').trim().slice(0, 1200),
      createdAt: serverTimestamp(),
    });
    return {
      id: mcqId,
      category: (mcq.category || 'General').trim().slice(0, 100) || 'General',
      department: department as McqQuestion['department'],
      semester,
      questionBn: (mcq.questionBn || '').trim().slice(0, 600),
      optionsBn,
      correctIndex,
      explanationBn: (mcq.explanationBn || '').trim().slice(0, 1200),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `platformMcqs/${mcqId}`);
  }
}

export async function adminDeleteMcqInFirestore(mcqIdRaw: string): Promise<void> {
  if (!isVerifiedAdminFirebaseSession()) return;
  const mcqId = sanitizeId(mcqIdRaw, 'mcq');
  try {
    await deleteDoc(doc(db, 'platformMcqs', mcqId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `platformMcqs/${mcqId}`);
  }
}

// --- Platform App Config ---
export async function fetchPlatformAppConfigFromFirestore(): Promise<AppReleaseConfig | null> {
  if (!isFirebaseConfigured) return null;
  try {
    const snap = await getDoc(doc(db, 'platformConfig', 'main'));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    return {
      appVersion: String(data.appVersion || '2.0.0'),
      apkStatus: data.apkStatus === 'available' ? 'available' : 'coming_soon',
      apkDownloadUrl: String(data.apkDownloadUrl || ''),
      apkReleaseNotes: String(data.apkReleaseNotes || ''),
      btebResultUrl: String(data.btebResultUrl || 'https://result.bteb.gov.bd/result-search'),
      officialWebsiteUrl: String(data.officialWebsiteUrl || 'https://bteb.gov.bd/'),
      updatedAt: toIsoTimestamp(data.updatedAt),
    };
  } catch {
    return null;
  }
}

export async function adminSaveAppConfigInFirestore(
  config: Partial<AppReleaseConfig>
): Promise<AppReleaseConfig> {
  if (!isVerifiedAdminFirebaseSession()) {
    throw new Error('Admin Firebase session is required to update configuration.');
  }
  const existing = await fetchPlatformAppConfigFromFirestore();
  const merged = {
    appVersion: (config.appVersion ?? existing?.appVersion ?? '2.0.0').trim().slice(0, 40) || '2.0.0',
    apkStatus: (config.apkStatus ?? existing?.apkStatus ?? 'coming_soon') === 'available'
      ? ('available' as const)
      : ('coming_soon' as const),
    apkDownloadUrl: (config.apkDownloadUrl ?? existing?.apkDownloadUrl ?? '').trim().slice(0, 600),
    apkReleaseNotes: (config.apkReleaseNotes ?? existing?.apkReleaseNotes ?? '').trim().slice(0, 1000),
    btebResultUrl:
      (config.btebResultUrl ?? existing?.btebResultUrl ?? 'https://result.bteb.gov.bd/result-search')
        .trim()
        .slice(0, 600) || 'https://result.bteb.gov.bd/result-search',
    officialWebsiteUrl:
      (config.officialWebsiteUrl ?? existing?.officialWebsiteUrl ?? 'https://bteb.gov.bd/')
        .trim()
        .slice(0, 600) || 'https://bteb.gov.bd/',
  };

  try {
    await setDoc(doc(db, 'platformConfig', 'main'), {
      ...merged,
      updatedAt: serverTimestamp(),
    });
    return {
      ...merged,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'platformConfig/main');
  }
}

