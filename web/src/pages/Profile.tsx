import { AnimatedInput } from '../components/AnimatedInput.tsx';
// Perfil: preferências explícitas editáveis, preferências aprendidas visíveis, agenda e conta (LGPD).
import { useEffect, useState, type ReactNode } from 'react';
import { GENRE_LABELS, type Genre } from '../../../core/domain/genres.ts';
import { deriveSignals } from '../../../core/engine/score.ts';
import type { Constraints } from '../../../core/schemas.ts';
import { defaultSchedule, FavoritesPicker, GenreSet, LimitsFields, ScheduleFields, TasteGenres } from '../components/Pickers.tsx';
import { Button, ErrorState, PageHeader, SectionTitle } from '../components/ui.tsx';
import { deleteMyAccount, exportMyData, getSchedule, saveProfile, saveSchedule, supabase, type Schedule } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { useUser } from '../lib/session.tsx';
import { useMovieActions } from '../lib/useMovieActions.ts';

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-t border-matte pt-8">
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
    a.download = 'cinematch-meus-dados.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  const confirmWord = locale === 'pt' ? 'APAGAR' : 'DELETE';
  const dateFmt = new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'en', { dateStyle: 'full', timeStyle: 'short' });

  return (
    <div className="max-w-4xl space-y-10">
      <PageHeader title={t('profile.title')} />

      <Panel title={t('profile.taste')}>
        <div className="space-y-8">
          <div>
            <h3 className="mb-3 text-sm text-fog">{t('profile.love')}</h3>
            <p className="-mt-2 mb-3 text-xs text-fog">{t('onb.genresHint')}</p>
            <TasteGenres liked={liked} disliked={disliked} onChange={(l, d) => { setLiked(l); setDisliked(d); }} />
          </div>
          <div>
            <h3 className="mb-3 text-sm text-fog">{t('profile.exclude')}</h3>
            <GenreSet value={constraints.excludedGenres} tone="negative" onChange={(v) => setConstraints({ ...constraints, excludedGenres: v })} />
          </div>
          <div>
            <h3 className="mb-3 text-sm text-fog">{t('profile.favorites')}</h3>
            <FavoritesPicker value={favorites} onChange={setFavorites} max={10} />
          </div>
        </div>
      </Panel>

      <Panel title={t('profile.limits')} hint={t('profile.limitsHint')}>
        <LimitsFields value={constraints} onChange={setConstraints} />
      </Panel>

      <Panel title={t('profile.schedule')}>
        <ScheduleFields value={schedule} onChange={setSchedule} />
        {nextRunAt && schedule.active && <p className="mt-4 text-sm text-fog">{t('profile.nextRun', { date: dateFmt.format(new Date(nextRunAt)) })}</p>}
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

      <Panel title={t('profile.language')}>
        <div className="flex gap-2" role="radiogroup" aria-label={t('profile.language')}>
          {(['pt', 'en'] as const).map((l) => (
            <Button key={l} role="radio" aria-checked={appLocale === l} variant={appLocale === l ? 'quiet' : 'ghost'} onClick={() => setAppLocale(l)}>
              {l === 'pt' ? 'Português' : 'English'}
            </Button>
          ))}
        </div>
      </Panel>

      <div className="sticky bottom-4 z-10 flex items-center gap-4 rounded-full bg-ink/80 p-2 ring-1 ring-matte backdrop-blur-md">
        <Button variant="primary" onClick={() => void save()} disabled={status === 'saving'}>
          {t('profile.save')}
        </Button>
        <p role="status" className="text-sm text-fog">
          {status === 'saved' ? t('profile.saved') : ''}
        </p>
      </div>
      {status === 'error' && <ErrorState message={t('error.generic')} />}

      <Panel title={t('profile.account')}>
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void download()}>{t('profile.export')}</Button>
            <Button variant="ghost" onClick={() => void supabase.auth.signOut()}>
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
            <Button variant="danger" className="mt-4" disabled={confirmText !== confirmWord} onClick={() => void deleteMyAccount()}>
              {t('profile.delete')}
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
