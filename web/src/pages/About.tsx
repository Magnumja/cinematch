// Sobre e créditos. O FAQ do TMDB pede a atribuição numa seção "About"/"Credits" do app (além do rodapé);
// aqui ficam todas as fontes de dados e o aviso de não endosso no texto original dos termos (§3).
import { useI18n } from '../lib/i18n.tsx';
import { TMDB_LOGO } from '../components/Poster.tsx';

export default function About() {
  const { t } = useI18n();
  const link = 'underline underline-offset-4 hover:text-paper';
  return (
    <article className="reveal mx-auto max-w-3xl space-y-10 px-5 py-14 sm:px-8">
      <header>
        <h1 className="font-display text-5xl font-extrabold text-paper uppercase sm:text-6xl">{t('about.title')}</h1>
        <p className="mt-4 text-lg text-paper/90">{t('about.intro')}</p>
        <p className="mt-3 text-fog">{t('about.noncommercial')}</p>
      </header>

      <section aria-labelledby="about-tmdb" className="space-y-3 rounded-2xl border border-matte p-6">
        <h2 id="about-tmdb" className="sr-only">TMDB</h2>
        <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" className="inline-block">
          <img src={TMDB_LOGO} alt="The Movie Database (TMDB)" width={180} height={24} className="h-6 w-auto" />
        </a>
        <p className="text-paper">{t('tmdb.disclaimer')}</p>
        <p lang="en" className="text-sm text-fog">This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</p>
        <p className="text-sm text-fog">{t('about.tmdbData')}</p>
      </section>

      <section aria-labelledby="about-sources" className="space-y-3">
        <h2 id="about-sources" className="font-display text-3xl font-bold text-paper uppercase">{t('about.sources')}</h2>
        <ul className="list-disc space-y-2 pl-5 text-fog">
          <li>
            <a href="https://www.wikidata.org" target="_blank" rel="noreferrer" className={link}>Wikidata</a> — {t('about.wikidata')}
          </li>
          <li>{t('about.critics')}</li>
          <li>
            <a href="https://www.justwatch.com" target="_blank" rel="noreferrer" className={link}>JustWatch</a> — {t('about.justwatch')}
          </li>
        </ul>
      </section>

      <section aria-labelledby="about-how" className="space-y-3">
        <h2 id="about-how" className="font-display text-3xl font-bold text-paper uppercase">{t('about.howTitle')}</h2>
        <p className="text-fog">{t('about.how')}</p>
      </section>
    </article>
  );
}
