// Uma lista personalizada (DEC-045): nome, descrição, filmes; editar, excluir e remover filmes.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Movie } from '../../../core/schemas.ts';
import { listErrorKey } from '../components/ListPicker.tsx';
import { MovieRowItem } from '../components/MovieCard.tsx';
import { RowListSkeleton } from '../components/Skeletons.tsx';
import { Button, ErrorState } from '../components/ui.tsx';
import { deleteList, getList, removeFromList, updateList, type UserList } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';

type Data = { list: Omit<UserList, 'count' | 'covers'>; movies: Movie[] };

export default function ListDetail() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getList(id));
    } catch {
      setData(null);
    }
  }, [id]);
  useEffect(() => {
    setData(undefined);
    void load();
  }, [load]);

  if (data === undefined) return <RowListSkeleton count={4} />;
  if (data === null) {
    return (
      <div className="max-w-4xl space-y-4">
        <ErrorState message={t('lists.notFound')} />
        <Link to="/list" className="text-sm text-fog underline underline-offset-4 hover:text-paper">{t('lists.back')}</Link>
      </div>
    );
  }
  const { list, movies } = data;

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateList(list.id, { name, description });
      setEditing(false);
      await load();
    } catch (err) {
      setError(t(listErrorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(t('lists.deleteConfirm', { name: list.name }))) return;
    setBusy(true);
    try {
      await deleteList(list.id);
      navigate('/list', { replace: true });
    } catch (err) {
      setError(t(listErrorKey(err)));
      setBusy(false);
    }
  }

  const field = 'w-full rounded-xl bg-graphite px-4 py-3 text-paper ring-1 ring-matte placeholder:text-fog/70 focus:ring-ember/60 focus:outline-none';
  return (
    <div className="reveal max-w-4xl">
      <Link to="/list" className="text-sm text-fog hover:text-paper">← {t('lists.back')}</Link>
      {editing ? (
        <form onSubmit={(e) => void save(e)} className="mt-6 space-y-3 rounded-2xl bg-graphite/40 p-5 ring-1 ring-matte">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required aria-label={t('lists.namePlaceholder')} placeholder={t('lists.namePlaceholder')} className={`${field} font-display text-2xl uppercase`} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} rows={2} aria-label={t('lists.descPlaceholder')} placeholder={t('lists.descPlaceholder')} className={field} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={busy}>{t('lists.save')}</Button>
            <Button type="button" onClick={() => setEditing(false)} disabled={busy}>{t('lists.cancel')}</Button>
          </div>
        </form>
      ) : (
        <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-4xl font-extrabold break-words text-paper uppercase sm:text-6xl">{list.name}</h1>
            {list.description && <p className="mt-2 max-w-[60ch] text-fog">{list.description}</p>}
            <p className="mt-2 text-sm text-fog">{movies.length === 1 ? t('lists.countOne') : t('lists.count', { n: movies.length })}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => { setName(list.name); setDescription(list.description ?? ''); setEditing(true); }}>{t('lists.edit')}</Button>
            <Button variant="ghost" onClick={() => void remove()} disabled={busy}>{t('lists.delete')}</Button>
          </div>
        </header>
      )}
      {error && <p role="alert" className="mt-4 text-sm text-signal-red">{error}</p>}

      <div className="mt-8">
        {movies.length === 0 ? (
          <p className="text-fog">{t('lists.empty')}</p>
        ) : (
          <ul>
            {movies.map((m) => (
              <MovieRowItem
                key={m.id}
                movie={m}
                actions={
                  <Button className="px-3 py-1.5" onClick={() => void removeFromList(list.id, m.id).then(load).catch((err) => setError(t(listErrorKey(err))))}>
                    {t('list.remove')}
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
