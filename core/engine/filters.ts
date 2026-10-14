// Filtros obrigatórios. Rodam ANTES do ranking: um filme reprovado aqui nunca é pontuado.
import type { Constraints, HardFilterReason, Movie, Relaxable, UserMovie } from '../schemas.ts';

export function averageRating(movie: Movie): number | null {
  if (movie.ratings.length === 0) return null;
  const sum = movie.ratings.reduce((acc, r) => acc + r.value, 0);
  return Math.round((sum / movie.ratings.length) * 10) / 10;
}

// O contexto substitui valores do perfil só neste pedido. Gêneros excluídos são somados:
// um pedido pontual nunca reabre um gênero que o usuário excluiu.
export function mergeConstraints(profile: Constraints, context: Partial<Constraints>): Constraints {
  const merged: Constraints = { ...profile };
  for (const [key, value] of Object.entries(context) as [keyof Constraints, unknown][]) {
    if (value === undefined) continue;
    (merged as Record<string, unknown>)[key] = value;
  }
  merged.excludedGenres = [...new Set([...profile.excludedGenres, ...(context.excludedGenres ?? [])])];
  return merged;
}

export function hardFilterReason(
  movie: Movie,
  c: Constraints,
  state: UserMovie | undefined,
  sessionExcluded: ReadonlySet<string>,
): HardFilterReason | null {
  if (sessionExcluded.has(movie.id)) return 'excluded_by_session';
  if (state?.notInterested) return 'not_interested';
  if (state?.sentiment === -1) return 'disliked';
  if (state?.watched && !c.allowRewatch) return 'already_watched';
  if (movie.genres.some((g) => c.excludedGenres.includes(g))) return 'excluded_genre';
  if (c.minRuntimeMin !== null && movie.runtimeMin < c.minRuntimeMin) return 'runtime_too_short';
  if (c.maxRuntimeMin !== null && movie.runtimeMin > c.maxRuntimeMin) return 'runtime_too_long';
  if (c.minRating !== null) {
    const avg = averageRating(movie);
    if (avg === null) return 'rating_unknown';
    if (avg < c.minRating) return 'rating_too_low';
  }
  if (c.minYear !== null || c.maxYear !== null) {
    if (movie.year === null) return 'year_out_of_range';
    if (c.minYear !== null && movie.year < c.minYear) return 'year_out_of_range';
    if (c.maxYear !== null && movie.year > c.maxYear) return 'year_out_of_range';
  }
  if (c.languages.length > 0 && !movie.languages.some((l) => c.languages.includes(l))) return 'language_mismatch';
  return null;
}

export interface FilterOutcome {
  eligible: Movie[];
  rejected: Partial<Record<HardFilterReason, number>>;
}

export function applyHardFilters(
  movies: readonly Movie[],
  c: Constraints,
  states: ReadonlyMap<string, UserMovie>,
  sessionExcluded: ReadonlySet<string>,
): FilterOutcome {
  const eligible: Movie[] = [];
  const rejected: Partial<Record<HardFilterReason, number>> = {};
  for (const movie of movies) {
    const reason = hardFilterReason(movie, c, states.get(movie.id), sessionExcluded);
    if (reason === null) eligible.push(movie);
    else rejected[reason] = (rejected[reason] ?? 0) + 1;
  }
  return { eligible, rejected };
}

function without(c: Constraints, key: Relaxable): Constraints | null {
  switch (key) {
    case 'minRating':
      return c.minRating === null ? null : { ...c, minRating: null };
    case 'maxRuntimeMin':
      return c.maxRuntimeMin === null ? null : { ...c, maxRuntimeMin: null };
    case 'minRuntimeMin':
      return c.minRuntimeMin === null ? null : { ...c, minRuntimeMin: null };
    case 'languages':
      return c.languages.length === 0 ? null : { ...c, languages: [] };
    case 'yearRange':
      return c.minYear === null && c.maxYear === null ? null : { ...c, minYear: null, maxYear: null };
  }
}

// Cada restrição ativa removida isoladamente. Usado para sugerir ao usuário o que ele pode autorizar relaxar.
// Gêneros excluídos não entram: são regra do perfil e só mudam lá (DEC-021).
export function relaxedVariants(c: Constraints): { constraint: Relaxable; relaxed: Constraints }[] {
  const keys: Relaxable[] = ['minRating', 'maxRuntimeMin', 'minRuntimeMin', 'languages', 'yearRange'];
  return keys.flatMap((constraint) => {
    const relaxed = without(c, constraint);
    return relaxed ? [{ constraint, relaxed }] : [];
  });
}

// Quantos filmes passariam se cada restrição fosse removida isoladamente.
// Só informa: relaxar exige autorização explícita do usuário.
export function suggestRelaxations(
  movies: readonly Movie[],
  c: Constraints,
  states: ReadonlyMap<string, UserMovie>,
  sessionExcluded: ReadonlySet<string>,
): { constraint: Relaxable; wouldMatch: number }[] {
  return relaxedVariants(c)
    .map(({ constraint, relaxed }) => ({ constraint, wouldMatch: applyHardFilters(movies, relaxed, states, sessionExcluded).eligible.length }))
    .filter((r) => r.wouldMatch > 0)
    .sort((a, b) => b.wouldMatch - a.wouldMatch);
}
