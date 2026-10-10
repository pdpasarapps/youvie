-- Run after supabase/video-catalog.sql to enable drama favorites and watch progress.
create table if not exists public.drama_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid not null references public.drama_series(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, series_id)
);

create index if not exists drama_favorites_user_created_idx
  on public.drama_favorites (user_id, created_at desc);

alter table public.drama_favorites enable row level security;
revoke all on public.drama_favorites from public, anon;

drop policy if exists "Readers manage their drama favorites" on public.drama_favorites;
drop policy if exists "Readers view their drama favorites" on public.drama_favorites;
create policy "Readers view their drama favorites"
  on public.drama_favorites for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Readers add published drama favorites" on public.drama_favorites;
create policy "Readers add published drama favorites"
  on public.drama_favorites for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.drama_series
      where drama_series.id = drama_favorites.series_id
        and drama_series.status = 'published'
    )
  );

drop policy if exists "Readers remove their drama favorites" on public.drama_favorites;
create policy "Readers remove their drama favorites"
  on public.drama_favorites for delete
  to authenticated
  using (
    auth.uid() = user_id
  );
grant select, insert, delete on public.drama_favorites to authenticated;

create table if not exists public.drama_episode_watch_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  episode_id uuid not null references public.drama_episodes(id) on delete cascade,
  position_seconds integer not null default 0 check (position_seconds >= 0),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, episode_id)
);

create index if not exists drama_episode_watch_progress_user_updated_idx
  on public.drama_episode_watch_progress (user_id, updated_at desc);

alter table public.drama_episode_watch_progress enable row level security;
revoke all on public.drama_episode_watch_progress from public, anon;

drop policy if exists "Readers manage their drama watch progress" on public.drama_episode_watch_progress;
drop policy if exists "Readers view their drama watch progress" on public.drama_episode_watch_progress;
create policy "Readers view their drama watch progress"
  on public.drama_episode_watch_progress for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Readers create drama watch progress" on public.drama_episode_watch_progress;
create policy "Readers create drama watch progress"
  on public.drama_episode_watch_progress for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.drama_episodes
      join public.drama_seasons on drama_seasons.id = drama_episodes.season_id
      join public.drama_series on drama_series.id = drama_seasons.series_id
      where drama_episodes.id = drama_episode_watch_progress.episode_id
        and drama_episodes.status = 'published'
        and drama_series.status = 'published'
    )
  );

drop policy if exists "Readers update their drama watch progress" on public.drama_episode_watch_progress;
create policy "Readers update their drama watch progress"
  on public.drama_episode_watch_progress for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.drama_episodes
      join public.drama_seasons on drama_seasons.id = drama_episodes.season_id
      join public.drama_series on drama_series.id = drama_seasons.series_id
      where drama_episodes.id = drama_episode_watch_progress.episode_id
        and drama_episodes.status = 'published'
        and drama_series.status = 'published'
    )
  );

drop policy if exists "Readers remove their drama watch progress" on public.drama_episode_watch_progress;
create policy "Readers remove their drama watch progress"
  on public.drama_episode_watch_progress for delete
  to authenticated
  using (auth.uid() = user_id);
grant select, insert, update, delete on public.drama_episode_watch_progress to authenticated;

notify pgrst, 'reload schema';
