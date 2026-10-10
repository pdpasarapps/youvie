alter type public.comic_status add value if not exists 'pending_review' after 'draft';

drop policy if exists "Creators manage own comics" on public.comics;
drop policy if exists "Creators create own comics" on public.comics;
drop policy if exists "Creators update own comics" on public.comics;
drop policy if exists "Creators delete own comics" on public.comics;
drop policy if exists "Admins review comics" on public.comics;

create policy "Creators create own comics" on public.comics for insert with check (
  creator_id = auth.uid() and status::text in ('draft', 'pending_review')
);

create policy "Creators update own comics" on public.comics for update
using (creator_id = auth.uid() and status::text in ('draft', 'pending_review', 'published', 'archived'))
with check (creator_id = auth.uid() and status::text in ('draft', 'pending_review', 'archived'));

create policy "Creators delete own comics" on public.comics for delete using (creator_id = auth.uid());

create policy "Admins review comics" on public.comics for all
using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

drop policy if exists "Admins review chapters" on public.chapters;
create policy "Admins review chapters" on public.chapters for select
using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

drop policy if exists "Admins review pages" on public.pages;
create policy "Admins review pages" on public.pages for select
using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
