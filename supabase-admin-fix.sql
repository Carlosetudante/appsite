-- Correção de permissões admin para editar outros perfis via app
-- Execute este script no SQL Editor do Supabase (projeto tufcnxbveupoqrgdabfg).

begin;

-- 1) Tabela de admins
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

drop policy if exists admin_users_select_self_or_admin on public.admin_users;
drop policy if exists admin_users_insert_admin on public.admin_users;
drop policy if exists admin_users_update_admin on public.admin_users;
drop policy if exists admin_users_delete_admin on public.admin_users;
drop policy if exists admin_users_select_self on public.admin_users;
create policy admin_users_select_self
on public.admin_users
for select
to authenticated
using (auth.uid() = user_id);

-- Bootstrap do seu usuário admin (substitua o UUID se necessário)
insert into public.admin_users (user_id)
values ('1c42000d-5e9b-4afc-afb1-15056db29655')
on conflict (user_id) do nothing;

-- Função para checar admin sem recursão de policy
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

-- 2) Políticas admin em profiles (mantém políticas atuais, adiciona poder admin)
alter table public.profiles enable row level security;

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

-- 3) RPC admin usado pelo app (fallback)
create or replace function public.admin_update_user_profile(
  p_user_id uuid,
  p_character_name text default null,
  p_title text default null,
  p_level integer default null,
  p_relationship_start timestamptz default null,
  p_inventory jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_row public.profiles%rowtype;
begin
  select exists(
    select 1 from public.admin_users a where a.user_id = auth.uid()
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'forbidden';
  end if;

  update public.profiles p
  set
    character_name = coalesce(nullif(trim(p_character_name), ''), p.character_name),
    title = coalesce(p_title, p.title),
    level = coalesce(p_level, p.level),
    relationship_start = case
      when p_relationship_start is null then p.relationship_start
      else p_relationship_start
    end,
    inventory = case
      when p_inventory is null then p.inventory
      when jsonb_typeof(coalesce(p.inventory, '{}'::jsonb)) = 'object'
           and jsonb_typeof(p_inventory) = 'object'
        then coalesce(p.inventory, '{}'::jsonb) || p_inventory
      else p_inventory
    end,
    updated_at = now()
  where p.id = p_user_id
  returning p.* into v_row;

  if not found then
    raise exception 'profile_not_found_or_forbidden';
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.admin_update_user_profile(uuid, text, text, integer, timestamptz, jsonb) from public;
grant execute on function public.admin_update_user_profile(uuid, text, text, integer, timestamptz, jsonb) to authenticated;

commit;

-- Verificação rápida:
-- select * from public.admin_users;
-- select id, character_name, level from public.profiles order by updated_at desc limit 10;
