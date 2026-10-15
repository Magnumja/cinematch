// Explicação curta de como o app decide. Aparece aberta até a pessoa dispensar; depois vira um link discreto.
// O "dispensado" fica só neste navegador (conveniência local, não é dado do perfil).
import { useState } from 'react';
import { useI18n } from '../lib/i18n.tsx';
import { Button } from './ui.tsx';

const KEY = 'cineou.how.dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(value: boolean) {
  try {
    if (value) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // Sem armazenamento (aba anônima, bloqueio): o painel só volta a aparecer na próxima visita.
  }
}

const STEPS = [1, 2, 3] as const;
const TIERS = [
  { tier: 'high', dot: 'bg-ember' },
  { tier: 'good', dot: 'bg-signal-amber/80' },
  { tier: 'longshot', dot: 'bg-fog' },
] as const;

export function HowItWorks() {
  const { t } = useI18n();
  const [open, setOpen] = useState(() => !readDismissed());

  if (!open) {
    return (
      <button type="button" onClick={() => { writeDismissed(false); setOpen(true); }} className="text-sm text-fog underline underline-offset-4 hover:text-paper">
        {t('how.show')}
      </button>
    );
  }

  return (
    <section aria-labelledby="how-title" className="reveal rounded-2xl border border-matte bg-graphite/40 p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 id="how-title" className="font-display text-3xl font-bold text-paper uppercase">{t('how.title')}</h2>
        <Button onClick={() => { writeDismissed(true); setOpen(false); }} className="px-3 py-1.5">
          {t('how.dismiss')}
        </Button>
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
