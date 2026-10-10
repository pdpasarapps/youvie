alter table public.profiles
  add column if not exists public_profile boolean not null default false;

drop policy if exists "Public creator profiles are readable" on public.profiles;
create policy "Public creator profiles are readable" on public.profiles
  for select
  using (role = 'creator' and public_profile = true);
