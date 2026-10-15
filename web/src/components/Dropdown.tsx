// Dropdown com a identidade visual do Cineou (grafite, ember, Big Shoulders nos rótulos).
// Padrão WAI-ARIA "select-only": botão com aria-haspopup="listbox" abre uma lista que recebe o foco
// e indica a opção ativa por aria-activedescendant. Sem bibliotecas: só React e Tailwind.
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useI18n } from '../lib/i18n.tsx';

export type DropdownOption<T> = { value: T; label: string; hint?: string };

type Tone = 'on' | 'negative';

// Item já resolvido para a lista (inclui o "Qualquer" do Dropdown simples).
type Row = { key: string; label: string; hint?: string; selected: boolean; disabled?: boolean };

const TONE = {
  on: { check: 'text-ember', box: 'bg-ember ring-ember text-ink', ring: 'ring-ember/60', badge: 'bg-ember/15 text-ember' },
  negative: { check: 'text-signal-red', box: 'bg-signal-red ring-signal-red text-paper', ring: 'ring-signal-red/55', badge: 'bg-signal-red/15 text-signal-red' },
} satisfies Record<Tone, Record<string, string>>;

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={`size-4 shrink-0 text-fog transition-transform duration-200 ease-(--ease-calm) motion-reduce:transition-none ${open ? 'rotate-180 text-paper' : ''}`}
    >
      <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={`size-4 shrink-0 ${className}`}>
      <path d="M4.5 10.5 8.5 14.5 15.5 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Base compartilhada: abrir/fechar, teclado, clique fora e posicionamento do painel.
function DropdownBase({
  label,
  summary,
  isEmpty,
  highlight,
  rows,
  multi,
  tone,
  count,
  initialActive,
  onPick,
  footer,
}: {
  label: string;
  summary: string;
  isEmpty: boolean;
  // Contorno colorido quando o campo restringe algo (um filtro ativo).
  highlight: boolean;
  rows: Row[];
  multi: boolean;
  tone: Tone;
  count?: number;
  initialActive: number;
  onPick: (index: number) => void;
  footer?: (close: () => void) => ReactNode;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<{ up: boolean; right: boolean; maxHeight: number }>({ up: false, right: false, maxHeight: 288 });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: '', at: 0 });

  function openAt(index: number) {
    setActive(Math.max(0, Math.min(rows.length - 1, index)));
    setOpen(true);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  // Ao abrir, o foco vai para a lista (o botão mantém aria-expanded=true).
  useEffect(() => {
    if (open) listRef.current?.focus({ preventScroll: true });
  }, [open]);

  // Mantém a opção ativa visível ao navegar com as setas.
  useEffect(() => {
    if (!open) return;
    document.getElementById(`${id}-opt-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, id]);

  // Clique (ou toque) fora fecha sem roubar o foco do que foi clicado.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  // O painel nunca sai da tela: abre para cima se faltar espaço embaixo e alinha à direita
  // se passar da borda. A altura máxima acompanha o espaço disponível (rolagem interna).
  useLayoutEffect(() => {
    if (!open || !rootRef.current || !panelRef.current) return;
    const margin = 16;
    const box = rootRef.current.getBoundingClientRect();
    const width = panelRef.current.offsetWidth;
    // "Moldura" do painel = padding + rodapé (Limpar/Concluir); a lista rola, a moldura não.
    const chrome = panelRef.current.offsetHeight - (listRef.current?.offsetHeight ?? 0);
    const gap = 8; // mt-2 / mb-2
    const below = window.innerHeight - box.bottom - margin - gap - chrome;
    const above = box.top - margin - gap - chrome; // abre acima do rótulo (topo do componente)
    const up = below < 200 && above > below;
    const right = box.left + width > window.innerWidth - margin && box.right - width >= margin;
    setPlacement({ up, right, maxHeight: Math.max(132, Math.min(288, up ? above : below)) });
  }, [open]);

  function onButtonKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openAt(e.key === 'ArrowUp' && initialActive === 0 ? rows.length - 1 : initialActive);
    }
  }

  function pick(index: number) {
    const row = rows[index];
    if (!row || row.disabled) return;
    onPick(index);
    if (!multi) close(true);
  }

  function onListKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    const last = rows.length - 1;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => Math.min(last, i + 1));
        return;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        return;
      case 'Home':
        e.preventDefault();
        setActive(0);
        return;
      case 'End':
        e.preventDefault();
        setActive(last);
        return;
      case 'Enter':
      case ' ':
        e.preventDefault();
        pick(active);
        return;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close(true);
        return;
      case 'Tab':
        // No multi, Tab segue para o "Limpar" do painel; o focusout fecha ao sair do componente.
        // Nos demais casos fecha e devolve o foco ao botão: a navegação do Tab continua a partir dele.
        if (multi && !e.shiftKey && footer) return;
        close(true);
        return;
      default:
        // Digitar letras pula para a primeira opção com esse começo.
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const now = Date.now();
          const t = typeahead.current;
          t.text = now - t.at > 600 ? e.key.toLowerCase() : t.text + e.key.toLowerCase();
          t.at = now;
          const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
          const found = rows.findIndex((r) => norm(r.label).startsWith(norm(t.text)));
          if (found >= 0) setActive(found);
        }
    }
  }

  const tones = TONE[tone];

  return (
    <div
      ref={rootRef}
      className="relative min-w-0"
      onBlur={(e) => {
        // Foco saiu do componente inteiro (Tab a partir do "Limpar", por exemplo): fecha.
        if (open && !rootRef.current?.contains(e.relatedTarget as Node | null) && e.relatedTarget) setOpen(false);
      }}
    >
      <span id={labelId} className="block text-sm text-fog">
        {label}
      </span>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={() => (open ? close(false) : openAt(initialActive))}
        onKeyDown={onButtonKeyDown}
        className={`mt-1.5 flex min-h-12 w-full items-center justify-between gap-2 rounded-xl bg-graphite py-3 pr-3 pl-4 text-left ring-1 transition-[box-shadow,background-color] duration-200 ease-(--ease-calm) hover:bg-matte/60 focus-visible:ring-2 focus-visible:ring-ember focus-visible:outline-none disabled:cursor-not-allowed disabled:hover:bg-graphite ${
          open ? 'ring-fog/50' : highlight ? tones.ring : 'ring-matte'
        }`}
      >
        <span id={valueId} className={`min-w-0 truncate ${isEmpty ? 'text-fog' : 'text-paper'}`}>
          {summary}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {count !== undefined && count > 0 && (
            <span aria-hidden="true" className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${tones.badge}`}>
              {count}
            </span>
          )}
          <Chevron open={open} />
        </span>
      </button>

      {/* A lista existe sempre no DOM (oculta quando fechada) para que aria-controls aponte para algo real. */}
      <div
        ref={panelRef}
        hidden={!open}
        onMouseDown={(e) => e.preventDefault() /* mantém o foco na lista ao clicar no painel */}
        className={`menu-reveal absolute z-40 w-max max-w-[calc(100vw-2rem)] min-w-full overflow-hidden rounded-2xl bg-graphite/95 p-1.5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] ring-1 ring-matte backdrop-blur-md ${
          placement.up ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2'
        } ${placement.right ? 'right-0' : 'left-0'}`}
      >
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelId}
          aria-multiselectable={multi || undefined}
          aria-activedescendant={open ? optionId(active) : undefined}
          onKeyDown={onListKeyDown}
          // O foco fica na lista, mas o indicador visível é a opção ativa (bg-matte); sem contorno duplicado.
          style={{ maxHeight: placement.maxHeight, outline: 'none' }}
          className="overflow-y-auto overscroll-contain focus:outline-none"
        >
          {rows.map((row, i) => (
            <li
              key={row.key}
              id={optionId(i)}
              role="option"
              aria-selected={row.selected}
              aria-disabled={row.disabled || undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(i)}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors duration-150 select-none aria-disabled:cursor-not-allowed aria-disabled:opacity-40 ${
                i === active ? 'bg-matte' : ''
              } ${row.selected ? 'text-paper' : 'text-paper/75'}`}
            >
              {multi ? (
                <span
                  aria-hidden="true"
                  className={`grid size-4.5 shrink-0 place-items-center rounded-[5px] ring-1 transition-colors duration-150 ${row.selected ? tones.box : 'ring-fog/50'}`}
                >
                  {row.selected && <CheckIcon className="size-3.5" />}
                </span>
              ) : (
                <span aria-hidden="true" className="w-4 shrink-0">
                  {row.selected && <CheckIcon className={tones.check} />}
                </span>
              )}
              <span className="min-w-0 flex-1 break-words">{row.label}</span>
              {row.hint && <span className="shrink-0 text-xs text-fog">{row.hint}</span>}
            </li>
          ))}
        </ul>
        {footer?.(() => close(true))}
      </div>
    </div>
  );
}

// Seleção única. Com allowClear, a primeira opção é o "Qualquer" (valor null).
export function Dropdown<T extends string | number>({
  label,
  value,
  options,
  onChange,
  placeholder,
  allowClear = true,
}: {
  label: string;
  value: T | null;
  options: DropdownOption<T>[];
  onChange: (v: T | null) => void;
  placeholder: string;
  allowClear?: boolean;
}) {
  const rows: Row[] = [
    ...(allowClear ? [{ key: '__any', label: placeholder, selected: value === null }] : []),
    ...options.map((o) => ({ key: String(o.value), label: o.label, hint: o.hint, selected: o.value === value })),
  ];
  const offset = allowClear ? 1 : 0;
  const current = options.find((o) => o.value === value);
  const selectedIndex = rows.findIndex((r) => r.selected);
  return (
    <DropdownBase
      label={label}
      summary={current?.label ?? placeholder}
      isEmpty={!current}
      highlight={allowClear && !!current}
      rows={rows}
      multi={false}
      tone="on"
      initialActive={Math.max(0, selectedIndex)}
      onPick={(i) => onChange(i < offset ? null : options[i - offset]!.value)}
    />
  );
}

// Seleção múltipla com marcação por opção. tone="negative" marca em signal-red (ex.: "Hoje não").
export function MultiDropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  max,
  tone = 'on',
}: {
  label: string;
  value: T[];
  options: DropdownOption<T>[];
  onChange: (v: T[]) => void;
  placeholder: string;
  max?: number;
  tone?: Tone;
}) {
  const { t } = useI18n();
  const full = max !== undefined && value.length >= max;
  const rows: Row[] = options.map((o) => {
    const selected = value.includes(o.value);
    return { key: o.value, label: o.label, hint: o.hint, selected, disabled: !selected && full };
  });
  // Resumo na ordem em que o usuário escolheu: "Ação, Comédia +2".
  const labels = value.map((v) => options.find((o) => o.value === v)?.label ?? v);
  const summary = labels.length === 0 ? placeholder : labels.slice(0, 2).join(', ') + (labels.length > 2 ? ` +${labels.length - 2}` : '');
  const firstSelected = rows.findIndex((r) => r.selected);

  return (
    <DropdownBase
      label={label}
      summary={summary}
      isEmpty={value.length === 0}
      highlight={value.length > 0}
      rows={rows}
      multi
      tone={tone}
      count={value.length}
      initialActive={Math.max(0, firstSelected)}
      onPick={(i) => {
        const v = options[i]!.value;
        onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
      }}
      footer={(close) => (
        <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-matte px-2 pt-1.5">
          <span className="text-xs text-fog tabular-nums">{max !== undefined ? `${value.length}/${max}` : value.length > 0 ? String(value.length) : ''}</span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={value.length === 0}
              onClick={() => onChange([])}
              className="min-h-11 rounded-full px-3 text-sm text-fog transition-colors duration-150 hover:text-paper focus-visible:ring-2 focus-visible:ring-ember focus-visible:outline-none disabled:opacity-40"
            >
              {t('dropdown.clear')}
            </button>
            <button
              type="button"
              onClick={close}
              className="min-h-11 rounded-full px-3 text-sm font-medium text-paper transition-colors duration-150 hover:text-ember focus-visible:ring-2 focus-visible:ring-ember focus-visible:outline-none"
            >
              {t('dropdown.done')}
            </button>
          </div>
        </div>
      )}
    />
  );
}
