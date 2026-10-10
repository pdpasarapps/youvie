-- Run after supabase/video-catalog.sql to enable drama play analytics.
create table if not exists public.drama_episode_view_events (
  visitor_id uuid not null,
  episode_id uuid not null references public.drama_episodes(id) on delete cascade,
  series_id uuid not null references public.drama_series(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  view_bucket timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (visitor_id, episode_id, view_bucket)
);

create index if not exists drama_episode_view_events_bucket_idx
  on public.drama_episode_view_events (view_bucket desc);
create index if not exists drama_episode_view_events_series_bucket_idx
  on public.drama_episode_view_events (series_id, view_bucket desc);
create index if not exists drama_episode_view_events_episode_bucket_idx
  on public.drama_episode_view_events (episode_id, view_bucket desc);

alter table public.drama_episode_view_events enable row level security;
revoke all on public.drama_episode_view_events from public, anon, authenticated;

create or replace function public.public_drama_popular_episodes()
returns table (episode_id uuid)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select event.episode_id
  from public.drama_episode_view_events as event
  join public.drama_episodes as episode on episode.id = event.episode_id
  join public.drama_seasons as season on season.id = episode.season_id
  join public.drama_series as series on series.id = season.series_id
  where event.view_bucket >= statement_timestamp() - interval '30 days'
    and event.view_bucket <= statement_timestamp()
    and episode.status = 'published'
    and series.status = 'published'
  group by event.episode_id
  order by count(*) desc, max(event.view_bucket) desc, event.episode_id
  limit 12;
$$;

revoke all on function public.public_drama_popular_episodes() from public;
grant execute on function public.public_drama_popular_episodes() to anon, authenticated;

create or replace function public.record_drama_episode_view(
  p_episode_id uuid,
  p_visitor_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_episode_id is null or p_visitor_id is null then
    raise exception 'Episode and visitor IDs are required' using errcode = '22023';
  end if;
  if p_user_id is not null and not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Viewer account does not exist' using errcode = '22023';
  end if;

  insert into public.drama_episode_view_events (visitor_id, episode_id, series_id, user_id, view_bucket)
  select
    p_visitor_id,
    episode.id,
    series.id,
    p_user_id,
    date_trunc('hour', statement_timestamp())
      + make_interval(mins => (extract(minute from statement_timestamp())::integer / 30) * 30)
  from public.drama_episodes as episode
  join public.drama_seasons as season on season.id = episode.season_id
  join public.drama_series as series on series.id = season.series_id
  where episode.id = p_episode_id
    and episode.status = 'published'
    and series.status = 'published'
  on conflict (visitor_id, episode_id, view_bucket) do nothing;
end;
$$;

revoke all on function public.record_drama_episode_view(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_drama_episode_view(uuid, uuid, uuid) to service_role;

create or replace function public.admin_drama_analytics(p_days integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_start_date date;
  v_start timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'Analytics range must be 7, 30, or 90 days' using errcode = '22023';
  end if;

  v_start_date := timezone('UTC', statement_timestamp())::date - p_days + 1;
  v_start := v_start_date::timestamp at time zone 'UTC';

  with filtered as (
    select event.visitor_id, event.user_id, event.series_id, event.episode_id, event.view_bucket
    from public.drama_episode_view_events as event
    where event.view_bucket >= v_start
      and event.view_bucket <= statement_timestamp()
  ),
  daily as (
    select (event.view_bucket at time zone 'UTC')::date as day, count(*)::bigint as views
    from filtered as event
    group by (event.view_bucket at time zone 'UTC')::date
  ),
  top_series as (
    select series.id, series.title, count(*)::bigint as views
    from filtered as event
    join public.drama_series as series on series.id = event.series_id
    group by series.id, series.title
    order by views desc, series.title
    limit 5
  ),
  top_episodes as (
    select episode.id, series.title as series_title, season.season_number,
      episode.episode_number, episode.title, count(*)::bigint as views
    from filtered as event
    join public.drama_episodes as episode on episode.id = event.episode_id
    join public.drama_seasons as season on season.id = episode.season_id
    join public.drama_series as series on series.id = event.series_id
    group by episode.id, series.title, season.season_number, episode.episode_number, episode.title
    order by views desc, series.title, season.season_number, episode.episode_number
    limit 5
  )
  select jsonb_build_object(
    'views', (select count(*) from filtered),
    'uniqueVisitors', (select count(distinct visitor_id) from filtered),
    'registeredViewers', (select count(distinct user_id) from filtered where user_id is not null),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', to_char(calendar.day, 'YYYY-MM-DD'),
        'views', coalesce(daily.views, 0)
      ) order by calendar.day)
      from generate_series(v_start_date, timezone('UTC', statement_timestamp())::date, interval '1 day') as calendar(day)
      left join daily on daily.day = calendar.day::date
    ), '[]'::jsonb),
    'topSeries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'seriesId', id, 'title', title, 'views', views
      ) order by views desc, title)
      from top_series
    ), '[]'::jsonb),
    'topEpisodes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'episodeId', id, 'seriesTitle', series_title, 'seasonNumber', season_number,
        'episodeNumber', episode_number, 'title', title, 'views', views
      ) order by views desc, series_title, season_number, episode_number)
      from top_episodes
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_drama_analytics(integer) from public, anon;
grant execute on function public.admin_drama_analytics(integer) to authenticated;

notify pgrst, 'reload schema';
