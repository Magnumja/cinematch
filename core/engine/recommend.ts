// Pipeline: perfil + contexto → filtros obrigatórios → ranking → diversidade → resultado com fatores.
import {
  ContextSchema,
  type Constraints,
  type ContextInput,
  type Movie,
  type Preferences,
  type RecommendationResult,
  type UserMovie,
} from '../schemas.ts';
import { applyHardFilters, mergeConstraints, suggestRelaxations } from './filters.ts';
import { ALGORITHM_VERSION, deriveSignals, movieSimilarity, scoreMovie, tierFor, type Scored } from './score.ts';

export interface RecommendInput {
  candidates: readonly Movie[];
  profile: { constraints: Constraints; preferences: Preferences };
  states: readonly UserMovie[];
  // Favoritos e filmes com interação, para similaridade e aprendizado implícito.
  referenceMovies: readonly Movie[];
  // Filmes citados só neste pedido ("parecido com X"): guiam a similaridade, nunca são recomendados
  // e nunca aparecem como histórico do usuário.
  requestReferences?: readonly Movie[];
  context?: ContextInput;
  limit?: number;
}

const DIVERSITY_LAMBDA = 0.75;
const DIVERSITY_POOL = 60;

// Maximal Marginal Relevance: evita que o topo seja cinco variações do mesmo filme.
export function diversify(ranked: readonly Scored[], limit: number): Scored[] {
  const pool = ranked.slice(0, Math.max(limit, DIVERSITY_POOL));
  const selected: Scored[] = [];
  while (selected.length < limit && pool.length > 0) {
    let bestIdx = 0;
    let bestValue = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[i]!;
      const redundancy = selected.reduce((max, s) => Math.max(max, movieSimilarity(candidate.movie, s.movie).value), 0);
      const value = DIVERSITY_LAMBDA * candidate.score - (1 - DIVERSITY_LAMBDA) * redundancy;
      if (value > bestValue) {
        bestValue = value;
        bestIdx = i;
      }
    }
    selected.push(pool.splice(bestIdx, 1)[0]!);
  }
  return selected;
}

export function recommend(input: RecommendInput): RecommendationResult {
  const context = ContextSchema.parse(input.context ?? {});
  const limit = input.limit ?? 5;
  const merged = mergeConstraints(input.profile.constraints, context.constraints);
  // "Hoje não" (avoidGenres) é filtro deste pedido, não só penalidade (DEC-034).
  const constraints = { ...merged, excludedGenres: [...new Set([...merged.excludedGenres, ...context.avoidGenres])] };
  const states = new Map(input.states.map((s) => [s.movieId, s]));
  const requested = input.requestReferences ?? [];
  const sessionExcluded = new Set([...context.excludeMovieIds, ...requested.map((m) => m.id)]);

  const { eligible, rejected } = applyHardFilters(input.candidates, constraints, states, sessionExcluded);

  const base = {
    algorithmVersion: ALGORITHM_VERSION,
    appliedConstraints: constraints,
    candidateCount: input.candidates.length,
    rejected,
  };

  if (eligible.length === 0) {
    // Nada compatível: não inventamos recomendação. Devolvemos o que poderia ser relaxado.
    return { ...base, items: [], relaxations: suggestRelaxations(input.candidates, constraints, states, sessionExcluded) };
  }

  const signals = deriveSignals(input.profile.preferences, input.states, input.referenceMovies, requested);
  const maxPopularity = eligible.reduce((max, m) => Math.max(max, m.popularity), 0);
  const ranked = eligible
    .map((m) => scoreMovie(m, signals, context, maxPopularity))
    .sort((a, b) => b.score - a.score || a.movie.id.localeCompare(b.movie.id));

  const items = diversify(ranked, limit).map((s, i) => ({
    movieId: s.movie.id,
    rank: i + 1,
    score: s.score,
    tier: tierFor(s.score),
    factors: s.factors,
  }));

  return { ...base, items, relaxations: [] };
}
