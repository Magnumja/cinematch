import { describe, expect, it } from 'vitest';
import { estimateCostUsd, ExtractedRequestSchema, toContext, type ExtractedRequest } from './assistant.ts';
import { recommend } from './engine/recommend.ts';
import { ConstraintsSchema, PreferencesSchema, type Movie } from './schemas.ts';

const empty: ExtractedRequest = {
  intent: 'recommend',
  clarificationQuestion: null,
  preferGenres: [],
  avoidGenres: [],
  maxRuntimeMin: null,
  minRuntimeMin: null,
  minRating: null,
  minYear: null,
  maxYear: null,
  languages: [],
  similarToTitle: null,
  mode: 'default',
};

describe('toContext', () => {
  it('descarta valores fora de faixa vindos da LLM', () => {
    const ctx = toContext({ ...empty, maxRuntimeMin: 5, minRating: 42, minYear: 1990, maxYear: 99999, languages: ['PT', 'portuguese'] });
    expect(ctx.constraints).toEqual({ minYear: 1990, languages: ['pt'] });
  });

  it('gênero pedido e evitado ao mesmo tempo fica só como evitado', () => {
    const ctx = toContext({ ...empty, preferGenres: ['comedy', 'horror'], avoidGenres: ['horror'] });
    expect(ctx.preferGenres).toEqual(['comedy']);
    expect(ctx.avoidGenres).toEqual(['horror']);
  });

  it('pedido de filme curto vira restrição obrigatória que o motor respeita', () => {
    const movie = (id: string, runtimeMin: number): Movie => ({
      id, titlePt: id, titleEn: id, year: 2000, runtimeMin, genres: ['comedy'], languages: ['en'],
      directors: [], ratings: [], popularity: 50, descriptionPt: null, descriptionEn: null,
    });
    const ctx = toContext({ ...empty, maxRuntimeMin: 100, preferGenres: ['comedy'] });
    const result = recommend({
      candidates: [movie('Q1', 95), movie('Q2', 140)],
      profile: { constraints: ConstraintsSchema.parse({}), preferences: PreferencesSchema.parse({}) },
      states: [],
      referenceMovies: [],
      context: ctx,
    });
    expect(result.items.map((i) => i.movieId)).toEqual(['Q1']);
  });

  it('rejeita saída da LLM que não segue o schema', () => {
    expect(ExtractedRequestSchema.safeParse({ ...empty, preferGenres: ['k-drama'] }).success).toBe(false);
  });
});

describe('estimateCostUsd', () => {
  it('usa o preço oficial do Haiku 5.5', () => {
    expect(estimateCostUsd(1_000_000, 0)).toBeCloseTo(0.1);
    expect(estimateCostUsd(3000, 400)).toBeCloseTo(0.0005);
  });
});
