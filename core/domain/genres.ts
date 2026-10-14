// Gêneros canônicos do Cineou. O importador do Wikidata mapeia os gêneros
// originais (centenas de subgêneros) para esta lista curta.

export const GENRES = [
  'action',
  'adventure',
  'animation',
  'biography',
  'comedy',
  'crime',
  'documentary',
  'drama',
  'family',
  'fantasy',
  'history',
  'horror',
  'musical',
  'mystery',
  'romance',
  'science_fiction',
  'thriller',
  'war',
  'western',
] as const;

export type Genre = (typeof GENRES)[number];

export const GENRE_LABELS: Record<Genre, { pt: string; en: string }> = {
  action: { pt: 'Ação', en: 'Action' },
  adventure: { pt: 'Aventura', en: 'Adventure' },
  animation: { pt: 'Animação', en: 'Animation' },
  biography: { pt: 'Biografia', en: 'Biography' },
  comedy: { pt: 'Comédia', en: 'Comedy' },
  crime: { pt: 'Crime', en: 'Crime' },
  documentary: { pt: 'Documentário', en: 'Documentary' },
  drama: { pt: 'Drama', en: 'Drama' },
  family: { pt: 'Família', en: 'Family' },
  fantasy: { pt: 'Fantasia', en: 'Fantasy' },
  history: { pt: 'Histórico', en: 'History' },
  horror: { pt: 'Terror', en: 'Horror' },
  musical: { pt: 'Musical', en: 'Musical' },
  mystery: { pt: 'Mistério', en: 'Mystery' },
  romance: { pt: 'Romance', en: 'Romance' },
  science_fiction: { pt: 'Ficção científica', en: 'Science fiction' },
  thriller: { pt: 'Suspense', en: 'Thriller' },
  war: { pt: 'Guerra', en: 'War' },
  western: { pt: 'Faroeste', en: 'Western' },
};

// Matiz (0–360) usada na luz ambiente do fundo. Valores dessaturados no CSS;
// aqui só a direção da cor.
export const GENRE_HUES: Record<Genre, number> = {
  action: 18,
  adventure: 32,
  animation: 44,
  biography: 28,
  comedy: 48,
  crime: 4,
  documentary: 200,
  drama: 22,
  family: 40,
  fantasy: 275,
  history: 34,
  horror: 356,
  musical: 300,
  mystery: 265,
  romance: 345,
  science_fiction: 255,
  thriller: 10,
  war: 26,
  western: 30,
};
