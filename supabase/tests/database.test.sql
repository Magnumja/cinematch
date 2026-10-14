-- Testes do banco: RLS, imutabilidade de colunas, agendamento idempotente e exclusão de conta.
-- Rodar com: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Dados de teste (sintéticos).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local');
insert into public.movies (id, title_en, runtime_min, genres) values ('Q999999991', 'Test Movie', 100, '{drama}');

select ok(exists (select 1 from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), 'perfil criado automaticamente no cadastro');

insert into public.user_movies (user_id, movie_id, watched) values ('00000000-0000-0000-0000-00000000000b', 'Q999999991', true);
insert into public.recommendations (id, user_id, kind, algorithm_version, applied_constraints, candidate_count)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'on_demand', 'rules-v1', '{}', 1);
insert into public.recommendation_items (recommendation_id, movie_id, rank, score, tier)
values ('10000000-0000-0000-0000-000000000001', 'Q999999991', 1, 0.5, 'good');

-- ---------------------------------------------------------------- RLS como usuário A
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is((select count(*)::int from public.user_movies), 0, 'A não vê filmes de B');
select is((select count(*)::int from public.recommendations), 0, 'A não vê recomendações de B');
select is((select count(*)::int from public.recommendation_items), 0, 'A não vê itens de B');
select ok(exists (select 1 from public.movies where id = 'Q999999991'), 'catálogo visível para usuário logado');
select throws_ok(
  $$ insert into public.user_movies (user_id, movie_id) values ('00000000-0000-0000-0000-00000000000b', 'Q999999991') $$,
  '42501', null, 'A não grava em nome de B'
);
select throws_ok(
  $$ insert into public.recommendations (user_id, kind, algorithm_version, applied_constraints, candidate_count)
     values ('00000000-0000-0000-0000-00000000000a', 'on_demand', 'x', '{}', 0) $$,
  '42501', null, 'cliente não cria recomendações (só o backend)'
);
select throws_ok(
  $$ insert into public.recommendation_schedules (user_id, frequency, weekday, next_run_at)
     values ('00000000-0000-0000-0000-00000000000a', 'weekly', 5, now()) $$,
  '42501', null, 'cliente não define next_run_at'
);

-- ---------------------------------------------------------------- RLS como usuário B
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select lives_ok(
  $$ update public.recommendation_items set feedback = 'liked', feedback_at = now() where rank = 1 $$,
  'B registra feedback no próprio item'
);
select throws_ok(
  $$ update public.recommendation_items set score = 9.9 where rank = 1 $$,
  '42501', null, 'B não altera score (log imutável para o cliente)'
);

-- ---------------------------------------------------------------- Agendamento (como postgres)
reset role;

select is(
  public.compute_next_run('weekly', 5::smallint, null, 19::smallint, 'America/Sao_Paulo', '2026-10-14 12:00+00'),
  '2026-10-16 22:00+00'::timestamptz,
  'sexta às 19h em São Paulo a partir de quarta'
);
select is(
  public.compute_next_run('daily', null, null, 19::smallint, 'America/Sao_Paulo', '2026-10-14 23:30+00'),
  '2026-10-15 22:00+00'::timestamptz,
  'diário: horário de hoje já passou, vai para amanhã'
);
select is(
  public.compute_next_run('monthly', null, 1::smallint, 9::smallint, 'UTC', '2026-10-14 12:00+00'),
  '2026-11-01 09:00+00'::timestamptz,
  'mensal: dia 1 do mês seguinte'
);

insert into public.recommendation_schedules (user_id, frequency, weekday, hour)
values ('00000000-0000-0000-0000-00000000000a', 'weekly', 5, 19);
update public.recommendation_schedules set next_run_at = now() - interval '1 minute' where user_id = '00000000-0000-0000-0000-00000000000a';

select is((select count(*)::int from public.claim_due_schedules(10)), 1, 'primeira execução reserva o agendamento vencido');
select is((select count(*)::int from public.claim_due_schedules(10)), 0, 'execução repetida não reserva de novo');

-- Retry limitado: falha persistente para depois de 3 tentativas (não fica em loop a cada 15 min).
-- Simula 4 ciclos de "vencer → reservar → falhar"; o tempo é avançado empurrando next_run_at para o passado.
do $$
begin
  for i in 1..4 loop
    update public.recommendation_schedules set next_run_at = now() - interval '1 minute'
    where user_id = '00000000-0000-0000-0000-00000000000a' and next_run_at <= now() + interval '20 minutes';
    perform public.claim_due_schedules(10);
    perform public.retry_schedule('00000000-0000-0000-0000-00000000000a');
  end loop;
end $$;
select is(
  (select attempts::int from public.recommendation_schedules where user_id = '00000000-0000-0000-0000-00000000000a'),
  3,
  'retry para em 3 tentativas'
);
select ok(
  (select next_run_at > now() + interval '1 hour' from public.recommendation_schedules where user_id = '00000000-0000-0000-0000-00000000000a'),
  'depois de esgotar as tentativas, volta para a próxima ocorrência normal'
);

insert into public.recommendations (user_id, kind, period_key, algorithm_version, applied_constraints, candidate_count)
values ('00000000-0000-0000-0000-00000000000a', 'scheduled', 'scheduled:2026-W42', 'rules-v1', '{}', 1);
select throws_ok(
  $$ insert into public.recommendations (user_id, kind, period_key, algorithm_version, applied_constraints, candidate_count)
     values ('00000000-0000-0000-0000-00000000000a', 'scheduled', 'scheduled:2026-W42', 'rules-v1', '{}', 1) $$,
  '23505', null, 'mesma semana não gera segunda recomendação agendada'
);

select * from finish();
rollback;
