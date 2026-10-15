import { describe, expect, it } from 'vitest';
import { averageRating } from './engine/filters.ts';
import { MIN_TMDB_VOTES, movieToRow, parseProfile, periodKey, rowToMovie, tmdbUserScore } from './db.ts';
import type { Movie } from './schemas.ts';

describe('periodKey', () => {
  it('usa o fuso do usuário, não UTC', () => {
    // 02:30 UTC de 17/10 ainda é 16/10 em São Paulo (UTC-3).
    expect(periodKey('daily', new Date('2026-10-17T02:30:00Z'), 'America/Sao_Paulo')).toBe('scheduled:2026-10-16');
    expect(periodKey('daily', new Date('2026-10-17T02:30:00Z'), 'UTC')).toBe('scheduled:2026-10-17');
  });

  it('calcula semana ISO, inclusive na virada do ano', () => {
    expect(periodKey('weekly', new Date('2026-12-31T15:00:00Z'), 'UTC')).toBe('scheduled:2026-W53');
    expect(periodKey('weekly', new Date('2027-01-01T15:00:00Z'), 'UTC')).toBe('scheduled:2026-W53');
    expect(periodKey('weekly', new Date('2027-01-04T15:00:00Z'), 'UTC')).toBe('scheduled:2027-W01');
  });

  it('mesma semana gera a mesma chave (idempotência)', () => {
    const fri = periodKey('weekly', new Date('2026-10-16T22:00:00Z'), 'America/Sao_Paulo');
    const sat = periodKey('weekly', new Date('2026-10-17T22:00:00Z'), 'America/Sao_Paulo');
    expect(fri).toBe(sat);
    expect(periodKey('monthly', new Date('2026-10-01T12:00:00Z'), 'UTC')).toBe('scheduled:2026-10');
  });
});

describe('mapeamento de linhas', () => {
  it('ida e volta preserva o filme e calcula a média de nota', () => {
    const m: Movie = {
      id: 'Q123',
      titlePt: 'Ilha do Medo',
      titleEn: 'Shutter Island',
      year: 2010,
      runtimeMin: 138,
      genres: ['mystery', 'thriller'],
      languages: ['en'],
      directors: [{ id: 'Q41148', name: 'Martin Scorsese' }],
      ratings: [
        { source: 'metacritic', value: 6.3, raw: '63/100' },
        { source: 'rotten_tomatoes', value: 6.7, raw: '6.7/10' },
      ],
      popularity: 60,
      descriptionPt: null,
      descriptionEn: '2010 film by Martin Scorsese',
    };
    const row = movieToRow(m);
    expect(row).not.toHaveProperty('rating_avg'); // coluna gerada pelo banco
    expect(row).not.toHaveProperty('tmdb'); // escrita só pelo enriquecimento do TMDB
    expect(rowToMovie(row)).toEqual({ ...m, tmdb: null });
  });

  it('nota do TMDB fica à parte: nunca entra em ratings nem na média da crítica (DEC-043)', () => {
    const base = {
      id: 'Q1', title_pt: 'A', title_en: 'A', year: 2000, runtime_min: 100, genres: [], languages: [], directors: [],
      ratings: [{ source: 'metacritic', value: 8, raw: '80/100' }], popularity: 10, description_pt: null, description_en: null,
    };
    const info = { posterPath: '/p.jpg', backdropPath: null, overviewPt: 'Sinopse', overviewEn: null, taglinePt: null, providers: [], watchLink: null };
    const muitos = rowToMovie({ ...base, tmdb: { ...info, voteAverage: 7.25, voteCount: 5000 } });
    expect(muitos.ratings).toEqual(base.ratings);
    expect(averageRating(muitos)).toBe(8);
    expect(tmdbUserScore(muitos.tmdb)).toEqual({ value: 7.25, votes: 5000 });
    expect(tmdbUserScore({ ...info, voteAverage: 9.9, voteCount: MIN_TMDB_VOTES - 1 })).toBeNull();
    expect(tmdbUserScore(null)).toBeNull();
  });

  it('rejeita jsonb corrompido em vez de seguir silenciosamente', () => {
    expect(() => parseProfile({ constraints: { minRating: 42 }, preferences: {} })).toThrow();
    expect(parseProfile({ constraints: null, preferences: null }).constraints.allowRewatch).toBe(false);
  });
});
