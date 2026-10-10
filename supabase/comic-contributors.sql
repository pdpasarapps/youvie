-- Jalankan sekali untuk mendukung banyak contributor per komik.
alter table public.comics
  add column if not exists contributor text not null default '',
  add column if not exists contributors jsonb not null default '[{"role":"Penulis","name":""}]'::jsonb;

update public.comics
set contributors = jsonb_build_array(jsonb_build_object('role', 'Penulis', 'name', btrim(contributor)))
where btrim(contributor) <> ''
  and contributors = '[{"role":"Penulis","name":""}]'::jsonb;

do $$ begin
  alter table public.comics
    add constraint comics_contributors_nonempty
    check (jsonb_typeof(contributors) = 'array' and contributors <> '[]'::jsonb);
exception when duplicate_object then null;
end $$;
