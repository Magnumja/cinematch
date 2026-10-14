// Onboarding curto (DEC-026): 4 passos, pulável depois do primeiro. O resto o app aprende pelo feedback.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Genre } from '../../../core/domain/genres.ts';
import type { Constraints } from '../../../core/schemas.ts';
import { defaultSchedule, FavoritesPicker, LimitsFields, ScheduleFields, TasteGenres } from '../components/Pickers.tsx';
import { Button, ErrorState } from '../components/ui.tsx';
import { saveProfile, saveSchedule } from '../lib/api.ts';
import { useI18n, type MessageKey } from '../lib/i18n.tsx';
import { useUser } from '../lib/session.tsx';

const STEPS: { title: MessageKey; hint?: MessageKey }[] = [
  { title: 'onb.genresTitle', hint: 'onb.genresHint' },
  { title: 'onb.favoritesTitle', hint: 'onb.favoritesHint' },
  { title: 'onb.limitsTitle', hint: 'profile.limitsHint' },
  { title: 'onb.scheduleTitle' },
];

export default function Onboarding() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { userId, profile, reloadProfile } = useUser();
  const [step, setStep] = useState(0);
  const [liked, setLiked] = useState<Genre[]>(profile.preferences.likedGenres);
  const [disliked, setDisliked] = useState<Genre[]>(profile.preferences.dislikedGenres);
  const [favorites, setFavorites] = useState<string[]>(profile.preferences.favoriteMovieIds);
  const [constraints, setConstraints] = useState<Constraints>(profile.constraints);
  const [schedule, setSchedule] = useState(defaultSchedule);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function finish(includeSchedule: boolean) {
    setBusy(true);
    setError(false);
    try {
      await saveProfile(userId, {
        preferences: { likedGenres: liked, dislikedGenres: disliked, favoriteMovieIds: favorites },
        constraints,
        onboardedAt: new Date().toISOString(),
      });
      if (includeSchedule && schedule.active) await saveSchedule(userId, schedule);
      await reloadProfile();
      navigate('/', { replace: true });
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;

  return (
    <main className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
      <p className="text-sm text-fog" aria-live="polite">
        {t('onb.step', { n: step + 1, total: STEPS.length })}
      </p>
      <div className="mt-3 flex gap-1.5" aria-hidden="true">
        {STEPS.map((_, i) => (
          <span key={i} className={`h-0.5 flex-1 rounded-full transition-colors duration-500 ${i <= step ? 'bg-ember' : 'bg-matte'}`} />
        ))}
      </div>

      <section key={step} className="reveal mt-10">
        <h1 className="font-display text-5xl font-extrabold text-paper uppercase sm:text-6xl">{t(current.title)}</h1>
        {current.hint && <p className="mt-3 text-fog">{t(current.hint)}</p>}
        <div className="mt-8">
          {step === 0 && <TasteGenres liked={liked} disliked={disliked} onChange={(l, d) => { setLiked(l); setDisliked(d); }} />}
          {step === 1 && <FavoritesPicker value={favorites} onChange={setFavorites} max={5} />}
          {step === 2 && <LimitsFields value={constraints} onChange={setConstraints} showRewatch={false} />}
          {step === 3 && <ScheduleFields value={schedule} onChange={setSchedule} />}
        </div>
      </section>

      {error && (
        <div className="mt-8">
          <ErrorState message={t('error.generic')} />
        </div>
      )}

      <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-matte pt-6">
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={busy}>
              {t('onb.back')}
            </Button>
          )}
          {step > 0 && !last && (
            <Button variant="ghost" onClick={() => void finish(false)} disabled={busy}>
              {t('onb.skip')}
            </Button>
          )}
        </div>
        {last ? (
          <Button variant="primary" onClick={() => void finish(true)} disabled={busy}>
            {t('onb.finish')}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setStep(step + 1)} disabled={busy}>
            {t('onb.next')}
          </Button>
        )}
      </div>
    </main>
  );
}
