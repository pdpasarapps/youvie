begin;

with ranked_bookmarks as (
  select
    ctid,
    row_number() over (
      partition by user_id, comic_id
      order by created_at desc, chapter_id desc nulls last
    ) as position
  from public.bookmarks
)
delete from public.bookmarks
where ctid in (select ctid from ranked_bookmarks where position > 1);

alter table public.bookmarks drop constraint if exists bookmarks_pkey;
alter table public.bookmarks alter column chapter_id drop not null;
update public.bookmarks set chapter_id = null;
alter table public.bookmarks add constraint bookmarks_pkey primary key (user_id, comic_id);

commit;
