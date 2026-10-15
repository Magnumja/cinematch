// Explicações determinísticas a partir dos fatores reais do motor (DEC-023).
// Só cita o que o motor de fato usou: nunca histórico, nota ou similaridade inexistentes.
import { GENRE_LABELS, type Genre } from './domain/genres.ts';
import { formatRating } from './engine/filters.ts';
import type { Factor } from './schemas.ts';

export type Locale = 'pt' | 'en';

const SOURCE_LABELS = { rotten_tomatoes: 'Rotten Tomatoes', metacritic: 'Metacritic', tmdb: 'TMDB' } as const;

function list(items: string[], locale: Locale): string {
  if (items.length <= 1) return items.join('');
  const last = items[items.length - 1];
  return `${items.slice(0, -1).join(', ')} ${locale === 'pt' ? 'e' : 'and'} ${last}`;
}

function genres(gs: Genre[], locale: Locale): string {
  return list(gs.map((g) => GENRE_LABELS[g][locale].toLowerCase()), locale);
}

export function explainFactor(f: Factor, locale: Locale, titleOf: (id: string) => string | undefined): string | null {
  const pt = locale === 'pt';
  switch (f.type) {
    case 'liked_genres':
      return pt ? `Você disse que gosta de ${genres(f.genres, locale)}.` : `You said you enjoy ${genres(f.genres, locale)}.`;
    case 'learned_genres':
      return pt
        ? `Você tem curtido filmes de ${genres(f.genres, locale)}.`
        : `You've been liking ${genres(f.genres, locale)} films.`;
    case 'similar_to': {
      const title = titleOf(f.movieId);
      if (!title) return null;
      if (f.source === 'request') {
        if (f.sharedDirector) {
          return pt ? `Mesmo diretor de ${title}, que você citou: ${f.sharedDirector}.` : `Same director as ${title}, which you mentioned: ${f.sharedDirector}.`;
        }
        return pt ? `Parecido com ${title}, que você citou.` : `Similar to ${title}, which you mentioned.`;
      }
      if (f.sharedDirector) {
        return pt
          ? `Mesmo diretor de ${title}: ${f.sharedDirector}.`
          : `Same director as ${title}: ${f.sharedDirector}.`;
      }
      return pt ? `Tem afinidade com ${title}, que você curtiu.` : `Shares a lot with ${title}, which you liked.`;
    }
    case 'rating': {
      const sources = list(f.sources.map((s) => SOURCE_LABELS[s]), locale);
      return pt
        ? `Bem avaliado pela crítica (${formatRating(f.average)}/10, ${sources}).`
        : `Well reviewed by critics (${formatRating(f.average)}/10, ${sources}).`;
    }
    case 'context_genres':
      return pt ? `Combina com o que você pediu agora.` : `Matches what you asked for right now.`;
    case 'explore':
      return pt
        ? `Fora do seu padrão: ${genres(f.genres, locale)}.`
        : `Outside your usual: ${genres(f.genres, locale)}.`;
    case 'popularity':
      return pt ? 'Um dos filmes mais conhecidos do catálogo.' : 'One of the best-known films in the catalog.';
    // Fator negativo: nunca vira motivo.
    case 'disliked_genres':
      return null;
  }
}

export function explain(factors: Factor[], locale: Locale, titleOf: (id: string) => string | undefined, max = 2): string[] {
  const out: string[] = [];
  for (const f of factors) {
    if (f.weight <= 0) continue;
    const text = explainFactor(f, locale, titleOf);
    if (text) out.push(text);
    if (out.length >= max) break;
  }
  return out;
}
