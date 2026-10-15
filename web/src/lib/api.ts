// Acesso a dados do frontend. Só usa a chave pública; toda escrita sensível passa por RLS ou Edge Function.
import { createClient } from '@supabase/supabase-js';
import { MOVIE_COLUMNS, rowToMovie, rowToUserMovie, type MovieRow, type UserMovieRow } from '../../../core/db.ts';
import {
  ConstraintsSchema,
  PreferencesSchema,
  type Constraints,
  type ContextInput,
  type Movie,
  type Preferences,
  type RecommendationItem,
  type Relaxable,
  type UserMovie,
} from '../../../core/schemas.ts';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
if (!url || !key) throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env (veja .env.example).');

export const supabase = createClient(url, key);

export type Feedback = 'liked' | 'disliked' | 'want' | 'not_interested' | 'watched' | 'skipped';

export interface RecItem extends RecommendationItem {
  itemId: string | null;
  feedback: Feedback | null;
}

export interface RecView {
  recommendationId: string | null;
  // 'assistant' só aparece em recomendações antigas, de antes da remoção do assistente (DEC-038).
  kind: 'on_demand' | 'discover' | 'explore' | 'scheduled' | 'assistant';
  createdAt: string;
  // Só para agendadas: derivada do period_key.
  frequency?: 'daily' | 'weekly' | 'monthly';
  items: RecItem[];
  movies: Map<string, Movie>;
  relaxations: { constraint: Relaxable; wouldMatch: number }[];
}

interface FunctionRecResponse {
  recommendationId: string | null;
  itemIds: Record<number, string>;
  items: RecommendationItem[];
  relaxations: { constraint: Relaxable; wouldMatch: number }[];
  movies: Movie[];
}

function toView(kind: RecView['kind'], r: FunctionRecResponse): RecView {
  return {
    recommendationId: r.recommendationId,
    kind,
    createdAt: new Date().toISOString(),
    items: r.items.map((i) => ({ ...i, itemId: r.itemIds[i.rank] ?? null, feedback: null })),
    movies: new Map(r.movies.map((m) => [m.id, m])),
    relaxations: r.relaxations,
  };
}

export class ApiError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // FunctionsHttpError carrega a resposta; extraímos o código de erro padronizado da função.
    const ctx = (error as { context?: Response }).context;
    const payload = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
    throw new ApiError(payload?.error ?? 'network_error');
  }
  return data as T;
}

// Restrição liberada pelo usuário vira contexto pontual: vale só para o próximo pedido.
export function relaxToContext(c: Relaxable): Partial<Constraints> {
  switch (c) {
    case 'minRating':
      return { minRating: null };
    case 'maxRuntimeMin':
      return { maxRuntimeMin: null };
    case 'minRuntimeMin':
      return { minRuntimeMin: null };
    case 'languages':
      return { languages: [] };
    case 'yearRange':
      return { minYear: null, maxYear: null };
  }
}

// on_demand = recomendação principal da Home; discover = busca pontual com filtros (nunca vira a principal).
export async function requestRecommendation(
  kind: 'on_demand' | 'discover' | 'explore',
  context?: ContextInput,
  limit = 5,
): Promise<RecView> {
  return toView(kind, await invoke<FunctionRecResponse>('recommend', { kind, context, limit }));
}

interface StoredRecRow {
  id: string;
  kind: RecView['kind'];
  period_key: string | null;
  created_at: string;
  recommendation_items: {
    id: string;
    movie_id: string;
    rank: number;
    score: number;
    tier: RecItem['tier'];
    factors: RecItem['factors'];
    feedback: Feedback | null;
    movies: MovieRow;
  }[];
}

function frequencyOf(periodKey: string | null): RecView['frequency'] {
  if (!periodKey) return undefined;
  if (/W\d{2}$/.test(periodKey)) return 'weekly';
  if (/\d{4}-\d{2}-\d{2}$/.test(periodKey)) return 'daily';
  return 'monthly';
}

// Última recomendação ainda válida. Abrir a home NÃO gera recomendação nova se já existe uma recente.
export async function latestRecommendation(kinds: RecView['kind'][], maxAgeDays: number): Promise<RecView | null> {
  const since = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('recommendations')
    .select(`id,kind,period_key,created_at,recommendation_items(id,movie_id,rank,score,tier,factors,feedback,movies(${MOVIE_COLUMNS}))`)
    .in('kind', kinds)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = (data as unknown as StoredRecRow[] | null)?.[0];
  if (!row || row.recommendation_items.length === 0) return null;
  const frequency = frequencyOf(row.period_key);
  // A agendada vale até o próximo período: 1 dia (diária), 7 (semanal), 31 (mensal).
  const validDays = frequency === 'daily' ? 1 : frequency === 'weekly' ? 7 : 31;
  if (row.kind === 'scheduled' && Date.now() - Date.parse(row.created_at) > validDays * 86_400_000) return null;
  const items = [...row.recommendation_items].sort((a, b) => a.rank - b.rank);
  const movies = new Map(items.map((i) => [i.movie_id, rowToMovie(i.movies)]));
  // Títulos dos filmes citados nas explicações ("mesmo diretor de X").
  const refIds = items.flatMap((i) => i.factors.flatMap((f) => (f.type === 'similar_to' ? [f.movieId] : [])));
  for (const m of await moviesByIds(refIds.filter((id) => !movies.has(id)))) movies.set(m.id, m);
  return {
    recommendationId: row.id,
    kind: row.kind,
    createdAt: row.created_at,
    frequency,
    items: items.map((i) => ({
      movieId: i.movie_id,
      rank: i.rank,
      score: Number(i.score),
      tier: i.tier,
      factors: i.factors,
      itemId: i.id,
      feedback: i.feedback,
    })),
    movies,
    relaxations: [],
  };
}

export async function moviesByIds(ids: string[]): Promise<Movie[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('movies').select(MOVIE_COLUMNS).in('id', ids);
  if (error) throw error;
  return (data as unknown as MovieRow[]).map(rowToMovie);
}

export async function searchMovies(query: string, limit = 20): Promise<Movie[]> {
  const q = query.trim().toLowerCase().replace(/[%_]/g, '');
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from('movies')
    .select(MOVIE_COLUMNS)
    .ilike('search_text', `%${q}%`)
    .order('popularity', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as MovieRow[]).map(rowToMovie);
}

export async function popularMovies(genres: string[], limit = 24): Promise<Movie[]> {
  let q = supabase.from('movies').select(MOVIE_COLUMNS).order('popularity', { ascending: false }).limit(limit);
  if (genres.length > 0) q = q.overlaps('genres', genres);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as MovieRow[]).map(rowToMovie);
}

// ---------------------------------------------------------------- Perfil

export interface Profile {
  locale: 'pt' | 'en';
  constraints: Constraints;
  preferences: Preferences;
  onboardedAt: string | null;
}

export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('locale,constraints,preferences,onboarded_at').eq('user_id', userId).single();
  if (error) throw error;
  return {
    locale: data.locale,
    constraints: ConstraintsSchema.parse(data.constraints ?? {}),
    preferences: PreferencesSchema.parse(data.preferences ?? {}),
    onboardedAt: data.onboarded_at,
  };
}

export async function saveProfile(userId: string, patch: Partial<Profile>): Promise<void> {
  const row: Record<string, unknown> = {};
  // Valida antes de gravar: o banco nunca recebe perfil fora do contrato.
  if (patch.constraints) row.constraints = ConstraintsSchema.parse(patch.constraints);
  if (patch.preferences) row.preferences = PreferencesSchema.parse(patch.preferences);
  if (patch.locale) row.locale = patch.locale;
  if (patch.onboardedAt !== undefined) row.onboarded_at = patch.onboardedAt;
  const { error } = await supabase.from('profiles').update(row).eq('user_id', userId);
  if (error) throw error;
}

// ---------------------------------------------------------------- Interações

export type UserMovieEntry = UserMovie & { movie: Movie; updatedAt: string };

export async function listUserMovies(userId: string): Promise<UserMovieEntry[]> {
  const { data, error } = await supabase
    .from('user_movies')
    .select(`movie_id,watched,watchlist,sentiment,not_interested,tags,updated_at,movies(${MOVIE_COLUMNS})`)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data as unknown as (UserMovieRow & { updated_at: string; movies: MovieRow })[]).map((r) => ({
    ...rowToUserMovie(r),
    movie: rowToMovie(r.movies),
    updatedAt: r.updated_at,
  }));
}

// Estado atual de filmes específicos (para revalidar uma recomendação gravada antes).
export async function statesFor(userId: string, movieIds: string[]): Promise<Map<string, UserMovie>> {
  if (movieIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('user_movies')
    .select('movie_id,watched,watchlist,sentiment,not_interested,tags')
    .eq('user_id', userId)
    .in('movie_id', movieIds);
  if (error) throw error;
  return new Map((data as UserMovieRow[]).map((r) => [r.movie_id, rowToUserMovie(r)]));
}

export async function updateUserMovie(userId: string, movieId: string, patch: Partial<Omit<UserMovie, 'movieId'>>): Promise<void> {
  const row: Record<string, unknown> = { user_id: userId, movie_id: movieId };
  if (patch.watched !== undefined) row.watched = patch.watched;
  if (patch.watchlist !== undefined) row.watchlist = patch.watchlist;
  if (patch.sentiment !== undefined) row.sentiment = patch.sentiment;
  if (patch.notInterested !== undefined) row.not_interested = patch.notInterested;
  if (patch.tags !== undefined) row.tags = patch.tags;
  const { error } = await supabase.from('user_movies').upsert(row, { onConflict: 'user_id,movie_id' });
  if (error) throw error;
}

export async function removeUserMovie(userId: string, movieId: string): Promise<void> {
  const { error } = await supabase.from('user_movies').delete().eq('user_id', userId).eq('movie_id', movieId);
  if (error) throw error;
}

// Feedback em uma recomendação: grava no log (para medir o algoritmo) e no estado do filme (para aprender).
export async function giveFeedback(userId: string, item: RecItem, feedback: Feedback): Promise<void> {
  if (item.itemId) {
    let q = supabase.from('recommendation_items').update({ feedback, feedback_at: new Date().toISOString() }).eq('id', item.itemId);
    // Sinais fracos ("salvei", "pulei") nunca sobrescrevem um feedback explícito já dado.
    if (feedback === 'want' || feedback === 'skipped') q = q.is('feedback', null);
    const { error } = await q;
    if (error) throw error;
  }
  // Cada feedback grava o estado completo que ele implica, desfazendo o anterior
  // (ex.: "Gostei" por engano corrigido para "Sem interesse" não deixa sentiment = 1 para trás).
  const patches: Record<Feedback, Partial<Omit<UserMovie, 'movieId'>> | null> = {
    liked: { sentiment: 1, watched: true, notInterested: false },
    disliked: { sentiment: -1, watched: true, notInterested: false },
    want: { watchlist: true, notInterested: false },
    not_interested: { notInterested: true, sentiment: 0, watchlist: false },
    watched: { watched: true, sentiment: 0, notInterested: false },
    skipped: null,
  };
  const patch = patches[feedback];
  if (patch) await updateUserMovie(userId, item.movieId, patch);
}

// ---------------------------------------------------------------- Agendamento

export interface Schedule {
  frequency: 'daily' | 'weekly' | 'monthly';
  weekday: number | null;
  dayOfMonth: number | null;
  hour: number;
  timezone: string;
  active: boolean;
  nextRunAt: string | null;
}

export async function getSchedule(userId: string): Promise<Schedule | null> {
  const { data, error } = await supabase
    .from('recommendation_schedules')
    .select('frequency,weekday,day_of_month,hour,timezone,active,next_run_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    frequency: data.frequency,
    weekday: data.weekday,
    dayOfMonth: data.day_of_month,
    hour: data.hour,
    timezone: data.timezone,
    active: data.active,
    nextRunAt: data.next_run_at,
  };
}

export async function saveSchedule(userId: string, s: Omit<Schedule, 'nextRunAt'>): Promise<void> {
  const row = {
    frequency: s.frequency,
    weekday: s.frequency === 'weekly' ? s.weekday : null,
    day_of_month: s.frequency === 'monthly' ? s.dayOfMonth : null,
    hour: s.hour,
    timezone: s.timezone,
    active: s.active,
  };
  const existing = await getSchedule(userId);
  const { error } = existing
    ? await supabase.from('recommendation_schedules').update(row).eq('user_id', userId)
    : await supabase.from('recommendation_schedules').insert({ user_id: userId, ...row });
  if (error) throw error;
}

// ---------------------------------------------------------------- Conta (LGPD)

// Exportação completa (LGPD art. 18) agregada no servidor: sem o corte de 1000 linhas e falhando alto.
export async function exportMyData(): Promise<string> {
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) throw error;
  return JSON.stringify(data, null, 2);
}

export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await supabase.auth.signOut();
}
