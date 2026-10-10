-- Run after video-catalog.sql and drama-video-storage.sql.
-- Adds optional artwork slots; cover_image_path remains the required main cover in the admin.

alter table public.drama_series
  add column if not exists hero_image_path text,
  add column if not exists detail_image_path text,
  add column if not exists card_image_path text;

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
