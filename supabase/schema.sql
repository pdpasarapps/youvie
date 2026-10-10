do $$ begin
  create type public.user_role as enum ('reader', 'creator', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.comic_status as enum ('draft', 'pending_review', 'published', 'archived');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Reader',
  public_handle text unique check (public_handle is null or (length(public_handle) between 3 and 40 and public_handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$')),
  avatar_key text,
  banner_key text,
  bio text not null default '',
  social_links jsonb not null default '[]'::jsonb check (jsonb_typeof(social_links) = 'array'),
  role public.user_role not null default 'reader',
  public_profile boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.reader_memberships (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'premium', 'vip')),
  updated_at timestamptz not null default now()
);

create table if not exists public.comics (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id),
  title text not null,
  slug text not null unique,
  synopsis text not null default '',
  contributor text not null default '',
  contributors jsonb not null default '[{"role":"Penulis","name":""}]'::jsonb
    check (jsonb_typeof(contributors) = 'array' and contributors <> '[]'::jsonb),
  cover_key text,
  genre text not null default 'Drama',
  production_technique text not null default 'traditional_drawing'
    check (production_technique in ('traditional_drawing', 'digital_illustration', 'mixed', 'ai_assisted', 'ai_generated')),
  story_status text not null default 'ongoing'
    check (story_status in ('ongoing', 'completed', 'hiatus')),
  target_audience text not null default 'all_ages'
    check (target_audience in ('all_ages', 'teen', 'adult')),
  target_device text not null default 'all'
    check (target_device in ('all', 'mobile', 'tablet', 'desktop')),
  language text not null default 'id' check (btrim(language) <> ''),
  origin_type text not null default 'original' check (origin_type in ('original', 'adaptation')),
  source_info text not null default '',
  status public.comic_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (origin_type <> 'adaptation' or btrim(source_info) <> '')
);

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  comic_id uuid not null references public.comics(id) on delete cascade,
  title text not null,
  chapter_number numeric not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (comic_id, chapter_number)
);

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  object_key text not null,
  created_at timestamptz not null default now(),
  unique (chapter_id, page_number)
);

create table if not exists public.reading_history (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  last_page integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, chapter_id)
);

create table if not exists public.bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  comic_id uuid not null references public.comics(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comic_id)
);

alter table public.profiles enable row level security;
alter table public.reader_memberships enable row level security;
grant select, insert, update on public.reader_memberships to authenticated;
alter table public.comics enable row level security;
alter table public.chapters enable row level security;
alter table public.pages enable row level security;
alter table public.reading_history enable row level security;
alter table public.bookmarks enable row level security;

drop policy if exists "Published comics are public" on public.comics;
drop policy if exists "Published chapters are public" on public.chapters;
drop policy if exists "Published pages are public" on public.pages;
drop policy if exists "Users read own profile" on public.profiles;
drop policy if exists "Public creator profiles are readable" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Users manage own history" on public.reading_history;
drop policy if exists "Users manage own bookmarks" on public.bookmarks;
drop policy if exists "Creators manage own comics" on public.comics;
drop policy if exists "Creators create own comics" on public.comics;
drop policy if exists "Creators update own comics" on public.comics;
drop policy if exists "Creators delete own comics" on public.comics;
drop policy if exists "Admins review comics" on public.comics;
drop policy if exists "Creators manage own chapters" on public.chapters;
drop policy if exists "Creators manage own pages" on public.pages;
drop policy if exists "Admins review chapters" on public.chapters;
drop policy if exists "Admins review pages" on public.pages;

create policy "Published comics are public" on public.comics for select using (status = 'published' or creator_id = auth.uid());
create policy "Published chapters are public" on public.chapters for select using (
  exists (
    select 1 from public.comics
    where comics.id = chapters.comic_id
      and ((comics.status = 'published' and chapters.published_at is not null) or comics.creator_id = auth.uid())
  )
);
create policy "Published pages are public" on public.pages for select using (
  exists (
    select 1 from public.chapters
    join public.comics on comics.id = chapters.comic_id
    where chapters.id = pages.chapter_id
      and ((comics.status = 'published' and chapters.published_at is not null) or comics.creator_id = auth.uid())
  )
);
create policy "Users read own profile" on public.profiles for select using (id = auth.uid());
drop policy if exists "Users and admins view reader memberships" on public.reader_memberships;
drop policy if exists "Admins manage reader memberships" on public.reader_memberships;
create policy "Users and admins view reader memberships" on public.reader_memberships for select using (
  user_id = auth.uid() or exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);
create policy "Admins manage reader memberships" on public.reader_memberships for all
using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
create policy "Public creator profiles are readable" on public.profiles for select using (role = 'creator' and public_profile = true);
create policy "Users update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "Users manage own history" on public.reading_history for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage own bookmarks" on public.bookmarks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Creators create own comics" on public.comics for insert with check (
  creator_id = auth.uid() and status in ('draft', 'pending_review')
);
create policy "Creators update own comics" on public.comics for update
using (creator_id = auth.uid() and status in ('draft', 'pending_review', 'published', 'archived'))
with check (creator_id = auth.uid() and status in ('draft', 'pending_review', 'archived'));
create policy "Creators delete own comics" on public.comics for delete using (creator_id = auth.uid());
create policy "Admins review comics" on public.comics for all
using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
create policy "Admins review chapters" on public.chapters for select
using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
create policy "Admins review pages" on public.pages for select
using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
create policy "Creators manage own chapters" on public.chapters for all using (
  exists (select 1 from public.comics where comics.id = chapters.comic_id and comics.creator_id = auth.uid())
) with check (
  exists (select 1 from public.comics where comics.id = chapters.comic_id and comics.creator_id = auth.uid())
);
create policy "Creators manage own pages" on public.pages for all using (
  exists (select 1 from public.chapters join public.comics on comics.id = chapters.comic_id where chapters.id = pages.chapter_id and comics.creator_id = auth.uid())
) with check (
  exists (select 1 from public.chapters join public.comics on comics.id = chapters.comic_id where chapters.id = pages.chapter_id and comics.creator_id = auth.uid())
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Reader'));
  return new;
end;
$$;

create or replace function public.create_reader_membership() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.reader_memberships (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.protect_profile_role() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.role is distinct from new.role and not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Only an admin can change account roles';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
drop trigger if exists create_reader_membership_on_profile on public.profiles;
create trigger create_reader_membership_on_profile after insert on public.profiles for each row execute procedure public.create_reader_membership();
insert into public.reader_memberships (user_id) select id from public.profiles on conflict (user_id) do nothing;
drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role before update on public.profiles for each row execute procedure public.protect_profile_role();
