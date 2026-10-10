create table if not exists public.reader_memberships (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'premium', 'vip')),
  updated_at timestamptz not null default now()
);

alter table public.reader_memberships enable row level security;

drop policy if exists "Users and admins view reader memberships" on public.reader_memberships;
create policy "Users and admins view reader memberships"
on public.reader_memberships for select
using (
  user_id = auth.uid()
  or exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);

drop policy if exists "Admins manage reader memberships" on public.reader_memberships;
create policy "Admins manage reader memberships"
on public.reader_memberships for all
using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

grant select, insert, update on public.reader_memberships to authenticated;

create or replace function public.create_reader_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.reader_memberships (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_reader_membership_on_profile on public.profiles;
create trigger create_reader_membership_on_profile
after insert on public.profiles
for each row execute procedure public.create_reader_membership();

insert into public.reader_memberships (user_id)
select id from public.profiles
on conflict (user_id) do nothing;
