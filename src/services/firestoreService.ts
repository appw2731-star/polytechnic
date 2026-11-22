import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import type { AuthUser, StudyNote, UserPdfRecord } from '../types/study';

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
  noteTitleMin: 2,
  noteTitleMax: 160,
  noteContentMax: 12000,
  subjectNameMax: 120,
  pdfCustomNameMax: 180,
  pdfFileNameMax: 200,
  subjectCodeMax: 40,
  maxPdfBytes: 52428800,
};

function sanitizeId(raw: string, fallbackPrefix = 'item'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, LIMITS.idMax);
  if (cleaned && VALID_ID_REGEX.test(cleaned)) return cleaned;
  return `${fallbackPrefix}_${Date.now()}`.slice(0, LIMITS.idMax);
}

function sanitizeDepartment(raw: string | undefined): string {
  const cleaned = (raw || 'power').toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, LIMITS.departmentMax);
  return cleaned.length >= 2 && VALID_DEPT_REGEX.test(cleaned) ? cleaned : 'power';
}

function sanitizeSemester(raw: number | undefined): number {
  const num = Math.trunc(Number(raw) || 1);
  return Math.min(8, Math.max(1, num));
}

function ensureVerifiedFirebaseUid(): string | null {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.uid || !fbUser.emailVerified) return null;
  if (!VALID_ID_REGEX.test(fbUser.uid) || fbUser.uid.length > LIMITS.idMax) return null;
  return fbUser.uid;
}

export async function syncUserProfileToFirestore(user: AuthUser): Promise<void> {
  const uid = ensureVerifiedFirebaseUid();
  if (!uid) return;

  const docPath = `users/${uid}`;
  const ref = doc(db, 'users', uid);

  const safeFullName = (user.fullName || 'Student').trim().slice(0, LIMITS.fullNameMax);
  const finalName = safeFullName.length >= LIMITS.fullNameMin ? safeFullName : 'Student';
  const safeEmail = (user.email || auth.currentUser?.email || 'student@example.com')
    .trim()
    .slice(0, LIMITS.emailMax);
  const safeDept = sanitizeDepartment(user.department);
  const safeSem = sanitizeSemester(user.semester);
  const safeCollege = (user.collegeName || user.instituteName || '').trim().slice(0, LIMITS.collegeMax);
  const safeRoll = (user.rollNumber || '').trim().slice(0, LIMITS.rollMax);
  const safeBio = (user.bio || '').trim().slice(0, LIMITS.bioMax);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid,
        fullName: finalName,
        email: safeEmail,
        department: safeDept,
        semester: safeSem,
        collegeName: safeCollege,
        rollNumber: safeRoll,
        bio: safeBio,
        role: 'student',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        fullName: finalName,
        department: safeDept,
        semester: safeSem,
        collegeName: safeCollege,
        rollNumber: safeRoll,
        bio: safeBio,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
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

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
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
      await updateDoc(ref, {
        title: safeTitle,
        content: safeContent,
        subjectName: safeSubject,
        department: safeDept,
        semester: safeSem,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
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
  const safeFileName = (pdf.originalFilename || 'document.pdf').trim().slice(0, LIMITS.pdfFileNameMax);
  const safeDept = sanitizeDepartment(pdf.department);
  const safeSem = sanitizeSemester(pdf.semester);
  const safeSubjectCode = (pdf.subjectName || '').trim().slice(0, LIMITS.subjectCodeMax);
  const safeSize = Math.min(LIMITS.maxPdfBytes, Math.max(0, Math.trunc(Number(pdf.fileSizeBytes) || 0)));

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
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
      await updateDoc(ref, {
        customName: safeCustomName,
        department: safeDept,
        semester: safeSem,
        subjectCode: safeSubjectCode,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
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
        const toIso = (val: unknown): string => {
          if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
            return (val as { toDate: () => Date }).toDate().toISOString();
          }
          return new Date().toISOString();
        };
        return {
          id: String(data.id || d.id),
          title: String(data.title || ''),
          content: String(data.content || ''),
          subjectName: data.subjectName ? String(data.subjectName) : undefined,
          pinned: false,
          createdAt: toIso(data.createdAt),
          updatedAt: toIso(data.updatedAt),
        };
      });
      onNotes(notes);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, collectionPath);
    }
  );
}
