import { AnimatedInput } from './components/AnimatedInput.tsx';
// Rotas e guarda de acesso: sem sessão → login; sem onboarding → onboarding; senão o app.
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Navbar } from './components/Navbar.tsx';
import { TmdbAttribution } from './components/Poster.tsx';
import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { Button, ErrorState, Skeleton } from './components/ui.tsx';
import { supabase } from './lib/api.ts';
import { browserLocale, LocaleProvider, useI18n } from './lib/i18n.tsx';
import { SessionProvider, useSession } from './lib/session.tsx';
import Auth from './pages/Auth.tsx';
import Home from './pages/Home.tsx';

// Telas fora do caminho principal (login → Home) carregam sob demanda e são pré-carregadas
// quando o navegador fica ocioso, para a navegação não esperar o download na hora do clique.
const pages = {
  Discover: () => import('./pages/Discover.tsx'),
  MovieDetail: () => import('./pages/MovieDetail.tsx'),
  MyList: () => import('./pages/MyList.tsx'),
  Onboarding: () => import('./pages/Onboarding.tsx'),
  Profile: () => import('./pages/Profile.tsx'),
  Search: () => import('./pages/Search.tsx'),
  About: () => import('./pages/About.tsx'),
};
const Discover = lazy(pages.Discover);
const MovieDetail = lazy(pages.MovieDetail);
const MyList = lazy(pages.MyList);
const Onboarding = lazy(pages.Onboarding);
const Profile = lazy(pages.Profile);
const Search = lazy(pages.Search);
const About = lazy(pages.About);

function usePrefetchPages() {
  useEffect(() => {
    const run = () => {
      for (const load of Object.values(pages)) void load().catch(() => undefined);
    };
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(run, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(run, 2000);
    return () => clearTimeout(id);
  }, []);
}

const PageFallback = () => <Skeleton className="h-64" />;

function Layout() {
  const { t } = useI18n();
  usePrefetchPages();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-paper focus:px-4 focus:py-2 focus:text-ink">
        {t('nav.skip')}
      </a>
      <Navbar />
      <main id="main" className="page-stage mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="mx-auto max-w-6xl space-y-3 px-5 pb-10 text-xs text-fog sm:px-8">
        <p>{t('movie.source')}</p>
        <TmdbAttribution />
        <Link to="/about" className="block underline underline-offset-4 hover:text-paper">{t('nav.about')}</Link>
        <span className="mt-3 block">UI: <a href="https://ui.unlumen.com" className="underline underline-offset-4 hover:text-paper">Unlumen UI</a> · <a href="https://skiper-ui.com" className="underline underline-offset-4 hover:text-paper">Skiper UI</a></span></footer>
    </>
  );
}

// Chegou pelo link de "esqueci minha senha": define a nova antes de usar o app.
function SetNewPassword() {
  const { t } = useI18n();
  const { finishRecovery } = useSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(err.message);
    else finishRecovery();
  }

  return (
    <main className="mx-auto max-w-md px-5 py-24">
      <form onSubmit={(e) => void submit(e)} className="rounded-[24px] bg-graphite/60 p-7 ring-1 ring-matte">
        <label className="block">
          <span className="text-sm text-fog">{t('auth.newPassword')}</span>
          <AnimatedInput
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 block w-full rounded-xl bg-graphite px-4 py-3 text-paper ring-1 ring-matte focus:outline-none"
          />
        </label>
        {error && <p role="alert" className="mt-4 text-sm text-signal-red">{error}</p>}
        <Button type="submit" variant="primary" disabled={busy} className="mt-6 w-full py-3">
          {t('auth.savePassword')}
        </Button>
      </form>
    </main>
  );
}

function Gate() {
  const { session, profile, loading, profileError, recovering } = useSession();
  const locale = profile?.locale ?? browserLocale();

  let content;
  if (loading) {
    content = (
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <Skeleton className="h-64" />
      </div>
    );
  } else if (session && recovering) {
    content = <SetNewPassword />;
  } else if (!session) {
    content = (
      <Routes>
        <Route path="about" element={<Suspense fallback={<PageFallback />}><About /></Suspense>} />
        <Route path="*" element={<Auth />} />
      </Routes>
    );
  } else if (!profile && profileError) {
    content = (
      <div className="mx-auto max-w-xl px-5 py-24">
        <ErrorState message="Não foi possível carregar seu perfil. / Could not load your profile." onRetry={() => location.reload()} />
      </div>
    );
  } else if (!profile) {
    content = null;
  } else if (!profile.onboardedAt) {
    content = (
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="*" element={<Onboarding />} />
        </Routes>
      </Suspense>
    );
  } else {
    content = (
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="discover" element={<Discover />} />
          <Route path="list" element={<MyList />} />
          <Route path="search" element={<Search />} />
          <Route path="profile" element={<Profile />} />
          <Route path="movie/:id" element={<MovieDetail />} />
          <Route path="about" element={<About />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    );
  }

  return (
    <LocaleProvider locale={locale}>
      <div className="ambient" aria-hidden="true" />
      {content}
    </LocaleProvider>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </SessionProvider>
  );
}
