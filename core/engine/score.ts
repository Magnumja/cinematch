// Ranking personalizado baseado em regras. Os pesos são HIPÓTESES a calibrar com o feedback do beta;
// qualquer mudança aqui exige subir ALGORITHM_VERSION para manter os logs comparáveis.
import type { Genre } from '../domain/genres.ts';
import type { AffinityTier, Context, Factor, Movie, Preferences, UserMovie } from '../schemas.ts';
import { averageRating } from './filters.ts';

export const ALGORITHM_VERSION = 'rules-v1';

export const WEIGHTS_V1 = {
  liked: 0.3,
  disliked: 0.3,
  learned: 0.15,
  similarity: 0.2,
  rating: 0.15,
  popularity: 0.1,
  context: 0.3,
  explore: 0.25,
} as const;

// Abaixo disso o histórico é ruído demais para virar preferência implícita.
export const MIN_INTERACTIONS_FOR_LEARNING = 3;
const MIN_FACTOR = 0.02;

export interface UserSignals {
  liked: ReadonlySet<Genre>;
  disliked: ReadonlySet<Genre>;
  // Afinidade implícita aprendida do histórico, -1..1. Vazia sem histórico suficiente.
  learned: ReadonlyMap<Genre, number>;
  // Filmes de referência para similaridade: favoritos e filmes que o usuário curtiu.
  references: readonly Movie[];
}

export function deriveSignals(
  preferences: Preferences,
  states: readonly UserMovie[],
  referenceMovies: readonly Movie[],
): UserSignals {
  const byId = new Map(referenceMovies.map((m) => [m.id, m]));
  const raw = new Map<Genre, number>();
  let evidence = 0;
  for (const s of states) {
    const movie = byId.get(s.movieId);
    if (!movie) continue;
    let delta = 0;
    if (s.sentiment === 1) delta = 1;
    else if (s.sentiment === -1) delta = -1;
    else if (s.notInterested) delta = -0.5;
    else if (s.watchlist) delta = 0.3;
    if (delta === 0) continue;
    evidence++;
    for (const g of movie.genres) raw.set(g, (raw.get(g) ?? 0) + delta);
  }

  const learned = new Map<Genre, number>();
  if (evidence >= MIN_INTERACTIONS_FOR_LEARNING) {
    const maxAbs = Math.max(...[...raw.values()].map(Math.abs), 0);
    if (maxAbs > 0) for (const [g, v] of raw) learned.set(g, v / maxAbs);
  }

  const likedIds = new Set([
    ...preferences.favoriteMovieIds,
    ...states.filter((s) => s.sentiment === 1).map((s) => s.movieId),
  ]);
  const references = [...likedIds].map((id) => byId.get(id)).filter((m): m is Movie => m !== undefined);

  return {
    liked: new Set(preferences.likedGenres),
    disliked: new Set(preferences.dislikedGenres),
    learned,
    references,
  };
}

function share(genres: readonly Genre[], set: ReadonlySet<Genre> | readonly Genre[]): { share: number; matched: Genre[] } {
  if (genres.length === 0) return { share: 0, matched: [] };
  const has = (g: Genre) => (Array.isArray(set) ? set.includes(g) : (set as ReadonlySet<Genre>).has(g));
  const matched = genres.filter(has);
  return { share: matched.length / genres.length, matched };
}

export function jaccard(a: readonly Genre[], b: readonly Genre[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const sa = new Set(a);
  const inter = b.filter((g) => sa.has(g)).length;
  return inter / new Set([...a, ...b]).size;
}

export function movieSimilarity(a: Movie, b: Movie): { value: number; sharedDirector: string | null; sharedGenres: Genre[] } {
  const director = a.directors.find((d) => b.directors.some((x) => x.id === d.id)) ?? null;
  const sharedGenres = a.genres.filter((g) => b.genres.includes(g));
  return {
    value: 0.5 * (director ? 1 : 0) + 0.5 * jaccard(a.genres, b.genres),
    sharedDirector: director?.name ?? null,
    sharedGenres,
  };
}

export interface Scored {
  movie: Movie;
  score: number;
  factors: Factor[];
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function scoreMovie(movie: Movie, signals: UserSignals, context: Context, maxPopularity: number): Scored {
  const w = WEIGHTS_V1;
  const explore = context.mode === 'explore';
  const factors: Factor[] = [];
  let score = 0;

  const liked = share(movie.genres, signals.liked);
  const likedC = liked.share * w.liked * (explore ? 0.5 : 1);
  score += likedC;
  if (likedC >= MIN_FACTOR) factors.push({ type: 'liked_genres', genres: liked.matched, weight: round(likedC) });

  const disliked = share(movie.genres, signals.disliked);
  const dislikedC = -disliked.share * w.disliked;
  score += dislikedC;
  if (dislikedC <= -MIN_FACTOR) factors.push({ type: 'disliked_genres', genres: disliked.matched, weight: round(dislikedC) });

  if (signals.learned.size > 0 && movie.genres.length > 0) {
    const values = movie.genres.map((g) => signals.learned.get(g) ?? 0);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const learnedC = mean * w.learned * (explore ? 0.5 : 1);
    score += learnedC;
    const positive = movie.genres.filter((g) => (signals.learned.get(g) ?? 0) > 0.3);
    if (learnedC >= MIN_FACTOR && positive.length > 0) factors.push({ type: 'learned_genres', genres: positive, weight: round(learnedC) });
  }

  let best: ReturnType<typeof movieSimilarity> & { id: string } = { value: 0, sharedDirector: null, sharedGenres: [], id: '' };
  for (const ref of signals.references) {
    if (ref.id === movie.id) continue;
    const sim = movieSimilarity(movie, ref);
    if (sim.value > best.value) best = { ...sim, id: ref.id };
  }
  const simC = best.value * w.similarity;
  score += simC;
  if (simC >= MIN_FACTOR) {
    factors.push({ type: 'similar_to', movieId: best.id, sharedDirector: best.sharedDirector, sharedGenres: best.sharedGenres, weight: round(simC) });
  }

  const avg = averageRating(movie);
  // Sem nota conhecida usamos valor neutro e NÃO citamos nota como motivo.
  const ratingC = (avg === null ? 0.5 : avg / 10) * w.rating;
  score += ratingC;
  if (avg !== null && avg >= 7) {
    factors.push({ type: 'rating', average: avg, sources: movie.ratings.map((r) => r.source), weight: round(ratingC) });
  }

  const popC = maxPopularity > 0 ? (Math.log1p(movie.popularity) / Math.log1p(maxPopularity)) * w.popularity : 0;
  score += popC;
  if (popC >= MIN_FACTOR) factors.push({ type: 'popularity', weight: round(popC) });

  if (context.preferGenres.length > 0 || context.avoidGenres.length > 0) {
    const prefer = share(movie.genres, context.preferGenres);
    const avoid = share(movie.genres, context.avoidGenres);
    const ctxC = (prefer.share - avoid.share) * w.context;
    score += ctxC;
    if (ctxC >= MIN_FACTOR) factors.push({ type: 'context_genres', genres: prefer.matched, weight: round(ctxC) });
  }

  if (explore) {
    const known = new Set<Genre>([...signals.liked, ...[...signals.learned].filter(([, v]) => v > 0).map(([g]) => g)]);
    const novel = movie.genres.filter((g) => !known.has(g) && !signals.disliked.has(g));
    const noveltyC = (movie.genres.length ? novel.length / movie.genres.length : 0) * w.explore;
    score += noveltyC;
    if (noveltyC >= MIN_FACTOR) factors.push({ type: 'explore', genres: novel, weight: round(noveltyC) });
  }

  factors.sort((a, b) => b.weight - a.weight);
  return { movie, score: round(score), factors };
}

// Faixas qualitativas (DEC-022). Limiares são hipóteses, não probabilidades.
export function tierFor(score: number): AffinityTier {
  if (score >= 0.55) return 'high';
  if (score >= 0.35) return 'good';
  return 'longshot';
}
