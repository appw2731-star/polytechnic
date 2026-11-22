# Polytechnic Hub — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default Deny**: Any unspecified Firestore path (`/test/connection`, unknown collections, nested shadows) is denied by default.
2. **PII Isolation**: `/users/{userId}` documents contain PII (`email`, `rollNumber`) and are strictly readable only by the owning user (`request.auth.uid == userId`) or a verified admin (`isAdmin()`). Blanket `isSignedIn()` reads and non-admin `list` queries on `/users` are forbidden.
3. **No Self-Assigned Roles**: On `/users/{userId}` creation, `role` MUST equal `'student'`; a standard user cannot create or escalate themselves to `role: 'admin'`, nor create documents inside `/admins/{userId}`.
4. **Master Gate Subcollections**: Writing to `/users/{userId}/studyNotes/{noteId}` or `/users/{userId}/pdfCatalog/{pdfId}` requires the parent `/users/$(userId)` document to exist (`exists(...)`), preventing orphaned records.
5. **Strict Key & Volumetric Validation**: Every `create` verifies exact required + allowed keys (`hasAll` + `hasOnly`), exact field types, `semester` in `[1..8]`, regex-checked IDs (`^[a-zA-Z0-9_\-]+$`, max 128 chars), and server timestamps (`request.time`).
6. **Immutable Ownership & Timestamps**: `uid`, `userId`, `id`, and `createdAt` cannot be modified after creation. Every update checks `isValid[Entity](incoming())` and `affectedKeys().hasOnly(...)`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Privilege Escalation (`create /users/u1`)**: `{ uid: 'u1', fullName: 'Bob', email: 'bob@x.com', department: 'power', semester: 4, role: 'admin', createdAt: serverTimestamp, updatedAt: serverTimestamp }` -> **DENIED** (`role != 'student'`).
2. **Role Escalation via Update (`update /users/u1`)**: `{ ...existing, role: 'admin', updatedAt: serverTimestamp }` -> **DENIED** (`affectedKeys` disallows `role` for non-admin).
3. **Ghost Shadow Field (`create /users/u1`)**: `{ ...validUser, isVerified: true }` -> **DENIED** (`hasOnly` rejects unknown key `isVerified`).
4. **Cross-User PII Read (`get /users/u2` as `u1`)**: Authenticated non-admin `u1` attempting to read `u2` -> **DENIED** (PII isolation).
5. **Blanket User Directory Scrape (`list /users` as `u1`)**: Authenticated non-admin listing `/users` -> **DENIED** (`allow list: if isAdmin()`).
6. **Admin Spoofing Without Verified Email (`create /admins/u1`)**: Token has `email: 'webrokib@gmail.com'`, `email_verified: false` -> **DENIED** (`isAdmin()` checks `email_verified == true`).
7. **Identity Spoofing in Subcollection (`create /users/u1/studyNotes/n1`)**: `{ id: 'n1', userId: 'u2', ... }` -> **DENIED** (`userId != request.auth.uid`).
8. **Path Variable ID Poisoning (`create /users/u1/studyNotes/invalid$id...`)**: Document ID failing `^[a-zA-Z0-9_\-]+$` or >128 bytes -> **DENIED** (`isValidId(noteId)`).
9. **Orphaned Subcollection Write (`create /users/u1/pdfCatalog/p1`)**: Parent `/users/u1` does not exist -> **DENIED** (`exists(/users/u1)` Master Gate).
10. **Payload Resource Exhaustion (`create /users/u1/studyNotes/n1`)**: `content` exceeding 12,000 chars or `title` exceeding 160 chars -> **DENIED**.
11. **Timestamp Forgery (`create /users/u1/studyNotes/n1`)**: Client sets `createdAt` to past/future custom timestamp instead of `request.time` -> **DENIED** (`incoming().createdAt == request.time`).
12. **Immutable Field Tampering (`update /users/u1/pdfCatalog/p1`)**: Modifying `createdAt` or `fileName` when renaming `customName` -> **DENIED** (`incoming().createdAt == existing().createdAt` + `affectedKeys().hasOnly(...)`).
