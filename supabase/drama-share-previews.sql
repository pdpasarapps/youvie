-- Run after supabase/video-catalog.sql to store generated drama share previews.
create table if not exists public.drama_share_previews (
  series_id uuid primary key references public.drama_series(id) on delete cascade,
  source_path text not null,
  object_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.drama_share_previews enable row level security;

drop policy if exists "Video managers read drama share previews" on public.drama_share_previews;
create policy "Video managers read drama share previews"
  on public.drama_share_previews for select
  using (public.can_manage_video_catalog());

drop policy if exists "Video managers manage drama share previews" on public.drama_share_previews;
create policy "Video managers manage drama share previews"
  on public.drama_share_previews for all
  using (public.can_manage_video_catalog())
  with check (public.can_manage_video_catalog());

grant select, insert, update, delete on public.drama_share_previews to authenticated;

notify pgrst, 'reload schema';
