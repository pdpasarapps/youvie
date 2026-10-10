-- Jalankan setelah creator-request.sql dan setelah tabel comics, chapters, dan pages tersedia.
create table if not exists public.platform_settings (
  id boolean primary key default true check (id),
  maintenance_enabled boolean not null default false,
  maintenance_message text not null default 'MU-Komik sedang dalam pemeliharaan. Silakan kembali lagi nanti.',
  announcement_enabled boolean not null default false,
  announcement_message text not null default '',
  feature_flags jsonb not null default '{"reading":true,"search":true,"creators":true,"comments":true,"favorites":true}'::jsonb
    check (jsonb_typeof(feature_flags) = 'object'),
  require_comic_review boolean not null default true,
  creator_applications_enabled boolean not null default true,
  max_comics_per_creator integer not null default 5 check (max_comics_per_creator between 1 and 100),
  max_upload_size_mb integer not null default 10 check (max_upload_size_mb between 1 and 50),
  max_pages_per_chapter integer not null default 100 check (max_pages_per_chapter between 1 and 500),
  allowed_image_types jsonb not null default '["image/jpeg","image/png","image/webp"]'::jsonb
    check (
      jsonb_typeof(allowed_image_types) = 'array'
      and jsonb_array_length(allowed_image_types) > 0
      and allowed_image_types <@ '["image/jpeg","image/png","image/webp"]'::jsonb
    ),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.platform_settings add column if not exists require_comic_review boolean not null default true;
alter table public.platform_settings add column if not exists creator_applications_enabled boolean not null default true;
alter table public.platform_settings add column if not exists max_comics_per_creator integer not null default 5 check (max_comics_per_creator between 1 and 100);
alter table public.platform_settings add column if not exists max_upload_size_mb integer not null default 10 check (max_upload_size_mb between 1 and 50);
alter table public.platform_settings add column if not exists max_pages_per_chapter integer not null default 100 check (max_pages_per_chapter between 1 and 500);
alter table public.platform_settings add column if not exists allowed_image_types jsonb not null default '["image/jpeg","image/png","image/webp"]'::jsonb
  check (
    jsonb_typeof(allowed_image_types) = 'array'
    and jsonb_array_length(allowed_image_types) > 0
    and allowed_image_types <@ '["image/jpeg","image/png","image/webp"]'::jsonb
  );

alter table public.platform_settings enable row level security;

drop policy if exists "Platform settings are publicly readable" on public.platform_settings;
create policy "Platform settings are publicly readable"
  on public.platform_settings for select
  using (true);

drop policy if exists "Admins manage platform settings" on public.platform_settings;
create policy "Admins manage platform settings"
  on public.platform_settings for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

drop policy if exists "Users create own creator request" on public.creator_requests;
create policy "Users create own creator request"
  on public.creator_requests for insert
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and coalesce((select feature_flags->>'creators' from public.platform_settings where id = true), 'true') = 'true'
    and coalesce((select creator_applications_enabled from public.platform_settings where id = true), true)
  );

drop policy if exists "Users resubmit rejected request" on public.creator_requests;
create policy "Users resubmit rejected request"
  on public.creator_requests for update
  using (user_id = auth.uid() and status = 'rejected')
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and coalesce((select feature_flags->>'creators' from public.platform_settings where id = true), 'true') = 'true'
    and coalesce((select creator_applications_enabled from public.platform_settings where id = true), true)
  );

grant select on public.platform_settings to anon, authenticated;
grant insert, update on public.platform_settings to authenticated;

insert into public.platform_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.platform_settings_audit (
  id bigint generated always as identity primary key,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  previous_values jsonb not null,
  new_values jsonb not null
);

alter table public.platform_settings_audit enable row level security;
drop policy if exists "Admins read platform settings audit" on public.platform_settings_audit;
create policy "Admins read platform settings audit"
  on public.platform_settings_audit for select
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
grant select on public.platform_settings_audit to authenticated;

create or replace function public.audit_platform_settings_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_jsonb(old) - 'updated_at' is distinct from to_jsonb(new) - 'updated_at' then
    insert into public.platform_settings_audit (changed_by, previous_values, new_values)
    values (auth.uid(), to_jsonb(old) - 'updated_at', to_jsonb(new) - 'updated_at');
  end if;
  return new;
end;
$$;

drop trigger if exists audit_platform_settings_change on public.platform_settings;
create trigger audit_platform_settings_change
  after update on public.platform_settings
  for each row execute function public.audit_platform_settings_change();

create or replace function public.owned_comic_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from public.comics where creator_id = auth.uid();
$$;
revoke all on function public.owned_comic_count() from public;
grant execute on function public.owned_comic_count() to authenticated;

create or replace function public.owned_chapter_page_count(target_chapter_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from public.pages
  join public.chapters on chapters.id = pages.chapter_id
  join public.comics on comics.id = chapters.comic_id
  where pages.chapter_id = target_chapter_id
    and (comics.creator_id = auth.uid()
      or exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
$$;
revoke all on function public.owned_chapter_page_count(uuid) from public;
grant execute on function public.owned_chapter_page_count(uuid) to authenticated;

drop policy if exists "Creators manage own pages" on public.pages;
drop policy if exists "Creators insert own pages within limits" on public.pages;
drop policy if exists "Creators update own pages" on public.pages;
drop policy if exists "Creators delete own pages" on public.pages;
drop policy if exists "Admins manage pages" on public.pages;
create policy "Creators insert own pages within limits" on public.pages for insert
with check (
  exists (
    select 1
    from public.chapters
    join public.comics on comics.id = chapters.comic_id
    where chapters.id = pages.chapter_id
      and comics.creator_id = auth.uid()
  )
  and coalesce((select feature_flags->>'creators' from public.platform_settings where id = true), 'true') = 'true'
  and public.owned_chapter_page_count(pages.chapter_id)
    < coalesce((select max_pages_per_chapter from public.platform_settings where id = true), 100)
);
create policy "Creators update own pages" on public.pages for update
using (
  exists (select 1 from public.chapters join public.comics on comics.id = chapters.comic_id where chapters.id = pages.chapter_id and comics.creator_id = auth.uid())
  and coalesce((select feature_flags->>'creators' from public.platform_settings where id = true), 'true') = 'true'
)
with check (
  exists (select 1 from public.chapters join public.comics on comics.id = chapters.comic_id where chapters.id = pages.chapter_id and comics.creator_id = auth.uid())
  and coalesce((select feature_flags->>'creators' from public.platform_settings where id = true), 'true') = 'true'
);
create policy "Creators delete own pages" on public.pages for delete
using (
  exists (select 1 from public.chapters join public.comics on comics.id = chapters.comic_id where chapters.id = pages.chapter_id and comics.creator_id = auth.uid())
  and coalesce((select feature_flags->>'creators' from public.platform_settings where id = true), 'true') = 'true'
);
create policy "Admins manage pages" on public.pages for all
using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

drop policy if exists "Creators manage own comics" on public.comics;
drop policy if exists "Creators create own comics" on public.comics;
create policy "Creators create own comics" on public.comics for insert with check (
  creator_id = auth.uid()
  and coalesce((select feature_flags->>'creators' from public.platform_settings where id = true), 'true') = 'true'
  and status::text in ('draft', 'pending_review')
  and public.owned_comic_count()
    < coalesce((select max_comics_per_creator from public.platform_settings where id = true), 5)
);

drop policy if exists "Creators update own comics" on public.comics;
create policy "Creators update own comics" on public.comics for update
using (
  creator_id = auth.uid()
  and status::text in ('draft', 'pending_review', 'published', 'archived')
  and coalesce((select feature_flags->>'creators' from public.platform_settings where id = true), 'true') = 'true'
)
with check (
  creator_id = auth.uid()
  and coalesce((select feature_flags->>'creators' from public.platform_settings where id = true), 'true') = 'true'
  and (
    status::text in ('draft', 'pending_review', 'archived')
    or (
      status::text = 'published'
      and coalesce((select require_comic_review from public.platform_settings where id = true), true) = false
    )
  )
);

drop policy if exists "Users manage own bookmarks" on public.bookmarks;
create policy "Users manage own bookmarks" on public.bookmarks for all
using (
  user_id = auth.uid()
  and coalesce((select feature_flags->>'favorites' from public.platform_settings where id = true), 'true') = 'true'
)
with check (
  user_id = auth.uid()
  and coalesce((select feature_flags->>'favorites' from public.platform_settings where id = true), 'true') = 'true'
);
