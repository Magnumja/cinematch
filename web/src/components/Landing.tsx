import '../landing.css';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n.tsx';
import logo from '../assets/cineou-logo.png';

// Public presentation only. Account actions stay in Auth and keep their existing flows.
export function Landing({ children, onMode }: { children: ReactNode; onMode: (mode: 'signIn' | 'signUp') => void }) {
  const { t } = useI18n();
  return (
    <div className="landing">
      <a href="#landing-main" className="landing-skip">{t('nav.skip')}</a>
      <header className="landing-nav">
        <a href="#" aria-label="Cineou"><img src={logo} alt="Cineou" width={296} height={80} /></a>
        <nav aria-label={t('nav.menu')}>
          <a className="landing-nav-how" href="#how-it-works">{t('landing.how')}</a>
          <Link className="landing-nav-about" to="/about">{t('nav.about')}</Link>
          <a className="landing-nav-login" href="#account" onClick={() => onMode('signIn')}>{t('auth.signIn')} <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <main id="landing-main">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <p className="landing-kicker landing-enter">{t('landing.eyebrow')}</p>
            <h1 id="landing-title" className="landing-enter">{t('landing.title')}{' '}<br /><em>{t('landing.titleAccent')}</em></h1>
            <p className="landing-lead landing-enter">{t('auth.subtitle')}</p>
            <div className="landing-hero-actions landing-enter">
              <a href="#account" className="landing-cta" onClick={() => onMode('signUp')}>{t('landing.start')} <span aria-hidden="true">↗</span></a>
              <a href="#how-it-works" className="landing-text-link">{t('landing.how')} <span aria-hidden="true">↓</span></a>
            </div>
          </div>
          <div className="landing-art landing-enter" aria-hidden="true">
            <div className="landing-orbit" />
            <div className="landing-ticket ticket-back"><span>CINEOU / {t('landing.session')}</span><strong>{t('landing.mood')}</strong></div>
            <div className="landing-ticket ticket-front">
              <div className="ticket-top"><span>CINEOU</span><span>✳</span></div>
              <p>{t('landing.ticketTop')}</p>
              <strong>{t('landing.ticketTitle')}</strong>
              <div className="ticket-bottom"><span>{t('landing.ticketBottom')}</span><span className="ticket-barcode" /></div>
            </div>
            <span className="landing-art-note">{t('landing.artNote')} <span>↗</span></span>
          </div>
          <div className="landing-hero-foot"><span>{t('landing.footnote')}</span><a href="#how-it-works" aria-label={t('landing.how')}>↓</a></div>
        </section>

        <section className="landing-story" id="how-it-works" aria-labelledby="story-title">
          <div className="landing-story-heading">
            <p className="landing-kicker">01 / {t('landing.how')}</p>
            <h2 id="story-title">{t('landing.storyTitle')} <em>{t('landing.storyAccent')}</em></h2>
            <p>{t('landing.storyBody')}</p>
          </div>
          <ol className="landing-steps">
            {(['one', 'two', 'three'] as const).map((step, i) => (
              <li key={step}>
                <span className="landing-step-number">0{i + 1}</span>
                <div><h3>{t(`landing.${step}Title`)}</h3><p>{t(`landing.${step}Body`)}</p></div>
                <span className="landing-step-mark" aria-hidden="true">{['✳', '↗', '↺'][i]}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-account" aria-labelledby="account-title">
          <div className="landing-account-copy">
            <p className="landing-kicker">02 / {t('landing.session')}</p>
            <h2 id="account-title">{t('landing.accountTitle')}{' '}<br /><em>{t('landing.accountAccent')}</em></h2>
            <p>{t('landing.accountBody')}</p>
            <span className="landing-account-star" aria-hidden="true">✳</span>
          </div>
          {children}
        </section>

        <section className="landing-faq" aria-labelledby="faq-title">
          <h2 id="faq-title">{t('landing.faq')}</h2>
          <div>{(['first', 'second', 'third'] as const).map(item => (
            <details key={item}>
              <summary>{t(`landing.${item}Question`)}<span aria-hidden="true">+</span></summary>
              <p>{t(`landing.${item}Answer`)}</p>
            </details>
          ))}</div>
        </section>
      </main>
      <footer className="landing-footer">
        <img src={logo} alt="Cineou" width={296} height={80} />
        <p>{t('landing.footnote')}</p>
        <Link to="/about">{t('nav.about')} ↗</Link>
      </footer>
    </div>
  );
}
