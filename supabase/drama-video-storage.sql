-- Run after video-catalog.sql. Media stays in Supabase Storage; published
-- episode videos and images can be signed for public playback, drafts remain private.

alter table public.drama_series
  add column if not exists cover_image_path text,
  add column if not exists hero_image_path text,
  add column if not exists detail_image_path text,
  add column if not exists card_image_path text;

alter table public.drama_episodes
  add column if not exists video_path text,
  add column if not exists thumbnail_path text;

alter table public.drama_episodes
  drop constraint if exists drama_episodes_check,
  drop constraint if exists drama_episodes_published_video_path_check;

alter table public.drama_episodes
  add constraint drama_episodes_published_video_path_check
  check (status <> 'published' or video_path is not null);

insert into storage.buckets (id, name, public, allowed_mime_types)
values (
  'drama-media',
  'drama-media',
  false,
  array['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Video managers write drama media" on storage.objects;
create policy "Video managers write drama media"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'drama-media'
    and public.can_manage_video_catalog()
  )
  with check (
    bucket_id = 'drama-media'
    and public.can_manage_video_catalog()
  );

drop policy if exists "Published drama media is readable" on storage.objects;
create policy "Published drama media is readable"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'drama-media'
    and (
      public.can_manage_video_catalog()
      or exists (
        select 1
        from public.drama_episodes
        join public.drama_seasons on drama_seasons.id = drama_episodes.season_id
        join public.drama_series on drama_series.id = drama_seasons.series_id
        where drama_episodes.video_path = storage.objects.name
          and drama_episodes.status = 'published'
          and drama_series.status = 'published'
      )
      or exists (
        select 1
        from public.drama_episodes
        join public.drama_seasons on drama_seasons.id = drama_episodes.season_id
        join public.drama_series on drama_series.id = drama_seasons.series_id
        where drama_episodes.thumbnail_path = storage.objects.name
          and drama_episodes.status = 'published'
          and drama_series.status = 'published'
      )
      or exists (
        select 1
        from public.drama_series
        where storage.objects.name in (
          drama_series.cover_image_path,
          drama_series.hero_image_path,
          drama_series.detail_image_path,
          drama_series.card_image_path
        )
          and drama_series.status = 'published'
      )
    )
  );
