-- Run in Supabase SQL Editor to enable the admin ads and sponsor workspace.
create table if not exists public.ad_slots (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  slot_key text not null unique check (slot_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  format text not null default 'banner' check (format in ('banner', 'native', 'sponsor')),
  description text not null default '' check (length(description) <= 300),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sponsor_campaigns (
  id uuid primary key default gen_random_uuid(),
  sponsor_name text not null check (length(btrim(sponsor_name)) between 1 and 120),
  title text not null check (length(btrim(title)) between 1 and 120),
  description text not null default '' check (length(description) <= 500),
  destination_url text not null check (destination_url ~* '^https?://[^[:space:]]+$'),
  image_url text check (image_url is null or image_url ~* '^https?://[^[:space:]]+$'),
  slot_id uuid references public.ad_slots(id) on delete set null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_campaign_dates_valid check (ends_on >= starts_on),
  constraint active_sponsor_campaign_requires_slot check (status <> 'active' or slot_id is not null)
);

alter table public.sponsor_campaigns
  add column if not exists image_url_tablet text
  check (image_url_tablet is null or image_url_tablet ~* '^https?://[^[:space:]]+$');
alter table public.sponsor_campaigns
  add column if not exists image_url_mobile text
  check (image_url_mobile is null or image_url_mobile ~* '^https?://[^[:space:]]+$');

alter table public.sponsor_campaigns
  add column if not exists target_comic_id uuid references public.comics(id) on delete cascade;
alter table public.sponsor_campaigns
  add column if not exists target_placement text not null default 'all';
alter table public.sponsor_campaigns
  drop constraint if exists sponsor_campaign_target_placement_valid;
alter table public.sponsor_campaigns
  add constraint sponsor_campaign_target_placement_valid
  check (target_placement in ('all', 'comic_detail', 'reader', 'episode_transition', 'both'));
alter table public.sponsor_campaigns
  drop constraint if exists active_sponsor_campaign_requires_slot;
alter table public.sponsor_campaigns
  add constraint active_sponsor_campaign_requires_slot
  check (
    status <> 'active'
    or slot_id is not null
    or (target_comic_id is not null and target_placement in ('comic_detail', 'reader', 'episode_transition', 'both'))
  );
alter table public.sponsor_campaigns
  drop constraint if exists sponsor_campaign_target_is_exclusive;
alter table public.sponsor_campaigns
  add constraint sponsor_campaign_target_is_exclusive
  check (target_comic_id is null or slot_id is null);

create index if not exists sponsor_campaigns_slot_id_idx on public.sponsor_campaigns(slot_id);
create index if not exists sponsor_campaigns_status_dates_idx on public.sponsor_campaigns(status, starts_on, ends_on);
create index if not exists sponsor_campaigns_target_comic_idx on public.sponsor_campaigns(target_comic_id, status);

insert into public.ad_slots (name, slot_key, format, description)
values
  ('Banner beranda', 'home_banner', 'banner', 'Tampil setelah area komik pilihan di beranda.'),
  ('Iklan native katalog', 'catalog_grid_native', 'native', 'Tampil selebar grid setelah 8 komik di Jelajah dan hasil pencarian (jika hasil lebih dari 8).'),
  ('Sponsor detail komik', 'comic_detail_sponsor', 'sponsor', 'Tampil di halaman detail komik sebelum daftar episode.'),
  ('Iklan tengah bab', 'reader_mid_chapter', 'native', 'Tampil setiap setelah 5 halaman di halaman baca, kecuali setelah halaman terakhir.'),
  ('Iklan antar episode', 'reader_episode_transition', 'native', 'Tampil saat pembaca berpindah episode. Materi tidak dapat dilewati selama 5 detik.')
on conflict (slot_key) do nothing;

alter table public.ad_slots enable row level security;
alter table public.sponsor_campaigns enable row level security;

drop policy if exists "Admins manage ad slots" on public.ad_slots;
create policy "Admins manage ad slots"
  on public.ad_slots for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

drop policy if exists "Admins manage sponsor campaigns" on public.sponsor_campaigns;
create policy "Admins manage sponsor campaigns"
  on public.sponsor_campaigns for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

grant select, insert, update, delete on public.ad_slots to authenticated;
grant select, insert, update, delete on public.sponsor_campaigns to authenticated;

create table if not exists public.sponsor_campaign_rotation (
  rotation_scope text primary key,
  next_position bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.sponsor_campaign_rotation enable row level security;
revoke all on public.sponsor_campaign_rotation from public, anon, authenticated;

drop function if exists public.get_active_sponsor_campaign(text);
drop function if exists public.get_active_sponsor_campaign(text, uuid);
create or replace function public.get_active_sponsor_campaign(p_slot_key text, p_comic_id uuid default null)
returns table (
  campaign_id uuid,
  sponsor_name text,
  title text,
  description text,
  destination_url text,
  image_url text,
  image_url_tablet text,
  image_url_mobile text,
  format text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  candidate_count bigint;
  selected_position bigint;
  v_rotation_scope text;
begin
  v_rotation_scope := concat_ws(
    ':',
    p_slot_key,
    coalesce(p_comic_id::text, 'all')
  );

  with eligible as (
    select
      campaign.created_at,
      campaign.id,
      case
        when campaign.target_comic_id = p_comic_id then 0
        else 1
      end as priority
    from public.sponsor_campaigns as campaign
    join public.ad_slots as slot on slot.id = campaign.slot_id
    where slot.slot_key = p_slot_key
      and slot.is_active
      and campaign.status = 'active'
      and (statement_timestamp() at time zone 'Asia/Jakarta')::date between campaign.starts_on and campaign.ends_on
      and (
        campaign.target_comic_id is null
        or (
          campaign.target_comic_id = p_comic_id
          and exists (
            select 1 from public.comics as target_comic
            where target_comic.id = campaign.target_comic_id
              and target_comic.status = 'published'
          )
          and (
            (campaign.target_placement = 'comic_detail' and p_slot_key = 'comic_detail_sponsor')
            or (campaign.target_placement = 'reader' and p_slot_key = 'reader_mid_chapter')
            or (campaign.target_placement = 'episode_transition' and p_slot_key = 'reader_episode_transition')
            or (campaign.target_placement = 'both' and p_slot_key in ('comic_detail_sponsor', 'reader_mid_chapter'))
          )
        )
      )
  )
  select count(*) into candidate_count
  from eligible
  where priority = (select min(priority) from eligible);

  if candidate_count = 0 then
    return;
  end if;

  insert into public.sponsor_campaign_rotation (rotation_scope, next_position)
  values (v_rotation_scope, 0)
  on conflict (rotation_scope) do update
    set next_position = (public.sponsor_campaign_rotation.next_position + 1) % candidate_count,
        updated_at = now()
  returning next_position into selected_position;

  return query
  with eligible as (
    select
      campaign.id,
      campaign.sponsor_name,
      campaign.title,
      campaign.description,
      campaign.destination_url,
      campaign.image_url,
      campaign.image_url_tablet,
      campaign.image_url_mobile,
      slot.format,
      campaign.created_at,
      case
        when campaign.target_comic_id = p_comic_id then 0
        else 1
      end as priority
    from public.sponsor_campaigns as campaign
    join public.ad_slots as slot on slot.id = campaign.slot_id
    where slot.slot_key = p_slot_key
      and slot.is_active
      and campaign.status = 'active'
      and (statement_timestamp() at time zone 'Asia/Jakarta')::date between campaign.starts_on and campaign.ends_on
      and (
        campaign.target_comic_id is null
        or (
          campaign.target_comic_id = p_comic_id
          and exists (
            select 1 from public.comics as target_comic
            where target_comic.id = campaign.target_comic_id
              and target_comic.status = 'published'
          )
          and (
            (campaign.target_placement = 'comic_detail' and p_slot_key = 'comic_detail_sponsor')
            or (campaign.target_placement = 'reader' and p_slot_key = 'reader_mid_chapter')
            or (campaign.target_placement = 'episode_transition' and p_slot_key = 'reader_episode_transition')
            or (campaign.target_placement = 'both' and p_slot_key in ('comic_detail_sponsor', 'reader_mid_chapter'))
          )
        )
      )
  )
  select
    eligible.id,
    eligible.sponsor_name,
    eligible.title,
    eligible.description,
    eligible.destination_url,
    eligible.image_url,
    eligible.image_url_tablet,
    eligible.image_url_mobile,
    eligible.format
  from eligible
  where eligible.priority = (select min(priority) from eligible)
  order by eligible.created_at desc, eligible.id
  offset selected_position
  limit 1;
end;
$$;

revoke all on function public.get_active_sponsor_campaign(text, uuid) from public;
grant execute on function public.get_active_sponsor_campaign(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
