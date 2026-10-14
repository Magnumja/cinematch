import { describe, expect, it } from 'vitest';
import { GENRES, type Genre } from '../domain/genres.ts';
import { explain } from '../explain.ts';
import { ConstraintsSchema, PreferencesSchema, type Movie, type UserMovie } from '../schemas.ts';
import { averageRating } from './filters.ts';
import { recommend } from './recommend.ts';
import { deriveSignals } from './score.ts';

function movie(id: number, over: Partial<Movie> = {}): Movie {
  return {
    id: `Q${id}`,
    titlePt: `Filme ${id}`,
    titleEn: `Movie ${id}`,
    year: 2000 + (id % 20),
    runtimeMin: 100,
    genres: ['drama'],
    languages: ['en'],
    directors: [{ id: `QD${id}`, name: `Director ${id}` }],
    ratings: [],
    popularity: 10,
    descriptionPt: null,
    descriptionEn: null,
    ...over,
  };
}

const rated = (value: number) => [{ source: 'metacritic' as const, value, raw: `${value * 10}/100` }];

function state(movieId: string, over: Partial<UserMovie> = {}): UserMovie {
  return { movieId, watched: false, watchlist: false, sentiment: 0, notInterested: false, tags: [], ...over };
}

function profile(constraints: Record<string, unknown> = {}, preferences: Record<string, unknown> = {}) {
  return { constraints: ConstraintsSchema.parse(constraints), preferences: PreferencesSchema.parse(preferences) };
}

describe('filtros obrigatórios', () => {
  it('nota mínima 8 nunca recomenda filme com nota inferior nem sem nota', () => {
    const candidates = [
      movie(1, { ratings: rated(7.9), popularity: 1000 }),
      movie(2, { ratings: [], popularity: 1000 }),
      movie(3, { ratings: rated(8) }),
      movie(4, { ratings: rated(9.1) }),
    ];
    const result = recommend({ candidates, profile: profile({ minRating: 8 }), states: [], referenceMovies: [] });
    expect(result.items.map((i) => i.movieId).sort()).toEqual(['Q3', 'Q4']);
    expect(result.rejected).toEqual({ rating_too_low: 1, rating_unknown: 1 });
  });

  it('não recomenda filme já assistido, salvo permissão explícita de rever', () => {
    const candidates = [movie(1), movie(2)];
    const states = [state('Q1', { watched: true })];
    expect(recommend({ candidates, profile: profile(), states, referenceMovies: [] }).items.map((i) => i.movieId)).toEqual(['Q2']);
    const rewatch = recommend({ candidates, profile: profile({ allowRewatch: true }), states, referenceMovies: [] });
    expect(rewatch.items.map((i) => i.movieId).sort()).toEqual(['Q1', 'Q2']);
  });

  it('nunca recomenda filme marcado como "não gostei" ou "não tenho interesse", mesmo com rever ativo', () => {
    const candidates = [movie(1), movie(2), movie(3)];
    const states = [state('Q1', { sentiment: -1, watched: true }), state('Q2', { notInterested: true })];
    const result = recommend({ candidates, profile: profile({ allowRewatch: true }), states, referenceMovies: [] });
    expect(result.items.map((i) => i.movieId)).toEqual(['Q3']);
  });

  it('respeita duração máxima pedida no contexto sem alterar o perfil', () => {
    const candidates = [movie(1, { runtimeMin: 95 }), movie(2, { runtimeMin: 150 })];
    const p = profile({ maxRuntimeMin: 180 });
    const result = recommend({ candidates, profile: p, states: [], referenceMovies: [], context: { constraints: { maxRuntimeMin: 100 } } });
    expect(result.items.map((i) => i.movieId)).toEqual(['Q1']);
    expect(result.appliedConstraints.maxRuntimeMin).toBe(100);
    expect(p.constraints.maxRuntimeMin).toBe(180);
  });

  it('restrição do contexto não apaga as demais restrições do perfil', () => {
    const candidates = [
      movie(1, { runtimeMin: 90, ratings: rated(6), languages: ['pt'] }),
      movie(2, { runtimeMin: 90, ratings: rated(9), languages: ['en'] }),
      movie(3, { runtimeMin: 90, ratings: rated(9), languages: ['pt'] }),
    ];
    const states = [state('Q3', { watched: true })];
    const p = profile({ minRating: 8, languages: ['pt'], allowRewatch: true });
    const result = recommend({ candidates, profile: p, states, referenceMovies: [], context: { constraints: { maxRuntimeMin: 100 } } });
    expect(result.items.map((i) => i.movieId)).toEqual(['Q3']);
    expect(result.appliedConstraints).toMatchObject({ minRating: 8, languages: ['pt'], allowRewatch: true, maxRuntimeMin: 100 });
  });

  it('pedido pontual não reabre gênero excluído no perfil', () => {
    const candidates = [movie(1, { genres: ['horror'] }), movie(2, { genres: ['comedy'] })];
    const result = recommend({
      candidates,
      profile: profile({ excludedGenres: ['horror'] }),
      states: [],
      referenceMovies: [],
      context: { constraints: { excludedGenres: [] }, preferGenres: ['horror'] },
    });
    expect(result.items.map((i) => i.movieId)).toEqual(['Q2']);
  });

  it('exige idioma original quando configurado', () => {
    const candidates = [movie(1, { languages: ['pt'] }), movie(2, { languages: ['en'] }), movie(3, { languages: [] })];
    const result = recommend({ candidates, profile: profile({ languages: ['pt'] }), states: [], referenceMovies: [] });
    expect(result.items.map((i) => i.movieId)).toEqual(['Q1']);
  });

  it('exclui filmes da sessão ("recomende outro")', () => {
    const candidates = [movie(1), movie(2)];
    const result = recommend({ candidates, profile: profile(), states: [], referenceMovies: [], context: { excludeMovieIds: ['Q1'] } });
    expect(result.items.map((i) => i.movieId)).toEqual(['Q2']);
  });
});

describe('sem resultados compatíveis', () => {
  it('não inventa recomendação e informa o que poderia ser relaxado', () => {
    const candidates = [movie(1, { ratings: rated(6), runtimeMin: 90 }), movie(2, { ratings: rated(9), runtimeMin: 160 })];
    const result = recommend({ candidates, profile: profile({ minRating: 8, maxRuntimeMin: 120 }), states: [], referenceMovies: [] });
    expect(result.items).toEqual([]);
    expect(result.relaxations).toEqual([
      { constraint: 'minRating', wouldMatch: 1 },
      { constraint: 'maxRuntimeMin', wouldMatch: 1 },
    ]);
  });
});

describe('ranking', () => {
  it('prioriza gêneros favoritos e penaliza gêneros que o usuário não gosta', () => {
    const candidates = [movie(1, { genres: ['comedy'] }), movie(2, { genres: ['thriller'] }), movie(3, { genres: ['horror'] })];
    const result = recommend({
      candidates,
      profile: profile({}, { likedGenres: ['thriller'], dislikedGenres: ['horror'] }),
      states: [],
      referenceMovies: [],
    });
    expect(result.items.map((i) => i.movieId)).toEqual(['Q2', 'Q1', 'Q3']);
    expect(result.items[0]!.factors[0]).toMatchObject({ type: 'liked_genres', genres: ['thriller'] });
  });

  it('identifica filme do mesmo diretor de um favorito', () => {
    const fav = movie(100, { genres: ['thriller', 'mystery'], directors: [{ id: 'QX', name: 'Martin Scorsese' }] });
    const candidates = [movie(1, { genres: ['thriller'], directors: [{ id: 'QX', name: 'Martin Scorsese' }] }), movie(2, { genres: ['thriller'] })];
    const result = recommend({ candidates, profile: profile({}, { favoriteMovieIds: ['Q100'] }), states: [], referenceMovies: [fav] });
    expect(result.items[0]!.movieId).toBe('Q1');
    const reasons = explain(result.items[0]!.factors, 'pt', (id) => (id === 'Q100' ? 'Ilha do Medo' : undefined));
    expect(reasons[0]).toBe('Mesmo diretor de Ilha do Medo: Martin Scorsese.');
  });

  it('é determinístico para a mesma entrada', () => {
    const candidates = Array.from({ length: 40 }, (_, i) => movie(i + 1, { genres: [GENRES[i % GENRES.length]!], popularity: i }));
    const run = () => recommend({ candidates, profile: profile({}, { likedGenres: ['drama'] }), states: [], referenceMovies: [] });
    expect(run()).toEqual(run());
  });

  it('diversifica: não devolve só filmes do mesmo diretor e gênero', () => {
    const same = Array.from({ length: 6 }, (_, i) =>
      movie(i + 1, { genres: ['thriller'], directors: [{ id: 'QS', name: 'Same' }], popularity: 100 }),
    );
    const other = [movie(50, { genres: ['thriller', 'crime'], popularity: 90 })];
    const result = recommend({ candidates: [...same, ...other], profile: profile({}, { likedGenres: ['thriller'] }), states: [], referenceMovies: [], limit: 3 });
    expect(result.items.map((i) => i.movieId)).toContain('Q50');
  });

  it('modo explorar favorece gêneros fora do padrão', () => {
    const candidates = [movie(1, { genres: ['thriller'] }), movie(2, { genres: ['western'] })];
    const p = profile({}, { likedGenres: ['thriller'] });
    expect(recommend({ candidates, profile: p, states: [], referenceMovies: [] }).items[0]!.movieId).toBe('Q1');
    expect(recommend({ candidates, profile: p, states: [], referenceMovies: [], context: { mode: 'explore' } }).items[0]!.movieId).toBe('Q2');
  });
});

describe('aprendizado implícito', () => {
  it('só aprende com histórico mínimo de 3 interações', () => {
    const refs = [movie(1, { genres: ['war'] }), movie(2, { genres: ['war'] }), movie(3, { genres: ['war'] })];
    const prefs = PreferencesSchema.parse({});
    expect(deriveSignals(prefs, [state('Q1', { sentiment: 1 }), state('Q2', { sentiment: 1 })], refs).learned.size).toBe(0);
    const learned = deriveSignals(prefs, refs.map((r) => state(r.id, { sentiment: 1 })), refs).learned;
    expect(learned.get('war')).toBe(1);
  });
});

describe('explicações', () => {
  it('nunca cita nota quando o filme não tem nota', () => {
    const result = recommend({ candidates: [movie(1)], profile: profile(), states: [], referenceMovies: [] });
    expect(result.items[0]!.factors.some((f) => f.type === 'rating')).toBe(false);
    expect(explain(result.items[0]!.factors, 'en', () => undefined).join(' ')).not.toMatch(/critic/i);
  });

  it('não cita similaridade com filme cujo título é desconhecido', () => {
    const reasons = explain(
      [{ type: 'similar_to', movieId: 'Q9', sharedDirector: null, sharedGenres: ['drama'], weight: 0.1 }],
      'pt',
      () => undefined,
    );
    expect(reasons).toEqual([]);
  });
});

describe('propriedade: restrições obrigatórias sempre respeitadas', () => {
  // Gerador pseudoaleatório com semente para o teste ser reproduzível.
  function rng(seed: number) {
    return () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  }

  it('em 200 catálogos aleatórios nenhum item viola nota, duração, idioma, gênero ou já assistido', () => {
    const rand = rng(42);
    for (let run = 0; run < 200; run++) {
      const candidates = Array.from({ length: 30 }, (_, i) =>
        movie(i + 1, {
          runtimeMin: 60 + Math.floor(rand() * 120),
          ratings: rand() < 0.6 ? rated(Math.round(rand() * 100) / 10) : [],
          genres: [GENRES[Math.floor(rand() * GENRES.length)]!] as Genre[],
          languages: [rand() < 0.5 ? 'en' : 'pt'],
        }),
      );
      const constraints = {
        minRating: Math.round(rand() * 9),
        maxRuntimeMin: 80 + Math.floor(rand() * 80),
        languages: rand() < 0.5 ? ['pt'] : [],
        excludedGenres: [GENRES[Math.floor(rand() * GENRES.length)]!],
      };
      const states = candidates.filter(() => rand() < 0.2).map((m) => state(m.id, { watched: true }));
      const watched = new Set(states.map((s) => s.movieId));
      const result = recommend({ candidates, profile: profile(constraints), states, referenceMovies: [], limit: 10 });
      for (const item of result.items) {
        const m = candidates.find((c) => c.id === item.movieId)!;
        expect(averageRating(m)).not.toBeNull();
        expect(averageRating(m)!).toBeGreaterThanOrEqual(constraints.minRating);
        expect(m.runtimeMin).toBeLessThanOrEqual(constraints.maxRuntimeMin);
        if (constraints.languages.length) expect(m.languages).toContain('pt');
        expect(m.genres).not.toContain(constraints.excludedGenres[0]);
        expect(watched.has(m.id)).toBe(false);
      }
    }
  });
});

describe('regressões da revisão de código (2026-10-14)', () => {
  it('nota mínima compara a média exata: 7,449 não passa em 7,5', () => {
    const candidates = [
      movie(1, { ratings: [{ source: 'metacritic', value: 7.4, raw: '74/100' }, { source: 'rotten_tomatoes', value: 7.498, raw: '7.498/10' }] }),
      movie(2, { ratings: rated(7.5) }),
    ];
    const result = recommend({ candidates, profile: profile({ minRating: 7.5 }), states: [], referenceMovies: [] });
    expect(result.items.map((i) => i.movieId)).toEqual(['Q2']);
  });

  it('"um dos mais conhecidos" só aparece para filmes realmente populares', () => {
    const obscure = recommend({ candidates: [movie(1, { popularity: 8 }), movie(2, { popularity: 12 })], profile: profile(), states: [], referenceMovies: [] });
    expect(obscure.items.flatMap((i) => i.factors).some((f) => f.type === 'popularity')).toBe(false);
    const famous = recommend({ candidates: [movie(1, { popularity: 120 })], profile: profile(), states: [], referenceMovies: [] });
    expect(famous.items[0]!.factors.some((f) => f.type === 'popularity')).toBe(true);
  });

  it('filme citado no pedido guia a similaridade, não é recomendado e não vira "que você curtiu"', () => {
    const cited = movie(100, { genres: ['thriller'], directors: [{ id: 'QX', name: 'Fincher' }], popularity: 999 });
    const candidates = [cited, movie(1, { genres: ['thriller'], directors: [{ id: 'QX', name: 'Fincher' }] }), movie(2, { genres: ['comedy'] })];
    const result = recommend({ candidates, profile: profile(), states: [], referenceMovies: [], requestReferences: [cited] });
    expect(result.items.map((i) => i.movieId)).not.toContain('Q100');
    expect(result.items[0]!.movieId).toBe('Q1');
    const reasons = explain(result.items[0]!.factors, 'pt', (id) => (id === 'Q100' ? 'Zodiac' : undefined));
    expect(reasons.join(' ')).toContain('que você citou');
    expect(reasons.join(' ')).not.toContain('curtiu');
  });

  it('"Hoje não" do contexto é filtro, não só penalidade', () => {
    const candidates = [movie(1, { genres: ['horror'], popularity: 999, ratings: rated(9.5) }), movie(2, { genres: ['comedy'] })];
    const result = recommend({ candidates, profile: profile({}, { likedGenres: ['horror'] }), states: [], referenceMovies: [], context: { avoidGenres: ['horror'] } });
    expect(result.items.map((i) => i.movieId)).toEqual(['Q2']);
  });
});

describe('exibição de nota', () => {
  it('card e motivo arredondam a mesma média do mesmo jeito (8,45 → 8.5)', async () => {
    const { formatRating } = await import('./filters.ts');
    const m = movie(1, { ratings: [{ source: 'metacritic', value: 8.4, raw: '84/100' }, { source: 'rotten_tomatoes', value: 8.5, raw: '8.5/10' }] });
    const result = recommend({ candidates: [m], profile: profile(), states: [], referenceMovies: [] });
    const reason = explain(result.items[0]!.factors, 'pt', () => undefined).find((r) => r.includes('crítica'))!;
    expect(formatRating(averageRating(m)!)).toBe('8.5');
    expect(reason).toContain('8.5/10');
  });
});
