-- Universo Real
-- Copia dados de uma conta (origem) para outra (destino) pelo email.
-- ESCOPO DESTA VERSAO:
--   - tasks
--   - finance_transactions
--   - work_sessions
--   - bible_notes
--   - profiles.inventory.gratitudeJournal
--   - profiles.inventory.tasksBackup
--   - profiles.inventory.financesBackup
--   - profiles.inventory.workLogBackup
--   - profiles.inventory.deletedTaskIds
--   - profiles.inventory.deletedWorkLogIds
--   - profiles.inventory.financeMonthHistory
-- NAO COPIA:
--   - profile (level/xp/titulo/etc)
--   - xp_events
--   - oracle_messages
--   - oracle_memory
-- IMPORTANTE: este script sobrescreve os dados atuais da conta destino
-- nas tabelas acima.
--
-- Execute no SQL Editor do Supabase (projeto tufcnxbveupoqrgdabfg).
-- Recomendado: fazer backup antes.

begin;

do $$
declare
  v_source_email text := 'Carlos.eduardoymail.com@gmail.com';
  v_target_email text := 'Oliveirac072@gmail.com';
  v_source_id uuid;
  v_target_id uuid;
  v_table text;
  v_cols text;
begin
  select u.id
    into v_source_id
  from auth.users u
  where lower(u.email) = lower(v_source_email)
  limit 1;

  select u.id
    into v_target_id
  from auth.users u
  where lower(u.email) = lower(v_target_email)
  limit 1;

  if v_source_id is null then
    raise exception 'Conta origem nao encontrada: %', v_source_email;
  end if;

  if v_target_id is null then
    raise exception 'Conta destino nao encontrada: %', v_target_email;
  end if;

  if v_source_id = v_target_id then
    raise exception 'Origem e destino sao a mesma conta.';
  end if;

  -- Copia somente campos selecionados dentro de profiles.inventory (sem mexer em level/xp)
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'profiles'
  ) then
    update public.profiles t
    set
      inventory =
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      case
                        when jsonb_typeof(coalesce(t.inventory, '{}'::jsonb)) = 'object'
                          then coalesce(t.inventory, '{}'::jsonb)
                        else '{}'::jsonb
                      end,
                      '{gratitudeJournal}',
                      case
                        when jsonb_typeof(coalesce(s.inventory, '{}'::jsonb)) = 'object'
                          then coalesce(s.inventory->'gratitudeJournal', '[]'::jsonb)
                        else '[]'::jsonb
                      end,
                      true
                    ),
                    '{tasksBackup}',
                    case
                      when jsonb_typeof(coalesce(s.inventory, '{}'::jsonb)) = 'object'
                        then coalesce(s.inventory->'tasksBackup', '[]'::jsonb)
                      else '[]'::jsonb
                    end,
                    true
                  ),
                  '{financesBackup}',
                  case
                    when jsonb_typeof(coalesce(s.inventory, '{}'::jsonb)) = 'object'
                      then coalesce(s.inventory->'financesBackup', '[]'::jsonb)
                    else '[]'::jsonb
                  end,
                  true
                ),
                '{workLogBackup}',
                case
                  when jsonb_typeof(coalesce(s.inventory, '{}'::jsonb)) = 'object'
                    then coalesce(s.inventory->'workLogBackup', '[]'::jsonb)
                  else '[]'::jsonb
                end,
                true
              ),
              '{deletedTaskIds}',
              case
                when jsonb_typeof(coalesce(s.inventory, '{}'::jsonb)) = 'object'
                  then coalesce(s.inventory->'deletedTaskIds', '[]'::jsonb)
                else '[]'::jsonb
              end,
              true
            ),
            '{deletedWorkLogIds}',
            case
              when jsonb_typeof(coalesce(s.inventory, '{}'::jsonb)) = 'object'
                then coalesce(s.inventory->'deletedWorkLogIds', '[]'::jsonb)
              else '[]'::jsonb
            end,
            true
          ),
          '{financeMonthHistory}',
          case
            when jsonb_typeof(coalesce(s.inventory, '{}'::jsonb)) = 'object'
              then coalesce(s.inventory->'financeMonthHistory', '[]'::jsonb)
            else '[]'::jsonb
          end,
          true
        ),
      updated_at = now()
    from public.profiles s
    where t.id = v_target_id
      and s.id = v_source_id;
  end if;

  -- Copia apenas tabelas com user_id: limpa destino e replica da origem
  foreach v_table in array array[
    'tasks',
    'finance_transactions',
    'work_sessions',
    'bible_notes'
  ]
  loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = v_table
    ) then
      -- Remove tudo da conta destino nessa tabela
      execute format('delete from public.%I where user_id = $1', v_table)
        using v_target_id;

      -- Monta lista de colunas para copiar (exclui id e user_id)
      select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
        into v_cols
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = v_table
        and c.column_name not in ('id', 'user_id');

      if v_cols is null then
        execute format(
          'insert into public.%I (user_id)
           select $1
           from public.%I
           where user_id = $2',
          v_table, v_table
        )
        using v_target_id, v_source_id;
      else
        execute format(
          'insert into public.%I (user_id, %s)
           select $1, %s
           from public.%I
           where user_id = $2',
          v_table, v_cols, v_cols, v_table
        )
        using v_target_id, v_source_id;
      end if;
    end if;
  end loop;
end $$;

commit;

-- Verificacao rapida apos executar:
-- select id, email from auth.users where lower(email) in (lower('Carlos.eduardoymail.com@gmail.com'), lower('Oliveirac072@gmail.com'));
-- select count(*) as tasks_origem from public.tasks where user_id = (select id from auth.users where lower(email)=lower('Carlos.eduardoymail.com@gmail.com') limit 1);
-- select count(*) as tasks_destino from public.tasks where user_id = (select id from auth.users where lower(email)=lower('Oliveirac072@gmail.com') limit 1);
