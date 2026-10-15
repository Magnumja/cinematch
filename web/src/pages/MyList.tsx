// Minha lista: salvos, assistidos (com avaliação editável) e filmes marcados como sem interesse.
import { RowListSkeleton } from '../components/Skeletons.tsx';
import { useState } from 'react';
import { MovieRowItem } from '../components/MovieCard.tsx';
import { Button, PageHeader } from '../components/ui.tsx';
import { updateUserMovie, type UserMovieEntry } from '../lib/api.ts';
import { useI18n, type MessageKey } from '../lib/i18n.tsx';
import { useUser } from '../lib/session.tsx';
import { useMovieActions } from '../lib/useMovieActions.ts';

type Tab = 'watchlist' | 'watched' | 'hidden';
const TABS: { id: Tab; label: MessageKey; filter: (e: UserMovieEntry) => boolean }[] = [
  { id: 'watchlist', label: 'list.watchlist', filter: (e) => e.watchlist && !e.watched },
  { id: 'watched', label: 'list.watched', filter: (e) => e.watched },
  { id: 'hidden', label: 'list.hidden', filter: (e) => e.notInterested },
];

export default function MyList() {
  const { t } = useI18n();
  const { userId } = useUser();
  const { entries, loaded, refresh } = useMovieActions();
  const [tab, setTab] = useState<Tab>('watchlist');
  const current = TABS.find((x) => x.id === tab)!;
  const items = entries.filter(current.filter);

  async function act(fn: () => Promise<void>) {
    await fn();
    await refresh();
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title={t('list.title')} />
      <div role="tablist" aria-label={t('list.title')} className="mb-6 flex gap-6 border-b border-matte">
        {TABS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={`-mb-px border-b-2 pb-3 text-sm transition-colors ${tab === x.id ? 'border-ember text-paper' : 'border-transparent text-fog hover:text-paper'}`}
          >
            {t(x.label)} <span className="text-fog">{entries.filter(x.filter).length}</span>
          </button>
        ))}
      </div>

      {!loaded ? (
        <RowListSkeleton count={4} />
      ) : items.length === 0 ? (
        <p className="text-fog">{t('list.empty')}</p>
      ) : (
        <ul role="tabpanel">
          {items.map((e) => (
            <MovieRowItem
              key={e.movieId}
              movie={e.movie}
              actions={
                tab === 'watchlist' ? (
                  <>
                    <Button className="px-3 py-1.5" onClick={() => void act(() => updateUserMovie(userId, e.movieId, { watched: true, watchlist: false }))}>
                      {t('list.markWatched')}
                    </Button>
                    <Button variant="ghost" className="px-3 py-1.5" onClick={() => void act(() => updateUserMovie(userId, e.movieId, { watchlist: false }))}>
                      {t('list.remove')}
                    </Button>
                  </>
                ) : tab === 'watched' ? (
                  <>
                    {([1, -1] as const).map((s) => (
                      <Button
                        key={s}
                        className="px-3 py-1.5"
                        aria-pressed={e.sentiment === s}
                        variant={e.sentiment === s ? 'quiet' : 'ghost'}
                        onClick={() => void act(() => updateUserMovie(userId, e.movieId, { sentiment: e.sentiment === s ? 0 : s }))}
                      >
                        {t(s === 1 ? 'fb.liked' : 'fb.disliked')}
                      </Button>
                    ))}
                    <Button variant="ghost" className="px-3 py-1.5" onClick={() => void act(() => updateUserMovie(userId, e.movieId, { watched: false, sentiment: 0, tags: [] }))}>
                      {t('list.remove')}
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" className="px-3 py-1.5" onClick={() => void act(() => updateUserMovie(userId, e.movieId, { notInterested: false }))}>
                    {t('list.remove')}
                  </Button>
                )
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
