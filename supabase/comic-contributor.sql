-- Jalankan sekali untuk menambahkan contributor ke komik yang sudah ada.
alter table public.comics
  add column if not exists contributor text not null default '';
