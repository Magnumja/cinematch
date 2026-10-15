// Teste de integração ponta a ponta contra um Supabase real (local ou staging) com o catálogo carregado.
// Cria um usuário descartável, exercita os fluxos críticos e apaga a conta no final.
// Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... CRON_SECRET=... node scripts/smoke-test.ts
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { averageRating } from '../core/engine/filters.ts';
import type { Movie, RecommendationItem } from '../core/schemas.ts';

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Defina ${k}`);
  return v;
};
const URL_ = env('SUPABASE_URL');
const admin = createClient(URL_, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const client = createClient(URL_, env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
const CRON_SECRET = env('CRON_SECRET');

type RecResponse = { recommendationId: string; itemIds: Record<number, string>; items: RecommendationItem[]; movies: Movie[]; relaxations: unknown[]; error?: string };

async function call(fn: string, body: unknown, token?: string): Promise<{ status: number; json: RecResponse }> {
  const res = await fetch(`${URL_}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as RecResponse };
}

function step(name: string) {
  console.log(`✔ ${name}`);
}

const email = `smoke-${Date.now()}@test.local`;
const { data: signUp, error: signUpError } = await client.auth.signUp({ email, password: 'smoke-test-password-123' });
assert.ifError(signUpError);
const userId = signUp.user!.id;
const token = signUp.session!.access_token;
step('cadastro cria sessão');

try {
  const { data: profile } = await client.from('profiles').select('user_id').eq('user_id', userId).single();
  assert.equal(profile?.user_id, userId);
  step('perfil criado automaticamente');

  const { data: watchedRow } = await client.from('movies').select('id').gte('rating_avg', 8.5).lte('runtime_min', 115)
    .order('popularity', { ascending: false }).limit(1).single();
  const watchedId = watchedRow!.id as string;
  assert.ifError((await client.from('user_movies').insert({ user_id: userId, movie_id: watchedId, watched: true, sentiment: 1 })).error);

  const constraints = { minRating: 8, maxRuntimeMin: 120, excludedGenres: ['horror'] };
  assert.ifError((await client.from('profiles').update({ constraints, preferences: { likedGenres: ['thriller', 'crime'] } }).eq('user_id', userId)).error);
  step('perfil salvo via RLS');

  const rec = await call('recommend', { kind: 'on_demand', limit: 5 }, token);
  assert.equal(rec.status, 200, JSON.stringify(rec.json));
  assert.ok(rec.json.items.length > 0, 'deveria haver itens');
  const byId = new Map(rec.json.movies.map((m) => [m.id, m]));
  for (const item of rec.json.items) {
    const m = byId.get(item.movieId)!;
    assert.ok(averageRating(m)! >= 8, `${m.titleEn} tem nota ${averageRating(m)}`);
    assert.ok(m.runtimeMin <= 120, `${m.titleEn} dura ${m.runtimeMin}`);
    assert.ok(!m.genres.includes('horror'));
    assert.notEqual(m.id, watchedId, 'filme já assistido foi recomendado');
  }
  console.log('   ', rec.json.items.map((i) => `${byId.get(i.movieId)!.titleEn} (${i.tier}, ${i.score})`).join(' | '));
  step('recomendação respeita nota ≥ 8, duração ≤ 120, gênero excluído e já assistido');

  // Regressão (auditoria 2026-10-14): uma restrição pontual não pode apagar as do perfil.
  const ctx = await call('recommend', { kind: 'discover', context: { constraints: { maxRuntimeMin: 100 } } }, token);
  assert.equal(ctx.status, 200, JSON.stringify(ctx.json));
  const ctxById = new Map(ctx.json.movies.map((m) => [m.id, m]));
  for (const item of ctx.json.items) {
    const m = ctxById.get(item.movieId)!;
    assert.ok(averageRating(m)! >= 8, `contexto apagou a nota mínima do perfil: ${m.titleEn} ${averageRating(m)}`);
    assert.ok(m.runtimeMin <= 100 && !m.genres.includes('horror'));
  }
  step('restrição pontual (≤ 100 min) mantém as restrições do perfil (nota ≥ 8, sem terror)');

  const short = await call('recommend', { kind: 'on_demand', context: { constraints: { minRuntimeMin: 300, maxRuntimeMin: 40 } } }, token);
  assert.equal(short.status, 200);
  assert.equal(short.json.items.length, 0);
  assert.ok(short.json.relaxations.length > 0);
  step('sem resultado compatível: nenhuma recomendação inventada, relaxamentos sugeridos');

  const first = rec.json.items[0]!;
  assert.ifError((await client.from('recommendation_items').update({ feedback: 'liked', feedback_at: new Date().toISOString() }).eq('id', rec.json.itemIds[first.rank]!)).error);
  const { error: tamper } = await client.from('recommendation_items').update({ score: 99 }).eq('id', rec.json.itemIds[first.rank]!);
  assert.ok(tamper, 'cliente não deveria conseguir alterar o score');
  step('feedback gravado; score imutável para o cliente');

  assert.ifError((await client.from('recommendation_schedules').insert({ user_id: userId, frequency: 'weekly', weekday: 5, hour: 19 })).error);
  assert.ifError((await admin.from('recommendation_schedules').update({ next_run_at: new Date(Date.now() - 60_000).toISOString() }).eq('user_id', userId)).error);
  const run1 = await call('scheduled-run', {}, CRON_SECRET);
  const run2 = await call('scheduled-run', {}, CRON_SECRET);
  assert.equal(run1.status, 200, JSON.stringify(run1.json));
  assert.equal(run2.status, 200);
  const { count } = await admin.from('recommendations').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'scheduled');
  assert.equal(count, 1, 'job executado duas vezes deve gerar uma única recomendação agendada');
  const { data: lastRun } = await admin.from('job_runs').select('status').order('id', { ascending: false }).limit(1).single();
  assert.equal(lastRun!.status, 'succeeded');
  step('job agendado executado duas vezes gera uma única recomendação e registra execução');

  const unauth = await call('scheduled-run', {}, 'wrong-secret');
  assert.equal(unauth.status, 401);
  step('job agendado recusa chamada sem o segredo');

} finally {
  const { error } = await client.rpc('delete_my_account');
  assert.ifError(error);
  const { data: leftovers } = await admin.from('user_movies').select('movie_id').eq('user_id', userId);
  assert.equal(leftovers?.length, 0);
  step('exclusão de conta remove os dados em cascata');
}
