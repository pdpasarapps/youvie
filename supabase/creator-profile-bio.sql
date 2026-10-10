alter table public.profiles
  add column if not exists bio text not null default '',
  add column if not exists banner_key text,
  add column if not exists social_links jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
