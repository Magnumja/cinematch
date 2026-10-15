// Imagens do TMDB (DEC-041). Servidas direto de image.tmdb.org (o app não hospeda as imagens).
// Sem pôster: some (ou, com `fallback`, vira um bloco tipográfico na cor do gênero) — nunca uma imagem inventada.
import { useRef, useState, type CSSProperties } from 'react';
import { displayTitle } from '../../../core/db.ts';
import type { Movie, WatchProvider } from '../../../core/schemas.ts';
import { useI18n } from '../lib/i18n.tsx';

const IMAGE_BASE = 'https://image.tmdb.org/t/p';
export type ImageSize = 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'w1280';

export function tmdbImage(path: string | null | undefined, size: ImageSize): string | null {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

function hueStyle(hue: number): CSSProperties {
  return { background: `linear-gradient(160deg, hsl(${hue} 45% 22%), hsl(${hue} 30% 9%))` };
}

export function Poster({ movie, hue, size = 'w342', className = '', fallback = false }: { movie: Movie; hue: number; size?: ImageSize; className?: string; fallback?: boolean }) {
  const { locale } = useI18n();
  const [failed, setFailed] = useState(false);
  const src = failed ? null : tmdbImage(movie.tmdb?.posterPath, size);
  const title = displayTitle(movie, locale);
  if (!src && !fallback) return null;
  return (
    <div className={`relative aspect-[2/3] shrink-0 overflow-hidden rounded-xl ring-1 ring-paper/10 ${className}`} style={hueStyle(hue)}>
      {src ? (
        <img
          src={src}
          alt={locale === 'pt' ? `Pôster de ${title}` : `${title} poster`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true" className="absolute inset-0 flex items-end p-2 font-display text-sm leading-none font-bold text-paper/70 uppercase">
          {title}
        </span>
      )}
    </div>
  );
}

// Fundo do destaque: imagem larga bem apagada, só quando existe.
export function Backdrop({ movie }: { movie: Movie }) {
  const src = tmdbImage(movie.tmdb?.backdropPath, 'w1280');
  if (!src) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover opacity-[0.14]" />
      <div className="absolute inset-0 bg-gradient-to-r from-graphite via-graphite/85 to-graphite/50" />
    </div>
  );
}

// Atribuição exigida pelos termos da API do TMDB: logo do TMDB + aviso de não endosso.
export const TMDB_LOGO = 'https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg';

export function TmdbAttribution({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  return (
    <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" className="shrink-0">
        <img src={TMDB_LOGO} alt="TMDB" width={80} height={10} className="h-2.5 w-auto" />
      </a>
      <span>{t('tmdb.disclaimer')}</span>
    </p>
  );
}

// Onde assistir em uma linha, para os cards. Prioriza o que já está incluso (assinatura/grátis);
// sem isso, diz só que dá para alugar ou comprar. Crédito ao JustWatch sempre junto (termos do TMDB).
const INCLUDED: WatchProvider['type'][] = ['flatrate', 'free', 'ads'];

export function ProviderBadges({ movie, max = 3, className = '' }: { movie: Movie; max?: number; className?: string }) {
  const { t } = useI18n();
  const providers = movie.tmdb?.providers ?? [];
  if (!movie.tmdb) return null;
  const included = providers.filter((p) => INCLUDED.includes(p.type));
  const paid = providers.some((p) => p.type === 'rent' || p.type === 'buy');
  const shown = [...new Map(included.map((p) => [p.name, p])).values()].slice(0, max);
  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs ${className}`}>
      {shown.length > 0 ? (
        shown.map((p) => {
          const logo = tmdbImage(p.logoPath, 'w92');
          return (
            <span key={p.name} className="inline-flex items-center gap-1.5 rounded-full bg-ink/50 py-0.5 pr-2.5 pl-0.5 text-paper ring-1 ring-paper/10">
              {logo ? <img src={logo} alt="" width={20} height={20} loading="lazy" className="size-5 rounded-full" /> : <span className="size-5" />}
              {p.name}
            </span>
          );
        })
      ) : (
        <span className="text-fog">{paid ? t('watch.rentOnly') : t('watch.noneShort')}</span>
      )}
      <span className="text-fog/70">{t('watch.via')}</span>
    </div>
  );
}

// Trailer dentro do app: player oficial do YouTube (youtube-nocookie) num diálogo, com brilho ambiente atrás.
// O brilho usa a imagem de fundo do filme desfocada — não dá para amostrar os quadros do player (iframe de outra
// origem) e baixar o vídeo violaria os termos do YouTube. O iframe só existe enquanto o diálogo está aberto:
// nada é enviado ao YouTube antes do clique, e fechar interrompe o vídeo.
export function TrailerButton({ movie, className = '' }: { movie: Movie; className?: string }) {
  const { t, locale } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const key = movie.tmdb?.trailerKey;
  if (!key) return null;
  const title = displayTitle(movie, locale);
  const glow = tmdbImage(movie.tmdb?.backdropPath, 'w780') ?? tmdbImage(movie.tmdb?.posterPath, 'w342');

  function show() {
    setOpen(true);
    const d = dialog.current;
    if (d?.showModal) d.showModal();
    else d?.setAttribute('open', '');
  }
  function close() {
    dialog.current?.close?.();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-haspopup="dialog"
        aria-label={`${t('movie.trailer')}: ${title}`}
        className={`relative z-10 inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-paper ring-1 ring-paper/20 transition-colors hover:bg-paper/10 ${className}`}
      >
        <span aria-hidden="true">▶</span> {t('movie.trailer')}
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        aria-label={`${t('movie.trailer')}: ${title}`}
        className="trailer-dialog m-auto w-[min(92vw,1100px)] overflow-visible bg-transparent p-0 text-paper backdrop:bg-ink/85 backdrop:backdrop-blur-sm"
      >
        {open && (
          <div className="relative px-2 py-10 sm:p-12">
            {glow && (
              <img
                src={glow}
                alt=""
                aria-hidden="true"
                className="trailer-ambient pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-[60px] saturate-150"
              />
            )}
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-ink shadow-[0_30px_80px_#000a] ring-1 ring-paper/10">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${key}?autoplay=1&rel=0&playsinline=1`}
                title={`${t('movie.trailer')}: ${title}`}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                className="absolute inset-0 h-full w-full"
              />
            </div>
            <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <a href={`https://www.youtube.com/watch?v=${key}`} target="_blank" rel="noreferrer" className="text-fog underline underline-offset-4 hover:text-paper">
                {t('movie.trailerYoutube')}
              </a>
              <button type="button" onClick={close} autoFocus className="min-h-11 rounded-full bg-paper px-5 py-2 font-medium text-ink hover:bg-paper/90">
                {t('movie.trailerClose')}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
