// Rotas e guarda de acesso: sem sessão → login; sem onboarding → onboarding; senão o app.
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Navbar } from './components/Navbar.tsx';
import { useState, type FormEvent } from 'react';
import { Button, ErrorState, Skeleton } from './components/ui.tsx';
import { supabase } from './lib/api.ts';
import { browserLocale, LocaleProvider, useI18n } from './lib/i18n.tsx';
import { SessionProvider, useSession } from './lib/session.tsx';
import Assistant from './pages/Assistant.tsx';
import Auth from './pages/Auth.tsx';
import Discover from './pages/Discover.tsx';
import Home from './pages/Home.tsx';
import MovieDetail from './pages/MovieDetail.tsx';
import MyList from './pages/MyList.tsx';
import Onboarding from './pages/Onboarding.tsx';
import Profile from './pages/Profile.tsx';
import Search from './pages/Search.tsx';

function Layout() {
  const { t } = useI18n();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-paper focus:px-4 focus:py-2 focus:text-ink">
        {t('nav.skip')}
      </a>
      <Navbar />
      <main id="main" className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-6xl px-5 pb-10 text-xs text-fog sm:px-8">{t('movie.source')}</footer>
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
          <input
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
      <Routes>
        <Route path="*" element={<Onboarding />} />
      </Routes>
    );
  } else {
    content = (
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="discover" element={<Discover />} />
          <Route path="assistant" element={<Assistant />} />
          <Route path="list" element={<MyList />} />
          <Route path="search" element={<Search />} />
          <Route path="profile" element={<Profile />} />
          <Route path="movie/:id" element={<MovieDetail />} />
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
