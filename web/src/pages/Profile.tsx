import { AnimatedInput } from '../components/AnimatedInput.tsx';
// Perfil em abas: Gosto (preferências explícitas e aprendidas), Filtros (restrições), Avisos (agenda e
// Web Push) e Conta (idioma e LGPD). A aba fica no endereço (?tab=) para links diretos, como o do aviso de teste.
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GENRE_LABELS, type Genre } from '../../../core/domain/genres.ts';
import { deriveSignals } from '../../../core/engine/score.ts';
import type { Constraints } from '../../../core/schemas.ts';
import { defaultSchedule, FavoritesPicker, GenreSet, LimitsFields, ScheduleFields, TasteGenres } from '../components/Pickers.tsx';
import { Button, ErrorState, PageHeader, SectionTitle } from '../components/ui.tsx';
import { deleteMyAccount, exportMyData, getSchedule, saveProfile, saveSchedule, supabase, type Schedule } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { disablePush, enablePush, pushStatus, showTestNotification, type PushStatus } from '../lib/push.ts';
import { useUser } from '../lib/session.tsx';
import { useMovieActions } from '../lib/useMovieActions.ts';

const TABS = ['taste', 'limits', 'alerts', 'account'] as const;
type Tab = (typeof TABS)[number];

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-t border-matte pt-6 first:border-t-0 first:pt-0 sm:pt-8">
      <SectionTitle>{title}</SectionTitle>
      {hint && <p className="-mt-2 mb-5 text-sm text-fog">{hint}</p>}
      {children}
    </section>
  );
}

export default function Profile() {
  const { t, locale } = useI18n();
  const { userId, profile, reloadProfile } = useUser();
  const { entries } = useMovieActions();
  const [liked, setLiked] = useState<Genre[]>(profile.preferences.likedGenres);
  const [disliked, setDisliked] = useState<Genre[]>(profile.preferences.dislikedGenres);
  const [favorites, setFavorites] = useState(profile.preferences.favoriteMovieIds);
  const [constraints, setConstraints] = useState<Constraints>(profile.constraints);
  const [appLocale, setAppLocale] = useState(profile.locale);
  const [schedule, setSchedule] = useState<Omit<Schedule, 'nextRunAt'>>(defaultSchedule);
  const [nextRunAt, setNextRunAt] = useState<string | null>(null);
  const [hadSchedule, setHadSchedule] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [confirmText, setConfirmText] = useState('');
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'taste';
  const selectTab = (next: Tab) => setParams(next === 'taste' ? {} : { tab: next }, { replace: true });

  useEffect(() => {
    void getSchedule(userId).then((s) => {
      if (!s) return setSchedule({ ...defaultSchedule(), active: false });
      setHadSchedule(true);
      setSchedule(s);
      setNextRunAt(s.nextRunAt);
    });
  }, [userId]);

  // Mesmo cálculo do motor: o usuário vê exatamente o que está sendo usado.
  const signals = deriveSignals(profile.preferences, entries, entries.map((e) => e.movie));
  const learned = [...signals.learned].filter(([, v]) => Math.abs(v) >= 0.34).sort((a, b) => b[1] - a[1]);

  async function save() {
    setStatus('saving');
    try {
      await saveProfile(userId, {
        locale: appLocale,
        constraints,
        preferences: { likedGenres: liked, dislikedGenres: disliked, favoriteMovieIds: favorites },
      });
      if (schedule.active || hadSchedule) await saveSchedule(userId, schedule);
      const s = await getSchedule(userId);
      setNextRunAt(s?.nextRunAt ?? null);
      setHadSchedule(Boolean(s));
      await reloadProfile();
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  async function download() {
    let json: string;
    try {
      json = await exportMyData();
    } catch {
      setStatus('error');
      return;
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cineou-meus-dados.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Sair/apagar a conta desliga os avisos deste aparelho: o próximo a entrar não recebe os avisos de quem saiu.
  async function signOut() {
    await disablePush().catch(() => undefined);
    await supabase.auth.signOut();
  }

  async function deleteAccount() {
    await disablePush().catch(() => undefined);
    await deleteMyAccount();
  }

  const confirmWord = locale === 'pt' ? 'APAGAR' : 'DELETE';
  const dateFmt = new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'en', { dateStyle: 'full', timeStyle: 'short' });

  const saveBar = (
    <div className={`${tab === 'alerts' ? '' : 'sticky bottom-4 z-10 '} flex items-center gap-4 rounded-full bg-ink/80 p-2 ring-1 ring-matte backdrop-blur-md`}>
      <Button variant="primary" onClick={() => void save()} disabled={status === 'saving'}>
        {t('profile.save')}
      </Button>
      <p role="status" className="text-sm text-fog">
        {status === 'saved' ? t('profile.saved') : ''}
      </p>
    </div>
  );

  return (
    <div className="max-w-4xl">
      <PageHeader title={t('profile.title')} />

      {/* Celular: abas roláveis na horizontal; a seção ativa ocupa a tela em vez de uma página longa. */}
      <div role="tablist" aria-label={t('profile.tabs')} className="-mx-5 -mt-4 mb-2 flex gap-2 overflow-x-auto px-5 py-1 sm:mx-0 sm:px-1">
        {TABS.map((id) => (
          <button
            key={id}
            id={`profile-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls="profile-panel"
            onClick={() => selectTab(id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ring-1 transition-colors ${tab === id ? 'bg-paper text-ink ring-paper' : 'text-fog ring-matte hover:text-paper hover:ring-fog/40'}`}
          >
            {t(`profile.tab.${id}`)}
          </button>
        ))}
      </div>
      <p className="mb-8 text-sm text-fog">{t(`profile.tabHint.${tab}`)}</p>

      <div id="profile-panel" role="tabpanel" aria-labelledby={`profile-tab-${tab}`} className="space-y-8 sm:space-y-10">
        {tab === 'taste' && (
          <>
            <Panel title={t('profile.love')} hint={t('onb.genresHint')}>
              <TasteGenres liked={liked} disliked={disliked} onChange={(l, d) => { setLiked(l); setDisliked(d); }} />
            </Panel>
            <Panel title={t('profile.favorites')}>
              <FavoritesPicker value={favorites} onChange={setFavorites} max={10} />
            </Panel>

            <Panel title={t('profile.learned')} hint={t('profile.learnedHint')}>
              {learned.length === 0 ? (
                <p className="text-fog">{t('profile.learnedEmpty')}</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {learned.map(([g, v]) => (
                    <li key={g} className={`rounded-full px-3.5 py-1.5 text-sm ring-1 ${v > 0 ? 'text-paper ring-ember/50' : 'text-fog line-through ring-signal-red/40'}`}>
                      {GENRE_LABELS[g][locale]}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </>
        )}

        {tab === 'limits' && (
          <>
            <Panel title={t('profile.limits')} hint={t('profile.limitsHint')}>
              <LimitsFields value={constraints} onChange={setConstraints} />
            </Panel>
            <Panel title={t('profile.exclude')}>
              <GenreSet value={constraints.excludedGenres} tone="negative" onChange={(v) => setConstraints({ ...constraints, excludedGenres: v })} />
            </Panel>
          </>
        )}

        {tab === 'alerts' && (
          <>
            <Panel title={t('profile.schedule')}>
              <ScheduleFields value={schedule} onChange={setSchedule} />
              {nextRunAt && schedule.active && <p className="mt-4 text-sm text-fog">{t('profile.nextRun', { date: dateFmt.format(new Date(nextRunAt)) })}</p>}
            </Panel>
            {/* O Salvar vale só para a agenda; os avisos abaixo mudam na hora e não ficam escondidos atrás da barra. */}
            {saveBar}
            <Panel title={t('push.title')} hint={t('push.hint')}>
              <PushSettings scheduleActive={schedule.active && hadSchedule} />
            </Panel>
          </>
        )}

        {tab === 'account' && (
          <Panel title={t('profile.language')}>
            <div className="flex gap-2" role="radiogroup" aria-label={t('profile.language')}>
              {(['pt', 'en'] as const).map((l) => (
                <Button key={l} role="radio" aria-checked={appLocale === l} variant={appLocale === l ? 'quiet' : 'ghost'} onClick={() => setAppLocale(l)}>
                  {l === 'pt' ? 'Português' : 'English'}
                </Button>
              ))}
            </div>
          </Panel>
        )}

        {tab !== 'alerts' && saveBar}
        {status === 'error' && <ErrorState message={t('error.generic')} />}

        {tab === 'account' && (
          <Panel title={t('profile.account')}>
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void download()}>{t('profile.export')}</Button>
                <Button variant="ghost" onClick={() => void signOut()}>
                  {t('profile.signOut')}
                </Button>
              </div>
              <div className="rounded-2xl p-5 ring-1 ring-signal-red/30">
                <label className="block text-sm text-fog">
                  {t('profile.deleteConfirm')}
                  <AnimatedInput
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    className="mt-2 block w-full max-w-xs rounded-xl bg-graphite px-4 py-2.5 text-paper ring-1 ring-matte focus:outline-none"
                  />
                </label>
                <Button variant="danger" className="mt-4" disabled={confirmText !== confirmWord} onClick={() => void deleteAccount()}>
                  {t('profile.delete')}
                </Button>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

// Liga/desliga os avisos deste aparelho. Muda na hora (depende da permissão do navegador), sem o "Salvar".
function PushSettings({ scheduleActive }: { scheduleActive: boolean }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    pushStatus()
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && setStatus('off'));
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(action: () => Promise<PushStatus | void>) {
    setBusy(true);
    setError(false);
    try {
      const next = await action();
      setStatus(next ?? (await pushStatus()));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (status === null) return <p className="text-sm text-fog" aria-busy="true">…</p>;

  const message: Partial<Record<PushStatus, string>> = {
    denied: t('push.denied'),
    'needs-install': t('push.needsInstall'),
    unsupported: t('push.unsupported'),
    'not-configured': t('push.notConfigured'),
  };

  return (
    <div className="space-y-4">
      {message[status] && <p className="rounded-2xl bg-graphite/60 p-4 text-sm text-fog ring-1 ring-matte">{message[status]}</p>}
      {status === 'off' && (
        <Button variant="primary" disabled={busy} onClick={() => void run(async () => {
          const next = await enablePush();
          if (next === 'on') await showTestNotification(t('push.testTitle'), t('push.testBody'));
          return next;
        })}>
          {t('push.enable')}
        </Button>
      )}
      {status === 'on' && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-2 flex items-center gap-2 text-sm text-paper">
            <span className="size-2 rounded-full bg-ember" aria-hidden="true" />
            {t('push.on')}
          </p>
          <Button disabled={busy} onClick={() => void run(() => showTestNotification(t('push.testTitle'), t('push.testBody')))}>
            {t('push.test')}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void run(disablePush)}>
            {t('push.disable')}
          </Button>
        </div>
      )}
      {status === 'on' && !scheduleActive && <p className="text-sm text-signal-amber">{t('push.needsSchedule')}</p>}
      {error && <p role="alert" className="text-sm text-signal-red">{t('push.error')}</p>}
    </div>
  );
}
