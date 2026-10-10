-- Run in Supabase SQL Editor to enable advertiser submissions and admin review.
-- Run supabase/ads-management.sql first to create ad slots and sponsor campaigns.
create table if not exists public.ad_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  advertiser_name text not null check (length(btrim(advertiser_name)) between 1 and 120),
  contact_email text not null check (length(btrim(contact_email)) between 3 and 254),
  contact_whatsapp text check (contact_whatsapp is null or length(btrim(contact_whatsapp)) <= 40),
  campaign_title text not null check (length(btrim(campaign_title)) between 1 and 120),
  description text not null check (length(btrim(description)) between 1 and 500),
  destination_url text not null check (destination_url ~* '^https?://[^[:space:]]+$'),
  image_url text check (image_url is null or image_url ~* '^https?://[^[:space:]]+$'),
  placements text[] not null check (
    cardinality(placements) > 0
    and placements <@ array[
      'home_banner',
      'catalog_grid_native',
      'comic_detail_sponsor',
      'reader_mid_chapter',
      'reader_episode_transition'
    ]::text[]
  ),
  requested_start date,
  requested_end date,
  status text not null default 'pending' check (status in ('pending', 'contacted', 'approved', 'rejected')),
  admin_note text not null default '' check (length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_request_dates_valid check (
    requested_start is null
    or requested_end is null
    or requested_end >= requested_start
  )
);

alter table public.ad_requests
  add column if not exists image_url_tablet text
  check (image_url_tablet is null or image_url_tablet ~* '^https?://[^[:space:]]+$');
alter table public.ad_requests
  add column if not exists image_url_mobile text
  check (image_url_mobile is null or image_url_mobile ~* '^https?://[^[:space:]]+$');

alter table public.sponsor_campaigns
  add column if not exists source_ad_request_id uuid
  references public.ad_requests(id) on delete set null;

create unique index if not exists sponsor_campaigns_source_request_slot_idx
  on public.sponsor_campaigns(source_ad_request_id, slot_id)
  where source_ad_request_id is not null and slot_id is not null;

create or replace function public.approve_ad_request(p_request_id uuid, p_admin_note text default '')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ad_request public.ad_requests%rowtype;
  campaign_start date;
  campaign_end date;
  expected_slots integer;
  available_slots integer;
  active_slots integer;
  published_campaigns integer;
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'Only administrators can approve advertiser requests'
      using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_admin_note, ''))) > 1000 then
    raise exception 'Admin note cannot exceed 1000 characters'
      using errcode = '22023';
  end if;

  select * into ad_request
  from public.ad_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Advertiser request was not found'
      using errcode = 'P0002';
  end if;

  select count(*) into expected_slots
  from (select distinct unnest(ad_request.placements) as slot_key) requested_slots;

  select count(*) into available_slots
  from (
    select distinct unnest(ad_request.placements) as slot_key
  ) requested_slots
  join public.ad_slots slots on slots.slot_key = requested_slots.slot_key;

  if expected_slots = 0 or available_slots <> expected_slots then
    raise exception 'One or more requested ad placements are missing from ad_slots'
      using errcode = '23503';
  end if;

  select count(*) into active_slots
  from (
    select distinct unnest(ad_request.placements) as slot_key
  ) requested_slots
  join public.ad_slots slots on slots.slot_key = requested_slots.slot_key
  where slots.is_active;

  if active_slots <> expected_slots then
    raise exception 'One or more requested ad slots are inactive'
      using errcode = '55000';
  end if;

  campaign_start := greatest(
    coalesce(ad_request.requested_start, (statement_timestamp() at time zone 'Asia/Jakarta')::date),
    (statement_timestamp() at time zone 'Asia/Jakarta')::date
  );
  campaign_end := greatest(coalesce(ad_request.requested_end, campaign_start + 30), campaign_start);

  insert into public.sponsor_campaigns (
    sponsor_name,
    title,
    description,
    destination_url,
    image_url,
    image_url_tablet,
    image_url_mobile,
    slot_id,
    starts_on,
    ends_on,
    status,
    source_ad_request_id,
    updated_at
  )
  select
    ad_request.advertiser_name,
    ad_request.campaign_title,
    ad_request.description,
    ad_request.destination_url,
    ad_request.image_url,
    ad_request.image_url_tablet,
    ad_request.image_url_mobile,
    slots.id,
    campaign_start,
    campaign_end,
    'active',
    ad_request.id,
    now()
  from (
    select distinct unnest(ad_request.placements) as slot_key
  ) requested_slots
  join public.ad_slots slots on slots.slot_key = requested_slots.slot_key
  on conflict (source_ad_request_id, slot_id)
    where source_ad_request_id is not null and slot_id is not null
    do update set
      sponsor_name = excluded.sponsor_name,
      title = excluded.title,
      description = excluded.description,
      destination_url = excluded.destination_url,
      image_url = excluded.image_url,
      image_url_tablet = excluded.image_url_tablet,
      image_url_mobile = excluded.image_url_mobile,
      starts_on = excluded.starts_on,
      ends_on = excluded.ends_on,
      status = 'active',
      updated_at = now();

  get diagnostics published_campaigns = row_count;

  update public.ad_requests
  set status = 'approved',
      admin_note = btrim(coalesce(p_admin_note, '')),
      updated_at = now()
  where id = ad_request.id;

  return published_campaigns;
end;
$$;

revoke all on function public.approve_ad_request(uuid, text) from public;
grant execute on function public.approve_ad_request(uuid, text) to authenticated;

create index if not exists ad_requests_user_created_idx
  on public.ad_requests(user_id, created_at desc);
create index if not exists ad_requests_status_created_idx
  on public.ad_requests(status, created_at desc);

alter table public.ad_requests enable row level security;

drop policy if exists "Users view own ad requests" on public.ad_requests;
create policy "Users view own ad requests"
  on public.ad_requests for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

drop policy if exists "Users submit own ad requests" on public.ad_requests;
create policy "Users submit own ad requests"
  on public.ad_requests for insert
  with check (user_id = auth.uid() and status = 'pending' and admin_note = '');

drop policy if exists "Admins review ad requests" on public.ad_requests;
create policy "Admins review ad requests"
  on public.ad_requests for update
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

grant select, insert, update on public.ad_requests to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ad-creatives', 'ad-creatives', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view advertiser creatives" on storage.objects;
create policy "Public can view advertiser creatives"
  on storage.objects for select
  using (bucket_id = 'ad-creatives');

drop policy if exists "Users upload own advertiser creatives" on storage.objects;
create policy "Users upload own advertiser creatives"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ad-creatives'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own advertiser creatives" on storage.objects;
create policy "Users delete own advertiser creatives"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ad-creatives'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

notify pgrst, 'reload schema';
