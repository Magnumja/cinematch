import { AnimatedInput } from './AnimatedInput.tsx';
// Controles de preferência compartilhados por onboarding, perfil e Descobrir.
import { useEffect, useId, useState } from 'react';
import { displayTitle } from '../../../core/db.ts';
import { GENRES, type Genre } from '../../../core/domain/genres.ts';
import type { Constraints, Movie } from '../../../core/schemas.ts';
import { moviesByIds, searchMovies, type Schedule } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { Dropdown } from './Dropdown.tsx';
import { GenreChip, type ChipState } from './ui.tsx';

// Um toque = gosta, dois = não curte, três = neutro.
export function TasteGenres({ liked, disliked, onChange }: { liked: Genre[]; disliked: Genre[]; onChange: (liked: Genre[], disliked: Genre[]) => void }) {
  const { t } = useI18n();
  const stateOf = (g: Genre): ChipState => (liked.includes(g) ? 'on' : disliked.includes(g) ? 'negative' : 'off');
  function cycle(g: Genre) {
    const s = stateOf(g);
    if (s === 'off') onChange([...liked, g], disliked);
    else if (s === 'on') onChange(liked.filter((x) => x !== g), [...disliked, g]);
    else onChange(liked, disliked.filter((x) => x !== g));
  }
  return (
    <div className="flex flex-wrap gap-2">
      {GENRES.map((g) => (
        <GenreChip key={g} genre={g} state={stateOf(g)} onClick={() => cycle(g)} labels={{ on: t('state.like'), negative: t('state.dislike') }} />
      ))}
    </div>
  );
}

export function GenreSet({ value, onChange, tone = 'on' }: { value: Genre[]; onChange: (v: Genre[]) => void; tone?: 'on' | 'negative' }) {
  return (
    <div className="flex flex-wrap gap-2">
      {GENRES.map((g) => (
        <GenreChip key={g} genre={g} state={value.includes(g) ? tone : 'off'} onClick={() => onChange(value.includes(g) ? value.filter((x) => x !== g) : [...value, g])} />
      ))}
    </div>
  );
}

export function FavoritesPicker({ value, onChange, max }: { value: string[]; onChange: (ids: string[]) => void; max: number }) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Movie[]>([]);
  const [selected, setSelected] = useState<Movie[]>([]);
  const [initialIds] = useState(value);

  // Carrega os títulos dos favoritos iniciais; depois a seleção local é a fonte da verdade.
  useEffect(() => {
    void moviesByIds(initialIds).then(setSelected);
  }, [initialIds]);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      searchMovies(query, 8)
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  function toggle(m: Movie) {
    const has = value.includes(m.id);
    if (!has && value.length >= max) return;
    const next = has ? selected.filter((x) => x.id !== m.id) : [...selected, m];
    setSelected(next);
    onChange(next.map((x) => x.id));
    // Escolheu da lista: limpa a busca para o próximo título não colar no anterior.
    if (!has) {
      setQuery('');
      setResults([]);
    }
  }

  return (
    <div className="space-y-4">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('profile.favorites')}>
          {selected.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => toggle(m)} className="rounded-full bg-ember/15 px-3.5 py-1.5 text-sm text-paper ring-1 ring-ember/60" aria-label={`${displayTitle(m, locale)}: ${t('list.remove')}`}>
                {displayTitle(m, locale)} <span aria-hidden="true" className="text-fog">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <AnimatedInput
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('search.placeholder')}
        aria-label={t('search.placeholder')}
        className="w-full rounded-xl bg-graphite px-4 py-3 text-paper ring-1 ring-matte placeholder:text-fog/70 focus:ring-fog/50 focus:outline-none"
      />
      {results.length > 0 && (
        <ul className="divide-y divide-matte rounded-xl ring-1 ring-matte">
          {results.map((m) => {
            const on = value.includes(m.id);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => toggle(m)}
                  aria-pressed={on}
                  disabled={!on && value.length >= max}
                  className="flex w-full items-baseline justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-graphite disabled:opacity-40"
                >
                  <span className={on ? 'text-ember' : 'text-paper'}>{displayTitle(m, locale)}</span>
                  <span className="shrink-0 text-sm text-fog">{m.year ?? ''}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const RUNTIMES = [90, 100, 120, 150, 180];
const RATINGS = [6, 7, 7.5, 8, 8.5];
export const LANGUAGES = ['pt', 'en', 'es', 'fr', 'it', 'de', 'ja', 'ko'] as const;

// Interruptor no estilo da marca (trilho grafite, botão ember quando ligado). role="switch" + rótulo associado.
export function Switch({ checked, onChange, label, tone = 'ember' }: { checked: boolean; onChange: (v: boolean) => void; label: string; tone?: 'ember' | 'violet' }) {
  const id = useId();
  const on = tone === 'violet' ? 'bg-signal-violet/80 ring-signal-violet' : 'bg-ember/85 ring-ember';
  return (
    <div className="flex min-h-11 items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full ring-1 transition-colors duration-200 ease-(--ease-calm) focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2 focus-visible:ring-offset-ink focus-visible:outline-none disabled:opacity-50 ${checked ? on : 'bg-graphite ring-matte'}`}
      >
        {/* Área de toque de 44px sem aumentar o desenho do trilho. */}
        <span aria-hidden="true" className="absolute -inset-2" />
        <span
          aria-hidden="true"
          className={`size-5 rounded-full shadow transition-transform duration-200 ease-(--ease-calm) motion-reduce:transition-none ${checked ? 'translate-x-6 bg-ink' : 'translate-x-1 bg-fog'}`}
        />
      </button>
      <span id={id} className="cursor-pointer text-paper" onClick={() => onChange(!checked)}>
        {label}
      </span>
    </div>
  );
}

export function LimitsFields({ value, onChange, showRewatch = true }: { value: Constraints; onChange: (c: Constraints) => void; showRewatch?: boolean }) {
  const { t, locale } = useI18n();
  const languageName = (code: string) => new Intl.DisplayNames([locale === 'pt' ? 'pt-BR' : 'en'], { type: 'language' }).of(code) ?? code;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Dropdown label={t('profile.maxRuntime')} value={value.maxRuntimeMin} placeholder={t('discover.any')}
          options={RUNTIMES.map((n) => ({ value: n, label: t('common.minutes', { n }) }))} onChange={(v) => onChange({ ...value, maxRuntimeMin: v })} />
        <Dropdown label={t('profile.minRating')} value={value.minRating} placeholder={t('discover.any')}
          options={RATINGS.map((n) => ({ value: n, label: `${n.toFixed(1)}+` }))} onChange={(v) => onChange({ ...value, minRating: v })} />
        <Dropdown<string> label={t('profile.languages')} value={value.languages[0] ?? null} placeholder={t('profile.anyLanguage')}
          options={LANGUAGES.map((code) => ({ value: code, label: languageName(code) }))} onChange={(v) => onChange({ ...value, languages: v ? [v] : [] })} />
      </div>
      {value.minRating !== null && <p className="text-sm text-fog">{t('profile.minRatingHint')}</p>}
      {showRewatch && (
        <Switch checked={value.allowRewatch} onChange={(v) => onChange({ ...value, allowRewatch: v })} label={t('profile.rewatch')} />
      )}
    </div>
  );
}

export function ScheduleFields({ value, onChange }: { value: Omit<Schedule, 'nextRunAt'>; onChange: (s: Omit<Schedule, 'nextRunAt'>) => void }) {
  const { t, locale } = useI18n();
  // 11/10/2026 é domingo: índice 0 = domingo, igual ao "dow" do Postgres.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'en', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 9, 11 + i))),
  );
  return (
    <div className="space-y-4">
      <Switch checked={value.active} onChange={(v) => onChange({ ...value, active: v })} label={t('profile.scheduleActive')} />
      <fieldset disabled={!value.active} className="grid gap-4 disabled:opacity-50 sm:grid-cols-3">
        <Dropdown<Schedule['frequency']> label={t('profile.frequency')} value={value.frequency} placeholder={t('profile.weekly')} allowClear={false}
          options={[
            { value: 'daily', label: t('profile.daily') },
            { value: 'weekly', label: t('profile.weekly') },
            { value: 'monthly', label: t('profile.monthly') },
          ]}
          onChange={(v) => v && onChange({ ...value, frequency: v, weekday: value.weekday ?? 5, dayOfMonth: value.dayOfMonth ?? 1 })} />
        {value.frequency === 'weekly' && (
          <Dropdown label={t('profile.weekday')} value={value.weekday ?? 5} placeholder={weekdays[5]!} allowClear={false}
            options={weekdays.map((d, i) => ({ value: i, label: d }))}
            onChange={(v) => v !== null && onChange({ ...value, weekday: v })} />
        )}
        {value.frequency === 'monthly' && (
          <Dropdown label={t('profile.dayOfMonth')} value={value.dayOfMonth ?? 1} placeholder="1" allowClear={false}
            options={Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
            onChange={(v) => v !== null && onChange({ ...value, dayOfMonth: v })} />
        )}
        <Dropdown label={t('profile.hour')} value={value.hour} placeholder="19:00" allowClear={false}
          options={Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${String(h).padStart(2, '0')}:00` }))}
          onChange={(v) => v !== null && onChange({ ...value, hour: v })} />
      </fieldset>
    </div>
  );
}

export function defaultSchedule(): Omit<Schedule, 'nextRunAt'> {
  return {
    frequency: 'weekly',
    weekday: 5,
    dayOfMonth: 1,
    hour: 19,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
    active: true,
  };
}
