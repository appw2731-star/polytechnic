// Firestore Rules Verification Specification (Dirty Dozen Adversarial Suite)
// Validates security assertions documented in security_spec.md against firestore.rules.

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'create' | 'update' | 'get' | 'list';
  path: string;
  expected: 'PERMISSION_DENIED';
  payload?: Record<string, unknown>;
  reason: string;
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Self-assigned admin role on signup',
    operation: 'create',
    path: '/users/u1',
    expected: 'PERMISSION_DENIED',
    payload: { uid: 'u1', fullName: 'Bob', email: 'bob@example.com', department: 'power', semester: 4, role: 'admin' },
    reason: 'incoming().role == "student" enforced on user creation unless isAdmin().',
  },
  {
    id: 2,
    name: 'Privilege escalation via profile update',
    operation: 'update',
    path: '/users/u1',
    expected: 'PERMISSION_DENIED',
    payload: { role: 'admin' },
    reason: 'affectedKeys().hasOnly() restricts non-admin profile updates away from role.',
  },
  {
    id: 3,
    name: 'Shadow ghost field injection',
    operation: 'create',
    path: '/users/u1',
    expected: 'PERMISSION_DENIED',
    payload: { uid: 'u1', role: 'student', isVerified: true },
    reason: 'keys().hasOnly() rejects undeclared keys.',
  },
  {
    id: 4,
    name: 'Cross-user PII profile read',
    operation: 'get',
    path: '/users/u2',
    expected: 'PERMISSION_DENIED',
    reason: 'PII isolation limits read to isOwner(userId) || isAdmin().',
  },
  {
    id: 5,
    name: 'Unauthorized user list scraping',
    operation: 'list',
    path: '/users',
    expected: 'PERMISSION_DENIED',
    reason: 'allow list on /users restricted to isAdmin().',
  },
  {
    id: 6,
    name: 'Unverified email spoofing admin check',
    operation: 'create',
    path: '/admins/u1',
    expected: 'PERMISSION_DENIED',
    reason: 'Bootstrapped admin check requires email_verified == true.',
  },
  {
    id: 7,
    name: 'Subcollection userId spoofing',
    operation: 'create',
    path: '/users/u1/studyNotes/n1',
    expected: 'PERMISSION_DENIED',
    payload: { id: 'n1', userId: 'u2', title: 'Spoof' },
    reason: 'Validation helper mandates userId == request.auth.uid == path userId.',
  },
  {
    id: 8,
    name: 'Path variable ID poisoning',
    operation: 'create',
    path: '/users/u1/studyNotes/bad$id',
    expected: 'PERMISSION_DENIED',
    reason: 'isValidId(noteId) rejects characters outside ^[a-zA-Z0-9_\\-]+$.',
  },
  {
    id: 9,
    name: 'Orphaned PDF metadata creation without parent user doc',
    operation: 'create',
    path: '/users/u1/pdfCatalog/p1',
    expected: 'PERMISSION_DENIED',
    reason: 'Master Gate requires exists(/databases/$(database)/documents/users/$(userId)).',
  },
  {
    id: 10,
    name: 'Oversized study note content exhaustion',
    operation: 'create',
    path: '/users/u1/studyNotes/n1',
    expected: 'PERMISSION_DENIED',
    reason: 'content.size() <= 12000 boundary enforced.',
  },
  {
    id: 11,
    name: 'Client-forged createdAt timestamp',
    operation: 'create',
    path: '/users/u1/studyNotes/n1',
    expected: 'PERMISSION_DENIED',
    reason: 'Temporal integrity requires incoming().createdAt == request.time.',
  },
  {
    id: 12,
    name: 'Immutable createdAt tampering on update',
    operation: 'update',
    path: '/users/u1/pdfCatalog/p1',
    expected: 'PERMISSION_DENIED',
    reason: 'Update enforces incoming().createdAt == existing().createdAt and strict affectedKeys.',
  },
];
