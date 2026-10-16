// Texto do aviso no celular (Web Push, DEC-048) para a recomendação agendada. Determinístico, sem dado
// pessoal além do título do filme; o conteúdo vai cifrado de ponta a ponta até o navegador.
import { displayTitle } from './db.ts';
import type { Movie } from './schemas.ts';

export type Frequency = 'daily' | 'weekly' | 'monthly';
export type PushMessage = { title: string; body: string; url: string; tag: string };

const TITLES: Record<'pt' | 'en', Record<Frequency, string>> = {
  pt: { daily: 'Seu filme de hoje', weekly: 'Seu filme da semana', monthly: 'Seu filme do mês' },
  en: { daily: 'Your film for today', weekly: 'Your film of the week', monthly: 'Your film of the month' },
};
const HINT = { pt: 'Toque para ver por que ele combina com você.', en: 'Tap to see why it fits you.' };

export function scheduledPushMessage(movie: Pick<Movie, 'titlePt' | 'titleEn' | 'year' | 'tmdb'>, locale: 'pt' | 'en', frequency: Frequency | null): PushMessage {
  const name = displayTitle(movie, locale);
  return {
    title: TITLES[locale][frequency ?? 'weekly'],
    body: `${movie.year ? `${name} (${movie.year})` : name}. ${HINT[locale]}`,
    // A Home mostra a recomendação agendada com a explicação.
    url: '/',
    // Mesma tag: um aviso novo substitui o anterior na barra em vez de empilhar.
    tag: 'cineou-scheduled',
  };
}
