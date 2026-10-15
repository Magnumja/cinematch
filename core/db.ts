// Conversão entre linhas do Postgres (snake_case, jsonb) e o domínio validado.
// Dados vindos do banco também passam por Zod: um jsonb corrompido falha alto, não silenciosamente.
import {
  ConstraintsSchema,
  MovieSchema,
  PreferencesSchema,
  TmdbInfoSchema,
  UserMovieSchema,
  type Constraints,
  type Movie,
  type Preferences,
  type TmdbInfo,
  type UserMovie,
} from './schemas.ts';

export const MOVIE_COLUMNS =
  'id,title_pt,title_en,year,runtime_min,genres,languages,directors,ratings,popularity,description_pt,description_en,tmdb';

// Nota dos usuários do TMDB: exibida à parte, como veio, e só com amostra mínima de votos. Não entra na média
// da crítica nem em filtros/ranking (DEC-043): misturá-la seria criar uma nota derivada do conteúdo do TMDB
// (termos §1.C) e chamar usuários de "crítica".
export const MIN_TMDB_VOTES = 100;

export function tmdbUserScore(tmdb: TmdbInfo | null | undefined): { value: number; votes: number } | null {
  if (!tmdb || tmdb.voteAverage === null || tmdb.voteCount < MIN_TMDB_VOTES) return null;
  return { value: tmdb.voteAverage, votes: tmdb.voteCount };
}

export interface MovieRow {
  id: string;
  title_pt: string | null;
  title_en: string | null;
  year: number | null;
  runtime_min: number;
  genres: string[];
  languages: string[];
  directors: unknown;
  ratings: unknown;
  popularity: number;
  description_pt: string | null;
  description_en: string | null;
  tmdb?: unknown;
}

export function rowToMovie(row: MovieRow): Movie {
  const tmdb = row.tmdb ? TmdbInfoSchema.parse(row.tmdb) : null;
  return MovieSchema.parse({
    id: row.id,
    titlePt: row.title_pt,
    titleEn: row.title_en,
    year: row.year,
    runtimeMin: row.runtime_min,
    genres: row.genres,
    languages: row.languages,
    directors: row.directors,
    ratings: row.ratings ?? [],
    popularity: row.popularity,
    descriptionPt: row.description_pt,
    descriptionEn: row.description_en,
    tmdb,
  });
}

// Linha para o upsert do catálogo do Wikidata. Não inclui tmdb (escrito só por scripts/tmdb) nem rating_avg
// (coluna gerada pelo banco a partir de ratings).
export function movieToRow(m: Movie): MovieRow {
  return {
    id: m.id,
    title_pt: m.titlePt,
    title_en: m.titleEn,
    year: m.year,
    runtime_min: m.runtimeMin,
    genres: m.genres,
    languages: m.languages,
    directors: m.directors,
    ratings: m.ratings,
    popularity: m.popularity,
    description_pt: m.descriptionPt,
    description_en: m.descriptionEn,
  };
}

export interface ProfileRow {
  locale: 'pt' | 'en';
  constraints: unknown;
  preferences: unknown;
  onboarded_at: string | null;
}

export function parseProfile(row: Pick<ProfileRow, 'constraints' | 'preferences'>): { constraints: Constraints; preferences: Preferences } {
  return {
    constraints: ConstraintsSchema.parse(row.constraints ?? {}),
    preferences: PreferencesSchema.parse(row.preferences ?? {}),
  };
}

export interface UserMovieRow {
  movie_id: string;
  watched: boolean;
  watchlist: boolean;
  sentiment: number;
  not_interested: boolean;
  tags: string[];
}

export function rowToUserMovie(row: UserMovieRow): UserMovie {
  return UserMovieSchema.parse({
    movieId: row.movie_id,
    watched: row.watched,
    watchlist: row.watchlist,
    sentiment: row.sentiment,
    notInterested: row.not_interested,
    tags: row.tags,
  });
}

// Em PT, o título de lançamento no Brasil (tradução pt-BR do TMDB) vem antes do rótulo pt do Wikidata, que às vezes
// é o título original ("The Godfather") ou o de Portugal.
export function displayTitle(m: Pick<Movie, 'titlePt' | 'titleEn'> & { tmdb?: Movie['tmdb'] }, locale: 'pt' | 'en'): string {
  return (locale === 'pt' ? (m.tmdb?.titlePt ?? m.titlePt ?? m.titleEn) : (m.titleEn ?? m.titlePt)) ?? '';
}

// Chave de período no fuso do usuário: impede duas recomendações agendadas no mesmo dia/semana/mês.
export function periodKey(frequency: 'daily' | 'weekly' | 'monthly', dueAt: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(dueAt);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const y = get('year');
  const m = get('month');
  const d = get('day');
  if (frequency === 'monthly') return `scheduled:${y}-${String(m).padStart(2, '0')}`;
  if (frequency === 'daily') return `scheduled:${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // Semana ISO a partir da data local.
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const isoYear = date.getUTCFullYear();
  const week = Math.ceil(((date.getTime() - Date.UTC(isoYear, 0, 1)) / 86400000 + 1) / 7);
  return `scheduled:${isoYear}-W${String(week).padStart(2, '0')}`;
}
