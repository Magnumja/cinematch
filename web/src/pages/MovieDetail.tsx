// Detalhe do filme: dados do catálogo (Wikidata) + TMDB (pôster, sinopse, onde assistir), com fontes visíveis.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { displayTitle } from '../../../core/db.ts';
import type { Movie, WatchProvider } from '../../../core/schemas.ts';
import { hueOf, MovieMeta, synopsis } from '../components/MovieCard.tsx';
import { Backdrop, Poster, TmdbAttribution, TrailerButton, tmdbImage } from '../components/Poster.tsx';
import { Button, ErrorState, setAmbient } from '../components/ui.tsx';
import { DetailSkeleton } from '../components/Skeletons.tsx';
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
    let cancelled = false;
    setMovie(undefined);
    moviesByIds([id])
      .then(([m]) => {
        if (cancelled) return;
        setMovie(m ?? null);
        if (m) setAmbient(m);
      })
      .catch(() => !cancelled && setMovie(null));
    return () => {
      cancelled = true;
      setAmbient(null);
    };
  }, [id]);

  if (movie === undefined) return <DetailSkeleton />;
  if (movie === null) return <ErrorState message={t('search.noResults')} />;

  const current = movie;
  const state = entries.find((e) => e.movieId === current.id);
  const description = synopsis(current, locale);
  const hasPoster = Boolean(current.tmdb?.posterPath);
  const shownTitle = displayTitle(current, locale);
  const otherTitle = displayTitle(current, locale === 'pt' ? 'en' : 'pt');
  const languageNames = new Intl.DisplayNames([locale === 'pt' ? 'pt-BR' : 'en'], { type: 'language' });

  async function mark(patch: Parameters<typeof updateUserMovie>[2]) {
    await updateUserMovie(userId, current.id, patch);
    await refresh();
  }

  return (
    <article className="reveal relative">
      <div className="relative -mx-5 overflow-hidden px-5 py-4 sm:-mx-8 sm:px-8 sm:py-8 sm:rounded-[28px]">
        <Backdrop movie={current} />
        {/* Celular: pôster pequeno ao lado do título; a partir do tablet, pôster grande à esquerda de tudo. */}
        <div className={`relative grid gap-x-5 gap-y-6 md:gap-x-12 ${hasPoster ? 'grid-cols-[7rem_minmax(0,1fr)] sm:grid-cols-[11rem_minmax(0,1fr)] md:grid-cols-[16rem_minmax(0,1fr)]' : 'grid-cols-1'}`}>
          <Poster movie={current} hue={hueOf(current)} size="w500" className="col-start-1 row-start-1 w-full self-start shadow-[0_20px_50px_#0008] md:row-span-2" />
          <div className={`min-w-0 row-start-1 self-center md:self-end ${hasPoster ? 'col-start-2' : ''}`}>
            <h1 className={`font-display leading-[0.94] font-extrabold text-balance text-paper uppercase ${hasPoster ? 'text-[clamp(2rem,7vw,6.5rem)]' : 'text-[clamp(2.75rem,8vw,6.5rem)]'}`}>
              {shownTitle}
            </h1>
            {otherTitle !== shownTitle && <p className="mt-2 text-sm text-fog sm:mt-3 sm:text-base">{otherTitle}</p>}
            <div className="mt-3 sm:mt-6">
              <MovieMeta movie={current} size="md" />
            </div>
          </div>
          <div className={`min-w-0 max-w-4xl ${hasPoster ? 'col-span-2 md:col-span-1 md:col-start-2 md:row-start-2' : ''}`}>
            {current.tmdb?.taglinePt && locale === 'pt' && <p className="text-paper/90 italic">{current.tmdb.taglinePt}</p>}
            {description && <p className="mt-3 max-w-[60ch] text-base text-paper/90 first-letter:uppercase sm:text-lg">{description}</p>}
            <TrailerButton movie={current} className="mt-6" />
            <div className="mt-6 space-y-1 text-fog">
              {current.directors.length > 0 && <p>{t('movie.directedBy', { names: current.directors.map((d) => d.name).join(', ') })}</p>}
              {current.languages.length > 0 && <p>{t('movie.originalLanguage', { langs: current.languages.map((l) => languageNames.of(l) ?? l).join(', ') })}</p>}
            </div>
          </div>
        </div>
      </div>

      <WhereToWatch providers={current.tmdb?.providers ?? []} link={current.tmdb?.watchLink ?? null} hasTmdb={Boolean(current.tmdb)} />

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

      <div className="mt-14 space-y-3 border-t border-matte pt-4 text-xs text-fog">
        <p>
          Wikidata:{' '}
          <a href={`https://www.wikidata.org/wiki/${current.id}`} target="_blank" rel="noreferrer" className="underline hover:text-paper">
            {current.id}
          </a>
        </p>
        {current.tmdb && <TmdbAttribution />}
      </div>
    </article>
  );
}

const PROVIDER_ORDER: WatchProvider['type'][] = ['flatrate', 'free', 'ads', 'rent', 'buy'];

// Onde assistir no Brasil. Dados do JustWatch via TMDB — a fonte é obrigatória e fica visível.
function WhereToWatch({ providers, link, hasTmdb }: { providers: WatchProvider[]; link: string | null; hasTmdb: boolean }) {
  const { t } = useI18n();
  if (!hasTmdb) return null;
  const groups = PROVIDER_ORDER.map((type) => ({ type, items: providers.filter((p) => p.type === type) })).filter((g) => g.items.length > 0);
  return (
    <section aria-labelledby="watch-title" className="mt-10 max-w-4xl">
      <h2 id="watch-title" className="font-display text-3xl font-bold text-paper uppercase">{t('watch.title')}</h2>
      {groups.length === 0 ? (
        <p className="mt-3 text-fog">{t('watch.none')}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {groups.map((g) => (
            <div key={g.type}>
              <h3 className="text-sm text-fog">{t(`watch.${g.type}`)}</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {g.items.map((p) => {
                  const logo = tmdbImage(p.logoPath, 'w92');
                  return (
                    <li key={p.name} className="flex items-center gap-2 rounded-full bg-graphite py-1 pr-3 pl-1 text-sm text-paper ring-1 ring-matte">
                      {logo ? <img src={logo} alt="" width={28} height={28} loading="lazy" className="size-7 rounded-full" /> : <span className="size-7" />}
                      {p.name}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-fog">
        {t('watch.source')}{' '}
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-paper">
            {t('watch.more')}
          </a>
        )}
      </p>
    </section>
  );
}
