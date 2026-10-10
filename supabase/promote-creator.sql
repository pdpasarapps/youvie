-- Jalankan setelah akun dibuat lewat /login.
-- Ganti email di bawah dengan email akun creator yang ingin dipromosikan.
update public.profiles
set role = 'creator'
where id = (
  select id
  from auth.users
  where email = 'poltamotion@gmail.com'
);

-- Verifikasi hasilnya.
select p.id, u.email, p.display_name, p.role
from public.profiles p
join auth.users u on u.id = p.id
where u.email = 'poltamotion@gmail.com';
