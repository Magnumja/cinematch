// Camada de dados das Edge Functions: carrega perfil e catálogo, roda o motor (core/) e grava o log.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MOVIE_COLUMNS, parseProfile, rowToMovie, rowToUserMovie, type MovieRow, type UserMovieRow } from '../../../core/db.ts';
import { mergeConstraints, relaxedVariants } from '../../../core/engine/filters.ts';
import { recommend } from '../../../core/engine/recommend.ts';
import { ContextSchema, type Constraints, type Context, type ContextInput, type Movie, type RecommendationResult } from '../../../core/schemas.ts';

const CANDIDATE_POOL = 2500;
const GENRE_POOL = 1500;

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
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

export async function loadUser(db: SupabaseClient, userId: string) {
  const [{ data: profileRow, error: pErr }, { data: stateRows, error: sErr }] = await Promise.all([
    db.from('profiles').select('constraints,preferences,locale').eq('user_id', userId).single(),
    db.from('user_movies').select('movie_id,watched,watchlist,sentiment,not_interested,tags').eq('user_id', userId)
      .order('updated_at', { ascending: false }).limit(2000),
  ]);
  if (pErr) throw pErr;
  if (sErr) throw sErr;
  const profile = parseProfile(profileRow);
  const states = (stateRows as UserMovieRow[]).map(rowToUserMovie);
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
// Contamos no próprio banco quantos filmes cada restrição removida liberaria (aproximado: não desconta já assistidos).
async function relaxationsFromDb(db: SupabaseClient, c: Constraints) {
  const counts = await Promise.all(
    relaxedVariants(c).map(async ({ constraint, relaxed }) => {
      const { count, error } = await applyPrefilter(db.from('movies').select('id', { count: 'exact', head: true }), relaxed);
      if (error) throw error;
      return { constraint, wouldMatch: count ?? 0 };
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
    kind: 'on_demand' | 'discover' | 'explore' | 'scheduled' | 'assistant';
    context?: ContextInput;
    limit?: number;
    periodKey?: string;
    // Referências extras só deste pedido (ex.: "parecido com X" no assistente). Não são persistidas.
    extraFavoriteIds?: string[];
  },
): Promise<Generated> {
  const user = await loadUser(db, userId);
  const context: Context = ContextSchema.parse(opts.context ?? {});
  const extra = opts.extraFavoriteIds ?? [];
  const preferences = { ...user.profile.preferences, favoriteMovieIds: [...user.profile.preferences.favoriteMovieIds, ...extra] };
  const referenceMovies = [...user.referenceMovies, ...(await moviesByIds(db, extra))];
  const constraints = mergeConstraints(user.profile.constraints, context.constraints);
  const focus = [...new Set([...preferences.likedGenres, ...context.preferGenres])];

  const candidates = await loadCandidates(db, constraints, focus, context.mode === 'explore');
  const result = recommend({
    candidates,
    profile: { constraints: user.profile.constraints, preferences },
    states: user.states,
    referenceMovies,
    context,
    limit: opts.limit ?? 5,
  });
  if (result.items.length === 0 && result.relaxations.length === 0) {
    result.relaxations = await relaxationsFromDb(db, result.appliedConstraints);
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

  const byId = new Map([...candidates, ...referenceMovies].map((m) => [m.id, m]));
  const movies = [...new Set([...result.items.map((i) => i.movieId), ...referenceMovies.map((m) => m.id)])]
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
