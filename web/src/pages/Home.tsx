// Home: um filme em destaque, poucas seções abaixo. Abrir a página não gera recomendação nova se já existe uma recente.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Constraints, Relaxable } from '../../../core/schemas.ts';
import { CompactCard, HeroCard, MovieRowItem } from '../components/MovieCard.tsx';
import { Button, ErrorState, NoMatch, SectionTitle, Skeleton, setAmbient } from '../components/ui.tsx';
import { ApiError, latestRecommendation, relaxToContext, requestRecommendation, type RecView } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { useMovieActions } from '../lib/useMovieActions.ts';

export function HeroSkeleton({ label }: { label: string }) {
  return (
    <div className="rounded-[28px] bg-graphite/40 p-7 ring-1 ring-matte sm:p-10 lg:p-14" aria-busy="true" aria-label={label}>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-6 h-20 w-3/4 sm:h-28" />
      <Skeleton className="mt-6 h-4 w-1/2" />
      <Skeleton className="mt-3 h-4 w-2/3" />
    </div>
  );
}

// Primeiro item ainda não descartado (pulado ou sem interesse).
function firstOpen(v: RecView): number {
  return v.items.findIndex((i) => i.feedback !== 'skipped' && i.feedback !== 'not_interested' && i.feedback !== 'disliked');
}

const SCHEDULE_LABEL = { daily: 'home.today', weekly: 'home.weekly', monthly: 'home.monthly' } as const;

export default function Home() {
  const { t } = useI18n();
  const { saved, saveFromRec, feedback, entries } = useMovieActions();
  const [view, setView] = useState<RecView | null>(null);
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explore, setExplore] = useState<RecView | null>(null);

  const fail = useCallback((e: unknown) => setError(e instanceof ApiError && e.code === 'rate_limited' ? t('error.rate') : t('error.generic')), [t]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const usable = (v: RecView | null) => (v && firstOpen(v) >= 0 ? v : null);
      const existing = usable(await latestRecommendation(['scheduled'], 31)) ?? usable(await latestRecommendation(['on_demand'], 1));
      const v = existing ?? (await requestRecommendation('on_demand'));
      setView(v);
      setIndex(Math.max(0, firstOpen(v)));
      setShown(v.items.map((i) => i.movieId));
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }, [fail]);

  // Uma carga por montagem (o StrictMode do React roda efeitos duas vezes em dev e geraria duas recomendações).
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void load();
    }
    return () => setAmbient(null);
  }, [load]);

  async function fresh(extra?: Partial<Constraints>) {
    setBusy(true);
    setError(null);
    try {
      const v = await requestRecommendation('on_demand', { excludeMovieIds: shown, constraints: extra ?? {} });
      setView(v);
      setIndex(0);
      setShown((s) => [...s, ...v.items.map((i) => i.movieId)]);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function advance() {
    if (!view) return;
    if (index + 1 < view.items.length) setIndex(index + 1);
    else await fresh();
  }

  async function another() {
    const current = view?.items[index];
    if (current) await feedback(current, 'skipped', []);
    await advance();
  }

  async function loadExplore() {
    setBusy(true);
    try {
      setExplore(await requestRecommendation('explore', { excludeMovieIds: shown }, 1));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  const hero = view?.items[index];
  const heroMovie = hero ? view.movies.get(hero.movieId) : undefined;
  const rest = view ? view.items.filter((_, i) => i !== index).slice(0, 4) : [];
  const savedEntries = entries.filter((e) => e.watchlist).slice(0, 4);
  const exploreItem = explore?.items[0];
  const exploreMovie = exploreItem ? explore.movies.get(exploreItem.movieId) : undefined;

  return (
    <div className="space-y-16">
      <section aria-live="polite">
        {loading ? (
          <HeroSkeleton label={t('home.generating')} />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : view && view.items.length === 0 ? (
          <NoMatch relaxations={view.relaxations} onRelax={(c: Relaxable) => void fresh(relaxToContext(c))} />
        ) : hero && heroMovie && view ? (
          <HeroCard
            key={hero.movieId}
            item={hero}
            movie={heroMovie}
            movies={view.movies}
            label={view.kind === 'scheduled' && view.frequency ? t(SCHEDULE_LABEL[view.frequency]) : t('home.forYou')}
            saved={saved.has(hero.movieId)}
            busy={busy}
            onSave={() => void saveFromRec(hero)}
            onAnother={() => void another()}
            onFeedback={async (f, tags) => {
              await feedback(hero, f, tags);
              if (f === 'not_interested') await advance();
            }}
          />
        ) : null}
      </section>

      {view && rest.length > 0 && (
        <section>
          <SectionTitle>{t('home.more')}</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {rest.map((item) => {
              const m = view.movies.get(item.movieId);
              return m ? (
                <CompactCard key={item.movieId} item={item} movie={m} movies={view.movies} saved={saved.has(item.movieId)} onSave={() => void saveFromRec(item)} />
              ) : null;
            })}
          </div>
        </section>
      )}

      <section className="grid gap-12 lg:grid-cols-[1fr_1fr]">
        <div>
          <SectionTitle>{t('home.different')}</SectionTitle>
          {exploreItem && exploreMovie && explore ? (
            <CompactCard item={exploreItem} movie={exploreMovie} movies={explore.movies} saved={saved.has(exploreItem.movieId)} onSave={() => void saveFromRec(exploreItem)} />
          ) : (
            <Button onClick={() => void loadExplore()} disabled={busy}>
              {t('discover.explore')}
            </Button>
          )}
        </div>
        <div>
          <SectionTitle action={<Link to="/list" className="text-sm text-fog hover:text-paper">{t('home.seeList')}</Link>}>{t('home.saved')}</SectionTitle>
          {savedEntries.length === 0 ? (
            <p className="text-fog">{t('home.savedEmpty')}</p>
          ) : (
            <ul>
              {savedEntries.map((e) => (
                <MovieRowItem key={e.movieId} movie={e.movie} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
