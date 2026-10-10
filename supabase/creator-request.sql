-- Jalankan sekali di Supabase SQL Editor.
create table if not exists public.creator_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.creator_requests add column if not exists portfolio_url text;
alter table public.creator_requests add column if not exists instagram_url text;
alter table public.creator_requests add column if not exists other_url text;

alter table public.creator_requests enable row level security;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

drop policy if exists "Users view own creator request" on public.creator_requests;
drop policy if exists "Users create own creator request" on public.creator_requests;
drop policy if exists "Admins view creator requests" on public.creator_requests;
drop policy if exists "Admins update creator requests" on public.creator_requests;

create policy "Users view own creator request"
on public.creator_requests for select
using (user_id = auth.uid());

create policy "Users create own creator request"
on public.creator_requests for insert
with check (user_id = auth.uid() and status = 'pending');

create policy "Admins view creator requests"
on public.creator_requests for select
using (public.is_admin());

create policy "Admins update creator requests"
on public.creator_requests for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Users resubmit rejected request" on public.creator_requests;
create policy "Users resubmit rejected request"
on public.creator_requests for update
using (user_id = auth.uid() and status = 'rejected')
with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "Admins update profiles" on public.profiles;
drop policy if exists "Admins view profiles" on public.profiles;
create policy "Admins view profiles"
on public.profiles for select
using (public.is_admin());

create policy "Admins update profiles"
on public.profiles for update
using (public.is_admin())
with check (true);

create or replace function public.review_creator_request(p_request_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can review creator requests';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid creator request decision';
  end if;

  update public.creator_requests
  set status = p_decision, reviewed_at = now()
  where id = p_request_id and status = 'pending'
  returning user_id into target_user_id;

  if target_user_id is null then
    raise exception 'Creator request is missing or no longer pending';
  end if;

  if p_decision = 'approved' then
    update public.profiles set role = 'creator' where id = target_user_id;
  end if;
end;
$$;

revoke all on function public.review_creator_request(uuid, text) from public;
grant execute on function public.review_creator_request(uuid, text) to authenticated;

create or replace function public.protect_profile_role() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.role is distinct from new.role and not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Only an admin can change account roles';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role before update on public.profiles for each row execute procedure public.protect_profile_role();
