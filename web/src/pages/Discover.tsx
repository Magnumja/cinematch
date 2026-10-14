// Descobrir: filtros pontuais para "agora". Equivale ao Modo B sem LLM e nunca altera o perfil (DEC-021).
import { useState } from 'react';
import type { Genre } from '../../../core/domain/genres.ts';
import { ConstraintsSchema, type Constraints, type Relaxable } from '../../../core/schemas.ts';
import { CompactCard } from '../components/MovieCard.tsx';
import { GenreSet, LimitsFields } from '../components/Pickers.tsx';
import { Button, ErrorState, NoMatch, PageHeader, SectionTitle, Skeleton } from '../components/ui.tsx';
import { ApiError, relaxToContext, requestRecommendation, type RecView } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { useUser } from '../lib/session.tsx';
import { useMovieActions } from '../lib/useMovieActions.ts';

export default function Discover() {
  const { t } = useI18n();
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
      <div className="space-y-8 rounded-[24px] bg-graphite/40 p-6 ring-1 ring-matte sm:p-8">
        <div>
          <h2 className="mb-3 text-sm text-fog">{t('discover.genres')}</h2>
          <GenreSet value={prefer} onChange={(v) => { setPrefer(v); setAvoid(avoid.filter((g) => !v.includes(g))); }} />
        </div>
        <div>
          <h2 className="mb-3 text-sm text-fog">{t('discover.avoid')}</h2>
          <GenreSet value={avoid} tone="negative" onChange={(v) => { setAvoid(v); setPrefer(prefer.filter((g) => !v.includes(g))); }} />
        </div>
        <LimitsFields value={limits} onChange={setLimits} showRewatch={false} />
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-matte pt-6">
          <label className="flex items-center gap-3 text-paper">
            <input type="checkbox" checked={explore} onChange={(e) => setExplore(e.target.checked)} className="size-4 accent-signal-violet" />
            {t('discover.explore')}
          </label>
          <Button variant="primary" onClick={() => void run()} disabled={loading}>
            {t('discover.submit')}
          </Button>
        </div>
      </div>

      <section className="mt-14" aria-live="polite">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-56" />
            ))}
          </div>
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
