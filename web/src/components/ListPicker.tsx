// "+ Lista": adiciona/remove o filme das listas personalizadas do usuário (DEC-045) e cria lista nova na hora.
// Painel no mesmo estilo dos menus do app; fecha com Esc (devolvendo o foco) ou clique fora.
// Renderizado num portal com posição fixa: os cards têm overflow-hidden e cortariam um painel absoluto.
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, addToList, createList, listMyLists, listsContaining, removeFromList, type UserList } from '../lib/api.ts';
import { useI18n, type MessageKey } from '../lib/i18n.tsx';
import { useUser } from '../lib/session.tsx';

export function listErrorKey(e: unknown): MessageKey {
  return (e instanceof ApiError && e.code.startsWith('list_') ? `error.${e.code}` : 'error.generic') as MessageKey;
}

export function ListPicker({ movieId, className = '', align = 'left' }: { movieId: string; className?: string; align?: 'left' | 'right' }) {
  const { t } = useI18n();
  const { userId } = useUser();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<UserList[] | null>(null);
  const [member, setMember] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<CSSProperties>({});

  // Abaixo do botão; acima dele se não couber; alinhado à esquerda/direita sem sair da tela.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = trigger.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(288, window.innerWidth - 40);
      let left = align === 'right' ? r.right - width : r.left;
      left = Math.max(20, Math.min(left, window.innerWidth - width - 20));
      const below = window.innerHeight - r.bottom;
      const panelH = panel.current?.offsetHeight ?? 320;
      const top = below < panelH + 16 && r.top > panelH + 16 ? r.top - panelH - 8 : r.bottom + 8;
      setPos({ position: 'fixed', top, left, width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align, lists]);

  // O painel fica fora da ordem de tabulação do botão (portal): leva o foco para ele ao abrir.
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    Promise.all([listMyLists(), listsContaining(movieId)])
      .then(([l, m]) => {
        if (cancelled) return;
        setLists(l);
        setMember(m);
      })
      .catch((e) => !cancelled && setError(t(listErrorKey(e))));
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!root.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => {
      cancelled = true;
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, movieId, t]);

  async function toggle(list: UserList) {
    setBusy(list.id);
    setError(null);
    const has = member.has(list.id);
    try {
      if (has) await removeFromList(list.id, movieId);
      else await addToList(list.id, movieId);
      const next = new Set(member);
      if (has) next.delete(list.id);
      else next.add(list.id);
      setMember(next);
      setLists((ls) => ls?.map((l) => (l.id === list.id ? { ...l, count: l.count + (has ? -1 : 1) } : l)) ?? null);
    } catch (e) {
      setError(t(listErrorKey(e)));
    } finally {
      setBusy(null);
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy('new');
    setError(null);
    try {
      const id = await createList(userId, name);
      await addToList(id, movieId);
      setLists(await listMyLists());
      setMember((m) => new Set(m).add(id));
      setName('');
    } catch (err) {
      setError(t(listErrorKey(err)));
    } finally {
      setBusy(null);
    }
  }

  const count = member.size;
  return (
    <div
      ref={root}
      className={`relative z-20 ${className}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ring-1 transition-colors ${open || count > 0 ? 'text-paper ring-ember/60' : 'text-fog ring-matte hover:text-paper hover:ring-fog/40'}`}
      >
        {t('lists.add')}
        {open && count > 0 && <span className="rounded-full bg-ember/20 px-1.5 text-xs text-ember">{count}</span>}
      </button>
      {open &&
        createPortal(
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-label={t('lists.addTo')}
          style={pos}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              trigger.current?.focus();
            }
          }}
          className="list-picker-panel z-50 rounded-2xl outline-none bg-graphite/95 p-2 text-left shadow-[0_18px_50px_#000a] ring-1 ring-matte backdrop-blur"
        >
          <p className="px-3 pt-2 pb-1 text-xs tracking-wider text-fog uppercase">{t('lists.addTo')}</p>
          {lists === null && !error ? (
            <p className="px-3 py-3 text-sm text-fog" role="status">{t('lists.loading')}</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {(lists ?? []).map((l) => (
                <li key={l.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm text-paper hover:bg-matte/70">
                    <input
                      type="checkbox"
                      checked={member.has(l.id)}
                      disabled={busy !== null}
                      onChange={() => void toggle(l)}
                      className="size-4 accent-ember"
                    />
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    <span className="shrink-0 text-xs text-fog">{l.count}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={(e) => void create(e)} className="mt-1 flex gap-2 border-t border-matte p-2 pt-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder={t('lists.namePlaceholder')}
              aria-label={t('lists.new')}
              className="min-w-0 flex-1 rounded-xl bg-ink/60 px-3 py-2 text-sm text-paper ring-1 ring-matte placeholder:text-fog/70 focus:ring-ember/60 focus:outline-none"
            />
            <button type="submit" disabled={busy !== null || !name.trim()} className="shrink-0 rounded-xl bg-ember px-3 py-2 text-sm font-medium text-ink disabled:opacity-40">
              {t('lists.create')}
            </button>
          </form>
          {error && <p role="alert" className="px-3 pb-2 text-sm text-signal-red">{error}</p>}
        </div>,
          document.body,
        )}
    </div>
  );
}
