// Controles de preferência compartilhados por onboarding, perfil e Descobrir.
import { useEffect, useState } from 'react';
import { displayTitle } from '../../../core/db.ts';
import { GENRES, type Genre } from '../../../core/domain/genres.ts';
import type { Constraints, Movie } from '../../../core/schemas.ts';
import { moviesByIds, searchMovies, type Schedule } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
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
    const handle = setTimeout(() => void searchMovies(query, 8).then(setResults).catch(() => setResults([])), 250);
    return () => clearTimeout(handle);
  }, [query]);

  function toggle(m: Movie) {
    const has = value.includes(m.id);
    if (!has && value.length >= max) return;
    const next = has ? selected.filter((x) => x.id !== m.id) : [...selected, m];
    setSelected(next);
    onChange(next.map((x) => x.id));
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
      <input
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

function Select<T extends string | number>({ label, value, options, onChange, format, anyLabel }: {
  label: string; value: T | null; options: readonly T[]; onChange: (v: T | null) => void; format: (v: T) => string; anyLabel: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-fog">{label}</span>
      <select
        value={value === null ? '' : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? null : (options.find((o) => String(o) === raw) ?? null));
        }}
        className="mt-1.5 block w-full rounded-xl bg-graphite px-4 py-3 text-paper ring-1 ring-matte focus:ring-fog/50 focus:outline-none"
      >
        <option value="">{anyLabel}</option>
        {options.map((o) => (
          <option key={String(o)} value={String(o)}>
            {format(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function LimitsFields({ value, onChange, showRewatch = true }: { value: Constraints; onChange: (c: Constraints) => void; showRewatch?: boolean }) {
  const { t, locale } = useI18n();
  const languageName = (code: string) => new Intl.DisplayNames([locale === 'pt' ? 'pt-BR' : 'en'], { type: 'language' }).of(code) ?? code;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Select label={t('profile.maxRuntime')} value={value.maxRuntimeMin} options={RUNTIMES} anyLabel={t('discover.any')}
          format={(n) => t('common.minutes', { n })} onChange={(v) => onChange({ ...value, maxRuntimeMin: v })} />
        <Select label={t('profile.minRating')} value={value.minRating} options={RATINGS} anyLabel={t('discover.any')}
          format={(n) => `${n.toFixed(1)}+`} onChange={(v) => onChange({ ...value, minRating: v })} />
        <Select label={t('profile.languages')} value={value.languages[0] ?? null} options={LANGUAGES} anyLabel={t('profile.anyLanguage')}
          format={languageName} onChange={(v) => onChange({ ...value, languages: v ? [v] : [] })} />
      </div>
      {value.minRating !== null && <p className="text-sm text-fog">{t('profile.minRatingHint')}</p>}
      {showRewatch && (
        <label className="flex items-center gap-3 text-paper">
          <input type="checkbox" checked={value.allowRewatch} onChange={(e) => onChange({ ...value, allowRewatch: e.target.checked })} className="size-4 accent-ember" />
          {t('profile.rewatch')}
        </label>
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
  const field = 'mt-1.5 block w-full rounded-xl bg-graphite px-4 py-3 text-paper ring-1 ring-matte focus:ring-fog/50 focus:outline-none';
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 text-paper">
        <input type="checkbox" checked={value.active} onChange={(e) => onChange({ ...value, active: e.target.checked })} className="size-4 accent-ember" />
        {t('profile.scheduleActive')}
      </label>
      <fieldset disabled={!value.active} className="grid gap-4 disabled:opacity-50 sm:grid-cols-3">
        <label>
          <span className="text-sm text-fog">{t('profile.frequency')}</span>
          <select className={field} value={value.frequency} onChange={(e) => onChange({ ...value, frequency: e.target.value as Schedule['frequency'], weekday: value.weekday ?? 5, dayOfMonth: value.dayOfMonth ?? 1 })}>
            <option value="daily">{t('profile.daily')}</option>
            <option value="weekly">{t('profile.weekly')}</option>
            <option value="monthly">{t('profile.monthly')}</option>
          </select>
        </label>
        {value.frequency === 'weekly' && (
          <label>
            <span className="text-sm text-fog">{t('profile.weekday')}</span>
            <select className={field} value={value.weekday ?? 5} onChange={(e) => onChange({ ...value, weekday: Number(e.target.value) })}>
              {weekdays.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
          </label>
        )}
        {value.frequency === 'monthly' && (
          <label>
            <span className="text-sm text-fog">{t('profile.dayOfMonth')}</span>
            <select className={field} value={value.dayOfMonth ?? 1} onChange={(e) => onChange({ ...value, dayOfMonth: Number(e.target.value) })}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span className="text-sm text-fog">{t('profile.hour')}</span>
          <select className={field} value={value.hour} onChange={(e) => onChange({ ...value, hour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>
            ))}
          </select>
        </label>
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
