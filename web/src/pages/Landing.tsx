// Página de apresentação para quem ainda não entrou (rota "/"). Leva ao login em /login.
// Só fatos verificáveis do produto: nada de números de usuários, depoimentos ou filmes/notas inventados.
// O cartão do topo é uma ilustração sem filme real (sem título, pôster nem nota).
import { Link } from 'react-router-dom';
import { TmdbAttribution } from '../components/Poster.tsx';
import { useI18n, type MessageKey } from '../lib/i18n.tsx';
import logo from '../assets/cineou-logo.png';

const FEATURES: { title: MessageKey; body: MessageKey }[] = [
  { title: 'landing.f.rules.title', body: 'landing.f.rules.body' },
  { title: 'landing.f.why.title', body: 'landing.f.why.body' },
  { title: 'landing.f.watch.title', body: 'landing.f.watch.body' },
  { title: 'landing.f.alerts.title', body: 'landing.f.alerts.body' },
  { title: 'landing.f.lists.title', body: 'landing.f.lists.body' },
  { title: 'landing.f.privacy.title', body: 'landing.f.privacy.body' },
];

const FACTS: { value: MessageKey; label: MessageKey }[] = [
  { value: 'landing.fact.catalog.value', label: 'landing.fact.catalog.label' },
  { value: 'landing.fact.one.value', label: 'landing.fact.one.label' },
  { value: 'landing.fact.ai.value', label: 'landing.fact.ai.label' },
  { value: 'landing.fact.price.value', label: 'landing.fact.price.label' },
];

const STEPS = [
  { title: 'how.step1.title', body: 'how.step1.body' },
  { title: 'how.step2.title', body: 'how.step2.body' },
  { title: 'how.step3.title', body: 'how.step3.body' },
] as const;

const primary =
  'motion-button inline-flex min-h-12 items-center justify-center rounded-full bg-ember px-6 py-3 text-base font-medium text-ink hover:bg-[#f59a4c] active:bg-ember-deep';
const secondary =
  'motion-button inline-flex min-h-12 items-center justify-center rounded-full px-6 py-3 text-base font-medium text-paper ring-1 ring-matte hover:ring-fog/50';

export default function Landing() {
  const { t } = useI18n();
  return (
    <div className="landing">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link to="/" aria-label="Cineou">
          <img src={logo} alt="Cineou" width={296} height={80} className="h-8 w-auto sm:h-9" />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link to="/about" className="hidden rounded-full px-4 py-2 text-sm text-fog hover:text-paper sm:inline-flex">{t('nav.about')}</Link>
          <Link to="/login" className="rounded-full px-4 py-2 text-sm font-medium text-paper ring-1 ring-matte hover:ring-fog/50">{t('auth.signIn')}</Link>
        </nav>
      </header>

      <main>
        {/* Topo: promessa + chamada para criar conta; ilustração da tela de recomendação ao lado. */}
        <section className="landing-hero relative isolate mx-auto grid max-w-6xl items-center gap-12 px-5 pt-8 pb-16 sm:px-8 sm:pt-16 lg:grid-cols-[1.15fr_1fr] lg:pb-24">
          <div className="cinema-orbit" aria-hidden="true"><span /><span /><span /></div>
          <div className="reveal">
            <p className="text-xs font-medium tracking-[0.2em] text-ember">{t('auth.eyebrow')}</p>
            <h1 className="mt-5 font-display text-[clamp(3rem,9vw,6.5rem)] leading-[0.94] font-extrabold text-balance text-paper uppercase">
              {t('landing.title')}
            </h1>
            <p className="mt-6 max-w-lg text-lg text-fog">{t('landing.subtitle')}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link to="/login?mode=signup" className={primary}>{t('landing.cta')}</Link>
              <Link to="/login" className={secondary}>{t('landing.haveAccount')}</Link>
            </div>
            <p className="mt-4 text-sm text-fog">{t('landing.ctaHint')}</p>
          </div>
          <DemoCard />
        </section>

        <section aria-label={t('landing.factsLabel')} className="border-y border-matte bg-graphite/30">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-5 py-10 sm:px-8 lg:grid-cols-4">
            {FACTS.map((f) => (
              <div key={f.value}>
                <dt className="sr-only">{t(f.label)}</dt>
                <dd className="font-display text-4xl font-extrabold text-paper uppercase sm:text-5xl">{t(f.value)}</dd>
                <dd className="mt-1 text-sm text-fog">{t(f.label)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="landing-how" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
          <h2 id="landing-how" className="font-display text-4xl font-extrabold text-paper uppercase sm:text-6xl">{t('how.title')}</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-t border-matte pt-5">
                <span className="font-display text-2xl font-extrabold text-ember tabular-nums" aria-hidden="true">0{i + 1}</span>
                <h3 className="mt-2 text-lg font-medium text-paper">{t(s.title)}</h3>
                <p className="mt-2 text-fog">{t(s.body)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="landing-features" className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 sm:pb-24">
          <h2 id="landing-features" className="font-display text-4xl font-extrabold text-paper uppercase sm:text-6xl">{t('landing.featuresTitle')}</h2>
          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-[20px] bg-graphite/60 p-6 ring-1 ring-matte">
                <h3 className="font-medium text-paper">{t(f.title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fog">{t(f.body)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
          <div className="auth-form relative overflow-hidden rounded-[28px] bg-graphite/60 px-6 py-12 text-center ring-1 ring-matte sm:px-12 sm:py-16">
            <div className="landing-glow" aria-hidden="true" />
            <h2 className="relative font-display text-4xl font-extrabold text-balance text-paper uppercase sm:text-6xl">{t('landing.finalTitle')}</h2>
            <p className="relative mx-auto mt-4 max-w-md text-fog">{t('auth.subtitle')}</p>
            <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/login?mode=signup" className={primary}>{t('landing.cta')}</Link>
              <Link to="/login" className={secondary}>{t('auth.signIn')}</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl space-y-3 border-t border-matte px-5 pt-6 pb-10 text-xs text-fog sm:px-8">
        <p>{t('movie.source')}</p>
        <TmdbAttribution />
        <Link to="/about" className="block underline underline-offset-4 hover:text-paper">{t('nav.about')}</Link>
      </footer>
    </div>
  );
}

// Ilustração da tela de recomendação: estrutura real (destaque, faixa de afinidade, motivos), sem filme real.
function DemoCard() {
  const { t } = useI18n();
  return (
    <figure className="reveal relative mx-auto w-full max-w-md [animation-delay:120ms]">
      <div className="auth-form rounded-[24px] bg-graphite/80 p-5 ring-1 ring-matte sm:p-6">
        <p className="text-xs font-medium tracking-[0.2em] text-ember uppercase">{t('home.weekly')}</p>
        <div className="mt-4 grid grid-cols-[6.5rem_1fr] gap-4 sm:grid-cols-[8rem_1fr]">
          <div className="landing-poster aspect-[2/3] rounded-xl ring-1 ring-matte" aria-hidden="true" />
          <div className="min-w-0 self-center" aria-hidden="true">
            <div className="h-6 w-11/12 rounded-md bg-paper/85" />
            <div className="mt-2 h-6 w-2/3 rounded-md bg-paper/85" />
            <div className="mt-4 h-3 w-1/2 rounded bg-fog/30" />
            <div className="mt-2 h-3 w-3/4 rounded bg-fog/20" />
          </div>
        </div>
        <p className="mt-5 inline-flex items-center gap-2 text-sm text-fog">
          <span className="size-1.5 rounded-full bg-ember" aria-hidden="true" />
          {t('tier.high')}
        </p>
        <ul className="mt-3 space-y-2 text-sm text-paper/90">
          <li className="flex gap-2"><span className="text-ember" aria-hidden="true">→</span>{t('landing.demo.reason1')}</li>
          <li className="flex gap-2"><span className="text-ember" aria-hidden="true">→</span>{t('landing.demo.reason2')}</li>
        </ul>
        <div className="mt-5 flex flex-wrap gap-2" aria-hidden="true">
          {(['fb.liked', 'fb.disliked', 'fb.watched'] as const).map((k) => (
            <span key={k} className="rounded-full bg-ink/60 px-3.5 py-2 text-xs text-paper ring-1 ring-matte">{t(k)}</span>
          ))}
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-fog">{t('landing.demo.caption')}</figcaption>
    </figure>
  );
}
