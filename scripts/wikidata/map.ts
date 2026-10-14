// Conversões puras dos valores brutos do Wikidata para o modelo do Cineou.
import type { Genre } from '../../core/domain/genres.ts';
import type { Rating } from '../../core/schemas.ts';

// Rótulos em inglês dos gêneros do Wikidata → gêneros canônicos. Ordem não importa;
// um rótulo pode cair em mais de um gênero ("romantic comedy" → romance + comedy).
const GENRE_RULES: [RegExp, Genre][] = [
  [/\baction\b|martial arts|superhero|swashbuckler/, 'action'],
  [/adventure/, 'adventure'],
  [/anim(at|e)|cartoon|anime/, 'animation'],
  [/biograph|biopic/, 'biography'],
  [/comed|satir|parody|slapstick/, 'comedy'],
  [/crime|gangster|heist|noir|mafia|police/, 'crime'],
  [/documentar/, 'documentary'],
  [/drama|melodrama/, 'drama'],
  [/family|children/, 'family'],
  [/fantasy|fairy/, 'fantasy'],
  [/historical|period|epic film|costume/, 'history'],
  [/horror|slasher|zombie|vampire/, 'horror'],
  [/musical|music film/, 'musical'],
  [/myster|detective|whodunit/, 'mystery'],
  [/romance|romantic/, 'romance'],
  [/science fiction|sci-fi|cyberpunk|space opera|dystopian/, 'science_fiction'],
  [/thriller|suspense/, 'thriller'],
  [/\bwar\b|anti-war/, 'war'],
  [/western/, 'western'],
];

export function mapGenreLabels(labels: readonly string[]): Genre[] {
  const out = new Set<Genre>();
  for (const label of labels) {
    const l = label.toLowerCase();
    for (const [re, genre] of GENRE_RULES) if (re.test(l)) out.add(genre);
  }
  return [...out].sort();
}

const UNIT_TO_MINUTES: Record<string, number> = {
  Q7727: 1, // minuto
  Q11574: 1 / 60, // segundo
  Q25235: 60, // hora
};

export function toMinutes(amount: number, unitQid: string): number | null {
  const factor = UNIT_TO_MINUTES[unitQid];
  if (factor === undefined || !Number.isFinite(amount) || amount <= 0) return null;
  const minutes = Math.round(amount * factor);
  // Fora disso é curta-metragem, erro de cadastro ou obra seriada.
  return minutes >= 40 && minutes <= 400 ? minutes : null;
}

// Só aceitamos Rotten Tomatoes (média x/10) e Metacritic (x/100) — DEC-010.
// "%" do Rotten Tomatoes é taxa de aprovação, não nota, e é ignorado.
// IMDb, Letterboxd e demais fontes são descartados.
export function parseScore(raw: string, reviewer: string): Rating | null {
  const r = reviewer.toLowerCase();
  const text = raw.trim();
  if (r === 'rotten tomatoes') {
    const m = /^(\d+(?:\.\d+)?)\/10$/.exec(text);
    if (!m) return null;
    const value = Number(m[1]);
    return value <= 10 ? { source: 'rotten_tomatoes', value, raw: text } : null;
  }
  if (r === 'metacritic') {
    const m = /^(\d+)\/100$/.exec(text);
    if (!m) return null;
    const value = Number(m[1]) / 10;
    return value <= 10 ? { source: 'metacritic', value, raw: text } : null;
  }
  return null;
}

// Se houver mais de um valor da mesma fonte (atualizações ao longo do tempo), usamos a média.
export function mergeRatings(ratings: readonly Rating[]): Rating[] {
  const bySource = new Map<Rating['source'], Rating[]>();
  for (const r of ratings) bySource.set(r.source, [...(bySource.get(r.source) ?? []), r]);
  return [...bySource.entries()]
    .map(([source, rs]) => ({
      source,
      value: Math.round((rs.reduce((a, r) => a + r.value, 0) / rs.length) * 10) / 10,
      raw: rs.map((r) => r.raw).join(' · '),
    }))
    .sort((a, b) => a.source.localeCompare(b.source));
}
