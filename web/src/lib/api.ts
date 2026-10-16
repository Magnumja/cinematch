// Acesso a dados do frontend. Só usa a chave pública; toda escrita sensível passa por RLS ou Edge Function.
import { createClient } from '@supabase/supabase-js';
import type { Genre } from '../../../core/domain/genres.ts';
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
  // Mesma normalização de public.search_normalize: minúsculas e sem acento.
  const q = query.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[%_]/g, '');
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

// ---------------------------------------------------------------- Prateleiras da Home (DEC-047)
// Navegação pelo catálogo, não recomendação: não grava log nem consome o limite do recommend. Mesmo assim respeita
// as restrições obrigatórias do perfil no banco (e a tela revalida com hardFilterReason, incluindo estados do usuário).
export interface ShelfQuery {
  genres?: Genre[];
  minYear?: number;
  maxYear?: number;
  maxRuntimeMin?: number;
  minRating?: number;
  streaming?: boolean; // só filmes inclusos em assinatura/grátis no Brasil (JustWatch via TMDB)
}

export async function browseMovies(s: ShelfQuery, c: Constraints, limit = 24): Promise<Movie[]> {
  // `as string`: com a string literal, o tipo do supabase-js explode após vários filtros encadeados (TS2589).
  let q = supabase.from('movies').select(MOVIE_COLUMNS as string).not('tmdb->>posterPath', 'is', null);
  const pick = (a: number | null | undefined, b: number | null | undefined, f: (x: number, y: number) => number) =>
    a == null ? (b ?? null) : b == null ? a : f(a, b);
  const minYear = pick(s.minYear, c.minYear, Math.max);
  const maxYear = pick(s.maxYear, c.maxYear, Math.min);
  const maxRuntime = pick(s.maxRuntimeMin, c.maxRuntimeMin, Math.min);
  const minRating = pick(s.minRating, c.minRating, Math.max);
  if (minYear !== null) q = q.gte('year', minYear);
  if (maxYear !== null) q = q.lte('year', maxYear);
  if (maxRuntime !== null) q = q.lte('runtime_min', maxRuntime);
  if (c.minRuntimeMin !== null) q = q.gte('runtime_min', c.minRuntimeMin);
  if (minRating !== null) q = q.gte('rating_avg', minRating);
  if (c.languages.length > 0) q = q.overlaps('languages', c.languages);
  if (c.excludedGenres.length > 0) q = q.not('genres', 'ov', `{${c.excludedGenres.join(',')}}`);
  if (s.genres?.length) q = q.overlaps('genres', s.genres);
  if (s.streaming) {
    q = q.or(['flatrate', 'free', 'ads'].map((type) => `tmdb->providers.cs.[{"type":"${type}"}]`).join(','));
  }
  const { data, error } = await q.order('popularity', { ascending: false }).order('id').limit(limit);
  if (error) throw error;
  return (data as unknown as MovieRow[]).map(rowToMovie);
}

// ---------------------------------------------------------------- Listas personalizadas (DEC-045)
export interface UserList {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  count: number;
  // Até 4 pôsteres (caminhos do TMDB) dos filmes mais recentes, para a capa da lista.
  covers: string[];
}

const LIST_ERRORS: Record<string, string> = { '23505': 'list_duplicate', '54000': 'list_limit', '23514': 'list_invalid' };
function listError(error: { code?: string }): ApiError {
  return new ApiError(LIST_ERRORS[error.code ?? ''] ?? 'generic');
}

type ListRow = {
  id: string; name: string; description: string | null; updated_at: string;
  items: { count: number }[]; covers: { movies: { tmdb: { posterPath?: string | null } | null } | null }[];
};

export async function listMyLists(): Promise<UserList[]> {
  const { data, error } = await supabase
    .from('user_lists')
    .select('id,name,description,updated_at,items:user_list_items(count),covers:user_list_items(added_at,movies(tmdb))')
    .order('updated_at', { ascending: false })
    .order('added_at', { referencedTable: 'covers', ascending: false })
    .limit(4, { referencedTable: 'covers' })
    .limit(50);
  if (error) throw listError(error);
  return (data as unknown as ListRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    updatedAt: r.updated_at,
    count: r.items[0]?.count ?? 0,
    covers: r.covers.map((c) => c.movies?.tmdb?.posterPath).filter((p): p is string => typeof p === 'string'),
  }));
}

export async function createList(userId: string, name: string, description: string | null = null): Promise<string> {
  const { data, error } = await supabase
    .from('user_lists')
    .insert({ user_id: userId, name: name.trim(), description: description?.trim() || null })
    .select('id')
    .single();
  if (error) throw listError(error);
  return (data as { id: string }).id;
}

export async function updateList(listId: string, patch: { name?: string; description?: string | null }): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.description !== undefined) row.description = patch.description?.trim() || null;
  const { error } = await supabase.from('user_lists').update(row).eq('id', listId);
  if (error) throw listError(error);
}

export async function deleteList(listId: string): Promise<void> {
  const { error } = await supabase.from('user_lists').delete().eq('id', listId);
  if (error) throw listError(error);
}

export async function getList(listId: string): Promise<{ list: Omit<UserList, 'count' | 'covers'>; movies: Movie[] } | null> {
  const { data, error } = await supabase
    .from('user_lists')
    .select(`id,name,description,updated_at,user_list_items(added_at,movies(${MOVIE_COLUMNS}))`)
    .eq('id', listId)
    .order('added_at', { referencedTable: 'user_list_items', ascending: false })
    .maybeSingle();
  if (error) throw listError(error);
  if (!data) return null;
  const r = data as unknown as { id: string; name: string; description: string | null; updated_at: string; user_list_items: { movies: MovieRow }[] };
  return {
    list: { id: r.id, name: r.name, description: r.description, updatedAt: r.updated_at },
    movies: r.user_list_items.map((i) => rowToMovie(i.movies)),
  };
}

export async function addToList(listId: string, movieId: string): Promise<void> {
  const { error } = await supabase.from('user_list_items').upsert({ list_id: listId, movie_id: movieId }, { onConflict: 'list_id,movie_id', ignoreDuplicates: true });
  if (error) throw listError(error);
}

export async function removeFromList(listId: string, movieId: string): Promise<void> {
  const { error } = await supabase.from('user_list_items').delete().eq('list_id', listId).eq('movie_id', movieId);
  if (error) throw listError(error);
}

// Em quais listas do usuário o filme está (a RLS já limita às listas dele).
export async function listsContaining(movieId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('user_list_items').select('list_id').eq('movie_id', movieId);
  if (error) throw listError(error);
  return new Set((data as { list_id: string }[]).map((r) => r.list_id));
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
