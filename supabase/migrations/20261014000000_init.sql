-- CineMatch AI — esquema inicial.
-- Princípios: RLS em todas as tabelas; cliente só lê/escreve os próprios dados;
-- escrita de recomendações apenas pelo backend (service role); idempotência por constraints.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Catálogo (Wikidata, CC0). Escrito só pelo script de importação.
-- ---------------------------------------------------------------------------
create table public.movies (
  id text primary key check (id ~ '^Q[0-9]+$'),
  title_pt text,
  title_en text,
  year smallint,
  runtime_min smallint not null check (runtime_min > 0),
  genres text[] not null default '{}',
  languages text[] not null default '{}',
  directors jsonb not null default '[]',
  ratings jsonb not null default '[]',
  -- Média das fontes aceitas (DEC-010), 0–10. Nula quando não há nota.
  rating_avg numeric(3, 1) check (rating_avg between 0 and 10),
  popularity integer not null default 0,
  description_pt text,
  description_en text,
  search_text text generated always as (lower(coalesce(title_pt, '') || ' ' || coalesce(title_en, ''))) stored,
  updated_at timestamptz not null default now(),
  check (title_pt is not null or title_en is not null)
);

create index movies_popularity_idx on public.movies (popularity desc);
create index movies_genres_idx on public.movies using gin (genres);
create index movies_runtime_idx on public.movies (runtime_min);
create index movies_rating_idx on public.movies (rating_avg) where rating_avg is not null;
create index movies_search_idx on public.movies using gin (search_text gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Perfil: restrições (obrigatórias) e preferências (flexíveis) em jsonb validado por Zod (DEC-020/021).
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  locale text not null default 'pt' check (locale in ('pt', 'en')),
  constraints jsonb not null default '{}',
  preferences jsonb not null default '{}',
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Estado do usuário por filme: assistido, salvo, gostou/não gostou, sem interesse, tags de feedback.
create table public.user_movies (
  user_id uuid not null references auth.users (id) on delete cascade,
  movie_id text not null references public.movies (id) on delete cascade,
  watched boolean not null default false,
  watchlist boolean not null default false,
  sentiment smallint not null default 0 check (sentiment in (-1, 0, 1)),
  not_interested boolean not null default false,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);
create index user_movies_recent_idx on public.user_movies (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Log de recomendações: versão do algoritmo, restrições aplicadas, score e fatores por item.
-- ---------------------------------------------------------------------------
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('on_demand', 'discover', 'explore', 'scheduled', 'assistant')),
  -- Só para agendadas: impede gerar duas vezes a mesma recomendação do período.
  period_key text,
  algorithm_version text not null,
  context jsonb not null default '{}',
  applied_constraints jsonb not null,
  candidate_count integer not null,
  rejected jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, period_key)
);
create index recommendations_user_idx on public.recommendations (user_id, created_at desc);

create table public.recommendation_items (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.recommendations (id) on delete cascade,
  movie_id text not null references public.movies (id) on delete cascade,
  rank smallint not null check (rank > 0),
  score numeric(6, 3) not null,
  tier text not null check (tier in ('high', 'good', 'longshot')),
  factors jsonb not null default '[]',
  feedback text check (feedback in ('liked', 'disliked', 'want', 'not_interested', 'watched', 'skipped')),
  feedback_at timestamptz,
  unique (recommendation_id, rank)
);
create index recommendation_items_rec_idx on public.recommendation_items (recommendation_id);

-- ---------------------------------------------------------------------------
-- Agendamento. next_run_at é sempre calculado no banco (trigger), nunca pelo cliente.
-- ---------------------------------------------------------------------------
create table public.recommendation_schedules (
  user_id uuid primary key references auth.users (id) on delete cascade,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  weekday smallint check (weekday between 0 and 6),
  day_of_month smallint check (day_of_month between 1 and 28),
  hour smallint not null default 19 check (hour between 0 and 23),
  timezone text not null default 'America/Sao_Paulo',
  channel text not null default 'in_app' check (channel in ('in_app')),
  active boolean not null default true,
  next_run_at timestamptz,
  attempts smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (frequency <> 'weekly' or weekday is not null),
  check (frequency <> 'monthly' or day_of_month is not null)
);
create index schedules_due_idx on public.recommendation_schedules (next_run_at) where active;

-- Execuções dos jobs: nenhuma falha é silenciosa.
create table public.job_runs (
  id bigint generated always as identity primary key,
  job text not null,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  processed integer not null default 0,
  failed integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Consumo da LLM por usuário/dia, para limites e controle de custo.
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  requests integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger user_movies_touch before update on public.user_movies for each row execute function public.touch_updated_at();
create trigger schedules_touch before update on public.recommendation_schedules for each row execute function public.touch_updated_at();

-- Cria o perfil vazio quando o usuário se cadastra.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Próxima execução no fuso do usuário, estritamente depois de "after".
create or replace function public.compute_next_run(
  p_frequency text, p_weekday smallint, p_day_of_month smallint, p_hour smallint, p_timezone text, p_after timestamptz
) returns timestamptz
language plpgsql stable as $$
declare
  local_after timestamp := p_after at time zone p_timezone;
  candidate timestamp;
begin
  if p_frequency = 'daily' then
    candidate := date_trunc('day', local_after) + make_interval(hours => p_hour);
    if candidate <= local_after then candidate := candidate + interval '1 day'; end if;
  elsif p_frequency = 'weekly' then
    candidate := date_trunc('day', local_after) + make_interval(hours => p_hour)
      + make_interval(days => ((p_weekday - extract(dow from local_after)::int + 7) % 7));
    if candidate <= local_after then candidate := candidate + interval '7 days'; end if;
  elsif p_frequency = 'monthly' then
    candidate := date_trunc('month', local_after) + make_interval(days => p_day_of_month - 1, hours => p_hour);
    if candidate <= local_after then
      candidate := date_trunc('month', local_after) + interval '1 month' + make_interval(days => p_day_of_month - 1, hours => p_hour);
    end if;
  else
    raise exception 'frequência inválida: %', p_frequency;
  end if;
  return candidate at time zone p_timezone;
end $$;

create or replace function public.schedule_set_next_run() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT'
     or new.frequency is distinct from old.frequency or new.weekday is distinct from old.weekday
     or new.day_of_month is distinct from old.day_of_month or new.hour is distinct from old.hour
     or new.timezone is distinct from old.timezone or (new.active and not old.active) then
    new.next_run_at := public.compute_next_run(new.frequency, new.weekday, new.day_of_month, new.hour, new.timezone, now());
    new.attempts := 0;
  end if;
  return new;
end $$;

create trigger schedules_next_run before insert or update on public.recommendation_schedules
for each row execute function public.schedule_set_next_run();

-- Reserva agendamentos vencidos. FOR UPDATE SKIP LOCKED + avanço imediato de next_run_at
-- garantem que duas execuções concorrentes nunca peguem o mesmo usuário.
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
      attempts = 0
  from due
  where s.user_id = due.user_id
  returning s.user_id, s.frequency, s.timezone, due.next_run_at;
end $$;

-- Política de retry: até 3 tentativas, 15 minutos depois.
create or replace function public.retry_schedule(p_user_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.recommendation_schedules
  set next_run_at = now() + interval '15 minutes', attempts = attempts + 1
  where user_id = p_user_id and attempts < 3;
$$;

-- Contabiliza uso da LLM e devolve o total do dia (atômico).
create or replace function public.record_ai_usage(p_user_id uuid, p_input integer, p_output integer)
returns integer
language sql security definer set search_path = '' as $$
  insert into public.ai_usage (user_id, day, requests, input_tokens, output_tokens)
  values (p_user_id, current_date, 1, p_input, p_output)
  on conflict (user_id, day) do update
    set requests = public.ai_usage.requests + 1,
        input_tokens = public.ai_usage.input_tokens + excluded.input_tokens,
        output_tokens = public.ai_usage.output_tokens + excluded.output_tokens
  returning requests;
$$;

-- Exclusão de conta (LGPD): remove o usuário; todo o resto cai em cascata.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke execute on function public.claim_due_schedules(integer) from public, anon, authenticated;
revoke execute on function public.retry_schedule(uuid) from public, anon, authenticated;
revoke execute on function public.record_ai_usage(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.movies enable row level security;
alter table public.profiles enable row level security;
alter table public.user_movies enable row level security;
alter table public.recommendations enable row level security;
alter table public.recommendation_items enable row level security;
alter table public.recommendation_schedules enable row level security;
alter table public.job_runs enable row level security;
alter table public.ai_usage enable row level security;

create policy "catálogo visível para usuários logados" on public.movies
  for select to authenticated using (true);

create policy "ler o próprio perfil" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "atualizar o próprio perfil" on public.profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "gerenciar os próprios filmes" on public.user_movies
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "ler as próprias recomendações" on public.recommendations
  for select to authenticated using (user_id = (select auth.uid()));

create policy "ler os próprios itens" on public.recommendation_items
  for select to authenticated using (
    exists (select 1 from public.recommendations r where r.id = recommendation_id and r.user_id = (select auth.uid()))
  );
create policy "dar feedback nos próprios itens" on public.recommendation_items
  for update to authenticated using (
    exists (select 1 from public.recommendations r where r.id = recommendation_id and r.user_id = (select auth.uid()))
  );
-- O cliente só pode alterar as colunas de feedback; score, fatores e ranking são imutáveis para ele.
revoke update on public.recommendation_items from authenticated;
grant update (feedback, feedback_at) on public.recommendation_items to authenticated;

create policy "gerenciar o próprio agendamento" on public.recommendation_schedules
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- next_run_at e attempts são controlados pelo banco.
revoke insert, update on public.recommendation_schedules from authenticated;
grant insert (user_id, frequency, weekday, day_of_month, hour, timezone, active) on public.recommendation_schedules to authenticated;
grant update (frequency, weekday, day_of_month, hour, timezone, active) on public.recommendation_schedules to authenticated;

create policy "ver o próprio consumo de IA" on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));

-- job_runs: sem políticas → inacessível ao cliente; só service role.
