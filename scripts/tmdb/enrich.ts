// Enriquece o catálogo com dados do TMDB (DEC-041): pôster, fundo, título e sinopse PT/EN, nota, trailer e onde assistir (BR).
// Uso: TMDB_READ_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run tmdb:enrich [-- --limit=200] [-- --skip-ids]
//      --ids-only: só mapeia os ids pelo Wikidata (não precisa do token do TMDB).
// Retomável: só busca filmes sem dados ou com dados de mais de 150 dias (o banco apaga após 180 — termos do TMDB).
// Os mais populares vêm primeiro. Respeita o limite de requisições do TMDB (≈40/s) com folga.
import { createClient } from '@supabase/supabase-js';
import { EMPTY_TMDB, mapTmdbMovie, type TmdbMovieResponse } from './map.ts';

const PAGE = 1000; // max_rows do PostgREST
const SPARQL_BATCH = 400;
const CONCURRENCY = 6;
const MIN_INTERVAL_MS = 30; // ≈ 33 req/s no máximo
const WRITE_BATCH = 100;
const REFRESH_DAYS = 150;

const env = (k: string) => {
  const v = process.env[k];
  if (!v) {
    console.error(`Defina ${k} (nunca versione chaves).`);
    process.exit(1);
  }
  return v;
};
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? Infinity);
const skipIds = process.argv.includes('--skip-ids');
const idsOnly = process.argv.includes('--ids-only');
const TOKEN = idsOnly ? '' : env('TMDB_READ_TOKEN');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Erros passageiros do banco (timeout 57014, conexão, 5xx do PostgREST): tenta de novo com espera crescente.
async function withRetry<T>(what: string, fn: () => PromiseLike<{ data: T; error: { code?: string; message: string } | null }>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await fn();
    if (!error) return data;
    const transient = ['57014', '08006', '08003', '53300', 'PGRST000', 'PGRST001', 'PGRST002'].includes(error.code ?? '') || !error.code;
    if (!transient || attempt >= 5) throw new Error(`${what}: ${error.code ?? ''} ${error.message}`);
    console.warn(`  ${what} falhou (${error.code ?? 'rede'}); nova tentativa ${attempt + 1}/5`);
    await sleep(2 ** attempt * 1000);
  }
}

// ---------------------------------------------------------------- 1. QID → id do TMDB (Wikidata P4947)
type Binding = { f: { value: string }; t: { value: string } };
async function sparql(query: string, attempt = 1): Promise<Binding[]> {
  const res = await fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: {
      'User-Agent': 'CineouCatalogImport/0.1 (https://github.com/Magnumja/cinematch)',
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ query }),
  }).catch(() => null);
  if (res?.ok) return ((await res.json()) as { results: { bindings: Binding[] } }).results.bindings;
  if (attempt >= 5) throw new Error(`SPARQL falhou (${res?.status ?? 'rede'})`);
  await sleep(2 ** attempt * 2000);
  return sparql(query, attempt + 1);
}

async function mapIds() {
  let mapped = 0;
  let lastId = '';
  // Cursor por id: cada filme sem tmdb_id é visto uma vez (os sem P4947 no Wikidata ficam sem id).
  for (;;) {
    const { data, error } = await db.from('movies').select('id').is('tmdb_id', null).gt('id', lastId).order('id').limit(PAGE);
    if (error) throw error;
    if (data.length === 0) break;
    lastId = data[data.length - 1]!.id as string;
    for (let i = 0; i < data.length; i += SPARQL_BATCH) {
      const ids = data.slice(i, i + SPARQL_BATCH).map((r) => r.id as string);
      const rows = await sparql(`SELECT ?f ?t WHERE { VALUES ?f { ${ids.map((q) => `wd:${q}`).join(' ')} } ?f wdt:P4947 ?t . }`);
      const pairs = new Map<string, number>();
      for (const r of rows) {
        const id = r.f.value.slice(r.f.value.lastIndexOf('/') + 1);
        const tmdbId = Number(r.t.value);
        if (Number.isInteger(tmdbId) && tmdbId > 0 && !pairs.has(id)) pairs.set(id, tmdbId);
      }
      if (pairs.size > 0) {
        const { error: e } = await db.rpc('set_tmdb_ids', { p_rows: [...pairs].map(([id, tmdb_id]) => ({ id, tmdb_id })) });
        if (e) throw e;
      }
      mapped += pairs.size;
      await sleep(300);
    }
    console.log(`  ids do TMDB mapeados: ${mapped}`);
  }
  return mapped;
}

// ---------------------------------------------------------------- 2. Detalhes no TMDB
let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_INTERVAL_MS;
  if (slot > now) await sleep(slot - now);
}

async function fetchMovie(tmdbId: number, attempt = 1): Promise<TmdbMovieResponse | 'not_found'> {
  await throttle();
  const url = `https://api.themoviedb.org/3/movie/${tmdbId}?language=pt-BR&append_to_response=${encodeURIComponent('watch/providers,translations,videos')}&include_video_language=pt,en`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } }).catch(() => null);
  if (res?.ok) return (await res.json()) as TmdbMovieResponse;
  if (res?.status === 404) return 'not_found';
  if (res?.status === 401) {
    console.error('TMDB recusou o token (401). Confira TMDB_READ_TOKEN (é o "API Read Access Token").');
    process.exit(1);
  }
  if (attempt >= 5) throw new Error(`TMDB ${res?.status ?? 'rede'} no filme ${tmdbId}`);
  const retryAfter = Number(res?.headers.get('retry-after')) || 2 ** attempt;
  await sleep(retryAfter * 1000);
  return fetchMovie(tmdbId, attempt + 1);
}

async function enrich() {
  const cutoff = new Date(Date.now() - REFRESH_DAYS * 86_400_000).toISOString();
  let done = 0;
  let withPoster = 0;
  let withProviders = 0;
  let notFound = 0;
  // Duas filas, cada uma servida por um índice (sem OR, que obrigava a varrer a tabela e estourava o timeout):
  // 1) nunca buscados, por popularidade (movies_tmdb_pending_idx); 2) vencidos, os mais antigos primeiro.
  let phase: 'pending' | 'stale' = 'pending';
  while (done < limit) {
    const size = Math.min(PAGE, limit - done);
    const data = await withRetry('ler fila', () =>
      phase === 'pending'
        ? db.from('movies').select('id,tmdb_id').not('tmdb_id', 'is', null).is('tmdb_fetched_at', null)
            .order('popularity', { ascending: false }).order('id').limit(size)
        : db.from('movies').select('id,tmdb_id').not('tmdb_id', 'is', null).lt('tmdb_fetched_at', cutoff)
            .order('tmdb_fetched_at').order('id').limit(size),
    );
    if (!data || data.length === 0) {
      if (phase === 'stale') break;
      phase = 'stale';
      continue;
    }

    const queue = [...(data as { id: string; tmdb_id: number }[])];
    const pending: { id: string; tmdb: unknown }[] = [];
    const flush = async () => {
      if (pending.length === 0) return;
      const rows = pending.splice(0);
      await withRetry('gravar lote', () => db.rpc('apply_tmdb', { p_rows: rows }));
    };
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        for (let item = queue.shift(); item; item = queue.shift()) {
          const r = await fetchMovie(item.tmdb_id);
          const info = r === 'not_found' ? EMPTY_TMDB : mapTmdbMovie(r);
          if (r === 'not_found') notFound++;
          if (info.posterPath) withPoster++;
          if (info.providers.length > 0) withProviders++;
          pending.push({ id: item.id, tmdb: info });
          if (pending.length >= WRITE_BATCH) await flush();
        }
      }),
    );
    await flush();
    done += data.length;
    console.log(`  detalhes: ${done} filmes (com pôster ${withPoster}, com onde assistir no BR ${withProviders}, não encontrados ${notFound})`);
  }
  return done;
}

console.log(skipIds ? 'Pulando o mapeamento de ids.' : 'Mapeando ids do TMDB pelo Wikidata (P4947)...');
if (!skipIds) await mapIds();
if (!idsOnly) {
  console.log('Buscando detalhes no TMDB...');
  const total = await enrich();
  console.log(`Concluído: ${total} filmes atualizados. Dados do TMDB vencem em 180 dias; rode de novo antes disso para renovar.`);
}
