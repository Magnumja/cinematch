// Peças pequenas e reutilizáveis da interface.
import { GlowButton } from './unlumen-ui/GlowButton.tsx';
import { useEffect, useRef, useState, type AnimationEvent, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { GENRE_HUES, GENRE_LABELS, type Genre } from '../../../core/domain/genres.ts';
import type { Movie, Relaxable } from '../../../core/schemas.ts';
import { useI18n } from '../lib/i18n.tsx';

// Luz ambiente: muda a matiz do fundo para a do gênero principal do filme em foco.
// Funciona com hover E foco de teclado (os cards chamam isso em onFocus/onMouseEnter).
const DEFAULT_HUE = 24;
export function setAmbient(movie: Pick<Movie, 'genres'> | null) {
  const genre = movie?.genres[0] as Genre | undefined;
  document.documentElement.style.setProperty('--ambient-hue', String(genre ? GENRE_HUES[genre] : DEFAULT_HUE));
}

type Variant = 'primary' | 'quiet' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-ember text-ink hover:bg-[#f59a4c] active:bg-ember-deep',
  quiet: 'bg-graphite text-paper ring-1 ring-matte hover:ring-fog/50 active:bg-matte aria-pressed:bg-ember/15 aria-pressed:ring-ember/70',
  ghost: 'text-fog hover:text-paper aria-pressed:text-paper aria-pressed:ring-1 aria-pressed:ring-ember/70',
  danger: 'text-signal-red ring-1 ring-signal-red/40 hover:bg-signal-red/10',
};

// Pulse once when a toggle turns on, never when it mounts already pressed (e.g. a saved film).
export function useConfirmPulse(pressed: boolean) {
  const was = useRef(pressed);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (pressed !== was.current) setConfirm(pressed);
    was.current = pressed;
  }, [pressed]);
  return {
    'data-confirm': confirm || undefined,
    onAnimationEnd: (e: AnimationEvent<HTMLButtonElement>) => { if (e.target === e.currentTarget) setConfirm(false); },
  };
}

export function Button({ variant = 'quiet', className = '', onAnimationEnd, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const Component = variant === 'primary' ? GlowButton : 'button';
  const pulse = useConfirmPulse(props['aria-pressed'] === true || props['aria-pressed'] === 'true');
  return (
    <Component
      {...props}
      data-confirm={pulse['data-confirm']}
      onAnimationEnd={e => { pulse.onAnimationEnd(e); onAnimationEnd?.(e); }}
      className={`motion-button inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-200 ease-(--ease-calm) active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}

export type ChipState = 'off' | 'on' | 'negative';

export function GenreChip({ genre, state, onClick, labels }: { genre: Genre; state: ChipState; onClick: () => void; labels?: { on: string; negative: string } }) {
  const { locale } = useI18n();
  const style =
    state === 'on'
      ? 'bg-ember/15 text-paper ring-ember/70'
      : state === 'negative'
        ? 'bg-signal-red/10 text-fog line-through decoration-signal-red/70 ring-signal-red/40'
        : 'text-fog ring-matte hover:text-paper hover:ring-fog/40';
  const stateLabel = state === 'on' ? labels?.on : state === 'negative' ? labels?.negative : undefined;
  const pulse = useConfirmPulse(state !== 'off');
  return (
    <button
      type="button"
      {...pulse}
      onClick={onClick}
      aria-pressed={state !== 'off'}
      aria-label={stateLabel ? `${GENRE_LABELS[genre][locale]}: ${stateLabel}` : GENRE_LABELS[genre][locale]}
      className={`motion-chip min-h-11 rounded-full px-3.5 py-1.5 text-sm ring-1 transition-colors duration-200 ${style}`}
    >
      {GENRE_LABELS[genre][locale]}
    </button>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 className="text-lg font-medium text-paper">{children}</h2>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="rounded-2xl bg-graphite/70 p-6 ring-1 ring-matte">
      <p className="text-paper">{message}</p>
      {onRetry && (
        <Button className="mt-4" onClick={onRetry}>
          {t('error.retry')}
        </Button>
      )}
    </div>
  );
}

// Nenhum filme passou nos filtros: explica e deixa o usuário escolher o que liberar (nunca automático).
export function NoMatch({ relaxations, onRelax, disabled = false }: {
  relaxations: { constraint: Relaxable; wouldMatch: number }[];
  onRelax: (c: Relaxable) => void;
  disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const fmt = new Intl.NumberFormat(locale === 'pt' ? 'pt-BR' : 'en');
  return (
    <div className="rounded-2xl bg-graphite/70 p-6 ring-1 ring-matte sm:p-8">
      <p className="font-display text-3xl font-semibold tracking-tight text-paper">{t('empty.title')}</p>
      {relaxations.length > 0 ? (
        <>
          <p className="mt-3 max-w-prose text-fog">{t('empty.body')}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {relaxations.map((r) => (
              <Button key={r.constraint} disabled={disabled} onClick={() => onRelax(r.constraint)}>
                {t(`relax.${r.constraint}`)}
                <span className="text-fog">{t('relax.count', { n: fmt.format(r.wouldMatch) })}</span>
              </Button>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 text-fog">{t('empty.none')}</p>
      )}
    </div>
  );
}

export function PageHeader({ title, intro }: { title: string; intro?: string }) {
  return (
    <header className="mb-8 max-w-2xl">
      <h1 className="font-display text-5xl font-bold tracking-tight text-paper sm:text-6xl">{title}</h1>
      {intro && <p className="mt-3 text-fog">{intro}</p>}
    </header>
  );
}
