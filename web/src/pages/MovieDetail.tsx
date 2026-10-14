// Detalhe do filme: só dados do catálogo (Wikidata), com fonte visível. Nada gerado por IA.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { displayTitle } from '../../../core/db.ts';
import type { Movie } from '../../../core/schemas.ts';
import { hueOf, MovieMeta } from '../components/MovieCard.tsx';
import { Button, ErrorState, Skeleton, setAmbient } from '../components/ui.tsx';
import { moviesByIds, updateUserMovie } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { useUser } from '../lib/session.tsx';
import { useMovieActions } from '../lib/useMovieActions.ts';

export default function MovieDetail() {
  const { id = '' } = useParams();
  const { t, locale } = useI18n();
  const { userId } = useUser();
  const { entries, saved, toggleSave, refresh } = useMovieActions();
  const [movie, setMovie] = useState<Movie | null | undefined>(undefined);

  useEffect(() => {
    void moviesByIds([id])
      .then(([m]) => {
        setMovie(m ?? null);
        if (m) setAmbient(m);
      })
      .catch(() => setMovie(null));
    return () => setAmbient(null);
  }, [id]);

  if (movie === undefined) return <Skeleton className="h-72" />;
  if (movie === null) return <ErrorState message={t('search.noResults')} />;

  const current = movie;
  const state = entries.find((e) => e.movieId === current.id);
  const description = locale === 'pt' ? (current.descriptionPt ?? current.descriptionEn) : (current.descriptionEn ?? current.descriptionPt);
  const languageNames = new Intl.DisplayNames([locale === 'pt' ? 'pt-BR' : 'en'], { type: 'language' });

  async function mark(patch: Parameters<typeof updateUserMovie>[2]) {
    await updateUserMovie(userId, current.id, patch);
    await refresh();
  }

  return (
    <article className="reveal max-w-4xl">
      <div aria-hidden="true" className="mb-8 h-1 w-24 rounded-full" style={{ background: `hsl(${hueOf(current)} 55% 50% / 0.8)` }} />
      <h1 className="font-display text-[clamp(3.5rem,10vw,8rem)] leading-[0.94] font-extrabold text-balance text-paper uppercase">
        {displayTitle(current, locale)}
      </h1>
      {current.titleEn && current.titlePt && current.titleEn !== current.titlePt && (
        <p className="mt-3 text-fog">{locale === 'pt' ? current.titleEn : current.titlePt}</p>
      )}
      <div className="mt-6">
        <MovieMeta movie={current} size="md" />
      </div>
      {description && <p className="mt-6 max-w-[60ch] text-lg text-paper/90 first-letter:uppercase">{description}</p>}
      <div className="mt-6 space-y-1 text-fog">
        {current.directors.length > 0 && <p>{t('movie.directedBy', { names: current.directors.map((d) => d.name).join(', ') })}</p>}
        {current.languages.length > 0 && <p>{t('movie.originalLanguage', { langs: current.languages.map((l) => languageNames.of(l) ?? l).join(', ') })}</p>}
      </div>

      <div className="mt-10 flex flex-wrap gap-2">
        <Button variant="primary" aria-pressed={saved.has(current.id)} onClick={() => void toggleSave(current.id)}>
          {saved.has(current.id) ? t('movie.saved') : t('movie.save')}
        </Button>
        <Button aria-pressed={state?.sentiment === 1} onClick={() => void mark({ sentiment: state?.sentiment === 1 ? 0 : 1, watched: true })}>
          {t('fb.liked')}
        </Button>
        <Button aria-pressed={state?.sentiment === -1} onClick={() => void mark({ sentiment: state?.sentiment === -1 ? 0 : -1, watched: true })}>
          {t('fb.disliked')}
        </Button>
        <Button aria-pressed={state?.watched ?? false} onClick={() => void mark({ watched: !state?.watched })}>
          {t('fb.watched')}
        </Button>
        <Button variant="ghost" aria-pressed={state?.notInterested ?? false} onClick={() => void mark({ notInterested: !state?.notInterested })}>
          {t('fb.not_interested')}
        </Button>
      </div>

      <p className="mt-14 border-t border-matte pt-4 text-xs text-fog">
        Wikidata:{' '}
        <a href={`https://www.wikidata.org/wiki/${current.id}`} target="_blank" rel="noreferrer" className="underline hover:text-paper">
          {current.id}
        </a>
      </p>
    </article>
  );
}
