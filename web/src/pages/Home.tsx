// Home: um filme em destaque, poucas seções abaixo. Abrir a página não gera recomendação nova se já existe uma recente.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatedLink } from '../components/skiper-ui/AnimatedLink.tsx';
import { hardFilterReason } from '../../../core/engine/filters.ts';
import type { Constraints, Relaxable, UserMovie } from '../../../core/schemas.ts';
import { CompactCard, HeroCard, MovieRowItem } from '../components/MovieCard.tsx';
import { Button, ErrorState, NoMatch, SectionTitle, Skeleton, setAmbient } from '../components/ui.tsx';
import { ApiError, latestRecommendation, relaxToContext, requestRecommendation, statesFor, type RecItem, type RecView } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { useUser } from '../lib/session.tsx';
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

// Feedback que tira o item do destaque: já foi pulado, avaliado ou recusado.
const CLOSED: ReadonlySet<RecItem['feedback']> = new Set(['skipped', 'not_interested', 'disliked', 'liked', 'watched']);
// O servidor recebe no máximo 500 ids excluídos; mandamos só os mais recentes.
const MAX_SHOWN = 300;

const SCHEDULE_LABEL = { daily: 'home.today', weekly: 'home.weekly', monthly: 'home.monthly' } as const;

export default function Home() {
  const { t } = useI18n();
  const { userId, profile } = useUser();
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
      // Uma recomendação gravada antes só é reaproveitada com os itens que ainda valem HOJE:
      // o perfil (restrições) e o estado de cada filme podem ter mudado depois que ela foi gerada.
      const usable = async (v: RecView | null): Promise<RecView | null> => {
        if (!v) return null;
        const states = await statesFor(userId, v.items.map((i) => i.movieId));
        const items = v.items.filter((i) => {
          const movie = v.movies.get(i.movieId);
          return movie && !CLOSED.has(i.feedback) && hardFilterReason(movie, profile.constraints, states.get(i.movieId) as UserMovie | undefined, new Set()) === null;
        });
        return items.length > 0 ? { ...v, items } : null;
      };
      const existing = (await usable(await latestRecommendation(['scheduled'], 31))) ?? (await usable(await latestRecommendation(['on_demand'], 1)));
      const v = existing ?? (await requestRecommendation('on_demand'));
      setView(v);
      setIndex(0);
      setShown(v.items.map((i) => i.movieId));
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }, [fail, userId, profile.constraints]);

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
      const v = await requestRecommendation('on_demand', { excludeMovieIds: shown.slice(-MAX_SHOWN), constraints: extra ?? {} });
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

  // Trava contra clique duplo: duas chamadas gerariam duas recomendações e gastariam o limite por minuto.
  async function another() {
    if (busy) return;
    setBusy(true);
    try {
      const current = view?.items[index];
      if (current) await feedback(current, 'skipped', []);
      await advance();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function loadExplore() {
    if (busy) return;
    setBusy(true);
    try {
      setExplore(await requestRecommendation('explore', { excludeMovieIds: shown.slice(-MAX_SHOWN) }, 1));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  const hero = view?.items[index];
  const heroMovie = hero ? view.movies.get(hero.movieId) : undefined;
  const rest = view ? view.items.filter((_, i) => i !== index).slice(0, 4) : [];
  // Mesmo critério de Minha lista → "Quero assistir".
  const savedEntries = entries.filter((e) => e.watchlist && !e.watched).slice(0, 4);
  const exploreItem = explore?.items[0];
  const exploreMovie = exploreItem ? explore.movies.get(exploreItem.movieId) : undefined;

  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-ember">Cineou / {t('home.forYou')}</p>
          <h1 className="font-display text-5xl font-bold tracking-tight sm:text-6xl">{t('home.title')}</h1>
          <p className="mt-3 text-sm text-fog">{t('home.intro')}</p>
        </div>
        <AnimatedLink to="/discover" className="inline-flex min-h-11 items-center gap-4 rounded-full border border-matte px-5 text-sm hover:border-fog">{t('nav.discover')}</AnimatedLink>
      </header>
      <section aria-live="polite">
        {loading ? (
          <HeroSkeleton label={t('home.generating')} />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : view && view.items.length === 0 ? (
          <NoMatch relaxations={view.relaxations} disabled={busy} onRelax={(c: Relaxable) => void (busy ? undefined : fresh(relaxToContext(c)))} />
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
          <div className="movie-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {rest.map((item, position) => {
              const m = view.movies.get(item.movieId);
              return m ? (
                <CompactCard key={item.movieId} entranceDelay={Math.min(position, 3) * 0.08} item={item} movie={m} movies={view.movies} saved={saved.has(item.movieId)} onSave={() => void saveFromRec(item)} />
              ) : null;
            })}
          </div>
        </section>
      )}

      <section className="grid gap-12 lg:grid-cols-[1fr_1fr]">
        <div className="explore-panel rounded-2xl border border-matte p-6">
          <SectionTitle>{t('home.different')}</SectionTitle>
          <p className="mb-6 max-w-sm text-sm leading-relaxed text-fog">{t('home.exploreIntro')}</p>
          {exploreItem && exploreMovie && explore ? (
            <CompactCard item={exploreItem} movie={exploreMovie} movies={explore.movies} saved={saved.has(exploreItem.movieId)} onSave={() => void saveFromRec(exploreItem)} />
          ) : (
            <Button onClick={() => void loadExplore()} disabled={busy}>
              {t('discover.explore')}
            </Button>
          )}
        </div>
        <div>
          <SectionTitle action={<AnimatedLink to="/list" className="text-sm text-fog hover:text-paper">{t('home.seeList')}</AnimatedLink>}>{t('home.saved')}</SectionTitle>
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
