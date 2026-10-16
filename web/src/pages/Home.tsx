// Home: um filme em destaque, poucas seções abaixo. Abrir a página não gera recomendação nova se já existe uma recente.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GENRE_LABELS } from '../../../core/domain/genres.ts';
import { Shelf } from '../components/Shelf.tsx';
import { ArrowLink } from '../components/ArrowLink.tsx';
import { hardFilterReason } from '../../../core/engine/filters.ts';
import type { Constraints, Movie, Relaxable, UserMovie } from '../../../core/schemas.ts';
import { HowItWorks } from '../components/HowItWorks.tsx';
import { CompactCard, HeroCard, MovieRowItem } from '../components/MovieCard.tsx';
import { Button, ErrorState, NoMatch, SectionTitle, setAmbient } from '../components/ui.tsx';
import { CardGridSkeleton, HeroSkeleton } from '../components/Skeletons.tsx';
import { ApiError, browseMovies, latestRecommendation, type ShelfQuery, relaxToContext, requestRecommendation, statesFor, type RecItem, type RecView } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { useUser } from '../lib/session.tsx';
import { useMovieActions } from '../lib/useMovieActions.ts';

// Feedback que tira o item do destaque: já foi pulado, avaliado ou recusado.
const CLOSED: ReadonlySet<RecItem['feedback']> = new Set(['skipped', 'not_interested', 'disliked', 'liked', 'watched']);
// O servidor recebe no máximo 500 ids excluídos; mandamos só os mais recentes.
const MAX_SHOWN = 300;

// Filmes por pedido (o backend aceita até 10): 1 destaque + até 9 no grid.
const BATCH = 10;
const GRID = 8;
// Prateleiras: até 16 filmes; com menos de 4 compatíveis, a prateleira não aparece.
const SHELF_MAX = 16;
const SHELF_MIN = 4;

const SCHEDULE_LABEL = { daily: 'home.today', weekly: 'home.weekly', monthly: 'home.monthly' } as const;

export default function Home() {
  const { t, locale } = useI18n();
  const { userId, profile } = useUser();
  const { saved, saveFromRec, feedback, entries } = useMovieActions();
  const [view, setView] = useState<RecView | null>(null);
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explore, setExplore] = useState<RecView | null>(null);
  // Lotes extras de "Ver mais sugestões", acrescentados abaixo do grid sem trocar o destaque.
  const [more, setMore] = useState<RecView[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const fail = useCallback((e: unknown) => setError(e instanceof ApiError && e.code === 'rate_limited' ? t('error.rate') : t('error.generic')), [t]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Uma recomendação gravada antes só é reaproveitada com os itens que ainda valem HOJE:
      // o perfil (restrições) e o estado de cada filme podem ter mudado depois que ela foi gerada.
      // As duas buscas e a leitura de estados correm em paralelo (antes eram até 4 idas e voltas em série).
      const [scheduled, onDemand] = await Promise.all([latestRecommendation(['scheduled'], 31), latestRecommendation(['on_demand'], 1)]);
      const ids = [...(scheduled?.items ?? []), ...(onDemand?.items ?? [])].map((i) => i.movieId);
      const states = ids.length > 0 ? await statesFor(userId, [...new Set(ids)]) : new Map();
      const usable = (v: RecView | null): RecView | null => {
        if (!v) return null;
        const items = v.items.filter((i) => {
          const movie = v.movies.get(i.movieId);
          return movie && !CLOSED.has(i.feedback) && hardFilterReason(movie, profile.constraints, states.get(i.movieId) as UserMovie | undefined, new Set()) === null;
        });
        return items.length > 0 ? { ...v, items } : null;
      };
      const existing = usable(scheduled) ?? usable(onDemand);
      const v = existing ?? (await requestRecommendation('on_demand', undefined, BATCH));
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
      const v = await requestRecommendation('on_demand', { excludeMovieIds: shown.slice(-MAX_SHOWN), constraints: extra ?? {} }, BATCH);
      setView(v);
      setIndex(0);
      setMore([]);
      setExhausted(false);
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

  // Troca o destaque e o grid por um conjunto novo (sem repetir o que já apareceu nesta visita).
  async function refresh() {
    if (busy) return;
    setRefreshing(true);
    await fresh();
    setRefreshing(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function loadMore() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const v = await requestRecommendation('on_demand', { excludeMovieIds: shown.slice(-MAX_SHOWN) }, BATCH);
      if (v.items.length === 0) setExhausted(true);
      else {
        setMore((m) => [...m, v]);
        setShown((s) => [...s, ...v.items.map((i) => i.movieId)]);
      }
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

  // ---- Prateleiras (DEC-047): navegação pelo catálogo, carregada depois do destaque, em paralelo.
  const shelfDefs = useMemo((): { key: string; title: string; subtitle?: string; q: ShelfQuery }[] => {
    const liked = profile.preferences.likedGenres;
    const year = new Date().getFullYear();
    const genreShelf = (i: number) =>
      liked[i] ? [{ key: `g${i}`, title: t('shelf.genre', { genre: GENRE_LABELS[liked[i]!][locale] }), q: { genres: [liked[i]!] } as ShelfQuery }] : [];
    return [
      ...genreShelf(0),
      { key: 'stream', title: t('shelf.streaming'), subtitle: t('shelf.streamingSub'), q: { streaming: true } as ShelfQuery },
      { key: 'recent', title: t('shelf.recent'), subtitle: t('shelf.recentSub', { year: year - 3 }), q: { minYear: year - 3 } as ShelfQuery },
      { key: 'classics', title: t('shelf.classics'), subtitle: t('shelf.classicsSub'), q: { maxYear: 1995, minRating: 8 } as ShelfQuery },
      ...genreShelf(1),
      { key: 'short', title: t('shelf.short'), subtitle: t('shelf.shortSub'), q: { maxRuntimeMin: 100 } as ShelfQuery },
    ];
  }, [profile.preferences.likedGenres, t, locale]);
  const [rawShelves, setRawShelves] = useState<Record<string, Movie[] | undefined>>({});
  const shelvesStarted = useRef(false);
  useEffect(() => {
    if (loading || shelvesStarted.current) return;
    shelvesStarted.current = true;
    for (const d of shelfDefs) {
      browseMovies(d.q, profile.constraints, 30)
        .then((movies) => setRawShelves((r) => ({ ...r, [d.key]: movies })))
        .catch(() => setRawShelves((r) => ({ ...r, [d.key]: [] })));
    }
  }, [loading, shelfDefs, profile.constraints]);

  const hero = view?.items[index];
  const heroMovie = hero ? view.movies.get(hero.movieId) : undefined;
  const grid = [
    ...(view ? view.items.filter((_, i) => i !== index).slice(0, GRID).map((item) => ({ item, movies: view.movies })) : []),
    ...more.flatMap((v) => v.items.map((item) => ({ item, movies: v.movies }))),
  ];
  // Revalida cada prateleira com as restrições e os estados atuais (já vistos, sem interesse, não gostei) e tira
  // repetições: um filme aparece uma vez só na página (destaque, grid ou a primeira prateleira em que couber).
  const shelves = useMemo(() => {
    const states = new Map(entries.map((e) => [e.movieId, e as UserMovie]));
    // "Não curto" é preferência (só pesa no ranking), mas numa prateleira de navegação seria descuido mostrar.
    const disliked = new Set(profile.preferences.dislikedGenres);
    const seen = new Set<string>([...(hero ? [hero.movieId] : []), ...grid.map((g) => g.item.movieId)]);
    return shelfDefs.map((d) => {
      const raw = rawShelves[d.key];
      const movies = (raw ?? [])
        .filter((m) => !seen.has(m.id) && !m.genres.some((g) => disliked.has(g)))
        .filter((m) => hardFilterReason(m, profile.constraints, states.get(m.id), new Set()) === null)
        .slice(0, SHELF_MAX);
      movies.forEach((m) => seen.add(m.id));
      return { ...d, loading: raw === undefined, movies };
    });
  }, [shelfDefs, rawShelves, entries, hero, grid, profile.constraints, profile.preferences.dislikedGenres]);
  // Mesmo critério de Minha lista → "Quero assistir".
  const savedEntries = entries.filter((e) => e.watchlist && !e.watched).slice(0, 4);
  const exploreItem = explore?.items[0];
  const exploreMovie = exploreItem ? explore.movies.get(exploreItem.movieId) : undefined;

  return (
    <div className="space-y-8 sm:space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-3 hidden text-xs font-medium uppercase tracking-[0.2em] text-ember sm:block">Cineou / {t('home.forYou')}</p>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-6xl">{t('home.title')}</h1>
          <p className="mt-3 hidden text-sm text-fog sm:block">{t('home.intro')}</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onClick={() => void refresh()} spinning={refreshing} disabled={busy || loading} />
          {/* No celular o Descobrir já está no menu: o espaço vai para o filme. */}
          <ArrowLink to="/discover" className="hidden min-h-11 items-center gap-4 rounded-full border border-matte px-5 text-sm hover:border-fog sm:inline-flex">{t('nav.discover')}</ArrowLink>
        </div>
      </header>
      <section aria-live="polite">
        {loading || refreshing ? (
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

      <HowItWorks />

      {refreshing ? (
        <CardGridSkeleton count={GRID} />
      ) : (
        view &&
        grid.length > 0 && (
          <section aria-labelledby="home-more">
            <SectionTitle action={<RefreshButton compact onClick={() => void refresh()} spinning={refreshing} disabled={busy} />}>
              <span id="home-more">{t('home.more')}</span>
            </SectionTitle>
            <div className="movie-grid grid grid-cols-1 gap-3 min-[460px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              {grid.map(({ item, movies }, position) => {
                const m = movies.get(item.movieId);
                return m ? (
                  <CompactCard key={item.movieId} entranceDelay={Math.min(position % GRID, 3) * 0.08} item={item} movie={m} movies={movies} saved={saved.has(item.movieId)} onSave={() => void saveFromRec(item)} />
                ) : null;
              })}
            </div>
            <div className="mt-6 flex flex-col items-center gap-2">
              {exhausted ? (
                <p className="text-sm text-fog">{t('home.exhausted')}</p>
              ) : (
                <Button onClick={() => void loadMore()} disabled={busy} className="min-w-48">
                  {busy && !refreshing ? t('home.loadingMore') : t('home.loadMore')}
                </Button>
              )}
            </div>
          </section>
        )
      )}

      {shelves.map((s) =>
        s.loading || s.movies.length >= SHELF_MIN ? <Shelf key={s.key} title={s.title} subtitle={s.subtitle} movies={s.movies} loading={s.loading} /> : null,
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
          <SectionTitle action={<ArrowLink to="/list" className="text-sm text-fog hover:text-paper">{t('home.seeList')}</ArrowLink>}>{t('home.saved')}</SectionTitle>
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

// "Atualizar recomendações": pede um conjunto novo, sem repetir o que já apareceu nesta visita.
function RefreshButton({ onClick, spinning, disabled, compact = false }: { onClick: () => void; spinning: boolean; disabled: boolean; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={t('home.refresh')}
      title={t('home.refresh')}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full text-sm text-paper ring-1 ring-matte transition-colors hover:bg-graphite hover:ring-fog/40 disabled:opacity-50 ${compact ? 'px-3' : 'px-4'}`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className={`size-4 ${spinning ? 'motion-safe:animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
      <span className={compact ? 'hidden sm:inline' : ''}>{t('home.refreshShort')}</span>
    </button>
  );
}
