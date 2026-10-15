// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TmdbInfo } from '../../../core/schemas.ts';
import { makeMovie, renderWithProviders } from '../test-utils.tsx';
import { synopsis } from './MovieCard.tsx';
import { Poster, TmdbAttribution, tmdbImage } from './Poster.tsx';

const tmdb: TmdbInfo = {
  posterPath: '/p.jpg', backdropPath: null, overviewPt: 'Sinopse em português.', overviewEn: null, taglinePt: null,
  voteAverage: 7.5, voteCount: 300, providers: [], watchLink: null,
};

describe('Poster', () => {
  it('usa a imagem do TMDB quando existe', () => {
    renderWithProviders(<Poster movie={makeMovie({ tmdb })} hue={10} size="w185" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w185/p.jpg');
  });

  it('sem pôster (ou com erro ao carregar) mostra só o título, sem imagem inventada', () => {
    const { container } = renderWithProviders(<Poster movie={makeMovie({ tmdb: null })} hue={10} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('O Grande Teste');

    renderWithProviders(<Poster movie={makeMovie({ tmdb })} hue={10} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('tmdbImage não monta URL sem caminho', () => {
    expect(tmdbImage(null, 'w92')).toBeNull();
  });
});

describe('synopsis', () => {
  it('prefere a sinopse do TMDB no idioma da interface e cai para o Wikidata', () => {
    const m = makeMovie({ tmdb, descriptionPt: 'filme de 2001', descriptionEn: '2001 film' });
    expect(synopsis(m, 'pt')).toBe('Sinopse em português.');
    expect(synopsis(m, 'en')).toBe('2001 film');
    expect(synopsis(makeMovie({ tmdb: null, descriptionPt: null, descriptionEn: null }), 'pt')).toBeNull();
  });
});

describe('TmdbAttribution', () => {
  it('mostra o logo do TMDB e o aviso de não endosso exigidos pelos termos', () => {
    renderWithProviders(<TmdbAttribution />);
    expect(screen.getByAltText('TMDB')).toBeInTheDocument();
    expect(screen.getByText(/não é endossado nem certificado pelo TMDB/)).toBeInTheDocument();
  });
});
