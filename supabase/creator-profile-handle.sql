alter table public.profiles
  add column if not exists public_handle text;

with normalized as (
  select
    id,
    coalesce(
      nullif(trim(both '-' from left(regexp_replace(lower(display_name), '[^a-z0-9]+', '-', 'g'), 40)), ''),
      'kreator'
    ) as normalized_handle
  from public.profiles
  where public_handle is null
), candidates as (
  select
    id,
    case
      when length(normalized_handle) < 3 then normalized_handle || '-' || left(replace(id::text, '-', ''), 6)
      else normalized_handle
    end as base_handle
  from normalized
), ranked as (
  select
    id,
    base_handle,
    row_number() over (partition by base_handle order by id) as duplicate_number
  from candidates
)
update public.profiles as profile
set public_handle = case
  when ranked.duplicate_number = 1 then ranked.base_handle
  else left(ranked.base_handle, 31) || '-' || left(replace(ranked.id::text, '-', ''), 8)
end
from ranked
where profile.id = ranked.id;

create unique index if not exists profiles_public_handle_key
  on public.profiles (public_handle);

do $$
begin
  alter table public.profiles
    add constraint profiles_public_handle_format
    check (
      public_handle is null
      or (length(public_handle) between 3 and 40 and public_handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
    );
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
