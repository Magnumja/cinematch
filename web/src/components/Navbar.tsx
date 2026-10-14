// Navegação horizontal superior (sem sidebar). No celular, vira um menu que abre sob a barra.
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useI18n, type MessageKey } from '../lib/i18n.tsx';

const LINKS: { to: string; key: MessageKey }[] = [
  { to: '/', key: 'nav.home' },
  { to: '/discover', key: 'nav.discover' },
  { to: '/assistant', key: 'nav.assistant' },
  { to: '/list', key: 'nav.list' },
  { to: '/search', key: 'nav.search' },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `relative py-1 text-sm transition-colors duration-200 ${isActive ? 'text-paper' : 'text-fog hover:text-paper'}`;

export function Navbar() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-matte/60 bg-ink/70 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5 sm:px-8" aria-label="Principal">
        {/* Marca provisória até a logo oficial chegar. */}
        <NavLink to="/" className="font-display text-2xl font-extrabold tracking-tight text-paper uppercase" onClick={() => setOpen(false)}>
          CineMatch<span className="text-ember"> AI</span>
        </NavLink>

        <ul className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} end={l.to === '/'} className={linkClass}>
                {t(l.key)}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `hidden rounded-full px-3 py-1.5 text-sm ring-1 transition-colors md:inline-flex ${isActive ? 'text-paper ring-fog/50' : 'text-fog ring-matte hover:text-paper'}`
            }
          >
            {t('nav.profile')}
          </NavLink>
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-sm text-fog ring-1 ring-matte md:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {t('nav.menu')}
          </button>
        </div>
      </nav>

      {open && (
        <ul id="mobile-menu" className="reveal border-t border-matte/60 px-5 py-3 md:hidden">
          {[...LINKS, { to: '/profile', key: 'nav.profile' as MessageKey }].map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} end={l.to === '/'} className={({ isActive }) => `block py-2.5 ${isActive ? 'text-paper' : 'text-fog'}`} onClick={() => setOpen(false)}>
                {t(l.key)}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
