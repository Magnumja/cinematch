// Cards tipográficos (sem pôster, DEC-008). O título em fonte de letreiro é a "imagem" do filme.
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Tilt } from './unlumen-ui/Tilt.tsx';
import { ArrowLink } from './ArrowLink.tsx';
import { Link } from 'react-router-dom';
import { displayTitle, tmdbUserScore } from '../../../core/db.ts';
import { GENRE_HUES, GENRE_LABELS, type Genre } from '../../../core/domain/genres.ts';
import { averageRating, formatRating } from '../../../core/engine/filters.ts';
import { explain } from '../../../core/explain.ts';
import { FEEDBACK_TAGS, type FeedbackTag, type Movie } from '../../../core/schemas.ts';
import type { Feedback, RecItem } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { Button, setAmbient } from './ui.tsx';
import { Backdrop, Poster, ProviderBadges, TrailerButton } from './Poster.tsx';
import { ListPicker } from './ListPicker.tsx';

const SOURCE_NAMES = { rotten_tomatoes: 'Rotten Tomatoes', metacritic: 'Metacritic' } as const;

export function hueOf(movie: Movie): number {
  return GENRE_HUES[(movie.genres[0] as Genre | undefined) ?? 'drama'];
}

// Sinopse do TMDB no idioma da interface; sem ela, a descrição curta do Wikidata no mesmo idioma; por último a
// sinopse do TMDB no outro idioma. A descrição do Wikidata em outro idioma ("1957 film by…") não informa nada: fica de fora.
export function synopsis(movie: Movie, locale: 'pt' | 'en'): string | null {
  const tm = movie.tmdb;
  return (locale === 'pt'
    ? (tm?.overviewPt ?? movie.descriptionPt ?? tm?.overviewEn)
    : (tm?.overviewEn ?? movie.descriptionEn ?? tm?.overviewPt)) ?? null;
}

export function MovieMeta({ movie, size = 'sm' }: { movie: Movie; size?: 'sm' | 'md' }) {
  const { t, locale } = useI18n();
  const avg = averageRating(movie);
  const userScore = tmdbUserScore(movie.tmdb);
  return (
    <dl className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-fog ${size === 'md' ? 'text-sm sm:text-base' : 'text-sm'}`}>
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
            ? t('movie.ratingFrom', { value: formatRating(avg), sources: movie.ratings.map((r) => SOURCE_NAMES[r.source]).join(', ') })
            : t('movie.noRating')}
        </dd>
      </div>
      {userScore && (
        <div>
          <dt className="sr-only">TMDB</dt>
          <dd>{t('movie.tmdbScore', { value: formatRating(userScore.value) })}</dd>
        </div>
      )}
    </dl>
  );
}

function TierLabel({ tier }: { tier: RecItem['tier'] }) {
  const { t } = useI18n();
  const color = tier === 'high' ? 'bg-ember' : tier === 'good' ? 'bg-signal-amber/80' : 'bg-fog';
  return (
    <span className="inline-flex items-center gap-2 text-sm text-fog" title={`${t(`tier.${tier}`)}: ${t(`how.tier.${tier}`)}`}>
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
  const [failed, setFailed] = useState(false);

  // Falha ao gravar não pode sumir em silêncio: mostra aviso e não marca a opção.
  async function send(f: Feedback, nextTags = tags): Promise<boolean> {
    setBusy(true);
    setFailed(false);
    try {
      await onFeedback(f, nextTags);
      setGiven(f);
      return true;
    } catch {
      setFailed(true);
      return false;
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
            className={`min-h-11 rounded-full px-3 py-1.5 text-xs ring-1 transition-colors duration-200 disabled:opacity-50 ${given === f ? 'text-paper ring-ember/60' : 'text-fog ring-matte hover:text-paper hover:ring-fog/40'}`}
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
                  onClick={async () => {
                    const next = on ? tags.filter((x) => x !== tag) : [...tags, tag];
                    if (await send(given, next)) setTags(next);
                  }}
                  className={`min-h-11 rounded-full px-3 py-1 text-xs ring-1 transition-colors ${on ? 'text-paper ring-ember/60' : 'text-fog ring-matte hover:text-paper'}`}
                >
                  {t(`tag.${tag}`)}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {failed ? (
        <p className="text-sm text-signal-red" role="alert">
          {t('fb.failed')}
        </p>
      ) : given && given !== 'skipped' ? (
        <p className="text-sm text-fog" role="status">
          {t('fb.thanks')}
        </p>
      ) : (
        <p className="text-xs text-fog/80">{t('fb.hint')}</p>
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
  const description = synopsis(movie, locale);
  const title = displayTitle(movie, locale);
  const hasPoster = Boolean(movie.tmdb?.posterPath);

  return (
    <article
      aria-labelledby="hero-title"
      onMouseEnter={() => setAmbient(movie)}
      onFocus={() => setAmbient(movie)}
      className="reveal cinema-hero relative overflow-hidden rounded-[28px] bg-graphite/60 ring-1 ring-matte"
      style={{ '--film-hue': hueOf(movie) } as CSSProperties}
    >
      <Backdrop movie={movie} />
      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: `hsl(${hueOf(movie)} 55% 50% / 0.8)` }} />
      {/* Celular: pôster pequeno ao lado do título (filme, nota e onde assistir na primeira tela); o resto embaixo.
          Desktop: pôster | conteúdo | motivos. Sem pôster, o cabeçalho ocupa a largura toda. */}
      <div className={`relative grid gap-x-5 gap-y-6 p-5 sm:gap-x-8 sm:p-10 lg:gap-x-12 lg:gap-y-6 lg:p-14 ${hasPoster ? 'grid-cols-[6.5rem_minmax(0,1fr)] sm:grid-cols-[10rem_minmax(0,1fr)] lg:grid-cols-[14rem_minmax(0,1.4fr)_minmax(0,1fr)]' : 'grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]'}`}>
        <Poster movie={movie} hue={hueOf(movie)} size="w500" className="col-start-1 row-start-1 w-full self-start shadow-[0_20px_50px_#0008] lg:row-span-2" />
        {/* @container: o título é dimensionado pela largura desta coluna (cqi), não da tela — uma palavra longa
            como "OPPENHEIMER" não invade o painel ao lado. overflow-wrap só quebra a palavra em último caso. */}
        <div className={`@container min-w-0 row-start-1 self-center lg:self-start ${hasPoster ? 'col-start-2' : 'col-start-1'}`}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="rounded-full border border-ember/30 bg-ink/40 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wider text-ember sm:px-3 sm:py-1.5 sm:text-xs">{label}</p>
            <TierLabel tier={item.tier} />
          </div>
          <h2
            id="hero-title"
            className="mt-3 font-display text-[clamp(1.5rem,16cqi,6.25rem)] leading-[0.94] font-extrabold tracking-[-0.01em] text-balance text-paper uppercase [overflow-wrap:anywhere] sm:mt-5"
          >
            {title}
          </h2>
          <div className="mt-3 sm:mt-6">
            <MovieMeta movie={movie} size="md" />
          </div>
        </div>
        <div className={`min-w-0 ${hasPoster ? 'col-span-2 lg:col-span-1 lg:col-start-2 lg:row-start-2' : 'lg:row-start-2'}`}>
          <ProviderBadges movie={movie} />
          {movie.tmdb?.taglinePt && locale === 'pt' && <p className="mt-4 text-paper/90 italic">{movie.tmdb.taglinePt}</p>}
          {description && <p className="mt-3 line-clamp-3 max-w-[60ch] text-fog first-letter:uppercase sm:line-clamp-4">{description}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <TrailerButton movie={movie} />
            <ArrowLink to={`/movie/${movie.id}`} className="text-sm text-fog hover:text-paper">
              {t('movie.details')}
            </ArrowLink>
          </div>
        </div>

        <div className={`hero-reasons flex flex-col justify-between gap-6 rounded-2xl border border-paper/10 bg-ink/35 p-4 sm:gap-8 sm:p-6 ${hasPoster ? 'col-span-2 lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:row-start-1' : 'lg:col-start-2 lg:row-span-2 lg:row-start-1'}`}>
          <div>
            <h3 className="text-sm text-fog">{t('movie.why')}</h3>
            <ul className="mt-3 space-y-3">
              {reasons.map((r) => (
                <li key={r} className="text-base leading-snug text-paper sm:text-lg">
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
              <ListPicker movieId={movie.id} align="right" />
            </div>
            <FeedbackBar key={item.itemId ?? item.movieId} onFeedback={onFeedback} current={item.feedback} />
          </div>
        </div>
      </div>
    </article>
  );
}

export function CompactCard({ item, movie, movies, saved, onSave, entranceDelay = 0 }: Omit<CardProps, 'onFeedback'> & { entranceDelay?: number }) {
  const { t, locale } = useI18n();
  const reason = explain(item.factors, locale, (id) => {
    const m = movies.get(id);
    return m ? displayTitle(m, locale) : undefined;
  }, 1)[0];
  return (
    <Tilt className="h-full" entranceDelay={entranceDelay}>
    <article
      onMouseEnter={() => setAmbient(movie)}
      onFocus={() => setAmbient(movie)}
      style={{ '--film-hue': hueOf(movie) } as CSSProperties}
      className="movie-card group relative flex h-full flex-col justify-between gap-4 overflow-hidden rounded-2xl p-4 ring-1 sm:gap-5 sm:p-5 ring-matte hover:ring-fog/30 focus-within:ring-fog/40 motion-safe:hover:shadow-[0_12px_30px_#0004]"
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5" style={{ background: `hsl(${hueOf(movie)} 55% 50% / 0.7)` }} />
      <div className="@container min-w-0">
        <div className="flex items-start justify-between gap-3">
          <TierLabel tier={item.tier} />
          <Poster movie={movie} hue={hueOf(movie)} size="w185" className="w-16 sm:w-20" />
        </div>
        <h3 className="mt-3 font-display text-[clamp(1.4rem,14cqi,2.25rem)] leading-[0.95] font-bold text-balance text-paper uppercase [overflow-wrap:anywhere] sm:mt-4 sm:min-h-20">
          <Link to={`/movie/${movie.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {displayTitle(movie, locale)}
          </Link>
        </h3>
        <div className="mt-3">
          <MovieMeta movie={movie} />
        </div>
        <ProviderBadges movie={movie} max={2} className="mt-3" />
        {reason && <p className="mt-3 text-sm text-paper/85">{reason}</p>}
      </div>
      <div className="relative z-10 flex flex-wrap gap-2">
        <Button onClick={onSave} aria-pressed={saved} className="px-3 py-1.5">
          {saved ? t('movie.saved') : t('movie.save')}
        </Button>
        <ListPicker movieId={movie.id} />
      </div>
    </article>
    </Tilt>
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
        <Poster movie={movie} hue={hueOf(movie)} size="w92" className="w-12 rounded-md" fallback />
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
