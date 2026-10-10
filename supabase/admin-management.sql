-- Jalankan setelah creator-request.sql pada proyek Supabase yang sudah ada.
-- Kebijakan ini memberi admin akses baca profil untuk dashboard dan akses
-- pembaruan peran yang tetap dijaga oleh trigger protect_profile_role.
drop policy if exists "Admins view profiles" on public.profiles;
create policy "Admins view profiles"
on public.profiles for select
using (public.is_admin());

drop policy if exists "Admins update profiles" on public.profiles;
create policy "Admins update profiles"
on public.profiles for update
using (public.is_admin())
with check (true);
