import { describe, expect, it } from 'vitest';
import { mapGenreLabels, mergeRatings, parseScore, toMinutes } from './map.ts';

describe('mapGenreLabels', () => {
  it('mapeia subgêneros e gêneros compostos', () => {
    expect(mapGenreLabels(['psychological thriller'])).toEqual(['thriller']);
    expect(mapGenreLabels(['romantic comedy'])).toEqual(['comedy', 'romance']);
    expect(mapGenreLabels(['science fiction film', 'neo-noir'])).toEqual(['crime', 'science_fiction']);
    expect(mapGenreLabels(['film based on literature'])).toEqual([]);
  });

  it('não confunde "war" dentro de outras palavras', () => {
    expect(mapGenreLabels(['award film'])).toEqual([]);
    expect(mapGenreLabels(['war film'])).toEqual(['war']);
  });
});

describe('toMinutes', () => {
  it('converte unidades e descarta valores implausíveis', () => {
    expect(toMinutes(138, 'Q7727')).toBe(138);
    expect(toMinutes(7200, 'Q11574')).toBe(120);
    expect(toMinutes(2, 'Q25235')).toBe(120);
    expect(toMinutes(12, 'Q7727')).toBeNull();
    expect(toMinutes(100, 'Q999')).toBeNull();
  });
});

describe('parseScore', () => {
  it('aceita média do Rotten Tomatoes e nota do Metacritic, normalizadas para 0–10', () => {
    expect(parseScore('6.7/10', 'Rotten Tomatoes')).toEqual({ source: 'rotten_tomatoes', value: 6.7, raw: '6.7/10' });
    expect(parseScore('63/100', 'Metacritic')).toEqual({ source: 'metacritic', value: 6.3, raw: '63/100' });
  });

  it('ignora taxa de aprovação (%) e fontes não autorizadas (IMDb, Letterboxd)', () => {
    expect(parseScore('68%', 'Rotten Tomatoes')).toBeNull();
    expect(parseScore('8.8/10', 'IMDb')).toBeNull();
    expect(parseScore('4.5/5', 'Letterboxd')).toBeNull();
    expect(parseScore('8/10', '')).toBeNull();
  });
});

describe('mergeRatings', () => {
  it('faz média de valores repetidos da mesma fonte', () => {
    const merged = mergeRatings([
      { source: 'metacritic', value: 7, raw: '70/100' },
      { source: 'metacritic', value: 8, raw: '80/100' },
      { source: 'rotten_tomatoes', value: 6.7, raw: '6.7/10' },
    ]);
    expect(merged).toEqual([
      { source: 'metacritic', value: 7.5, raw: '70/100 · 80/100' },
      { source: 'rotten_tomatoes', value: 6.7, raw: '6.7/10' },
    ]);
  });
});
