-- Testes do banco: RLS, imutabilidade de colunas, agendamento idempotente e exclusão de conta.
-- Rodar com: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(66);

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

-- ---------------------------------------------------------------- Retry por período (in_retry)
-- Depois de esgotar as tentativas, a próxima reserva regular zera o contador e uma falha volta a ter retry.
update public.recommendation_schedules set next_run_at = now() - interval '1 minute' where user_id = '00000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.claim_due_schedules(10)), 1, 'próxima ocorrência regular é reservada');
select is(
  (select attempts::int from public.recommendation_schedules where user_id = '00000000-0000-0000-0000-00000000000a'),
  0,
  'reserva regular zera as tentativas do período anterior'
);
select public.retry_schedule('00000000-0000-0000-0000-00000000000a');
select ok(
  (select attempts = 1 and in_retry and next_run_at = now() + interval '15 minutes'
   from public.recommendation_schedules where user_id = '00000000-0000-0000-0000-00000000000a'),
  'falha no novo período agenda retry de novo'
);

-- Reserva de um retry mantém o contador; release_schedule devolve o usuário à fila sem perder o retry.
update public.recommendation_schedules set next_run_at = now() - interval '1 minute' where user_id = '00000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.claim_due_schedules(10)), 1, 'retry vencido é reservado');
select is(
  (select attempts::int from public.recommendation_schedules where user_id = '00000000-0000-0000-0000-00000000000a'),
  1,
  'reserva de retry mantém o contador'
);
select public.release_schedule('00000000-0000-0000-0000-00000000000a', now() - interval '1 minute');
select ok(
  (select next_run_at = now() - interval '1 minute' and in_retry
   from public.recommendation_schedules where user_id = '00000000-0000-0000-0000-00000000000a'),
  'release_schedule devolve o usuário à fila com o horário original'
);
select is((select count(*)::int from public.claim_due_schedules(10)), 1, 'usuário devolvido é reservado de novo');
select is(
  (select attempts::int from public.recommendation_schedules where user_id = '00000000-0000-0000-0000-00000000000a'),
  1,
  'reserva depois do release continua contando como retry'
);
select ok(
  not has_function_privilege('authenticated', 'public.release_schedule(uuid, timestamptz)', 'execute')
  and not has_column_privilege('authenticated', 'public.recommendation_schedules', 'in_retry', 'update')
  and not has_column_privilege('authenticated', 'public.recommendation_schedules', 'in_retry', 'insert'),
  'cliente não chama release_schedule nem escreve in_retry'
);

-- ---------------------------------------------------------------- Assistente de IA removido (DEC-038)
select hasnt_table('public', 'ai_usage', 'tabela ai_usage removida');
select ok(
  to_regprocedure('public.reserve_ai_request(uuid, integer, numeric)') is null
  and to_regprocedure('public.add_ai_tokens(uuid, integer, integer)') is null
  and to_regprocedure('public.record_ai_usage(uuid, integer, integer)') is null,
  'funções de consumo de IA removidas'
);

-- ---------------------------------------------------------------- Nota média exata
select col_type_is('public', 'movies', 'rating_avg', 'numeric(6,3)', 'rating_avg guarda 3 casas');
insert into public.movies (id, title_en, runtime_min, ratings) values ('Q999999992', 'Rating Test', 90,
  '[{"source":"metacritic","value":7.4,"raw":"74/100"},{"source":"rotten_tomatoes","value":7.498,"raw":"7.498/10"}]');
select ok((select rating_avg < 7.5 from public.movies where id = 'Q999999992'), 'média 7,449 não é arredondada para 7,5');

-- ---------------------------------------------------------------- TMDB (DEC-041)
select is((select rating_avg from public.movies where id = 'Q999999992'), 7.449::numeric, 'média gerada pelo banco a partir de ratings');
update public.movies set tmdb = '{"voteAverage": 9.0, "voteCount": 99}', tmdb_fetched_at = now() where id = 'Q999999992';
select is((select rating_avg from public.movies where id = 'Q999999992'), 7.449::numeric, 'nota do TMDB não entra na média (poucos votos)');
update public.movies set tmdb = '{"voteAverage": 9.0, "voteCount": 5000}' where id = 'Q999999992';
select is((select rating_avg from public.movies where id = 'Q999999992'), 7.449::numeric, 'nota do TMDB não entra na média nem com muitos votos (DEC-043)');
select throws_ok($$ update public.movies set rating_avg = 1 where id = 'Q999999992' $$, '428C9', null, 'rating_avg não pode ser escrita (coluna gerada)');
update public.movies set tmdb_fetched_at = now() - interval '181 days' where id = 'Q999999992';
select ok(public.purge_stale_tmdb() >= 1, 'purge apaga dados do TMDB com mais de 180 dias');
select ok((select tmdb is null and rating_avg = 7.449 from public.movies where id = 'Q999999992'), 'após o purge, os dados do TMDB somem e a média da crítica fica igual');
select ok(not has_function_privilege('authenticated', 'public.apply_tmdb(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.purge_stale_tmdb(interval)', 'execute'), 'cliente não escreve dados do TMDB');

-- ---------------------------------------------------------------- Defesa em profundidade (privilégios)
select ok(
  has_function_privilege('authenticated', 'public.compute_next_run(text,smallint,smallint,smallint,text,timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.compute_next_run(text,smallint,smallint,smallint,text,timestamptz)', 'execute'),
  'compute_next_run: authenticated sim (trigger), anon não'
);
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'truncate')
  and not has_table_privilege('anon', 'public.movies', 'truncate')
  and not has_table_privilege('authenticated', 'public.user_movies', 'trigger')
  and not has_table_privilege('authenticated', 'public.movies', 'references'),
  'cliente sem truncate/trigger/references'
);

-- ---------------------------------------------------------------- Como usuário B (authenticated)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select lives_ok(
  $$ insert into public.recommendation_schedules (user_id, frequency, hour) values ('00000000-0000-0000-0000-00000000000b', 'daily', 8) $$,
  'usuário cria o próprio agendamento'
);
select ok(
  (select next_run_at > now() from public.recommendation_schedules where user_id = '00000000-0000-0000-0000-00000000000b'),
  'trigger calcula next_run_at para o usuário'
);

select lives_ok(
  $$ update public.recommendation_items set feedback = 'disliked', feedback_at = '2000-01-01' where rank = 1 $$,
  'B muda o feedback'
);
select ok(
  (select feedback_at = now() from public.recommendation_items where rank = 1),
  'feedback_at é definido pelo banco, não pelo cliente'
);

select throws_ok(
  $$ update public.profiles set constraints = jsonb_build_object('x', repeat('a', 10000)) $$,
  '23514', null, 'constraints grande demais é rejeitado'
);
select throws_ok(
  $$ update public.profiles set preferences = '[]' $$,
  '23514', null, 'preferences precisa ser objeto'
);
select throws_ok(
  $$ update public.user_movies set tags = '{hack}' $$,
  '23514', null, 'tag fora da lista é rejeitada'
);
select throws_ok(
  $$ update public.user_movies set tags = array_fill('too_long'::text, array[7]) $$,
  '23514', null, 'mais de 6 tags é rejeitado'
);

select ok(
  (select d->'account'->>'email' = 'b@test.local'
      and jsonb_array_length(d->'movies') = 1
      and jsonb_array_length(d->'recommendations') = 1
      and jsonb_array_length(d->'recommendations'->0->'items') = 1
      and d->'schedule'->>'frequency' = 'daily'
      and d->'profile'->>'user_id' = '00000000-0000-0000-0000-00000000000b'
   from public.export_my_data() d),
  'exportação traz conta, perfil, filmes, agendamento e recomendações com itens'
);
select ok(
  (select not exists (
     select 1 from jsonb_array_elements(d->'movies') m where m->>'user_id' <> '00000000-0000-0000-0000-00000000000b'
   ) and not exists (
     select 1 from jsonb_array_elements(d->'recommendations') r where r->>'user_id' <> '00000000-0000-0000-0000-00000000000b'
   ) and not d ? 'ai_usage'
   from public.export_my_data() d),
  'exportação não traz dados de outro usuário'
);

set local role anon;
select throws_ok($$ select public.export_my_data() $$, '42501', null, 'anônimo não exporta dados');
reset role;

-- ---------------------------------------------------------------- Listas personalizadas (DEC-045)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select lives_ok(
  $$ insert into public.user_lists (id, user_id, name) values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'Terror') $$,
  'B cria a própria lista'
);
select lives_ok(
  $$ insert into public.user_list_items (list_id, movie_id) values ('20000000-0000-0000-0000-000000000001', 'Q999999991') $$,
  'B adiciona filme à própria lista'
);
select throws_ok(
  $$ insert into public.user_lists (user_id, name) values ('00000000-0000-0000-0000-00000000000b', '  terror ') $$,
  '23505', null, 'nome de lista repetido (ignorando caixa e espaços) é rejeitado'
);
select throws_ok(
  $$ insert into public.user_lists (user_id, name) values ('00000000-0000-0000-0000-00000000000b', '   ') $$,
  '23514', null, 'lista sem nome é rejeitada'
);
select ok(
  (select jsonb_array_length(d->'lists') = 1 and jsonb_array_length(d->'lists'->0->'items') = 1 from public.export_my_data() d),
  'exportação LGPD inclui as listas e seus filmes'
);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is((select count(*)::int from public.user_lists), 0, 'A não vê listas de B');
select is((select count(*)::int from public.user_list_items), 0, 'A não vê filmes das listas de B');
select throws_ok(
  $$ insert into public.user_list_items (list_id, movie_id) values ('20000000-0000-0000-0000-000000000001', 'Q999999992') $$,
  '42501', null, 'A não adiciona filme à lista de B'
);
select throws_ok(
  $$ insert into public.user_lists (user_id, name) values ('00000000-0000-0000-0000-00000000000b', 'Invasão') $$,
  '42501', null, 'A não cria lista em nome de B'
);
update public.user_lists set name = 'hackeada' where id = '20000000-0000-0000-0000-000000000001';
reset role;
select is((select name from public.user_lists where id = '20000000-0000-0000-0000-000000000001'), 'Terror', 'A não renomeia a lista de B');

insert into public.user_lists (user_id, name)
  select '00000000-0000-0000-0000-00000000000a', 'Lista ' || g from generate_series(1, 50) g;
select throws_ok(
  $$ insert into public.user_lists (user_id, name) values ('00000000-0000-0000-0000-00000000000a', 'Lista 51') $$,
  '54000', null, 'limite de 50 listas por usuário'
);
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.user_lists where user_id = '00000000-0000-0000-0000-00000000000a'), 0, 'excluir a conta apaga as listas em cascata');

select has_index('public', 'movies', 'movies_tmdb_pending_idx', 'índice parcial da fila do TMDB (evita timeout no enriquecimento)');

-- Busca sem acento e pelo título pt-BR do TMDB
select is(public.search_normalize('Amélie AÇÃO'), 'amelie acao', 'search_normalize tira acento e caixa');
update public.movies set tmdb = coalesce(tmdb, '{}'::jsonb) || '{"titlePt": "Título Só No TMDB"}' where id = 'Q999999992';
select ok((select search_text like '%titulo so no tmdb%' from public.movies where id = 'Q999999992'), 'busca inclui o título pt-BR do TMDB, sem acento');

select * from finish();
rollback;
