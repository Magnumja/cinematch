// Estado "salvo" e envio de feedback, compartilhado pelas telas que mostram recomendações.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FeedbackTag } from '../../../core/schemas.ts';
import { giveFeedback, listUserMovies, updateUserMovie, type Feedback, type RecItem, type UserMovieEntry } from './api.ts';
import { useUser } from './session.tsx';

export function useMovieActions() {
  const { userId } = useUser();
  const [entries, setEntries] = useState<UserMovieEntry[]>([]);
  // Distingue "ainda carregando" de "lista vazia" (sem isso, Minha lista piscava "nada aqui" ao abrir).
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    setEntries(await listUserMovies(userId));
    setLoaded(true);
  }, [userId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saved = useMemo(() => new Set(entries.filter((e) => e.watchlist).map((e) => e.movieId)), [entries]);

  const toggleSave = useCallback(
    async (movieId: string) => {
      await updateUserMovie(userId, movieId, { watchlist: !saved.has(movieId) });
      await refresh();
    },
    [userId, refresh, saved],
  );

  // Salvar um filme recomendado conta como aceitação no log (métrica do MVP, DEC-005).
  const saveFromRec = useCallback(
    async (item: RecItem) => {
      const willSave = !saved.has(item.movieId);
      if (willSave) await giveFeedback(userId, item, 'want');
      else await updateUserMovie(userId, item.movieId, { watchlist: false });
      await refresh();
    },
    [userId, refresh, saved],
  );

  const feedback = useCallback(
    async (item: RecItem, f: Feedback, tags: FeedbackTag[]) => {
      await giveFeedback(userId, item, f);
      if (f === 'liked' || f === 'disliked') await updateUserMovie(userId, item.movieId, { tags });
      await refresh();
    },
    [userId, refresh],
  );

  return { entries, loaded, saved, toggleSave, saveFromRec, feedback, refresh };
}
