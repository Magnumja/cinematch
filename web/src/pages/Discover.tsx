// Descobrir: filtros pontuais para "agora". Equivale ao Modo B sem LLM e nunca altera o perfil (DEC-021).
import { useMemo, useState } from 'react';
import { GENRE_LABELS, GENRES, type Genre } from '../../../core/domain/genres.ts';
import { ConstraintsSchema, type Constraints, type Relaxable } from '../../../core/schemas.ts';
import { CompactCard } from '../components/MovieCard.tsx';
import { MultiDropdown } from '../components/Dropdown.tsx';
import { LimitsFields, Switch } from '../components/Pickers.tsx';
import { Button, ErrorState, NoMatch, PageHeader, SectionTitle } from '../components/ui.tsx';
import { CardGridSkeleton } from '../components/Skeletons.tsx';
import { ApiError, relaxToContext, requestRecommendation, type RecView } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { useUser } from '../lib/session.tsx';
import { useMovieActions } from '../lib/useMovieActions.ts';

export default function Discover() {
  const { t, locale } = useI18n();
  const { profile } = useUser();
  const { saved, saveFromRec } = useMovieActions();
  const [prefer, setPrefer] = useState<Genre[]>([]);
  const [avoid, setAvoid] = useState<Genre[]>([]);
  // Começa com os limites do perfil; mudanças aqui valem só para esta busca.
  const [limits, setLimits] = useState<Constraints>(profile.constraints);
  const [explore, setExplore] = useState(false);
  const [view, setView] = useState<RecView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gêneros em ordem alfabética no idioma atual: numa lista de 19 itens isso facilita achar.
  const genreOptions = useMemo(
    () => GENRES.map((g) => ({ value: g, label: GENRE_LABELS[g][locale] })).sort((a, b) => a.label.localeCompare(b.label, locale)),
    [locale],
  );

  // Filtros ativos: cada gênero escolhido + cada limite preenchido.
  const activeCount =
    prefer.length + avoid.length + (limits.maxRuntimeMin !== null ? 1 : 0) + (limits.minRating !== null ? 1 : 0) + (limits.languages.length > 0 ? 1 : 0);
  // "Limpar filtros" volta ao ponto de partida: sem gêneros e com os limites do perfil.
  const base = profile.constraints;
  const pristine =
    prefer.length === 0 &&
    avoid.length === 0 &&
    limits.maxRuntimeMin === base.maxRuntimeMin &&
    limits.minRating === base.minRating &&
    limits.languages.join() === base.languages.join();
  function clearFilters() {
    setPrefer([]);
    setAvoid([]);
    setLimits(base);
  }

  async function run(extra: Partial<Constraints> = {}) {
    setLoading(true);
    setError(null);
    try {
      const { maxRuntimeMin, minRating, languages } = ConstraintsSchema.parse(limits);
      setView(
        await requestRecommendation(
          explore ? 'explore' : 'discover',
          { preferGenres: prefer, avoidGenres: avoid, constraints: { maxRuntimeMin, minRating, languages, ...extra } },
          8,
        ),
      );
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'rate_limited' ? t('error.rate') : t('error.generic'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title={t('discover.title')} intro={t('discover.intro')} />
      <div className="rounded-[24px] bg-graphite/40 ring-1 ring-matte">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-matte px-5 py-4 sm:px-8">
          <p className="text-sm text-fog">{t('discover.hint')}</p>
          <div className="flex items-center gap-3">
            <span aria-live="polite" className={`text-sm tabular-nums ${activeCount > 0 ? 'text-paper' : 'text-fog'}`}>
              {activeCount === 0 ? t('discover.filtersNone') : activeCount === 1 ? t('discover.filtersOne') : t('discover.filtersMany', { n: activeCount })}
            </span>
            <Button variant="ghost" onClick={clearFilters} disabled={pristine}>
              {t('discover.clearFilters')}
            </Button>
          </div>
        </div>

        <div className="grid gap-8 px-5 py-6 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-8">
          <section aria-labelledby="discover-want" className="min-w-0">
            <h2 id="discover-want" className="mb-4 font-display text-xl font-semibold tracking-wide text-paper uppercase">
              {t('discover.wantGroup')}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <MultiDropdown
                label={t('discover.genres')}
                value={prefer}
                options={genreOptions}
                placeholder={t('discover.anyGenre')}
                onChange={(v) => { setPrefer(v); setAvoid(avoid.filter((g) => !v.includes(g))); }}
              />
              <MultiDropdown
                label={t('discover.avoid')}
                value={avoid}
                options={genreOptions}
                tone="negative"
                placeholder={t('discover.avoidNone')}
                onChange={(v) => { setAvoid(v); setPrefer(prefer.filter((g) => !v.includes(g))); }}
              />
            </div>
          </section>
          <section aria-labelledby="discover-limits" className="min-w-0 lg:border-l lg:border-matte lg:pl-8">
            <h2 id="discover-limits" className="mb-4 flex flex-wrap items-baseline gap-x-3 font-display text-xl font-semibold tracking-wide text-paper uppercase">
              {t('discover.limitsGroup')}
              <span className="font-sans text-xs font-normal tracking-normal text-fog normal-case">{t('discover.limitsNote')}</span>
            </h2>
            <LimitsFields value={limits} onChange={setLimits} showRewatch={false} />
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-b-[24px] border-t border-matte bg-ink/30 px-5 py-4 sm:px-8">
          <Switch checked={explore} onChange={setExplore} label={t('discover.explore')} tone="violet" />
          <Button variant="primary" onClick={() => void run()} disabled={loading} className="w-full sm:w-auto">
            {t('discover.submit')}
          </Button>
        </div>
      </div>

      <section className="mt-14" aria-live="polite">
        {loading ? (
          <CardGridSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void run()} />
        ) : view && view.items.length === 0 ? (
          <NoMatch relaxations={view.relaxations} onRelax={(c: Relaxable) => void run(relaxToContext(c))} />
        ) : view ? (
          <>
            <SectionTitle>{t('discover.results')}</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {view.items.map((item) => {
                const m = view.movies.get(item.movieId);
                return m ? <CompactCard key={item.movieId} item={item} movie={m} movies={view.movies} saved={saved.has(item.movieId)} onSave={() => void saveFromRec(item)} /> : null;
              })}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
