-- Jalankan setelah supabase/comic-analytics.sql untuk menampilkan statistik publik komik.
create table if not exists public.comic_share_events (
  id bigint generated always as identity primary key,
  comic_id uuid not null references public.comics(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists comic_share_events_comic_id_idx
  on public.comic_share_events (comic_id);
create index if not exists bookmarks_comic_id_idx
  on public.bookmarks (comic_id);

alter table public.comic_share_events enable row level security;
revoke all on public.comic_share_events from public, anon, authenticated;

create or replace function public.public_comic_engagement(p_comic_id uuid)
returns table (views bigint, likes bigint, shares bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    (select count(*)::bigint
      from public.comic_view_events as event
      where event.comic_id = comic.id),
    (select count(*)::bigint
      from public.bookmarks as bookmark
      where bookmark.comic_id = comic.id),
    (select count(*)::bigint
      from public.comic_share_events as event
      where event.comic_id = comic.id)
  from public.comics as comic
  where comic.id = p_comic_id
    and comic.status = 'published';
$$;

revoke all on function public.public_comic_engagement(uuid) from public;
grant execute on function public.public_comic_engagement(uuid) to anon, authenticated;

create or replace function public.public_comics_engagement(p_comic_ids uuid[])
returns table (comic_id uuid, views bigint, likes bigint, shares bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with published_comics as (
    select comic.id
    from public.comics as comic
    where comic.id = any(p_comic_ids)
      and comic.status = 'published'
  ),
  view_counts as (
    select event.comic_id, count(*)::bigint as total
    from public.comic_view_events as event
    join published_comics as comic on comic.id = event.comic_id
    group by event.comic_id
  ),
  like_counts as (
    select bookmark.comic_id, count(*)::bigint as total
    from public.bookmarks as bookmark
    join published_comics as comic on comic.id = bookmark.comic_id
    group by bookmark.comic_id
  ),
  share_counts as (
    select event.comic_id, count(*)::bigint as total
    from public.comic_share_events as event
    join published_comics as comic on comic.id = event.comic_id
    group by event.comic_id
  )
  select comic.id,
    coalesce(view_counts.total, 0),
    coalesce(like_counts.total, 0),
    coalesce(share_counts.total, 0)
  from published_comics as comic
  left join view_counts on view_counts.comic_id = comic.id
  left join like_counts on like_counts.comic_id = comic.id
  left join share_counts on share_counts.comic_id = comic.id;
$$;

revoke all on function public.public_comics_engagement(uuid[]) from public;
grant execute on function public.public_comics_engagement(uuid[]) to anon, authenticated;

create or replace function public.record_comic_share(p_comic_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_comic_id is null then
    raise exception 'Comic ID is required' using errcode = '22023';
  end if;

  insert into public.comic_share_events (comic_id)
  select comic.id
  from public.comics as comic
  where comic.id = p_comic_id
    and comic.status = 'published';

  if not found then
    raise exception 'Published comic does not exist' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.record_comic_share(uuid) from public, anon, authenticated;
grant execute on function public.record_comic_share(uuid) to service_role;
