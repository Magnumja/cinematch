// Camada de dados das Edge Functions: carrega perfil e catálogo, roda o motor (core/) e grava o log.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MOVIE_COLUMNS, parseProfile, rowToMovie, rowToUserMovie, type MovieRow, type UserMovieRow } from '../../../core/db.ts';
import { mergeConstraints, relaxedVariants } from '../../../core/engine/filters.ts';
import { recommend } from '../../../core/engine/recommend.ts';
import { ContextSchema, type Constraints, type Context, type ContextInput, type Movie, type RecommendationResult } from '../../../core/schemas.ts';

// O PostgREST corta toda resposta em max_rows = 1000 (inclusive service role). Pools maiores exigem paginação.
const PAGE = 1000;
const CANDIDATE_POOL = 1000;
const GENRE_POOL = 1000;

export const CORS_HEADERS = {
  // Sem ALLOWED_ORIGIN configurado, só o frontend local é aceito (falha fechada em produção).
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? 'http://127.0.0.1:5173',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

// Comparação em tempo constante do segredo do cron (scheduled-run e deliver-push).
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function userIdFromRequest(db: SupabaseClient, req: Request): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

// Limite simples por usuário, usando o próprio log de recomendações.
export async function tooManyRequests(db: SupabaseClient, userId: string, perMinute: number): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await db
    .from('recommendations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);
  if (error) throw error;
  return (count ?? 0) >= perMinute;
}

export async function moviesByIds(db: SupabaseClient, ids: readonly string[]): Promise<Movie[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db.from('movies').select(MOVIE_COLUMNS).in('id', ids.slice(0, 500));
  if (error) throw error;
  return (data as MovieRow[]).map(rowToMovie);
}

// Todos os estados do usuário, paginando além do limite de 1000 linhas.
// Truncar aqui faria um filme antigo marcado "não gostei"/"assistido" voltar a ser recomendado.
async function loadAllStates(db: SupabaseClient, userId: string): Promise<UserMovieRow[]> {
  const rows: UserMovieRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('user_movies')
      .select('movie_id,watched,watchlist,sentiment,not_interested,tags')
      .eq('user_id', userId)
      .order('movie_id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data as UserMovieRow[]));
    if (data.length < PAGE) return rows;
  }
}

export async function loadUser(db: SupabaseClient, userId: string) {
  const [{ data: profileRow, error: pErr }, stateRows] = await Promise.all([
    db.from('profiles').select('constraints,preferences,locale').eq('user_id', userId).single(),
    loadAllStates(db, userId),
  ]);
  if (pErr) throw pErr;
  const profile = parseProfile(profileRow);
  const states = stateRows.map(rowToUserMovie);
  // Referências: favoritos e filmes com sinal (para similaridade e aprendizado implícito).
  const signalIds = states.filter((s) => s.sentiment !== 0 || s.watchlist || s.notInterested).map((s) => s.movieId);
  const referenceMovies = await moviesByIds(db, [...new Set([...profile.preferences.favoriteMovieIds, ...signalIds])]);
  return { profile, states, referenceMovies, locale: profileRow.locale as 'pt' | 'en' };
}

// Pré-filtro no banco para limitar o volume. É igual ou mais permissivo que o motor:
// o core/ reaplica todos os filtros obrigatórios depois.
function applyPrefilter<T>(query: T, c: Constraints): T {
  // deno-lint-ignore no-explicit-any
  let q = query as any;
  if (c.minRuntimeMin !== null) q = q.gte('runtime_min', c.minRuntimeMin);
  if (c.maxRuntimeMin !== null) q = q.lte('runtime_min', c.maxRuntimeMin);
  if (c.minRating !== null) q = q.gte('rating_avg', c.minRating);
  if (c.minYear !== null) q = q.gte('year', c.minYear);
  if (c.maxYear !== null) q = q.lte('year', c.maxYear);
  if (c.languages.length > 0) q = q.overlaps('languages', c.languages);
  if (c.excludedGenres.length > 0) q = q.not('genres', 'ov', `{${c.excludedGenres.join(',')}}`);
  return q as T;
}

export async function loadCandidates(db: SupabaseClient, constraints: Constraints, focusGenres: readonly string[], explore: boolean): Promise<Movie[]> {
  const base = applyPrefilter(db.from('movies').select(MOVIE_COLUMNS), constraints)
    .order('popularity', { ascending: false }).order('id').limit(CANDIDATE_POOL);
  const queries = [base];
  if (focusGenres.length > 0) {
    const genreQuery = applyPrefilter(db.from('movies').select(MOVIE_COLUMNS), constraints).overlaps('genres', focusGenres as string[]);
    queries.push(
      explore
        // Explorar: títulos fora dos gêneros habituais.
        ? applyPrefilter(db.from('movies').select(MOVIE_COLUMNS), constraints)
          .not('genres', 'ov', `{${focusGenres.join(',')}}`).order('popularity', { ascending: false }).limit(GENRE_POOL)
        : genreQuery.order('popularity', { ascending: false }).limit(GENRE_POOL),
    );
  }
  const results = await Promise.all(queries);
  const byId = new Map<string, Movie>();
  for (const { data, error } of results) {
    if (error) throw error;
    for (const row of data as MovieRow[]) if (!byId.has(row.id)) byId.set(row.id, rowToMovie(row));
  }
  return [...byId.values()];
}

// Quando nada passa nos filtros, o pré-filtro do banco deixa o motor sem candidatos para comparar.
// Para cada restrição removida, contamos no banco e descontamos os filmes que o usuário não pode receber
// (assistidos, não gostei, sem interesse, já mostrados). Acima de 1000 linhas a conta é um limite inferior.
async function relaxationsFromDb(db: SupabaseClient, c: Constraints, blocked: ReadonlySet<string>) {
  const counts = await Promise.all(
    relaxedVariants(c).map(async ({ constraint, relaxed }) => {
      const { data, count, error } = await applyPrefilter(db.from('movies').select('id', { count: 'exact' }), relaxed).limit(PAGE);
      if (error) throw error;
      const ids = (data as { id: string }[]).map((r) => r.id);
      const available = ids.filter((id) => !blocked.has(id)).length;
      const wouldMatch = ids.length < PAGE ? available : Math.max(available, (count ?? 0) - blocked.size);
      return { constraint, wouldMatch };
    }),
  );
  return counts.filter((r) => r.wouldMatch > 0).sort((a, b) => b.wouldMatch - a.wouldMatch);
}

export interface Generated {
  recommendationId: string | null;
  duplicate: boolean;
  result: RecommendationResult;
  // id de cada item gravado, por rank — o cliente usa para registrar feedback.
  itemIds: Record<number, string>;
  movies: Movie[];
}

export async function generateAndStore(
  db: SupabaseClient,
  userId: string,
  opts: {
    kind: 'on_demand' | 'discover' | 'explore' | 'scheduled';
    context?: ContextInput;
    limit?: number;
    periodKey?: string;
    // Filmes citados só neste pedido ("parecido com X"): guiam a similaridade, não viram histórico
    // nem são recomendados. Não são persistidos no perfil.
    requestReferenceIds?: string[];
  },
): Promise<Generated> {
  const user = await loadUser(db, userId);
  const context: Context = ContextSchema.parse(opts.context ?? {});
  const preferences = user.profile.preferences;
  const requestReferences = await moviesByIds(db, opts.requestReferenceIds ?? []);
  const referenceMovies = user.referenceMovies;
  const merged = mergeConstraints(user.profile.constraints, context.constraints);
  const constraints = { ...merged, excludedGenres: [...new Set([...merged.excludedGenres, ...context.avoidGenres])] };
  const focus = [...new Set([...preferences.likedGenres, ...context.preferGenres])];

  const candidates = await loadCandidates(db, constraints, focus, context.mode === 'explore');
  const result = recommend({
    candidates,
    profile: { constraints: user.profile.constraints, preferences },
    states: user.states,
    referenceMovies,
    requestReferences,
    context,
    limit: opts.limit ?? 5,
  });
  if (result.items.length === 0 && result.relaxations.length === 0) {
    const blocked = new Set([
      ...context.excludeMovieIds,
      ...requestReferences.map((m) => m.id),
      ...user.states
        .filter((s) => s.notInterested || s.sentiment === -1 || (s.watched && !result.appliedConstraints.allowRewatch))
        .map((s) => s.movieId),
    ]);
    result.relaxations = await relaxationsFromDb(db, result.appliedConstraints, blocked);
  }

  const recRow = {
    user_id: userId,
    kind: opts.kind,
    period_key: opts.periodKey ?? null,
    algorithm_version: result.algorithmVersion,
    context,
    applied_constraints: result.appliedConstraints,
    candidate_count: result.candidateCount,
    rejected: result.rejected,
  };
  const insert = opts.periodKey
    ? db.from('recommendations').upsert(recRow, { onConflict: 'user_id,period_key', ignoreDuplicates: true }).select('id')
    : db.from('recommendations').insert(recRow).select('id');
  const { data: inserted, error } = await insert;
  if (error) throw error;
  const recommendationId = (inserted as { id: string }[])[0]?.id ?? null;

  const byId = new Map([...candidates, ...referenceMovies, ...requestReferences].map((m) => [m.id, m]));
  const movies = [...new Set([...result.items.map((i) => i.movieId), ...referenceMovies.map((m) => m.id), ...requestReferences.map((m) => m.id)])]
    .map((id) => byId.get(id))
    .filter((m): m is Movie => m !== undefined);

  // Duplicata de período: outra execução já gerou esta recomendação. Nada mais é gravado.
  if (!recommendationId) return { recommendationId: null, duplicate: true, result, movies, itemIds: {} };

  const itemIds: Record<number, string> = {};
  if (result.items.length > 0) {
    const { data: itemRows, error: itemsError } = await db.from('recommendation_items').insert(
      result.items.map((i) => ({
        recommendation_id: recommendationId,
        movie_id: i.movieId,
        rank: i.rank,
        score: i.score,
        tier: i.tier,
        factors: i.factors,
      })),
    ).select('id,rank');
    if (itemsError) {
      // Desfaz o cabeçalho para que o retry não seja bloqueado pela chave de período.
      await db.from('recommendations').delete().eq('id', recommendationId);
      throw itemsError;
    }
    for (const row of itemRows as { id: string; rank: number }[]) itemIds[row.rank] = row.id;
  }
  return { recommendationId, duplicate: false, result, movies, itemIds };
}
