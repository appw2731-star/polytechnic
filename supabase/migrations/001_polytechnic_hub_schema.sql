-- Polytechnic Hub — Supabase PostgreSQL Schema & Row-Level Security (RLS)
-- Execute this file inside your Supabase SQL Editor when enabling Supabase cloud storage.

create extension if not exists "pgcrypto";

-- 1. Student & Admin Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role text not null default 'student' check (role in ('student', 'admin')),
  department text not null default 'power',
  semester int not null default 4 check (semester between 1 and 8),
  institute_name text default '',
  roll_number text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Diploma Books Library (Admin-managed official books & PDF links)
create table if not exists public.books (
  id text primary key,
  subject_code text not null,
  title_bn text not null,
  title_en text not null,
  department text not null,
  semester int not null check (semester between 1 and 8),
  credits numeric(3,1) default 3,
  author_or_publisher text default 'BTEB Official Curriculum',
  official_url text default 'https://bteb.gov.bd/',
  pdf_url text default '',
  download_permitted boolean not null default false,
  cover_accent text default 'cyan',
  description_bn text default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Platform & BTEB Notices
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  category text not null default 'general' check (category in ('general', 'exam', 'result', 'urgent')),
  official_link text default '',
  pinned boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 4. Shared Admin-Uploaded Study Notes & PDF Resources
create table if not exists public.shared_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text not null,
  semester int not null check (semester between 1 and 8),
  subject_code text default '',
  summary text not null default '',
  pdf_url text default '',
  download_permitted boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 5. Admin-Managed MCQ Bank
create table if not exists public.mcqs (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  department text not null default 'common',
  semester int default 1,
  question_bn text not null,
  options_bn jsonb not null,
  correct_index int not null check (correct_index between 0 and 3),
  explanation_bn text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 6. Student Community Forum Posts & Replies
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null,
  author_department text not null,
  department text not null default 'power',
  semester int not null default 4,
  subject_tag text default '',
  title text not null,
  body text not null,
  reports_count int not null default 0,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.community_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- 7. Student Book Favorites
create table if not exists public.user_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

-- 8. App Release & APK Config (Singleton row id = 1)
create table if not exists public.app_config (
  id int primary key default 1 check (id = 1),
  app_version text not null default '2.0.0',
  apk_status text not null default 'coming_soon' check (apk_status in ('coming_soon', 'available')),
  apk_download_url text default '',
  apk_release_notes text default '',
  bteb_result_url text not null default 'https://result.bteb.gov.bd/result-search',
  official_website_url text not null default 'https://bteb.gov.bd/',
  updated_at timestamptz not null default now()
);

insert into public.app_config (id) values (1) on conflict (id) do nothing;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.notices enable row level security;
alter table public.shared_notes enable row level security;
alter table public.mcqs enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_replies enable row level security;
alter table public.user_favorites enable row level security;
alter table public.app_config enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Profiles: users read own/public author info, update own non-role fields; admins manage all
create policy "profiles_select_authenticated" on public.profiles
  for select using (true);
create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id and role = 'student');
create policy "profiles_update_self_or_admin" on public.profiles
  for update using (auth.uid() = id or public.is_admin());

-- Public read tables managed strictly by Admin
create policy "books_read_all" on public.books for select using (true);
create policy "books_admin_write" on public.books for all using (public.is_admin());

create policy "notices_read_all" on public.notices for select using (true);
create policy "notices_admin_write" on public.notices for all using (public.is_admin());

create policy "shared_notes_read_all" on public.shared_notes for select using (true);
create policy "shared_notes_admin_write" on public.shared_notes for all using (public.is_admin());

create policy "mcqs_read_all" on public.mcqs for select using (true);
create policy "mcqs_admin_write" on public.mcqs for all using (public.is_admin());

create policy "app_config_read_all" on public.app_config for select using (true);
create policy "app_config_admin_write" on public.app_config for all using (public.is_admin());

-- Community
create policy "community_posts_read_visible" on public.community_posts
  for select using (is_hidden = false or public.is_admin());
create policy "community_posts_insert_auth" on public.community_posts
  for insert with check (auth.uid() = author_id);
create policy "community_posts_delete_owner_or_admin" on public.community_posts
  for delete using (auth.uid() = author_id or public.is_admin());
create policy "community_posts_update_admin" on public.community_posts
  for update using (public.is_admin());

create policy "community_replies_read_all" on public.community_replies for select using (true);
create policy "community_replies_insert_auth" on public.community_replies
  for insert with check (auth.uid() = author_id);
create policy "community_replies_delete_owner_or_admin" on public.community_replies
  for delete using (auth.uid() = author_id or public.is_admin());

-- Favorites
create policy "favorites_own_all" on public.user_favorites
  for all using (auth.uid() = user_id);
