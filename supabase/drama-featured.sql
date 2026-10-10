-- Run once in the Supabase SQL Editor to enable featured drama on the homepage hero.
alter table public.drama_series
  add column if not exists is_featured boolean not null default false;

create index if not exists drama_series_featured_published_idx
  on public.drama_series (updated_at desc)
  where is_featured = true and status = 'published';
