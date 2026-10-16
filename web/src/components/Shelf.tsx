// Prateleira horizontal de pôsteres (DEC-047), no estilo dos apps de streaming. Rolagem por toque/trackpad com
// encaixe; no desktop, setas aparecem quando há mais conteúdo para os lados.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { displayTitle } from '../../../core/db.ts';
import { averageRating, formatRating } from '../../../core/engine/filters.ts';
import type { Movie } from '../../../core/schemas.ts';
import { useI18n } from '../lib/i18n.tsx';
import { hueOf } from './MovieCard.tsx';
import { Poster } from './Poster.tsx';
import { ShimmerSkeleton } from './unlumen-ui/ShimmerSkeleton.tsx';

function PosterTile({ movie }: { movie: Movie }) {
  const { locale } = useI18n();
  const avg = averageRating(movie);
  return (
    <li className="w-32 shrink-0 snap-start sm:w-40">
      <Link to={`/movie/${movie.id}`} className="group block rounded-xl focus-visible:outline-offset-4">
        <Poster movie={movie} hue={hueOf(movie)} size="w342" fallback className="w-full transition-transform duration-300 group-hover:-translate-y-1 group-hover:ring-fog/40" />
        <p className="mt-2 line-clamp-2 text-sm leading-snug text-paper group-hover:text-ember">{displayTitle(movie, locale)}</p>
        <p className="mt-0.5 text-xs text-fog">
          {[movie.year, avg !== null ? `★ ${formatRating(avg)}` : null].filter(Boolean).join(' · ')}
        </p>
      </Link>
    </li>
  );
}

export function Shelf({ title, subtitle, movies, loading = false }: { title: string; subtitle?: string; movies: Movie[]; loading?: boolean }) {
  const { t } = useI18n();
  const row = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const update = () => setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [movies.length, loading]);

  const scroll = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.85, behavior: 'smooth' });
  const arrow = 'absolute top-[38%] z-10 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink/80 text-paper ring-1 ring-matte backdrop-blur transition-opacity hover:bg-graphite sm:flex';

  return (
    <section aria-label={title} className="group/shelf">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-bold text-paper uppercase sm:text-3xl">{title}</h2>
          {subtitle && <p className="text-sm text-fog">{subtitle}</p>}
        </div>
      </div>
      <div className="relative">
        {loading ? (
          <div role="status" aria-busy="true" aria-label={t('loading')} className="flex gap-3 overflow-hidden sm:gap-4">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="w-32 shrink-0 sm:w-40">
                <ShimmerSkeleton className="aspect-[2/3] w-full" rounded="lg" />
                <ShimmerSkeleton className="mt-2 h-3.5 w-4/5" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <ul ref={row} className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-2 sm:mx-0 sm:gap-4 sm:scroll-px-0 sm:px-0">
              {movies.map((m) => (
                <PosterTile key={m.id} movie={m} />
              ))}
            </ul>
            <button type="button" aria-label={t('shelf.prev')} onClick={() => scroll(-1)} className={`${arrow} -left-4 ${edges.start ? 'pointer-events-none opacity-0' : 'opacity-0 group-hover/shelf:opacity-100 focus-visible:opacity-100'}`}>‹</button>
            <button type="button" aria-label={t('shelf.next')} onClick={() => scroll(1)} className={`${arrow} -right-4 ${edges.end ? 'pointer-events-none opacity-0' : 'opacity-0 group-hover/shelf:opacity-100 focus-visible:opacity-100'}`}>›</button>
          </>
        )}
      </div>
    </section>
  );
}
