// Navegação horizontal superior (sem sidebar). No celular, vira um menu que abre sob a barra.
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useI18n, type MessageKey } from '../lib/i18n.tsx';
import logo from '../assets/cineou-logo.png';

const LINKS: { to: string; key: MessageKey }[] = [
  { to: '/', key: 'nav.home' },
  { to: '/discover', key: 'nav.discover' },
  { to: '/list', key: 'nav.list' },
  { to: '/search', key: 'nav.search' },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `nav-link ${isActive ? 'nav-link-active' : 'text-fog hover:text-paper'}`;

export function Navbar() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-matte/60 bg-ink/70 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5 sm:px-8" aria-label="Principal">
        <NavLink to="/" className="flex min-h-11 items-center rounded-lg" onClick={() => setOpen(false)}>
          <img src={logo} alt="Cineou" width={296} height={80} className="h-7 w-auto" />
        </NavLink>

        <ul className="hidden items-center gap-1 rounded-full border border-matte bg-graphite/60 p-1 lg:flex">
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
              `hidden min-h-11 items-center rounded-full px-4 py-2 text-sm ring-1 transition-colors lg:inline-flex ${isActive ? 'text-paper ring-fog/50' : 'text-fog ring-matte hover:text-paper'}`
            }
          >
            {t('nav.profile')}
          </NavLink>
          <button
            type="button"
            className="min-h-11 rounded-full px-4 py-2 text-sm text-paper ring-1 ring-matte lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {t('nav.menu')}
          </button>
        </div>
      </nav>

      {open && (
        <ul id="mobile-menu" className="menu-reveal border-t border-matte/60 px-5 py-3 lg:hidden">
          {[...LINKS, { to: '/profile', key: 'nav.profile' as MessageKey }].map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} end={l.to === '/'} className={({ isActive }) => `block rounded-xl px-4 py-3 ${isActive ? 'bg-ember/15 text-ember' : 'text-fog'}`} onClick={() => setOpen(false)}>
                {t(l.key)}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
