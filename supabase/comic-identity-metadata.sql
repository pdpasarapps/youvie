-- Add descriptive identity fields without changing existing comic records.
alter table public.comics
  add column if not exists production_technique text not null default 'traditional_drawing',
  add column if not exists story_status text not null default 'ongoing',
  add column if not exists target_audience text not null default 'all_ages',
  add column if not exists language text not null default 'id',
  add column if not exists origin_type text not null default 'original',
  add column if not exists source_info text not null default '';

do $$ begin
  alter table public.comics
    add constraint comics_production_technique_valid
    check (production_technique in ('traditional_drawing', 'digital_illustration', 'mixed', 'ai_assisted', 'ai_generated'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.comics
    add constraint comics_story_status_valid
    check (story_status in ('ongoing', 'completed', 'hiatus'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.comics
    add constraint comics_target_audience_valid
    check (target_audience in ('all_ages', 'teen', 'adult'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.comics
    add constraint comics_language_nonempty
    check (btrim(language) <> '');
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.comics
    add constraint comics_origin_type_valid
    check (origin_type in ('original', 'adaptation'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.comics
    add constraint comics_adaptation_source_required
    check (origin_type <> 'adaptation' or btrim(source_info) <> '');
exception when duplicate_object then null;
end $$;
