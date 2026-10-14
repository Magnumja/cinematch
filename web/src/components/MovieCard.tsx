// Cards tipográficos (sem pôster, DEC-008). O título em fonte de letreiro é a "imagem" do filme.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { displayTitle } from '../../../core/db.ts';
import { GENRE_HUES, GENRE_LABELS, type Genre } from '../../../core/domain/genres.ts';
import { averageRating } from '../../../core/engine/filters.ts';
import { explain } from '../../../core/explain.ts';
import { FEEDBACK_TAGS, type FeedbackTag, type Movie } from '../../../core/schemas.ts';
import type { Feedback, RecItem } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { Button, setAmbient } from './ui.tsx';

const SOURCE_NAMES = { rotten_tomatoes: 'Rotten Tomatoes', metacritic: 'Metacritic' } as const;

export function hueOf(movie: Movie): number {
  return GENRE_HUES[(movie.genres[0] as Genre | undefined) ?? 'drama'];
}

export function MovieMeta({ movie, size = 'sm' }: { movie: Movie; size?: 'sm' | 'md' }) {
  const { t, locale } = useI18n();
  const avg = averageRating(movie);
  return (
    <dl className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-fog ${size === 'md' ? 'text-base' : 'text-sm'}`}>
      {movie.year && (
        <div>
          <dt className="sr-only">Ano</dt>
          <dd>{movie.year}</dd>
        </div>
      )}
      <div>
        <dt className="sr-only">Duração</dt>
        <dd>{t('movie.minutes', { n: movie.runtimeMin })}</dd>
      </div>
      {movie.genres.length > 0 && (
        <div>
          <dt className="sr-only">Gêneros</dt>
          <dd>{movie.genres.slice(0, 3).map((g) => GENRE_LABELS[g][locale]).join(', ')}</dd>
        </div>
      )}
      <div>
        <dt className="sr-only">Nota</dt>
        <dd className={avg !== null ? 'text-paper' : ''}>
          {avg !== null
            ? t('movie.ratingFrom', { value: avg.toFixed(1), sources: movie.ratings.map((r) => SOURCE_NAMES[r.source]).join(', ') })
            : t('movie.noRating')}
        </dd>
      </div>
    </dl>
  );
}

function TierLabel({ tier }: { tier: RecItem['tier'] }) {
  const { t } = useI18n();
  const color = tier === 'high' ? 'bg-ember' : tier === 'good' ? 'bg-signal-amber/80' : 'bg-fog';
  return (
    <span className="inline-flex items-center gap-2 text-sm text-fog">
      <span className={`size-1.5 rounded-full ${color}`} aria-hidden="true" />
      {t(`tier.${tier}`)}
    </span>
  );
}

export function FeedbackBar({ onFeedback, current }: { onFeedback: (f: Feedback, tags: FeedbackTag[]) => Promise<void>; current: Feedback | null }) {
  const { t } = useI18n();
  const [given, setGiven] = useState<Feedback | null>(current);
  const [tags, setTags] = useState<FeedbackTag[]>([]);
  const [busy, setBusy] = useState(false);

  async function send(f: Feedback, nextTags = tags) {
    setBusy(true);
    try {
      await onFeedback(f, nextTags);
      setGiven(f);
    } finally {
      setBusy(false);
    }
  }

  const options = ['liked', 'disliked', 'watched', 'not_interested'] as const;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Feedback">
        {options.map((f) => (
          <button
            key={f}
            type="button"
            disabled={busy}
            aria-pressed={given === f}
            onClick={() => void send(f)}
            className={`rounded-full px-3 py-1.5 text-xs ring-1 transition-colors duration-200 disabled:opacity-50 ${given === f ? 'text-paper ring-ember/60' : 'text-fog ring-matte hover:text-paper hover:ring-fog/40'}`}
          >
            {t(`fb.${f}`)}
          </button>
        ))}
      </div>
      {(given === 'liked' || given === 'disliked') && (
        <div className="reveal space-y-2">
          <p className="text-sm text-fog">{t('fb.tags')}</p>
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_TAGS.map((tag) => {
              const on = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  disabled={busy}
                  onClick={() => {
                    const next = on ? tags.filter((x) => x !== tag) : [...tags, tag];
                    setTags(next);
                    void send(given, next);
                  }}
                  className={`rounded-full px-3 py-1 text-xs ring-1 transition-colors ${on ? 'text-paper ring-ember/60' : 'text-fog ring-matte hover:text-paper'}`}
                >
                  {t(`tag.${tag}`)}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {given && given !== 'skipped' && (
        <p className="text-sm text-fog" role="status">
          {t('fb.thanks')}
        </p>
      )}
    </div>
  );
}

interface CardProps {
  item: RecItem;
  movie: Movie;
  movies: Map<string, Movie>;
  saved: boolean;
  onSave: () => void;
  onFeedback: (f: Feedback, tags: FeedbackTag[]) => Promise<void>;
}

export function HeroCard({ item, movie, movies, saved, onSave, onFeedback, onAnother, label, busy }: CardProps & { onAnother: () => void; label: string; busy: boolean }) {
  const { t, locale } = useI18n();
  const reasons = explain(item.factors, locale, (id) => {
    const m = movies.get(id);
    return m ? displayTitle(m, locale) : undefined;
  });
  const description = locale === 'pt' ? (movie.descriptionPt ?? movie.descriptionEn) : (movie.descriptionEn ?? movie.descriptionPt);
  const title = displayTitle(movie, locale);

  return (
    <article
      aria-labelledby="hero-title"
      onMouseEnter={() => setAmbient(movie)}
      onFocus={() => setAmbient(movie)}
      className="reveal relative overflow-hidden rounded-[28px] bg-graphite/60 ring-1 ring-matte backdrop-blur-sm"
    >
      {/* Faixa de cor do gênero: a única "imagem" do card. */}
      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: `hsl(${hueOf(movie)} 55% 50% / 0.8)` }} />
      <div className="grid gap-10 p-7 sm:p-10 lg:grid-cols-[1.4fr_1fr] lg:gap-14 lg:p-14">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <p className="text-sm text-ember">{label}</p>
            <TierLabel tier={item.tier} />
          </div>
          <h2
            id="hero-title"
            className="mt-5 font-display text-[clamp(3.25rem,9vw,7.5rem)] leading-[0.94] font-extrabold tracking-[-0.01em] text-balance text-paper uppercase"
          >
            {title}
          </h2>
          <div className="mt-6">
            <MovieMeta movie={movie} size="md" />
          </div>
          {description && <p className="mt-4 max-w-[52ch] text-fog first-letter:uppercase">{description}</p>}
          <Link to={`/movie/${movie.id}`} className="mt-6 inline-block text-sm text-fog underline decoration-matte underline-offset-4 transition-colors hover:text-paper hover:decoration-fog">
            {t('movie.details')}
          </Link>
        </div>

        <div className="flex flex-col justify-between gap-8 lg:border-l lg:border-matte lg:pl-12">
          <div>
            <h3 className="text-sm text-fog">{t('movie.why')}</h3>
            <ul className="mt-3 space-y-3">
              {reasons.map((r) => (
                <li key={r} className="text-lg leading-snug text-paper">
                  {r}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={onSave} aria-pressed={saved}>
                {saved ? t('movie.saved') : t('movie.save')}
              </Button>
              <Button onClick={onAnother} disabled={busy}>
                {t('movie.another')}
              </Button>
            </div>
            <FeedbackBar key={item.itemId ?? item.movieId} onFeedback={onFeedback} current={item.feedback} />
          </div>
        </div>
      </div>
    </article>
  );
}

export function CompactCard({ item, movie, movies, saved, onSave }: Omit<CardProps, 'onFeedback'>) {
  const { t, locale } = useI18n();
  const reason = explain(item.factors, locale, (id) => {
    const m = movies.get(id);
    return m ? displayTitle(m, locale) : undefined;
  }, 1)[0];
  return (
    <article
      onMouseEnter={() => setAmbient(movie)}
      onFocus={() => setAmbient(movie)}
      className="group relative flex h-full flex-col justify-between gap-5 overflow-hidden rounded-2xl bg-graphite/50 p-5 ring-1 ring-matte transition-[box-shadow,background-color] duration-300 hover:bg-graphite/80 hover:ring-fog/30 focus-within:ring-fog/40"
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5" style={{ background: `hsl(${hueOf(movie)} 55% 50% / 0.7)` }} />
      <div className="min-w-0">
        <TierLabel tier={item.tier} />
        <h3 className="mt-3 font-display text-3xl leading-[0.95] font-bold text-balance text-paper uppercase">
          <Link to={`/movie/${movie.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {displayTitle(movie, locale)}
          </Link>
        </h3>
        <div className="mt-3">
          <MovieMeta movie={movie} />
        </div>
        {reason && <p className="mt-3 text-sm text-paper/85">{reason}</p>}
      </div>
      <div className="relative z-10">
        <Button onClick={onSave} aria-pressed={saved} className="px-3 py-1.5">
          {saved ? t('movie.saved') : t('movie.save')}
        </Button>
      </div>
    </article>
  );
}

// Linha simples para listas e busca.
export function MovieRowItem({ movie, actions }: { movie: Movie; actions?: ReactNode }) {
  const { locale } = useI18n();
  return (
    <li
      onMouseEnter={() => setAmbient(movie)}
      onFocus={() => setAmbient(movie)}
      className="flex flex-col gap-3 border-b border-matte py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-4">
        <span aria-hidden="true" className="mt-1.5 h-8 w-1 shrink-0 rounded-full" style={{ background: `hsl(${hueOf(movie)} 55% 50% / 0.7)` }} />
        <div className="min-w-0">
          <Link to={`/movie/${movie.id}`} className="font-display text-2xl leading-none font-bold text-paper uppercase hover:text-ember">
            {displayTitle(movie, locale)}
          </Link>
          <div className="mt-1.5">
            <MovieMeta movie={movie} />
          </div>
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">{actions}</div>}
    </li>
  );
}
