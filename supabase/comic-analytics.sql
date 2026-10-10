-- Jalankan sekali di Supabase SQL Editor untuk mengaktifkan analitik komik.
create table if not exists public.comic_view_events (
  visitor_id uuid not null,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  comic_id uuid not null references public.comics(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  view_bucket timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (visitor_id, chapter_id, view_bucket)
);

create index if not exists comic_view_events_view_bucket_idx
  on public.comic_view_events (view_bucket desc);
create index if not exists comic_view_events_comic_bucket_idx
  on public.comic_view_events (comic_id, view_bucket desc);
create index if not exists comic_view_events_chapter_bucket_idx
  on public.comic_view_events (chapter_id, view_bucket desc);

alter table public.comic_view_events enable row level security;
revoke all on public.comic_view_events from public, anon, authenticated;

create or replace function public.record_comic_view(
  p_chapter_id uuid,
  p_visitor_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_chapter_id is null or p_visitor_id is null then
    raise exception 'Chapter and visitor IDs are required' using errcode = '22023';
  end if;
  if p_user_id is not null and not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Reader account does not exist' using errcode = '22023';
  end if;

  insert into public.comic_view_events (visitor_id, chapter_id, comic_id, user_id, view_bucket)
  select
    p_visitor_id,
    chapter.id,
    comic.id,
    p_user_id,
    date_trunc('hour', statement_timestamp())
      + make_interval(mins => (extract(minute from statement_timestamp())::integer / 30) * 30)
  from public.chapters as chapter
  join public.comics as comic on comic.id = chapter.comic_id
  where chapter.id = p_chapter_id
    and chapter.published_at is not null
    and comic.status = 'published'
  on conflict (visitor_id, chapter_id, view_bucket) do nothing;
end;
$$;

revoke all on function public.record_comic_view(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_comic_view(uuid, uuid, uuid) to service_role;

create or replace function public.admin_comic_analytics(p_days integer)
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
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'Analytics range must be 7, 30, or 90 days' using errcode = '22023';
  end if;

  v_start_date := timezone('UTC', statement_timestamp())::date - p_days + 1;
  v_start := v_start_date::timestamp at time zone 'UTC';

  with filtered as (
    select event.visitor_id, event.user_id, event.comic_id, event.chapter_id, event.view_bucket
    from public.comic_view_events as event
    where event.view_bucket >= v_start
      and event.view_bucket <= statement_timestamp()
  ),
  daily as (
    select (event.view_bucket at time zone 'UTC')::date as day, count(*)::bigint as views
    from filtered as event
    group by (event.view_bucket at time zone 'UTC')::date
  ),
  top_comics as (
    select comic.id, comic.slug, comic.title, count(*)::bigint as views
    from filtered as event
    join public.comics as comic on comic.id = event.comic_id
    group by comic.id, comic.slug, comic.title
    order by views desc, comic.title
    limit 5
  ),
  top_chapters as (
    select chapter.id, comic.slug as comic_slug, comic.title as comic_title,
      chapter.chapter_number, chapter.title, count(*)::bigint as views
    from filtered as event
    join public.chapters as chapter on chapter.id = event.chapter_id
    join public.comics as comic on comic.id = chapter.comic_id
    group by chapter.id, comic.slug, comic.title, chapter.chapter_number, chapter.title
    order by views desc, comic.title, chapter.chapter_number
    limit 5
  )
  select jsonb_build_object(
    'views', (select count(*) from filtered),
    'uniqueVisitors', (select count(distinct visitor_id) from filtered),
    'registeredReaders', (select count(distinct user_id) from filtered where user_id is not null),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', to_char(calendar.day, 'YYYY-MM-DD'),
        'views', coalesce(daily.views, 0)
      ) order by calendar.day)
      from generate_series(v_start_date, timezone('UTC', statement_timestamp())::date, interval '1 day') as calendar(day)
      left join daily on daily.day = calendar.day::date
    ), '[]'::jsonb),
    'topComics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'comicId', id, 'slug', slug, 'title', title, 'views', views
      ) order by views desc, title)
      from top_comics
    ), '[]'::jsonb),
    'topChapters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'chapterId', id, 'comicSlug', comic_slug, 'comicTitle', comic_title,
        'chapterNumber', chapter_number, 'title', title, 'views', views
      ) order by views desc, comic_title, chapter_number)
      from top_chapters
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_comic_analytics(integer) from public, anon;
grant execute on function public.admin_comic_analytics(integer) to authenticated;

create or replace function public.creator_comic_analytics(p_days integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_start_date date;
  v_start timestamptz;
  v_creator_id uuid;
  v_result jsonb;
begin
  v_creator_id := auth.uid();
  if v_creator_id is null or not exists (
    select 1 from public.profiles
    where id = v_creator_id and role = 'creator'
  ) then
    raise exception 'Creator access required' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'Analytics range must be 7, 30, or 90 days' using errcode = '22023';
  end if;

  v_start_date := timezone('UTC', statement_timestamp())::date - p_days + 1;
  v_start := v_start_date::timestamp at time zone 'UTC';

  with creator_comics as (
    select comic.id, comic.slug, comic.title
    from public.comics as comic
    where comic.creator_id = v_creator_id
  ),
  filtered as (
    select event.visitor_id, event.user_id, event.comic_id, event.chapter_id, event.view_bucket
    from public.comic_view_events as event
    join creator_comics as comic on comic.id = event.comic_id
    where event.view_bucket >= v_start
      and event.view_bucket <= statement_timestamp()
  ),
  daily as (
    select (event.view_bucket at time zone 'UTC')::date as day, count(*)::bigint as views
    from filtered as event
    group by (event.view_bucket at time zone 'UTC')::date
  ),
  top_comics as (
    select comic.id, comic.slug, comic.title, count(event.chapter_id)::bigint as views
    from creator_comics as comic
    join filtered as event on event.comic_id = comic.id
    group by comic.id, comic.slug, comic.title
    order by views desc, comic.title
    limit 5
  ),
  top_chapters as (
    select chapter.id, comic.slug as comic_slug, comic.title as comic_title,
      chapter.chapter_number, chapter.title, count(*)::bigint as views
    from filtered as event
    join public.chapters as chapter on chapter.id = event.chapter_id
    join creator_comics as comic on comic.id = chapter.comic_id
    group by chapter.id, comic.slug, comic.title, chapter.chapter_number, chapter.title
    order by views desc, comic.title, chapter.chapter_number
    limit 5
  )
  select jsonb_build_object(
    'views', (select count(*) from filtered),
    'uniqueVisitors', (select count(distinct visitor_id) from filtered),
    'registeredReaders', (select count(distinct user_id) from filtered where user_id is not null),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', to_char(calendar.day, 'YYYY-MM-DD'),
        'views', coalesce(daily.views, 0)
      ) order by calendar.day)
      from generate_series(v_start_date, timezone('UTC', statement_timestamp())::date, interval '1 day') as calendar(day)
      left join daily on daily.day = calendar.day::date
    ), '[]'::jsonb),
    'topComics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'comicId', id, 'slug', slug, 'title', title, 'views', views
      ) order by views desc, title)
      from top_comics
    ), '[]'::jsonb),
    'topChapters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'chapterId', id, 'comicSlug', comic_slug, 'comicTitle', comic_title,
        'chapterNumber', chapter_number, 'title', title, 'views', views
      ) order by views desc, comic_title, chapter_number)
      from top_chapters
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.creator_comic_analytics(integer) from public, anon;
grant execute on function public.creator_comic_analytics(integer) to authenticated;
