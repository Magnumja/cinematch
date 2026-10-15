// Minha lista: listas personalizadas do usuário (DEC-045) no topo; abaixo, as do sistema — salvos,
// assistidos (com avaliação editável) e filmes marcados como sem interesse.
import { RowListSkeleton } from '../components/Skeletons.tsx';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { listErrorKey } from '../components/ListPicker.tsx';
import { tmdbImage } from '../components/Poster.tsx';
import { MovieRowItem } from '../components/MovieCard.tsx';
import { Button, PageHeader } from '../components/ui.tsx';
import { createList, listMyLists, updateUserMovie, type UserList, type UserMovieEntry } from '../lib/api.ts';
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
      <MyLists />
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

// Grade de listas personalizadas: capa com até 4 pôsteres, nome e contagem; cartão para criar lista nova.
function MyLists() {
  const { t } = useI18n();
  const { userId } = useUser();
  const [lists, setLists] = useState<UserList[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listMyLists().then(setLists).catch(() => setLists([]));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createList(userId, name, description);
      setLists(await listMyLists());
      setCreating(false);
      setName('');
      setDescription('');
    } catch (err) {
      setError(t(listErrorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full rounded-xl bg-ink/60 px-3 py-2 text-sm text-paper ring-1 ring-matte placeholder:text-fog/70 focus:ring-ember/60 focus:outline-none';
  return (
    <section aria-labelledby="my-lists" className="mb-12">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="my-lists" className="font-display text-3xl font-bold text-paper uppercase">{t('lists.title')}</h2>
          <p className="mt-1 text-sm text-fog">{t('lists.intro')}</p>
        </div>
        {!creating && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            + {t('lists.new')}
          </Button>
        )}
      </div>

      {creating && (
        <form onSubmit={(e) => void create(e)} className="reveal mb-4 grid gap-2 rounded-2xl bg-graphite/50 p-4 ring-1 ring-matte sm:grid-cols-[1fr_1.4fr_auto]">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required placeholder={t('lists.namePlaceholder')} aria-label={t('lists.namePlaceholder')} className={field} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} placeholder={t('lists.descPlaceholder')} aria-label={t('lists.descPlaceholder')} className={field} />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={busy || !name.trim()}>{t('lists.create')}</Button>
            <Button type="button" onClick={() => { setCreating(false); setError(null); }}>{t('lists.cancel')}</Button>
          </div>
          {error && <p role="alert" className="text-sm text-signal-red sm:col-span-3">{error}</p>}
        </form>
      )}

      {lists === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-matte/40" />)}
        </div>
      ) : lists.length === 0 ? (
        !creating && <p className="text-fog">{t('lists.emptyAll')}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {lists.map((l) => (
            <li key={l.id}>
              <Link to={`/lists/${l.id}`} className="group block rounded-2xl p-2 ring-1 ring-matte transition-colors hover:bg-graphite/60 hover:ring-fog/30 focus-visible:ring-ember">
                {/* Capa: até 4 pôsteres sobrepostos (o mais recente na frente); sem filmes, um quadro vazio. */}
                <div className="relative flex aspect-[16/10] items-center overflow-hidden rounded-xl bg-gradient-to-br from-graphite to-ink px-3">
                  {l.covers.length === 0 ? (
                    <span aria-hidden="true" className="mx-auto font-display text-4xl text-matte">+</span>
                  ) : (
                    l.covers.map((path, i) => (
                      <img
                        key={path}
                        src={tmdbImage(path, 'w185') ?? undefined}
                        alt=""
                        loading="lazy"
                        style={{ zIndex: 10 - i }}
                        className={`aspect-[2/3] h-[82%] rounded-md object-cover shadow-[4px_0_14px_#000c] ring-1 ring-paper/10 transition-transform duration-300 group-hover:-translate-y-1 ${i > 0 ? '-ml-[14%]' : ''}`}
                      />
                    ))
                  )}
                </div>
                <p className="mt-2 truncate px-1 font-display text-xl font-bold text-paper uppercase">{l.name}</p>
                <p className="px-1 pb-1 text-xs text-fog">{l.count === 1 ? t('lists.countOne') : t('lists.count', { n: l.count })}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
