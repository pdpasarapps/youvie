-- Run once in the Supabase SQL Editor to prepare Youvie's drama catalog.
-- This migration does not change existing profile roles or creator data.

create table if not exists public.video_uploaders (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.drama_series (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (btrim(title) <> ''),
  synopsis text not null default '',
  poster_key text,
  genre text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drama_seasons (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.drama_series(id) on delete cascade,
  season_number integer not null check (season_number > 0),
  title text not null default '',
  created_at timestamptz not null default now(),
  unique (series_id, season_number)
);

create table if not exists public.drama_episodes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.drama_seasons(id) on delete cascade,
  episode_number integer not null check (episode_number > 0),
  title text not null check (btrim(title) <> ''),
  synopsis text not null default '',
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  video_asset_id text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, episode_number),
  check (status <> 'published' or video_asset_id is not null)
);

create index if not exists drama_series_status_updated_idx
  on public.drama_series (status, updated_at desc);
create index if not exists drama_seasons_series_idx
  on public.drama_seasons (series_id, season_number);
create index if not exists drama_episodes_season_idx
  on public.drama_episodes (season_id, episode_number);

create or replace function public.can_manage_video_catalog()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
    or exists (
      select 1 from public.video_uploaders
      where user_id = auth.uid()
    )
  );
$$;

revoke all on function public.can_manage_video_catalog() from public;
grant execute on function public.can_manage_video_catalog() to anon, authenticated;

alter table public.video_uploaders enable row level security;
alter table public.drama_series enable row level security;
alter table public.drama_seasons enable row level security;
alter table public.drama_episodes enable row level security;

drop policy if exists "Admins and uploaders read video uploader grants" on public.video_uploaders;
create policy "Admins and uploaders read video uploader grants"
  on public.video_uploaders for select
  using (user_id = auth.uid() or exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ));

drop policy if exists "Admins manage video uploader grants" on public.video_uploaders;
create policy "Admins manage video uploader grants"
  on public.video_uploaders for all
  using (exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ));

drop policy if exists "Published drama series are public" on public.drama_series;
create policy "Published drama series are public"
  on public.drama_series for select
  using (status = 'published' or public.can_manage_video_catalog());

drop policy if exists "Video managers manage drama series" on public.drama_series;
create policy "Video managers manage drama series"
  on public.drama_series for all
  using (public.can_manage_video_catalog())
  with check (public.can_manage_video_catalog());

drop policy if exists "Published drama seasons are public" on public.drama_seasons;
create policy "Published drama seasons are public"
  on public.drama_seasons for select
  using (
    public.can_manage_video_catalog()
    or exists (
      select 1 from public.drama_series
      where drama_series.id = drama_seasons.series_id
        and drama_series.status = 'published'
    )
  );

drop policy if exists "Video managers manage drama seasons" on public.drama_seasons;
create policy "Video managers manage drama seasons"
  on public.drama_seasons for all
  using (public.can_manage_video_catalog())
  with check (public.can_manage_video_catalog());

drop policy if exists "Published drama episodes are public" on public.drama_episodes;
create policy "Published drama episodes are public"
  on public.drama_episodes for select
  using (
    public.can_manage_video_catalog()
    or (
      status = 'published'
      and exists (
        select 1
        from public.drama_seasons
        join public.drama_series on drama_series.id = drama_seasons.series_id
        where drama_seasons.id = drama_episodes.season_id
          and drama_series.status = 'published'
      )
    )
  );

drop policy if exists "Video managers manage drama episodes" on public.drama_episodes;
create policy "Video managers manage drama episodes"
  on public.drama_episodes for all
  using (public.can_manage_video_catalog())
  with check (public.can_manage_video_catalog());

grant select on public.drama_series, public.drama_seasons, public.drama_episodes to anon, authenticated;
grant insert, update, delete on public.drama_series, public.drama_seasons, public.drama_episodes to authenticated;
grant select, insert, update, delete on public.video_uploaders to authenticated;
