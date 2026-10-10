-- Jalankan sekali untuk membuat admin pertama.
-- Akun ini harus dibuat lebih dulu lewat /login.
update public.profiles
set role = 'admin'
where id = (
  select id from auth.users where email = 'admin@mu-komik.com'
);

select p.id, u.email, p.display_name, p.role
from public.profiles p
join auth.users u on u.id = p.id
where u.email = 'admin@mu-komik.com';
