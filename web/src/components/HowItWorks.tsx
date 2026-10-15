// Explicação de como o app decide: uma linha fechada por padrão (o filme vem primeiro); abre os detalhes ao clicar.
import { useState } from 'react';
import { useI18n } from '../lib/i18n.tsx';

const STEPS = [1, 2, 3] as const;
const TIERS = [
  { tier: 'high', dot: 'bg-ember' },
  { tier: 'good', dot: 'bg-signal-amber/80' },
  { tier: 'longshot', dot: 'bg-fog' },
] as const;

export function HowItWorks() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-fog">
        <span>{t('how.short')}</span>
        <button type="button" aria-expanded={false} onClick={() => setOpen(true)} className="text-paper underline underline-offset-4 hover:text-ember">
          {t('how.more')}
        </button>
      </p>
    );
  }

  return (
    <section aria-labelledby="how-title" className="reveal rounded-2xl border border-matte bg-graphite/40 p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 id="how-title" className="font-display text-3xl font-bold text-paper uppercase">{t('how.title')}</h2>
        <button type="button" aria-expanded={true} onClick={() => setOpen(false)} className="min-h-11 rounded-full px-3 py-1.5 text-sm text-fog ring-1 ring-matte hover:text-paper">
          {t('how.dismiss')}
        </button>
      </div>
      <ol className="mt-6 grid gap-6 md:grid-cols-3">
        {STEPS.map((n) => (
          <li key={n} className="flex gap-4">
            <span aria-hidden="true" className="font-display text-4xl leading-none font-extrabold text-ember">{n}</span>
            <div>
              <h3 className="font-medium text-paper">{t(`how.step${n}.title`)}</h3>
              <p className="mt-1 text-sm leading-relaxed text-fog">{t(`how.step${n}.body`)}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 border-t border-matte pt-5">
        <h3 className="text-sm text-fog">{t('how.tiers')}</h3>
        <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
          {TIERS.map(({ tier, dot }) => (
            <li key={tier} className="flex items-baseline gap-2">
              <span aria-hidden="true" className={`size-1.5 shrink-0 translate-y-[-2px] rounded-full ${dot}`} />
              <span>
                <span className="text-paper">{t(`tier.${tier}`)}</span> <span className="text-fog">— {t(`how.tier.${tier}`)}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-fog">{t('how.where')}</p>
      </div>
    </section>
  );
}
