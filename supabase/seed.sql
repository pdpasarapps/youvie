-- Run after creating at least one account in /login.
-- Replace the first profile with a creator role if you want to test creator policies.
do $$
declare
  creator uuid;
  alchemist uuid;
  afterglow uuid;
  north uuid;
  pocket uuid;
begin
  select id into creator from public.profiles order by created_at limit 1;
  if creator is null then
    raise exception 'Create an account before running this seed.';
  end if;

  update public.profiles set role = 'creator' where id = creator;

  insert into public.comics (creator_id, title, slug, synopsis, genre, status)
  values
    (creator, 'The Last Alchemist', 'the-last-alchemist', 'A young alchemist follows a disappearing star through the oldest city in the world.', 'Fantasy', 'published'),
    (creator, 'Neon Afterglow', 'neon-afterglow', 'Two couriers cross a sleeping megacity before its lights go out for good.', 'Sci-fi', 'published'),
    (creator, 'Malam di Utara', 'malam-di-utara', 'A family returns to a quiet northern town and finds the past waiting at the station.', 'Drama', 'published'),
    (creator, 'Pocket Universe', 'pocket-universe', 'A tiny universe in a jacket pocket has very big opinions about its owner.', 'Comedy', 'published')
  on conflict (slug) do nothing;

  select id into alchemist from public.comics where slug = 'the-last-alchemist';
  select id into afterglow from public.comics where slug = 'neon-afterglow';
  select id into north from public.comics where slug = 'malam-di-utara';
  select id into pocket from public.comics where slug = 'pocket-universe';

  insert into public.chapters (comic_id, title, chapter_number, published_at)
  values
    (alchemist, 'The Vanishing Star', 1, now()),
    (alchemist, 'A Door Made of Salt', 2, now()),
    (afterglow, 'City at 03:17', 1, now()),
    (north, 'The Last Train Home', 1, now()),
    (pocket, 'Small Problems', 1, now())
  on conflict (comic_id, chapter_number) do nothing;
end $$;
