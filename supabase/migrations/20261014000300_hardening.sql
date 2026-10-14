-- Endurecimento pós-auditoria (2026-10-14): retry do agendamento, fila resiliente, reserva atômica de IA,
-- exportação LGPD completa, limites de tamanho, defesa em profundidade e nota média exata.

-- ---------------------------------------------------------------------------
-- 1. Retry do agendamento
--    Antes: `attempts` só zerava em mark_schedule_success; depois de esgotar 3 tentativas num período,
--    o período seguinte ficava sem retry. Agora `in_retry` distingue a reserva de um retry (mantém o
--    contador) da reserva de uma ocorrência regular (zera o contador).
-- ---------------------------------------------------------------------------
alter table public.recommendation_schedules add column in_retry boolean not null default false;
-- Os grants de coluna do cliente (insert/update) listam colunas explicitamente; in_retry não entra.

create or replace function public.claim_due_schedules(p_limit integer default 50)
returns table (user_id uuid, frequency text, timezone text, due_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select s.user_id, s.next_run_at
    from public.recommendation_schedules s
    where s.active and s.next_run_at <= now()
    order by s.next_run_at
    limit p_limit
    for update skip locked
  )
  update public.recommendation_schedules s
  set next_run_at = public.compute_next_run(s.frequency, s.weekday, s.day_of_month, s.hour, s.timezone, now()),
      attempts = case when s.in_retry then s.attempts else 0 end,
      in_retry = false
  from due
  where s.user_id = due.user_id
  returning s.user_id, s.frequency, s.timezone, due.next_run_at;
end $$;

-- Política de retry: até 3 tentativas por período, 15 minutos depois.
create or replace function public.retry_schedule(p_user_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.recommendation_schedules
  set next_run_at = now() + interval '15 minutes', attempts = attempts + 1, in_retry = true
  where user_id = p_user_id and attempts < 3;
$$;

-- Devolve à fila um usuário reservado e não processado (orçamento de tempo da execução esgotado).
-- in_retry volta a refletir se a reserva era de um retry (attempts > 0 só sobrevive à reserva nesse caso).
create or replace function public.release_schedule(p_user_id uuid, p_due_at timestamptz) returns void
language sql security definer set search_path = '' as $$
  update public.recommendation_schedules
  set next_run_at = p_due_at, in_retry = attempts > 0
  where user_id = p_user_id;
$$;

-- Mudança de agendamento pelo usuário recomeça do zero (contador e retry).
create or replace function public.schedule_set_next_run() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT'
     or new.frequency is distinct from old.frequency or new.weekday is distinct from old.weekday
     or new.day_of_month is distinct from old.day_of_month or new.hour is distinct from old.hour
     or new.timezone is distinct from old.timezone or (new.active and not old.active) then
    new.next_run_at := public.compute_next_run(new.frequency, new.weekday, new.day_of_month, new.hour, new.timezone, now());
    new.attempts := 0;
    new.in_retry := false;
  end if;
  return new;
end $$;

revoke execute on function public.claim_due_schedules(integer) from public, anon, authenticated;
revoke execute on function public.retry_schedule(uuid) from public, anon, authenticated;
revoke execute on function public.release_schedule(uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reserva atômica de IA
--    Antes: a checagem (select) e o registro (record_ai_usage) eram separados — pedidos simultâneos
--    passavam do limite — e a soma do mês era feita no cliente sobre no máximo 1000 linhas (max_rows).
-- ---------------------------------------------------------------------------
-- 'ok' reserva 1 pedido do dia; 'daily' = limite diário do usuário; 'budget' = teto global do mês.
-- Custo: preço do Haiku 5.5 (US$ 0,10 / 0,50 por milhão de tokens), igual a core/assistant.ts.
create or replace function public.reserve_ai_request(p_user_id uuid, p_daily_limit integer, p_budget_usd numeric)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  spent numeric;
begin
  -- Serializa as reservas: a soma do mês e o incremento ficam consistentes entre pedidos simultâneos.
  perform pg_advisory_xact_lock(hashtext('cinematch.reserve_ai_request'));

  select coalesce(sum(u.input_tokens::numeric * 0.1 + u.output_tokens::numeric * 0.5), 0) / 1000000
  into spent
  from public.ai_usage u
  where u.day >= date_trunc('month', current_date)::date;
  if spent >= p_budget_usd then return 'budget'; end if;

  if p_daily_limit < 1 then return 'daily'; end if;
  insert into public.ai_usage as a (user_id, day, requests)
  values (p_user_id, current_date, 1)
  on conflict (user_id, day) do update set requests = a.requests + 1
  where a.requests < p_daily_limit;
  if found then return 'ok'; end if;
  return 'daily';
end $$;

-- Soma os tokens consumidos (o pedido já foi contado na reserva).
create or replace function public.add_ai_tokens(p_user_id uuid, p_input integer, p_output integer) returns void
language sql security definer set search_path = '' as $$
  insert into public.ai_usage as a (user_id, day, requests, input_tokens, output_tokens)
  values (p_user_id, current_date, 0, greatest(p_input, 0), greatest(p_output, 0))
  on conflict (user_id, day) do update
    set input_tokens = a.input_tokens + excluded.input_tokens,
        output_tokens = a.output_tokens + excluded.output_tokens;
$$;

revoke execute on function public.reserve_ai_request(uuid, integer, numeric) from public, anon, authenticated;
revoke execute on function public.add_ai_tokens(uuid, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Exportação LGPD completa, agregada em SQL (sem o limite de 1000 linhas do PostgREST).
-- ---------------------------------------------------------------------------
create or replace function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'não autenticado' using errcode = '42501'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'account', (
      select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at)
      from auth.users u where u.id = uid
    ),
    'profile', (select to_jsonb(p) from public.profiles p where p.user_id = uid),
    'movies', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.updated_at desc) from public.user_movies m where m.user_id = uid
    ), '[]'::jsonb),
    'schedule', (select to_jsonb(s) from public.recommendation_schedules s where s.user_id = uid),
    'ai_usage', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.day) from public.ai_usage a where a.user_id = uid
    ), '[]'::jsonb),
    'recommendations', coalesce((
      select jsonb_agg(
        to_jsonb(r) || jsonb_build_object('items', coalesce((
          select jsonb_agg(to_jsonb(i) order by i.rank) from public.recommendation_items i where i.recommendation_id = r.id
        ), '[]'::jsonb))
        order by r.created_at desc
      )
      from public.recommendations r where r.user_id = uid
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Limites de tamanho (abuso de armazenamento pelo cliente).
-- ---------------------------------------------------------------------------
alter table public.profiles
  add constraint profiles_constraints_size check (pg_column_size(constraints) <= 4096 and jsonb_typeof(constraints) = 'object'),
  add constraint profiles_preferences_size check (pg_column_size(preferences) <= 4096 and jsonb_typeof(preferences) = 'object');

alter table public.user_movies
  add constraint user_movies_tags_valid check (
    cardinality(tags) <= 6
    and tags <@ array['loved_script', 'loved_twist', 'loved_acting', 'slow_pacing', 'predictable_ending', 'too_long']::text[]
  );

-- ---------------------------------------------------------------------------
-- 7. Defesa em profundidade
-- ---------------------------------------------------------------------------
-- compute_next_run não precisa ser chamável por anônimos. authenticated mantém o grant:
-- o trigger schedule_set_next_run roda com o papel de quem grava o agendamento.
revoke execute on function public.compute_next_run(text, smallint, smallint, smallint, text, timestamptz) from public, anon;

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- A data do feedback é definida pelo banco, não pelo cliente.
create or replace function public.recommendation_items_feedback_at() returns trigger
language plpgsql as $$
begin
  if new.feedback is distinct from old.feedback then
    new.feedback_at := case when new.feedback is null then null else now() end;
  else
    new.feedback_at := old.feedback_at;
  end if;
  return new;
end $$;

create trigger recommendation_items_feedback_at before update on public.recommendation_items
for each row execute function public.recommendation_items_feedback_at();

-- ---------------------------------------------------------------------------
-- 8. Nota média exata
--    numeric(3,1) arredondava a média (7,449 → 7,4; 7,45 → 7,5) e filmes abaixo do limiar passavam no filtro.
--    Dependências de movies.rating_avg: só o índice movies_rating_idx (reconstruído pelo alter) e o check.
-- ---------------------------------------------------------------------------
alter table public.movies alter column rating_avg type numeric(6, 3);

update public.movies
set rating_avg = (select round(avg((r ->> 'value')::numeric), 3) from jsonb_array_elements(ratings) r)
where jsonb_array_length(ratings) > 0;
