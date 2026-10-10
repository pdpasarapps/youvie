-- Run in Supabase SQL Editor to manage the public homepage hero carousel.
create table if not exists public.homepage_promos (
  id uuid primary key default gen_random_uuid(),
  eyebrow text not null default '' check (length(eyebrow) <= 80),
  title text not null check (length(btrim(title)) between 1 and 120),
  description text not null default '' check (length(description) <= 500),
  image_url text not null check (image_url ~* '^https?://[^[:space:]]+$'),
  image_url_tablet text check (image_url_tablet is null or image_url_tablet ~* '^https?://[^[:space:]]+$'),
  image_url_mobile text check (image_url_mobile is null or image_url_mobile ~* '^https?://[^[:space:]]+$'),
  cta_label text not null default '' check (length(cta_label) <= 40),
  destination_url text not null check (destination_url ~* '^(https?://[^[:space:]]+|/[^/[:space:]]*|/)$'),
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  starts_on date not null default (statement_timestamp() at time zone 'Asia/Jakarta')::date,
  ends_on date not null default ((statement_timestamp() at time zone 'Asia/Jakarta')::date + 30),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homepage_promo_dates_valid check (ends_on >= starts_on)
);

create index if not exists homepage_promos_public_order_idx
  on public.homepage_promos(status, sort_order, starts_on, ends_on);

alter table public.homepage_promos enable row level security;

drop policy if exists "Public can view active homepage promos" on public.homepage_promos;
create policy "Public can view active homepage promos"
  on public.homepage_promos for select
  using (
    status = 'active'
    and (statement_timestamp() at time zone 'Asia/Jakarta')::date between starts_on and ends_on
  );

drop policy if exists "Admins manage homepage promos" on public.homepage_promos;
create policy "Admins manage homepage promos"
  on public.homepage_promos for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

grant select on public.homepage_promos to anon, authenticated;
grant insert, update, delete on public.homepage_promos to authenticated;

notify pgrst, 'reload schema';
