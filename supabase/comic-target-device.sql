alter table public.comics
  add column if not exists target_device text not null default 'all'
  check (target_device in ('all', 'mobile', 'tablet', 'desktop'));
