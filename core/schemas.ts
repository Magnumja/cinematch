// Contratos validados em tempo de execução, compartilhados por web, Edge Functions e scripts.
import { z } from 'zod';
import { GENRES } from './domain/genres.ts';

export const GenreSchema = z.enum(GENRES);

// tmdb = média dos usuários do TMDB (DEC-041), só com amostra mínima de votos (ver scripts/tmdb/map.ts).
export const RATING_SOURCES = ['rotten_tomatoes', 'metacritic', 'tmdb'] as const;
export const RatingSourceSchema = z.enum(RATING_SOURCES);
export type RatingSource = z.infer<typeof RatingSourceSchema>;

export const RatingSchema = z.object({
  source: RatingSourceSchema,
  // Normalizado para 0–10.
  value: z.number().min(0).max(10),
  // Texto original da fonte, ex.: "93%", "81/100" ou "7.8/10 (12.345 votos)".
  raw: z.string(),
});
export type Rating = z.infer<typeof RatingSchema>;

export const WatchProviderSchema = z.object({
  type: z.enum(['flatrate', 'rent', 'buy', 'ads', 'free']),
  name: z.string(),
  logoPath: z.string().nullable(),
});
export type WatchProvider = z.infer<typeof WatchProviderSchema>;

// Dados do TMDB (cache máximo de 6 meses, apagado pelo banco depois disso). Caminhos de imagem são relativos
// a https://image.tmdb.org/t/p/<tamanho>. Provedores de streaming vêm do JustWatch (atribuição obrigatória).
export const TmdbInfoSchema = z.object({
  posterPath: z.string().nullable(),
  backdropPath: z.string().nullable(),
  overviewPt: z.string().nullable(),
  overviewEn: z.string().nullable(),
  taglinePt: z.string().nullable(),
  // Média dos usuários do TMDB (0–10) e tamanho da amostra; vira nota só com voteCount >= MIN_TMDB_VOTES.
  voteAverage: z.number().min(0).max(10).nullable(),
  voteCount: z.number().int().nonnegative(),
  providers: z.array(WatchProviderSchema),
  watchLink: z.string().nullable(),
});
export type TmdbInfo = z.infer<typeof TmdbInfoSchema>;

export const MovieSchema = z.object({
  id: z.string().regex(/^Q\d+$/),
  titlePt: z.string().nullable(),
  titleEn: z.string().nullable(),
  year: z.number().int().nullable(),
  runtimeMin: z.number().int().positive(),
  genres: z.array(GenreSchema),
  languages: z.array(z.string()),
  directors: z.array(z.object({ id: z.string(), name: z.string() })),
  ratings: z.array(RatingSchema),
  popularity: z.number().int().nonnegative(),
  descriptionPt: z.string().nullable(),
  descriptionEn: z.string().nullable(),
  // Ausente/nulo quando o filme ainda não foi enriquecido ou o cache venceu.
  tmdb: TmdbInfoSchema.nullable().optional(),
});
export type Movie = z.infer<typeof MovieSchema>;

// Restrições obrigatórias: aplicadas como filtro antes do ranking.
// Os campos ficam sem default aqui: o contexto de um pedido usa a versão parcial e não pode
// ganhar valores padrão que sobrescrevam o perfil (bug corrigido na auditoria de 2026-10-14).
const constraintFields = {
  minRuntimeMin: z.number().int().positive().nullable(),
  maxRuntimeMin: z.number().int().positive().nullable(),
  // Média das fontes disponíveis, escala 0–10. Filmes sem nota são excluídos quando ativo (DEC-009).
  minRating: z.number().min(0).max(10).nullable(),
  minYear: z.number().int().nullable(),
  maxYear: z.number().int().nullable(),
  excludedGenres: z.array(GenreSchema).max(19),
  // Vazio = qualquer idioma original. Códigos ISO 639-1.
  languages: z.array(z.string().length(2)).max(10),
  allowRewatch: z.boolean(),
};

export const ConstraintsSchema = z.object({
  minRuntimeMin: constraintFields.minRuntimeMin.default(null),
  maxRuntimeMin: constraintFields.maxRuntimeMin.default(null),
  minRating: constraintFields.minRating.default(null),
  minYear: constraintFields.minYear.default(null),
  maxYear: constraintFields.maxYear.default(null),
  excludedGenres: constraintFields.excludedGenres.default([]),
  languages: constraintFields.languages.default([]),
  allowRewatch: constraintFields.allowRewatch.default(false),
});

// Só os campos enviados existem no resultado; ausentes continuam ausentes.
export const ContextConstraintsSchema = z.object(constraintFields).partial();
export type Constraints = z.infer<typeof ConstraintsSchema>;

// Preferências flexíveis: só afetam a pontuação.
export const PreferencesSchema = z.object({
  likedGenres: z.array(GenreSchema).default([]),
  dislikedGenres: z.array(GenreSchema).default([]),
  favoriteMovieIds: z.array(z.string()).max(10).default([]),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

export const FEEDBACK_TAGS = [
  'loved_script',
  'loved_twist',
  'loved_acting',
  'slow_pacing',
  'predictable_ending',
  'too_long',
] as const;
export const FeedbackTagSchema = z.enum(FEEDBACK_TAGS);
export type FeedbackTag = z.infer<typeof FeedbackTagSchema>;

// Estado do usuário em relação a um filme (uma linha por usuário + filme).
export const UserMovieSchema = z.object({
  movieId: z.string(),
  watched: z.boolean(),
  watchlist: z.boolean(),
  sentiment: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  notInterested: z.boolean(),
  tags: z.array(FeedbackTagSchema),
});
export type UserMovie = z.infer<typeof UserMovieSchema>;

// Contexto de um pedido. Nunca é persistido no perfil (DEC-021).
export const ContextSchema = z.object({
  // Substituem os valores do perfil apenas neste pedido.
  constraints: ContextConstraintsSchema.default({}),
  preferGenres: z.array(GenreSchema).max(19).default([]),
  avoidGenres: z.array(GenreSchema).max(19).default([]),
  // Filmes já mostrados nesta sessão ("recomende outro").
  excludeMovieIds: z.array(z.string().max(16)).max(500).default([]),
  // explore = "descobrir algo diferente".
  mode: z.enum(['default', 'explore']).default('default'),
});
export type Context = z.infer<typeof ContextSchema>;
export type ContextInput = z.input<typeof ContextSchema>;

export const FactorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('liked_genres'), genres: z.array(GenreSchema), weight: z.number() }),
  z.object({ type: z.literal('disliked_genres'), genres: z.array(GenreSchema), weight: z.number() }),
  z.object({ type: z.literal('learned_genres'), genres: z.array(GenreSchema), weight: z.number() }),
  z.object({
    type: z.literal('similar_to'),
    movieId: z.string(),
    sharedDirector: z.string().nullable(),
    sharedGenres: z.array(GenreSchema),
    // history (ou ausente, em fatores gravados antes) = favorito/curtido; request = citado só neste pedido.
    source: z.enum(['history', 'request']).optional(),
    weight: z.number(),
  }),
  z.object({ type: z.literal('rating'), average: z.number(), sources: z.array(RatingSourceSchema), weight: z.number() }),
  z.object({ type: z.literal('context_genres'), genres: z.array(GenreSchema), weight: z.number() }),
  z.object({ type: z.literal('explore'), genres: z.array(GenreSchema), weight: z.number() }),
  z.object({ type: z.literal('popularity'), weight: z.number() }),
]);
export type Factor = z.infer<typeof FactorSchema>;

export const HARD_FILTER_REASONS = [
  'excluded_by_session',
  'not_interested',
  'disliked',
  'already_watched',
  'excluded_genre',
  'runtime_too_short',
  'runtime_too_long',
  'rating_unknown',
  'rating_too_low',
  'year_out_of_range',
  'language_mismatch',
] as const;
export type HardFilterReason = (typeof HARD_FILTER_REASONS)[number];

export const RELAXABLE = ['minRating', 'maxRuntimeMin', 'minRuntimeMin', 'languages', 'yearRange'] as const;
export type Relaxable = (typeof RELAXABLE)[number];

export type AffinityTier = 'high' | 'good' | 'longshot';

export interface RecommendationItem {
  movieId: string;
  rank: number;
  score: number;
  tier: AffinityTier;
  factors: Factor[];
}

export interface RecommendationResult {
  algorithmVersion: string;
  items: RecommendationItem[];
  appliedConstraints: Constraints;
  candidateCount: number;
  rejected: Partial<Record<HardFilterReason, number>>;
  // Preenchido quando nada passa nos filtros: o que o usuário pode autorizar relaxar.
  relaxations: { constraint: Relaxable; wouldMatch: number }[];
}
