-- Polytechnic Hub v2 Upgrade — Complete Supabase Auth, PostgreSQL, Storage & RLS Migration
-- Run this script inside your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query).

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. PROFILES TABLE (Extended with avatar, optional gender, bio, college, privacy)
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Diploma Student',
  email text not null unique,
  role text not null default 'student' check (role in ('student', 'admin')),
  avatar_url text default '',
  gender text default '' check (gender in ('', 'male', 'female')),
  show_gender boolean not null default false,
  bio text default '',
  department text not null default 'power',
  semester int not null default 4 check (semester between 1 and 8),
  college_name text default '',
  institute_name text default '',
  roll_number text default '',
  profile_visibility text not null default 'department' check (profile_visibility in ('public', 'department', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists avatar_url text default '';
alter table public.profiles add column if not exists gender text default '';
alter table public.profiles add column if not exists show_gender boolean not null default false;
alter table public.profiles add column if not exists bio text default '';
alter table public.profiles add column if not exists college_name text default '';
alter table public.profiles add column if not exists profile_visibility text not null default 'department';

-- Auto-create profile row on Email Sign-up or Google OAuth sign-in
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    email,
    avatar_url,
    department,
    semester,
    college_name
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', ''),
    coalesce(new.raw_user_meta_data ->> 'department', 'power'),
    greatest(1, least(8, coalesce((new.raw_user_meta_data ->> 'semester')::int, 4))),
    coalesce(new.raw_user_meta_data ->> 'college_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================================
-- 2. USER PRIVATE PDF LIBRARY
-- ============================================================================
create table if not exists public.user_pdfs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  custom_title text not null,
  original_filename text not null,
  storage_path text not null unique,
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 52428800),
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_pdfs_user_id on public.user_pdfs(user_id, created_at desc);

-- ============================================================================
-- 3. PHYSICS FORMULAS & MATHEMATICS FORMULAS (Admin-managed, Publicly readable)
-- ============================================================================
create table if not exists public.physics_formulas (
  id text primary key,
  chapter text not null,
  chapter_bn text not null,
  name_en text not null,
  name_bn text not null,
  expression_latex text not null,
  expression_plain text not null,
  symbols jsonb not null default '[]'::jsonb,
  explanation_bn text not null,
  explanation_en text not null,
  example_problem_bn text not null default '',
  example_problem_en text not null default '',
  example_solution_bn text not null default '',
  example_solution_en text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mathematics_formulas (
  id text primary key,
  chapter text not null,
  chapter_bn text not null,
  name_en text not null,
  name_bn text not null,
  expression_latex text not null,
  expression_plain text not null,
  symbols jsonb not null default '[]'::jsonb,
  explanation_bn text not null,
  explanation_en text not null,
  example_problem_bn text not null default '',
  example_problem_en text not null default '',
  example_solution_bn text not null default '',
  example_solution_en text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 4. AI CHAT HISTORY (Strictly Private Per User)
-- ============================================================================
create table if not exists public.chat_history (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  session_title text not null default 'New Chat',
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  mode text not null default 'explain',
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_history_user_session on public.chat_history(user_id, session_id, created_at asc);

-- ============================================================================
-- 5. FAVORITES (Formulas / PDFs — Strictly Private Per User)
-- ============================================================================
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('physics_formula', 'mathematics_formula', 'pdf')),
  item_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.user_pdfs enable row level security;
alter table public.physics_formulas enable row level security;
alter table public.mathematics_formulas enable row level security;
alter table public.chat_history enable row level security;
alter table public.favorites enable row level security;

-- Profiles RLS: strict privacy + anti-escalation
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_select_privacy" on public.profiles;
create policy "profiles_select_privacy" on public.profiles
  for select using (
    auth.uid() = id
    or public.is_admin()
    or profile_visibility in ('public', 'department')
  );

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id and role = 'student');

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
  for update
  using (auth.uid() = id or public.is_admin())
  with check (
    public.is_admin()
    or (
      auth.uid() = id
      and role = (select p.role from public.profiles p where p.id = auth.uid())
    )
  );

-- User Private PDFs RLS (No user can read/modify/delete another user's private PDFs)
drop policy if exists "user_pdfs_owner_select" on public.user_pdfs;
create policy "user_pdfs_owner_select" on public.user_pdfs
  for select using (auth.uid() = user_id);

drop policy if exists "user_pdfs_owner_insert" on public.user_pdfs;
create policy "user_pdfs_owner_insert" on public.user_pdfs
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_pdfs_owner_update" on public.user_pdfs;
create policy "user_pdfs_owner_update" on public.user_pdfs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_pdfs_owner_delete" on public.user_pdfs;
create policy "user_pdfs_owner_delete" on public.user_pdfs
  for delete using (auth.uid() = user_id);

-- Physics & Mathematics Formulas RLS
drop policy if exists "physics_formulas_read_all" on public.physics_formulas;
create policy "physics_formulas_read_all" on public.physics_formulas
  for select using (true);

drop policy if exists "physics_formulas_admin_write" on public.physics_formulas;
create policy "physics_formulas_admin_write" on public.physics_formulas
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "mathematics_formulas_read_all" on public.mathematics_formulas;
create policy "mathematics_formulas_read_all" on public.mathematics_formulas
  for select using (true);

drop policy if exists "mathematics_formulas_admin_write" on public.mathematics_formulas;
create policy "mathematics_formulas_admin_write" on public.mathematics_formulas
  for all using (public.is_admin()) with check (public.is_admin());

-- Chat History RLS (Strictly Owner Only)
drop policy if exists "chat_history_owner_all" on public.chat_history;
create policy "chat_history_owner_all" on public.chat_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Favorites RLS (Strictly Owner Only)
drop policy if exists "favorites_owner_all" on public.favorites;
create policy "favorites_owner_all" on public.favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- 7. SUPABASE STORAGE BUCKETS & POLICIES
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

-- Private PDF Storage Policies: strictly scoped to owner folder `${auth.uid()}/...`
drop policy if exists "user_pdfs_storage_select_own" on storage.objects;
create policy "user_pdfs_storage_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'user-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "user_pdfs_storage_insert_own" on storage.objects;
create policy "user_pdfs_storage_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'user-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "user_pdfs_storage_update_own" on storage.objects;
create policy "user_pdfs_storage_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'user-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "user_pdfs_storage_delete_own" on storage.objects;
create policy "user_pdfs_storage_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'user-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Avatar Storage Policies
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
