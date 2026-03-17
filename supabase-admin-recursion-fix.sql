-- HOTFIX: corrige recursão infinita em policies da tabela admin_users
-- Erro alvo: 42P17 "infinite recursion detected in policy for relation admin_users"

begin;

-- 1) Limpa policies problemáticas da admin_users
drop policy if exists admin_users_select_self_or_admin on public.admin_users;
drop policy if exists admin_users_insert_admin on public.admin_users;
drop policy if exists admin_users_update_admin on public.admin_users;
drop policy if exists admin_users_delete_admin on public.admin_users;
drop policy if exists admin_users_select_self on public.admin_users;

-- 2) Policy simples (sem auto-consulta da própria tabela): cada usuário só lê seu próprio registro
create policy admin_users_select_self
on public.admin_users
for select
to authenticated
using (auth.uid() = user_id);

-- 3) Função segura para verificar admin (SECURITY DEFINER evita depender de RLS do usuário final)
create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin_user() from public;
grant execute on function public.is_admin_user() to authenticated;

-- 4) Recria políticas admin em profiles usando a função (sem recursão)
drop policy if exists profiles_admin_select_all on public.profiles;
create policy profiles_admin_select_all
on public.profiles
for select
to authenticated
using (public.is_admin_user());

drop policy if exists profiles_admin_update_all on public.profiles;
create policy profiles_admin_update_all
on public.profiles
for update
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

commit;

-- Verificação:
-- select public.is_admin_user();
-- select * from public.admin_users;
