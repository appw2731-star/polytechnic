-- Polytechnic Hub v3 Repair & Upgrade Migration (Idempotent)
-- Safely repairs profiles (Firebase UID + duplicate prevention), user_pdfs (dept/semester),
-- pdf_books catalog, notification_preferences sound_style ('chime','alert','soft','bell','system'),
-- chat_history, and Storage buckets/RLS policies.

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. PROFILES REPAIR (Unified Firebase Auth UID + Duplicate Prevention)
-- ============================================================================
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();

alter table public.profiles add column if not exists firebase_uid text;
alter table public.profiles add column if not exists is_disabled boolean not null default false;

create unique index if not exists idx_profiles_firebase_uid_unique
  on public.profiles(firebase_uid)
  where firebase_uid is not null and firebase_uid <> '';

create index if not exists idx_profiles_email_lower
  on public.profiles(lower(email));

-- ============================================================================
-- 2. USER PRIVATE PDFs (Department & Semester Organization)
-- ============================================================================
alter table public.user_pdfs drop constraint if exists user_pdfs_user_id_fkey;

alter table public.user_pdfs add column if not exists department text not null default 'power';
alter table public.user_pdfs add column if not exists semester int not null default 4;
alter table public.user_pdfs add column if not exists subject_name text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_pdfs'::regclass
      and conname = 'user_pdfs_semester_check'
  ) then
    alter table public.user_pdfs
      add constraint user_pdfs_semester_check check (semester between 1 and 8);
  end if;
end $$;

create index if not exists idx_user_pdfs_dept_sem
  on public.user_pdfs(department, semester, created_at desc);

-- ============================================================================
-- 3. ADMIN PDF BOOKS CATALOG (Publicly Readable, Admin-Managed)
-- ============================================================================
create table if not exists public.pdf_books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text not null default 'power',
  semester int not null default 4 check (semester between 1 and 8),
  subject_code text not null default '',
  summary text not null default '',
  pdf_url text not null default '',
  storage_path text not null default '',
  file_size_bytes bigint not null default 0,
  download_permitted boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pdf_books_dept_sem
  on public.pdf_books(department, semester, created_at desc);

alter table public.pdf_books enable row level security;

drop policy if exists "pdf_books_read_all" on public.pdf_books;
create policy "pdf_books_read_all" on public.pdf_books
  for select using (true);

drop policy if exists "pdf_books_admin_write" on public.pdf_books;
create policy "pdf_books_admin_write" on public.pdf_books
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- 4. NOTIFICATION PREFERENCES (Support 'chime', 'alert', 'soft', 'bell', 'system')
-- ============================================================================
alter table public.notification_preferences drop constraint if exists notification_preferences_user_id_fkey;

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.notification_preferences'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%sound_style%'
  loop
    execute format('alter table public.notification_preferences drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.notification_preferences
  add constraint notification_preferences_sound_style_check
  check (sound_style in ('chime', 'alert', 'soft', 'bell', 'system'));

-- ============================================================================
-- 5. DETACH STRICT auth.users FKs ON USER DATA TABLES FOR UNIFIED PROFILE UUIDS
-- ============================================================================
alter table public.chat_history drop constraint if exists chat_history_user_id_fkey;
alter table public.favorites drop constraint if exists favorites_user_id_fkey;
alter table public.user_notifications drop constraint if exists user_notifications_user_id_fkey;
alter table public.device_tokens drop constraint if exists device_tokens_user_id_fkey;

-- ============================================================================
-- 6. ENSURE STORAGE BUCKETS EXIST
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-pdfs', 'user-pdfs', false, 52428800, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 52428800,
      allowed_mime_types = array['application/pdf'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];
