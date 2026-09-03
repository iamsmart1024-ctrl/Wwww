-- ============================================================
--  멘토-멘티 학습 플랫폼 Supabase 스키마
--  Supabase Dashboard > SQL Editor 에 전체 복사 후 Run
-- ============================================================

create extension if not exists "pgcrypto";

-- 1. 프로필
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  role text not null default 'mentee' check (role in ('mentor','mentee')),
  created_at timestamptz not null default now()
);

-- 신규 가입 트리거: username 이 'dhlee1024' 면 자동으로 mentor
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
  dname text;
begin
  uname := coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1));
  dname := coalesce(new.raw_user_meta_data->>'display_name', uname);

  insert into public.profiles (id, username, display_name, role)
  values (
    new.id, uname, dname,
    case when uname = 'dhlee1024' then 'mentor' else 'mentee' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. 교재 / 모의고사
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('textbook','mockexam')),
  pdf_path text,
  answer_pdf_path text,
  answer_key jsonb not null default '{}'::jsonb,
  allowed_questions int[] not null default '{}',
  total_questions int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

-- 3. 강의 영상
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  video_path text not null,
  material_id uuid references public.materials(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

-- 4. 멘티 답안 제출
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  score int,
  total int,
  graded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (material_id, user_id)
);

-- 5. 수업 일정
create table if not exists public.schedule (
  id uuid primary key default gen_random_uuid(),
  class_date date not null,
  start_time time,
  end_time time,
  title text,
  description text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

-- RLS
alter table public.profiles    enable row level security;
alter table public.materials   enable row level security;
alter table public.videos      enable row level security;
alter table public.submissions enable row level security;
alter table public.schedule    enable row level security;

create or replace function public.is_mentor()
returns boolean
language sql stable security definer
set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'mentor');
$$;

drop policy if exists "profiles read all"     on public.profiles;
drop policy if exists "profiles self update"  on public.profiles;
create policy "profiles read all"   on public.profiles for select using (auth.role() = 'authenticated');
create policy "profiles self update" on public.profiles for update using (id = auth.uid());

drop policy if exists "materials read" on public.materials;
drop policy if exists "materials mentor write" on public.materials;
create policy "materials read" on public.materials for select using (auth.role() = 'authenticated');
create policy "materials mentor write" on public.materials for all using (public.is_mentor()) with check (public.is_mentor());

drop policy if exists "videos read" on public.videos;
drop policy if exists "videos mentor write" on public.videos;
create policy "videos read" on public.videos for select using (auth.role() = 'authenticated');
create policy "videos mentor write" on public.videos for all using (public.is_mentor()) with check (public.is_mentor());

drop policy if exists "subs self read" on public.submissions;
drop policy if exists "subs self upsert" on public.submissions;
drop policy if exists "subs self update" on public.submissions;
drop policy if exists "subs self delete" on public.submissions;
create policy "subs self read" on public.submissions for select using (user_id = auth.uid() or public.is_mentor());
create policy "subs self upsert" on public.submissions for insert with check (user_id = auth.uid());
create policy "subs self update" on public.submissions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "subs self delete" on public.submissions for delete using (user_id = auth.uid() or public.is_mentor());

drop policy if exists "schedule read" on public.schedule;
drop policy if exists "schedule mentor write" on public.schedule;
create policy "schedule read" on public.schedule for select using (auth.role() = 'authenticated');
create policy "schedule mentor write" on public.schedule for all using (public.is_mentor()) with check (public.is_mentor());

-- Storage buckets
insert into storage.buckets (id, name, public) values ('materials','materials', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('videos','videos', false) on conflict (id) do nothing;

drop policy if exists "materials read auth"    on storage.objects;
drop policy if exists "materials mentor write" on storage.objects;
drop policy if exists "videos read auth"       on storage.objects;
drop policy if exists "videos mentor write"    on storage.objects;

create policy "materials read auth"
  on storage.objects for select
  using (bucket_id = 'materials' and auth.role() = 'authenticated');
create policy "materials mentor write"
  on storage.objects for all
  using (bucket_id = 'materials' and public.is_mentor())
  with check (bucket_id = 'materials' and public.is_mentor());
create policy "videos read auth"
  on storage.objects for select
  using (bucket_id = 'videos' and auth.role() = 'authenticated');
create policy "videos mentor write"
  on storage.objects for all
  using (bucket_id = 'videos' and public.is_mentor())
  with check (bucket_id = 'videos' and public.is_mentor());
