// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TmdbInfo } from '../../../core/schemas.ts';
import { makeMovie, renderWithProviders } from '../test-utils.tsx';
import { synopsis } from './MovieCard.tsx';
import { displayTitle } from '../../../core/db.ts';
import { Poster, ProviderBadges, TmdbAttribution, TrailerButton, tmdbImage } from './Poster.tsx';

const tmdb: TmdbInfo = {
  posterPath: '/p.jpg', backdropPath: null, overviewPt: 'Sinopse em português.', overviewEn: null, taglinePt: null,
  voteAverage: 7.5, voteCount: 300, providers: [], watchLink: null,
};

describe('Poster', () => {
  it('usa a imagem do TMDB quando existe', () => {
    renderWithProviders(<Poster movie={makeMovie({ tmdb })} hue={10} size="w185" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w185/p.jpg');
  });

  it('sem pôster (ou com erro ao carregar) não inventa imagem: some, ou mostra só o título com fallback', () => {
    const empty = renderWithProviders(<Poster movie={makeMovie({ tmdb: null })} hue={10} />);
    expect(empty.container).toBeEmptyDOMElement();
    const { container } = renderWithProviders(<Poster movie={makeMovie({ tmdb: null })} hue={10} fallback />);
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

  it('não mostra a descrição do Wikidata em outro idioma', () => {
    expect(synopsis(makeMovie({ tmdb: null, descriptionPt: null, descriptionEn: '1957 film by Billy Wilder' }), 'pt')).toBeNull();
    expect(synopsis(makeMovie({ tmdb: { ...tmdb, overviewPt: null, overviewEn: 'A trial.' }, descriptionPt: null }), 'pt')).toBe('A trial.');
  });

  it('título em PT prefere o de lançamento no Brasil (TMDB) e cai para o Wikidata', () => {
    expect(displayTitle(makeMovie({ titlePt: 'The Godfather', tmdb: { ...tmdb, titlePt: 'O Poderoso Chefão' } }), 'pt')).toBe('O Poderoso Chefão');
    expect(displayTitle(makeMovie({ titlePt: 'Ilha do Medo', tmdb: { ...tmdb, titlePt: null } }), 'pt')).toBe('Ilha do Medo');
    expect(displayTitle(makeMovie({ titlePt: null, titleEn: 'Borat', tmdb: null }), 'pt')).toBe('Borat');
    expect(displayTitle(makeMovie({ titleEn: 'The Godfather', tmdb: { ...tmdb, titlePt: 'O Poderoso Chefão' } }), 'en')).toBe('The Godfather');
  });
});

describe('TmdbAttribution', () => {
  it('mostra o logo do TMDB e o aviso de não endosso exigidos pelos termos', () => {
    renderWithProviders(<TmdbAttribution />);
    expect(screen.getByAltText('TMDB')).toBeInTheDocument();
    expect(screen.getByText(/não é endossado, certificado nem aprovado de outra forma pelo TMDB/)).toBeInTheDocument();
  });
});

describe('ProviderBadges', () => {
  it('mostra os serviços inclusos, sem repetir, com o crédito ao JustWatch', () => {
    const movie = makeMovie({ tmdb: { ...tmdb, providers: [
      { type: 'flatrate', name: 'Netflix', logoPath: '/n.png' },
      { type: 'ads', name: 'Netflix', logoPath: '/n.png' },
      { type: 'rent', name: 'Apple TV', logoPath: null },
    ] } });
    renderWithProviders(<ProviderBadges movie={movie} />);
    expect(screen.getAllByText('Netflix')).toHaveLength(1);
    expect(screen.queryByText('Apple TV')).not.toBeInTheDocument();
    expect(screen.getByText('via JustWatch')).toBeInTheDocument();
  });

  it('só aluguel: avisa em vez de listar; sem dados do TMDB: não mostra nada', () => {
    renderWithProviders(<ProviderBadges movie={makeMovie({ tmdb: { ...tmdb, providers: [{ type: 'rent', name: 'Apple TV', logoPath: null }] } })} />);
    expect(screen.getByText('Só para alugar ou comprar')).toBeInTheDocument();
    const { container } = renderWithProviders(<ProviderBadges movie={makeMovie({ tmdb: null })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('TrailerButton', () => {
  it('só carrega o player do YouTube (sem cookies) depois do clique', () => {
    renderWithProviders(<TrailerButton movie={makeMovie({ tmdb: { ...tmdb, trailerKey: 'abc123XYZ_-' } })} />);
    expect(document.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Trailer/ }));
    expect(document.querySelector('iframe')?.getAttribute('src')).toContain('https://www.youtube-nocookie.com/embed/abc123XYZ_-');
    fireEvent.click(screen.getByText('Fechar'));
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('some quando não há trailer', () => {
    const { container } = renderWithProviders(<TrailerButton movie={makeMovie({ tmdb })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
