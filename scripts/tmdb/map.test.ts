import { describe, expect, it } from 'vitest';
import { EMPTY_TMDB, mapProviders, mapTmdbMovie } from './map.ts';

describe('mapTmdbMovie', () => {
  it('extrai imagens, sinopses PT/EN, nota e provedores do Brasil', () => {
    const info = mapTmdbMovie({
      poster_path: '/poster.jpg',
      backdrop_path: '/fundo.jpg',
      overview: '  Um detetive investiga.  ',
      tagline: '',
      vote_average: 8.2,
      vote_count: 25000,
      translations: {
        translations: [
          { iso_639_1: 'es', iso_3166_1: 'ES', data: { overview: 'Un detective.' } },
          { iso_639_1: 'en', iso_3166_1: 'US', data: { overview: 'A detective investigates.' } },
          { iso_639_1: 'pt', iso_3166_1: 'BR', data: { title: 'O Detetive', overview: 'Um detetive investiga.' } },
        ],
      },
      videos: {
        results: [
          { site: 'Vimeo', type: 'Trailer', key: 'vimeo12345', official: true, iso_639_1: 'pt' },
          { site: 'YouTube', type: 'Teaser', key: 'teaser12345', official: true, iso_639_1: 'pt' },
          { site: 'YouTube', type: 'Trailer', key: 'enOfficial1', official: true, iso_639_1: 'en' },
          { site: 'YouTube', type: 'Trailer', key: 'ptFanMade01', official: false, iso_639_1: 'pt' },
        ],
      },
      'watch/providers': {
        results: {
          US: { flatrate: [{ provider_name: 'Hulu', logo_path: '/hulu.png' }] },
          BR: {
            link: 'https://www.themoviedb.org/movie/1/watch?locale=BR',
            flatrate: [
              { provider_name: 'Max', logo_path: '/max.png', display_priority: 2 },
              { provider_name: 'Netflix', logo_path: '/nf.png', display_priority: 1 },
              { provider_name: 'Netflix', logo_path: '/nf.png', display_priority: 3 },
            ],
            rent: [{ provider_name: 'Apple TV', logo_path: null }],
          },
        },
      },
    });
    expect(info).toEqual({
      posterPath: '/poster.jpg',
      backdropPath: '/fundo.jpg',
      overviewPt: 'Um detetive investiga.',
      overviewEn: 'A detective investigates.',
      taglinePt: null,
      voteAverage: 8.2,
      voteCount: 25000,
      providers: [
        { type: 'flatrate', name: 'Netflix', logoPath: '/nf.png' },
        { type: 'flatrate', name: 'Max', logoPath: '/max.png' },
        { type: 'rent', name: 'Apple TV', logoPath: null },
      ],
      watchLink: 'https://www.themoviedb.org/movie/1/watch?locale=BR',
      titlePt: 'O Detetive',
      trailerKey: 'ptFanMade01',
    });
  });

  it('não inventa nada quando a resposta vem incompleta', () => {
    const info = mapTmdbMovie({ overview: '', vote_average: 0, vote_count: 0 });
    expect(info).toEqual(EMPTY_TMDB);
  });

  it('sem dados do Brasil não mostra provedores de outro país', () => {
    expect(mapProviders({ US: { flatrate: [{ provider_name: 'Hulu' }] } })).toEqual({ providers: [], link: null });
    expect(mapProviders(undefined)).toEqual({ providers: [], link: null });
  });
});
