// Conversão pura da resposta de GET /3/movie/{id}?language=pt-BR&append_to_response=watch/providers,translations,videos
// para o TmdbInfo do Cineou (DEC-041). Campos ausentes viram null; nada é inventado.
import { TmdbInfoSchema, type TmdbInfo, type WatchProvider } from '../../core/schemas.ts';

type ProviderEntry = { provider_name?: string; logo_path?: string | null; display_priority?: number };
type CountryProviders = { link?: string } & Partial<Record<WatchProvider['type'], ProviderEntry[]>>;

export interface TmdbMovieResponse {
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string | null;
  tagline?: string | null;
  vote_average?: number | null;
  vote_count?: number | null;
  translations?: { translations?: { iso_639_1?: string; iso_3166_1?: string; data?: { title?: string; overview?: string; tagline?: string } }[] };
  videos?: { results?: VideoEntry[] };
  'watch/providers'?: { results?: Record<string, CountryProviders> };
}

type VideoEntry = { site?: string; type?: string; key?: string; official?: boolean; iso_639_1?: string };

// Trailer no YouTube: legendado/dublado em português primeiro, depois inglês; oficial antes de não oficial.
export function pickTrailer(videos: VideoEntry[] | undefined): string | null {
  const ok = (videos ?? []).filter((v) => v.site === 'YouTube' && v.type === 'Trailer' && typeof v.key === 'string' && /^[\w-]{6,32}$/.test(v.key));
  const rank = (v: VideoEntry) => (v.iso_639_1 === 'pt' ? 0 : v.iso_639_1 === 'en' ? 2 : 4) + (v.official ? 0 : 1);
  return ok.sort((a, b) => rank(a) - rank(b))[0]?.key ?? null;
}

const PROVIDER_TYPES: WatchProvider['type'][] = ['flatrate', 'free', 'ads', 'rent', 'buy'];
const text = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

// Onde assistir no Brasil, na ordem de exibição do TMDB, sem repetir o mesmo provedor no mesmo tipo.
export function mapProviders(results: Record<string, CountryProviders> | undefined, country = 'BR'): { providers: WatchProvider[]; link: string | null } {
  const c = results?.[country];
  if (!c) return { providers: [], link: null };
  const providers: WatchProvider[] = [];
  for (const type of PROVIDER_TYPES) {
    const seen = new Set<string>();
    for (const p of [...(c[type] ?? [])].sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99))) {
      const name = text(p.provider_name);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      providers.push({ type, name, logoPath: p.logo_path ?? null });
    }
  }
  return { providers, link: text(c.link) };
}

export function mapTmdbMovie(r: TmdbMovieResponse): TmdbInfo {
  const en = r.translations?.translations?.find((t) => t.iso_639_1 === 'en' && (t.iso_3166_1 === 'US' || !t.iso_3166_1))
    ?? r.translations?.translations?.find((t) => t.iso_639_1 === 'en');
  const ptBr = r.translations?.translations?.find((t) => t.iso_639_1 === 'pt' && t.iso_3166_1 === 'BR');
  const { providers, link } = mapProviders(r['watch/providers']?.results);
  const vote = typeof r.vote_average === 'number' && r.vote_average > 0 ? Math.min(10, r.vote_average) : null;
  return TmdbInfoSchema.parse({
    posterPath: text(r.poster_path),
    backdropPath: text(r.backdrop_path),
    // Com language=pt-BR o TMDB devolve overview vazio quando não há tradução — fica null, sem cair para outro idioma.
    overviewPt: text(r.overview),
    overviewEn: text(en?.data?.overview),
    taglinePt: text(r.tagline),
    voteAverage: vote,
    voteCount: Math.max(0, Math.round(r.vote_count ?? 0)),
    providers,
    watchLink: link,
    // Só o título traduzido de fato (o campo `title` cai para o original quando não há tradução).
    titlePt: text(ptBr?.data?.title),
    trailerKey: pickTrailer(r.videos?.results),
  });
}

// Filme removido do TMDB (404): registra "vazio" para não consultar de novo antes da próxima renovação.
export const EMPTY_TMDB: TmdbInfo = {
  posterPath: null, backdropPath: null, overviewPt: null, overviewEn: null, taglinePt: null,
  voteAverage: null, voteCount: 0, providers: [], watchLink: null, titlePt: null, trailerKey: null,
};
