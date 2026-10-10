-- Run after supabase/video-catalog.sql to create drama-only advertiser tables.
create table if not exists public.drama_ad_slots (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  slot_key text not null unique check (slot_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  format text not null default 'banner' check (format in ('banner', 'native', 'sponsor')),
  description text not null default '' check (length(description) <= 300),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drama_ad_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  advertiser_name text not null check (length(btrim(advertiser_name)) between 1 and 120),
  contact_email text not null check (length(btrim(contact_email)) between 3 and 254),
  contact_whatsapp text check (contact_whatsapp is null or length(btrim(contact_whatsapp)) <= 40),
  campaign_title text not null check (length(btrim(campaign_title)) between 1 and 120),
  description text not null check (length(btrim(description)) between 1 and 500),
  destination_url text not null check (destination_url ~* '^https?://[^[:space:]]+$'),
  image_url text check (image_url is null or image_url ~* '^https?://[^[:space:]]+$'),
  image_url_tablet text check (image_url_tablet is null or image_url_tablet ~* '^https?://[^[:space:]]+$'),
  image_url_mobile text check (image_url_mobile is null or image_url_mobile ~* '^https?://[^[:space:]]+$'),
  placements text[] not null check (
    cardinality(placements) > 0
    and placements <@ array[
      'drama_home_banner',
      'drama_feed_native',
      'drama_episode_transition'
    ]::text[]
  ),
  requested_start date,
  requested_end date,
  status text not null default 'pending' check (status in ('pending', 'contacted', 'approved', 'rejected')),
  admin_note text not null default '' check (length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drama_ad_request_dates_valid check (
    requested_start is null or requested_end is null or requested_end >= requested_start
  )
);

create table if not exists public.drama_sponsor_campaigns (
  id uuid primary key default gen_random_uuid(),
  sponsor_name text not null check (length(btrim(sponsor_name)) between 1 and 120),
  title text not null check (length(btrim(title)) between 1 and 120),
  description text not null default '' check (length(description) <= 500),
  destination_url text not null check (destination_url ~* '^https?://[^[:space:]]+$'),
  image_url text check (image_url is null or image_url ~* '^https?://[^[:space:]]+$'),
  image_url_tablet text check (image_url_tablet is null or image_url_tablet ~* '^https?://[^[:space:]]+$'),
  image_url_mobile text check (image_url_mobile is null or image_url_mobile ~* '^https?://[^[:space:]]+$'),
  slot_id uuid references public.drama_ad_slots(id) on delete set null,
  target_series_id uuid references public.drama_series(id) on delete cascade,
  target_placement text not null default 'all'
    check (target_placement in ('all', 'series', 'feed', 'episode_transition', 'both')),
  target_genres text[] not null default '{}',
  starts_on date not null,
  ends_on date not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  source_ad_request_id uuid references public.drama_ad_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drama_sponsor_campaign_dates_valid check (ends_on >= starts_on),
  constraint drama_sponsor_campaign_target_exclusive check (target_series_id is null or slot_id is null),
  constraint drama_sponsor_campaign_active_has_placement check (
    status <> 'active'
    or slot_id is not null
    or (target_series_id is not null and target_placement <> 'all')
  ),
  constraint drama_sponsor_campaign_request_slot_unique unique (source_ad_request_id, slot_id)
);

create index if not exists drama_ad_requests_user_created_idx
  on public.drama_ad_requests(user_id, created_at desc);
create index if not exists drama_ad_requests_status_created_idx
  on public.drama_ad_requests(status, created_at desc);
create index if not exists drama_sponsor_campaigns_status_dates_idx
  on public.drama_sponsor_campaigns(status, starts_on, ends_on);
create index if not exists drama_sponsor_campaigns_target_series_idx
  on public.drama_sponsor_campaigns(target_series_id, status);

insert into public.drama_ad_slots (name, slot_key, format, description)
values
  ('Banner beranda drama', 'drama_home_banner', 'banner', 'Materi sponsor untuk area promosi beranda drama.'),
  ('Selingan feed drama', 'drama_feed_native', 'native', 'Materi sponsor terintegrasi di antara video drama.'),
  ('Transisi episode drama', 'drama_episode_transition', 'native', 'Materi sponsor pada transisi antarepisode.')
on conflict (slot_key) do nothing;

alter table public.drama_ad_slots enable row level security;
alter table public.drama_ad_requests enable row level security;
alter table public.drama_sponsor_campaigns enable row level security;

drop policy if exists "Admins manage drama ad slots" on public.drama_ad_slots;
create policy "Admins manage drama ad slots"
  on public.drama_ad_slots for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

drop policy if exists "Users view own drama ad requests" on public.drama_ad_requests;
create policy "Users view own drama ad requests"
  on public.drama_ad_requests for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

drop policy if exists "Users submit own drama ad requests" on public.drama_ad_requests;
create policy "Users submit own drama ad requests"
  on public.drama_ad_requests for insert
  with check (user_id = auth.uid() and status = 'pending' and admin_note = '');

drop policy if exists "Admins review drama ad requests" on public.drama_ad_requests;
create policy "Admins review drama ad requests"
  on public.drama_ad_requests for update
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

drop policy if exists "Admins manage drama sponsor campaigns" on public.drama_sponsor_campaigns;
create policy "Admins manage drama sponsor campaigns"
  on public.drama_sponsor_campaigns for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

grant select, insert, update, delete on public.drama_ad_slots to authenticated;
grant select, insert, update, delete on public.drama_sponsor_campaigns to authenticated;
grant select, insert, update on public.drama_ad_requests to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('drama-ad-creatives', 'drama-ad-creatives', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view drama advertiser creatives" on storage.objects;
create policy "Public can view drama advertiser creatives"
  on storage.objects for select
  using (bucket_id = 'drama-ad-creatives');

drop policy if exists "Users upload own drama advertiser creatives" on storage.objects;
create policy "Users upload own drama advertiser creatives"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'drama-ad-creatives'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own drama advertiser creatives" on storage.objects;
create policy "Users delete own drama advertiser creatives"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'drama-ad-creatives'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

notify pgrst, 'reload schema';
