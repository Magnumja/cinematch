import { AnimatedInput } from '../components/AnimatedInput.tsx';
// Assistente (Modo B): o pedido em texto vira filtros; o motor escolhe entre filmes reais.
// A conversa fica só na sessão do navegador: não há tabela de conversas no MVP (DEC-020).
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { GENRE_LABELS } from '../../../core/domain/genres.ts';
import type { ContextInput, Relaxable } from '../../../core/schemas.ts';
import { CompactCard } from '../components/MovieCard.tsx';
import { Button, NoMatch, PageHeader, Skeleton } from '../components/ui.tsx';
import { ApiError, askAssistant, relaxToContext, requestRecommendation, type AssistantReply, type RecView } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { useMovieActions } from '../lib/useMovieActions.ts';

type Reply = AssistantReply | { kind: 'error'; message: string };

interface Turn {
  id: number;
  question: string;
  reply: Reply;
}

function Interpreted({ ctx }: { ctx: ContextInput }) {
  const { t, locale } = useI18n();
  const parts: string[] = [];
  for (const g of ctx.preferGenres ?? []) parts.push(GENRE_LABELS[g][locale]);
  for (const g of ctx.avoidGenres ?? []) parts.push(`${t('discover.avoid')}: ${GENRE_LABELS[g][locale]}`);
  const c = ctx.constraints ?? {};
  if (c.maxRuntimeMin) parts.push(`≤ ${t('common.minutes', { n: c.maxRuntimeMin })}`);
  if (c.minRuntimeMin) parts.push(`≥ ${t('common.minutes', { n: c.minRuntimeMin })}`);
  if (c.minRating) parts.push(`${t('profile.minRating')} ${c.minRating}+`);
  if (c.minYear || c.maxYear) parts.push(`${c.minYear ?? '…'}–${c.maxYear ?? '…'}`);
  if (c.languages?.length) parts.push(c.languages.join(', ').toUpperCase());
  if (ctx.mode === 'explore') parts.push(t('discover.explore'));
  if (parts.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-fog">{t('assistant.understood')}</span>
      {parts.map((p) => (
        <span key={p} className="rounded-full px-3 py-1 text-paper ring-1 ring-matte">
          {p}
        </span>
      ))}
    </div>
  );
}

export default function Assistant() {
  const { t } = useI18n();
  const { saved, saveFromRec } = useMovieActions();
  const [message, setMessage] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [disabled, setDisabled] = useState(false);

  // O servidor aceita até 500 ids; mandamos só os 300 mais recentes (turnos ficam em ordem decrescente).
  const shownIds = turns.flatMap((turn) => (turn.reply.kind === 'recommendation' ? turn.reply.view.items.map((i) => i.movieId) : [])).slice(0, 300);
  const push = (question: string, reply: Reply) => setTurns((ts) => [{ id: Date.now(), question, reply }, ...ts]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const question = message.trim();
    if (question.length < 3) return;
    setBusy(true);
    try {
      push(question, await askAssistant(question, shownIds));
      setMessage('');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'network_error';
      if (code === 'assistant_disabled') setDisabled(true);
      else push(question, { kind: 'error', message: code === 'daily_limit_reached' ? t('assistant.limit') : t('assistant.busy') });
    } finally {
      setBusy(false);
    }
  }

  // Liberar uma restrição reaproveita os filtros já interpretados: não chama a LLM de novo.
  async function relax(turn: Turn & { reply: { kind: 'recommendation' } }, c: Relaxable) {
    setBusy(true);
    try {
      const ctx = turn.reply.interpreted;
      const nextCtx: ContextInput = { ...ctx, constraints: { ...ctx.constraints, ...relaxToContext(c) }, excludeMovieIds: shownIds };
      const view: RecView = await requestRecommendation('assistant', nextCtx, 5, turn.reply.similarTo?.id);
      push(`${turn.question} (${t(`relax.${c}`).toLowerCase()})`, { ...turn.reply, interpreted: nextCtx, view });
    } catch {
      push(turn.question, { kind: 'error', message: t('error.generic') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <PageHeader title={t('assistant.title')} intro={t('assistant.intro')} />

      {disabled ? (
        <div className="rounded-2xl bg-graphite/60 p-6 ring-1 ring-matte" role="status">
          <p className="text-paper">{t('assistant.disabled')}</p>
          <Link to="/discover" className="mt-4 inline-flex rounded-full bg-ember px-4 py-2 text-sm font-medium text-ink">
            {t('nav.discover')}
          </Link>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="assistant-input">
            {t('assistant.placeholder')}
          </label>
          <AnimatedInput
            id="assistant-input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            placeholder={t('assistant.placeholder')}
            className="flex-1 rounded-full bg-graphite px-5 py-3.5 text-paper ring-1 ring-matte placeholder:text-fog/70 focus:ring-fog/50 focus:outline-none"
          />
          <Button type="submit" variant="primary" disabled={busy || message.trim().length < 3} className="px-6 py-3.5">
            {t('assistant.send')}
          </Button>
        </form>
      )}

      <div className="mt-12 space-y-14" aria-live="polite">
        {busy && <Skeleton className="h-40" />}
        {turns.map((turn) => (
          <section key={turn.id} className="reveal space-y-5">
            <p className="font-display text-3xl font-bold text-paper">“{turn.question}”</p>
            {turn.reply.kind === 'error' && <p className="text-fog">{turn.reply.message}</p>}
            {turn.reply.kind === 'off_topic' && <p className="text-fog">{t('assistant.offTopic')}</p>}
            {turn.reply.kind === 'clarify' && <p className="text-lg text-paper">{turn.reply.question}</p>}
            {turn.reply.kind === 'recommendation' && (
              <>
                <Interpreted ctx={turn.reply.interpreted} />
                {turn.reply.similarToNotFound && <p className="text-sm text-fog">{t('assistant.similarNotFound', { title: turn.reply.similarToNotFound })}</p>}
                {turn.reply.view.items.length === 0 ? (
                  <NoMatch relaxations={turn.reply.view.relaxations} onRelax={(c) => void relax(turn as Turn & { reply: { kind: 'recommendation' } }, c)} />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {turn.reply.view.items.map((item) => {
                      const view = (turn.reply as { view: RecView }).view;
                      const m = view.movies.get(item.movieId);
                      return m ? <CompactCard key={item.movieId} item={item} movie={m} movies={view.movies} saved={saved.has(item.movieId)} onSave={() => void saveFromRec(item)} /> : null;
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
