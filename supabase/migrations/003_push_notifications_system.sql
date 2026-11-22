-- Polytechnic Hub — Advanced Push Notification System Migration
-- Run this script inside Supabase Dashboard -> SQL Editor -> New Query.

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. NOTIFICATIONS (Admin Campaigns & Delivery Metrics)
-- ============================================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 140),
  body text not null check (char_length(body) between 2 and 1000),
  category text not null check (category in ('APP_UPDATE', 'IMPORTANT', 'EDUCATION', 'EMERGENCY', 'GENERAL')),
  image_url text default '',
  target_view text not null default 'notifications',
  action_url text default '',
  audience_type text not null check (audience_type in ('all', 'selected_users', 'department_semester')),
  target_user_ids uuid[] not null default '{}',
  target_department text default '',
  target_semester int check (target_semester is null or target_semester between 1 and 8),
  sound_mode text not null default 'custom' check (sound_mode in ('custom', 'default', 'silent')),
  status text not null default 'sent' check (status in ('sent', 'partial', 'failed')),
  total_recipients int not null default 0,
  fcm_sent_count int not null default 0,
  fcm_failed_count int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_created_at on public.notifications(created_at desc);

-- ============================================================================
-- 2. USER NOTIFICATIONS (Per-Student Inbox & Read State)
-- ============================================================================
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  category text not null check (category in ('APP_UPDATE', 'IMPORTANT', 'EDUCATION', 'EMERGENCY', 'GENERAL')),
  image_url text default '',
  target_view text not null default 'notifications',
  action_url text default '',
  is_read boolean not null default false,
  read_at timestamptz,
  delivered_via text not null default 'in_app' check (delivered_via in ('fcm_and_in_app', 'in_app', 'web_push')),
  created_at timestamptz not null default now(),
  unique (notification_id, user_id)
);

create index if not exists idx_user_notifications_user_created on public.user_notifications(user_id, created_at desc);
create index if not exists idx_user_notifications_user_unread on public.user_notifications(user_id, is_read);

-- ============================================================================
-- 3. NOTIFICATION PREFERENCES (Per-Student Category & Sound Controls)
-- ============================================================================
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default true,
  sound_enabled boolean not null default true,
  sound_style text not null default 'chime' check (sound_style in ('chime', 'bell', 'system')),
  allow_app_update boolean not null default true,
  allow_important boolean not null default true,
  allow_education boolean not null default true,
  allow_emergency boolean not null default true,
  allow_general boolean not null default true,
  respect_dnd boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 4. DEVICE TOKENS (Multi-Device FCM Tokens for Web & Capacitor Android)
-- ============================================================================
create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('web', 'android', 'ios')),
  browser_or_device text default '',
  app_version text default '2.0.0',
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_device_tokens_user_active on public.device_tokens(user_id, is_active);

-- ============================================================================
-- 5. SCHEDULED NOTIFICATIONS (Admin-Scheduled Future Campaigns)
-- ============================================================================
create table if not exists public.scheduled_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 140),
  body text not null check (char_length(body) between 2 and 1000),
  category text not null check (category in ('APP_UPDATE', 'IMPORTANT', 'EDUCATION', 'EMERGENCY', 'GENERAL')),
  image_url text default '',
  target_view text not null default 'notifications',
  action_url text default '',
  audience_type text not null check (audience_type in ('all', 'selected_users', 'department_semester')),
  target_user_ids uuid[] not null default '{}',
  target_department text default '',
  target_semester int check (target_semester is null or target_semester between 1 and 8),
  sound_mode text not null default 'custom' check (sound_mode in ('custom', 'default', 'silent')),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'cancelled', 'failed')),
  sent_notification_id uuid references public.notifications(id) on delete set null,
  error_message text default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_scheduled_notifications_due on public.scheduled_notifications(status, scheduled_for asc);

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
alter table public.notifications enable row level security;
alter table public.user_notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.device_tokens enable row level security;
alter table public.scheduled_notifications enable row level security;

-- notifications
drop policy if exists "notifications_admin_all" on public.notifications;
create policy "notifications_admin_all" on public.notifications
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "notifications_recipient_select" on public.notifications;
create policy "notifications_recipient_select" on public.notifications
  for select using (
    exists (
      select 1 from public.user_notifications un
      where un.notification_id = id and un.user_id = auth.uid()
    )
  );

-- user_notifications
drop policy if exists "user_notifications_owner_select" on public.user_notifications;
create policy "user_notifications_owner_select" on public.user_notifications
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "user_notifications_owner_update" on public.user_notifications;
create policy "user_notifications_owner_update" on public.user_notifications
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_notifications_owner_delete" on public.user_notifications;
create policy "user_notifications_owner_delete" on public.user_notifications
  for delete using (auth.uid() = user_id or public.is_admin());

drop policy if exists "user_notifications_admin_insert" on public.user_notifications;
create policy "user_notifications_admin_insert" on public.user_notifications
  for insert with check (public.is_admin());

-- notification_preferences
drop policy if exists "notification_preferences_owner_all" on public.notification_preferences;
create policy "notification_preferences_owner_all" on public.notification_preferences
  for all using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

-- device_tokens
drop policy if exists "device_tokens_owner_all" on public.device_tokens;
create policy "device_tokens_owner_all" on public.device_tokens
  for all using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id);

-- scheduled_notifications (Admin Only)
drop policy if exists "scheduled_notifications_admin_only" on public.scheduled_notifications;
create policy "scheduled_notifications_admin_only" on public.scheduled_notifications
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- 7. ENABLE REALTIME FOR INSTANT FOREGROUND INBOX UPDATES
-- ============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.user_notifications;
  end if;
exception when duplicate_object then
  null;
end $$;
