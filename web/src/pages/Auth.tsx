import { AnimatedInput } from '../components/AnimatedInput.tsx';
// Entrar ou criar conta (DEC-027: e-mail e senha via Supabase Auth).
import { useState, type FormEvent } from 'react';
import { Button } from '../components/ui.tsx';
import { supabase } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import logo from '../assets/cineou-logo.png';

const TITLES = { signIn: 'auth.signIn', signUp: 'auth.signUp', reset: 'auth.reset' } as const;

export default function Auth() {
  const { t } = useI18n();
  const [mode, setMode] = useState<'signIn' | 'signUp' | 'reset'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const redirectTo = window.location.origin;
    if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      setBusy(false);
      // Mesma mensagem com ou sem conta: não revela quais e-mails estão cadastrados.
      setMessage(error ? { kind: 'error', text: error.message } : { kind: 'info', text: t('auth.resetSent') });
      return;
    }
    const { data, error } =
      mode === 'signIn'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
    setBusy(false);
    // Mensagem do Supabase Auth (ex.: credenciais inválidas, senha curta) é específica e acionável.
    if (error) setMessage({ kind: 'error', text: mode === 'signIn' ? t('auth.invalid') : error.message });
    else if (mode === 'signUp' && !data.session) setMessage({ kind: 'info', text: t('auth.checkEmail') });
  }

  const field = 'mt-1.5 block w-full rounded-xl bg-graphite px-4 py-3 text-paper ring-1 ring-matte focus:ring-fog/50 focus:outline-none';

  return (
    <main className="auth-layout mx-auto grid min-h-dvh max-w-6xl items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.2fr_1fr]">
      <div className="reveal auth-intro">
        <div className="cinema-orbit" aria-hidden="true"><span /><span /><span /></div>
        <img src={logo} alt="Cineou" width={296} height={80} className="h-9 w-auto" />
        <p className="relative mt-12 text-xs font-medium tracking-[0.2em] text-ember">{t('auth.eyebrow')}</p>
        <h1 className="relative mt-5 font-display text-[clamp(3rem,7vw,6rem)] leading-[0.96] font-extrabold text-balance text-paper uppercase">{t('auth.title')}</h1>
        <p className="mt-6 max-w-md text-lg text-fog">{t('auth.subtitle')}</p>
              <ol className="auth-steps">
          {(['auth.step1', 'auth.step2', 'auth.step3'] as const).map((key, i) => (
            <li key={key}><span aria-hidden="true">0{i + 1}</span>{t(key)}</li>
          ))}
        </ol>
      </div>

      <form onSubmit={(e) => void submit(e)} className="reveal auth-form rounded-[24px] bg-graphite/60 p-7 ring-1 ring-matte sm:p-9">
        <h2 className="text-xl font-medium text-paper">{t(TITLES[mode])}</h2>
        <label className="mt-6 block">
          <span className="text-sm text-fog">{t('auth.email')}</span>
          <AnimatedInput type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
        </label>
        {mode !== 'reset' && (
        <label className="mt-4 block">
          <span className="text-sm text-fog">{t('auth.password')}</span>
          <AnimatedInput
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
          />
        </label>
        )}
        {message && (
          <p role={message.kind === 'error' ? 'alert' : 'status'} className={`mt-4 text-sm ${message.kind === 'error' ? 'text-signal-red' : 'text-paper'}`}>
            {message.text}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy} className="mt-6 w-full py-3">
          {t(TITLES[mode])}
        </Button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signIn' ? 'signUp' : 'signIn');
            setMessage(null);
          }}
          className="mt-4 w-full text-center text-sm text-fog hover:text-paper"
        >
          {mode === 'signIn' ? t('auth.toSignUp') : t('auth.toSignIn')}
        </button>
        {mode === 'signIn' && (
          <button type="button" onClick={() => { setMode('reset'); setMessage(null); }} className="mt-2 w-full text-center text-sm text-fog hover:text-paper">
            {t('auth.forgot')}
          </button>
        )}
        <p className="mt-6 border-t border-matte pt-4 text-xs text-fog">{t('auth.privacy')}</p>
        <p className="mt-4 text-xs text-fog">UI: <a href="https://ui.unlumen.com" className="underline underline-offset-4 hover:text-paper">Unlumen UI</a> · <a href="https://skiper-ui.com" className="underline underline-offset-4 hover:text-paper">Skiper UI</a></p>
      </form>
    </main>
  );
}
