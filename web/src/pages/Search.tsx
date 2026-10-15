import { RowListSkeleton } from '../components/Skeletons.tsx';
import { AnimatedInput } from '../components/AnimatedInput.tsx';
// Busca por título no catálogo (Wikidata). Sem LLM.
import { useEffect, useState } from 'react';
import type { Movie } from '../../../core/schemas.ts';
import { MovieRowItem } from '../components/MovieCard.tsx';
import { Button, PageHeader } from '../components/ui.tsx';
import { searchMovies } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { useMovieActions } from '../lib/useMovieActions.ts';

export default function Search() {
  const { t } = useI18n();
  const { saved, toggleSave } = useMovieActions();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Movie[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(() => {
      searchMovies(query, 30)
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setSearching(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  return (
    <div className="max-w-4xl">
      <PageHeader title={t('search.title')} />
      <AnimatedInput
        type="search"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('search.placeholder')}
        aria-label={t('search.placeholder')}
        className="w-full rounded-full bg-graphite px-5 py-4 text-lg text-paper ring-1 ring-matte placeholder:text-fog/70 focus:ring-fog/50 focus:outline-none"
      />
      <div className="mt-8" aria-live="polite">
        {searching && (results === null || results.length === 0) ? (
          <RowListSkeleton />
        ) : results === null ? (
          <p className="text-fog">{t('search.hint')}</p>
        ) : results.length === 0 ? (
          <p className="text-fog">{t('search.noResults')}</p>
        ) : (
          <ul>
            {results.map((m) => (
              <MovieRowItem
                key={m.id}
                movie={m}
                actions={
                  <Button className="px-3 py-1.5" aria-pressed={saved.has(m.id)} onClick={() => void toggleSave(m.id)}>
                    {saved.has(m.id) ? t('movie.saved') : t('movie.save')}
                  </Button>
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
