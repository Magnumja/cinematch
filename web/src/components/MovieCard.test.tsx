// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Factor, FeedbackTag, Movie } from '../../../core/schemas.ts';
import type { Feedback } from '../lib/api.ts';
import { makeItem, makeMovie, renderWithProviders } from '../test-utils.tsx';
import { FeedbackBar, HeroCard, MovieMeta } from './MovieCard.tsx';

// O ListPicker (nos cards) usa a API de listas e a sessão; aqui só importa que renderize.
vi.mock('../lib/api.ts', () => ({
  ApiError: class ApiError extends Error { code = 'generic'; },
  listMyLists: vi.fn(async () => []),
  listsContaining: vi.fn(async () => new Set()),
  addToList: vi.fn(),
  removeFromList: vi.fn(),
  createList: vi.fn(),
}));
vi.mock('../lib/session.tsx', () => ({ useUser: () => ({ userId: 'u1' }) }));


const ratedMovie = makeMovie({
  ratings: [
    { source: 'metacritic', value: 8.1, raw: '81/100' },
    { source: 'rotten_tomatoes', value: 8.9, raw: '89%' },
  ],
});

describe('MovieMeta', () => {
  it('mostra a média das notas com as fontes', () => {
    renderWithProviders(<MovieMeta movie={ratedMovie} />);
    expect(screen.getByText('Nota 8.5 (Metacritic, Rotten Tomatoes)')).toBeInTheDocument();
  });

  it('mostra uma única fonte quando só há uma nota', () => {
    renderWithProviders(<MovieMeta movie={makeMovie({ ratings: [{ source: 'rotten_tomatoes', value: 9.3, raw: '93%' }] })} />);
    expect(screen.getByText('Nota 9.3 (Rotten Tomatoes)')).toBeInTheDocument();
  });

  it('mostra "Sem nota de crítica" quando o filme não tem nota', () => {
    renderWithProviders(<MovieMeta movie={makeMovie({ ratings: [] })} />);
    expect(screen.getByText('Sem nota de crítica')).toBeInTheDocument();
    expect(screen.queryByText(/^Nota /)).not.toBeInTheDocument();
  });

  it('nunca mostra porcentagem, mesmo quando o texto original da fonte tem "%"', () => {
    const { container } = renderWithProviders(<MovieMeta movie={ratedMovie} />);
    expect(container.textContent).not.toContain('%');
  });

  it('mostra ano, duração e até três gêneros traduzidos', () => {
    renderWithProviders(<MovieMeta movie={makeMovie({ genres: ['thriller', 'drama', 'comedy', 'horror'] })} />);
    expect(screen.getByText('2001')).toBeInTheDocument();
    expect(screen.getByText('112 min')).toBeInTheDocument();
    expect(screen.getByText('Suspense, Drama, Comédia')).toBeInTheDocument();
  });

  it('usa os textos em inglês quando o idioma é en', () => {
    renderWithProviders(<MovieMeta movie={ratedMovie} />, { locale: 'en' });
    expect(screen.getByText('Score 8.5 (Metacritic, Rotten Tomatoes)')).toBeInTheDocument();
  });
});

describe('HeroCard', () => {
  const reference: Movie = makeMovie({ id: 'Q2002', titlePt: 'Filme Referência', titleEn: 'Reference Film' });
  const movie = makeMovie({ ratings: ratedMovie.ratings });
  const movies = new Map<string, Movie>([
    [movie.id, movie],
    [reference.id, reference],
  ]);
  const similarFactor: Factor = { type: 'similar_to', movieId: reference.id, sharedDirector: 'Fulano de Tal', sharedGenres: ['thriller'], weight: 0.4 };
  const ratingFactor: Factor = { type: 'rating', average: 8.5, sources: ['metacritic', 'rotten_tomatoes'], weight: 0.2 };

  function renderHero(overrides: Partial<Parameters<typeof HeroCard>[0]> = {}) {
    const props = {
      item: makeItem({}, [similarFactor, ratingFactor]),
      movie,
      movies,
      saved: false,
      onSave: vi.fn(),
      onFeedback: vi.fn(async () => {}),
      onAnother: vi.fn(),
      label: 'Para você',
      busy: false,
      ...overrides,
    };
    const utils = renderWithProviders(<HeroCard {...props} />);
    return { ...utils, props };
  }

  it('mostra o título do filme como cabeçalho do card', () => {
    renderHero();
    expect(screen.getByRole('heading', { level: 2, name: 'O Grande Teste' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'O Grande Teste' })).toBeInTheDocument();
  });

  it.each([
    ['high', 'Alta afinidade'],
    ['good', 'Boa afinidade'],
    ['longshot', 'Aposta'],
  ] as const)('mostra a faixa %s como "%s"', (tier, text) => {
    renderHero({ item: makeItem({ tier }, [similarFactor]) });
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('explica a escolha a partir dos fatores do motor', () => {
    renderHero();
    const why = screen.getByRole('heading', { level: 3, name: 'Por que este filme' }).parentElement as HTMLElement;
    const reasons = within(why).getAllByRole('listitem').map((li) => li.textContent);
    expect(reasons).toEqual(['Mesmo diretor de Filme Referência: Fulano de Tal.', 'Bem avaliado pela crítica (8.5/10, Metacritic e Rotten Tomatoes).']);
  });

  it('não cita fatores negativos nem filmes de referência desconhecidos', () => {
    renderHero({
      item: makeItem({}, [
        { type: 'disliked_genres', genres: ['horror'], weight: -0.3 },
        { type: 'similar_to', movieId: 'Q404', sharedDirector: null, sharedGenres: [], weight: 0.3 },
        { type: 'liked_genres', genres: ['thriller'], weight: 0.3 },
      ]),
    });
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Você disse que gosta de suspense.']);
  });

  it('não mostra nenhum texto com "%" (nem pontuação interna nem nota bruta)', () => {
    const { container } = renderHero({ item: makeItem({ score: 0.87 }, [similarFactor, ratingFactor]) });
    expect(container.textContent).not.toContain('%');
    expect(container.textContent).not.toContain('87');
  });

  it('chama onSave ao clicar em Salvar', () => {
    const { props } = renderHero();
    const save = screen.getByRole('button', { name: 'Salvar' });
    expect(save).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(save);
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it('mostra "Salvo" pressionado quando o filme já está salvo', () => {
    renderHero({ saved: true });
    expect(screen.getByRole('button', { name: 'Salvo' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('chama onAnother ao clicar em Outra sugestão', () => {
    const { props } = renderHero();
    fireEvent.click(screen.getByRole('button', { name: 'Outra sugestão' }));
    expect(props.onAnother).toHaveBeenCalledTimes(1);
  });

  it('desabilita Outra sugestão enquanto ocupado', () => {
    renderHero({ busy: true });
    expect(screen.getByRole('button', { name: 'Outra sugestão' })).toBeDisabled();
  });

  it('aponta "Ver detalhes" para a página do filme', () => {
    renderHero();
    expect(screen.getByRole('link', { name: 'Ver detalhes' })).toHaveAttribute('href', '/movie/Q1001');
  });

  it('em português não mostra a descrição curta do Wikidata em inglês', () => {
    renderHero({ movie: makeMovie({ descriptionPt: null, descriptionEn: 'english only' }) });
    expect(screen.queryByText('english only')).not.toBeInTheDocument();
  });
});

describe('FeedbackBar', () => {
  function renderBar(current: Feedback | null = null, onFeedback = vi.fn(async (_f: Feedback, _t: FeedbackTag[]) => {})) {
    renderWithProviders(<FeedbackBar onFeedback={onFeedback} current={current} />);
    return onFeedback;
  }

  it('começa sem nenhuma opção pressionada, sem tags e sem mensagem', () => {
    renderBar();
    for (const name of ['Gostei', 'Não gostei', 'Já assisti', 'Não tenho interesse']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
    expect(screen.queryByText('O que pesou?')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('ao clicar em Gostei envia ("liked", []) e mostra as tags e a confirmação', async () => {
    const onFeedback = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Gostei' }));
    expect(onFeedback).toHaveBeenCalledWith('liked', []);
    expect(await screen.findByRole('status')).toHaveTextContent('Anotado. Isso ajusta as próximas recomendações.');
    expect(screen.getByRole('button', { name: 'Gostei' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('O que pesou?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reviravolta' })).toBeInTheDocument();
  });

  it('clicar numa tag reenvia o feedback com a tag e marca a tag como pressionada', async () => {
    const onFeedback = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Gostei' }));
    const twist = await screen.findByRole('button', { name: 'Reviravolta' });
    await waitFor(() => expect(twist).toBeEnabled());
    fireEvent.click(twist);
    expect(onFeedback).toHaveBeenLastCalledWith('liked', ['loved_twist']);
    await waitFor(() => expect(twist).toHaveAttribute('aria-pressed', 'true'));
  });

  it('acumula tags e remove a tag ao clicar de novo', async () => {
    const onFeedback = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Gostei' }));
    const twist = await screen.findByRole('button', { name: 'Reviravolta' });
    const acting = screen.getByRole('button', { name: 'Atuações' });
    await waitFor(() => expect(twist).toBeEnabled());
    fireEvent.click(twist);
    await waitFor(() => expect(acting).toBeEnabled());
    fireEvent.click(acting);
    expect(onFeedback).toHaveBeenLastCalledWith('liked', ['loved_twist', 'loved_acting']);
    await waitFor(() => expect(twist).toBeEnabled());
    fireEvent.click(twist);
    expect(onFeedback).toHaveBeenLastCalledWith('liked', ['loved_acting']);
    await waitFor(() => expect(twist).toHaveAttribute('aria-pressed', 'false'));
    expect(acting).toHaveAttribute('aria-pressed', 'true');
  });

  it('trocar de Gostei para Não gostei move o aria-pressed', async () => {
    const onFeedback = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Gostei' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Não gostei' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Não gostei' }));
    expect(onFeedback).toHaveBeenLastCalledWith('disliked', []);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Não gostei' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('button', { name: 'Gostei' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('Já assisti confirma o feedback mas não pede tags', async () => {
    const onFeedback = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Já assisti' }));
    expect(onFeedback).toHaveBeenCalledWith('watched', []);
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('O que pesou?')).not.toBeInTheDocument();
  });

  it('desabilita os botões enquanto o envio está pendente', async () => {
    let resolve!: () => void;
    renderBar(null, vi.fn(() => new Promise<void>((r) => (resolve = r))));
    fireEvent.click(screen.getByRole('button', { name: 'Gostei' }));
    expect(screen.getByRole('button', { name: 'Não gostei' })).toBeDisabled();
    resolve();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Não gostei' })).toBeEnabled());
  });

  it('respeita o feedback já dado (current) ao montar', () => {
    renderBar('disliked');
    expect(screen.getByRole('button', { name: 'Não gostei' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('O que pesou?')).toBeInTheDocument();
  });

  it('não marca a opção como escolhida quando o envio falha', async () => {
    const swallowed = captureUnhandledRejections();
    try {
      renderBar(null, vi.fn(async () => Promise.reject(new Error('network_error'))));
      fireEvent.click(screen.getByRole('button', { name: 'Gostei' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Gostei' })).toBeEnabled());
      expect(screen.getByRole('button', { name: 'Gostei' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar sua resposta');
      await flushRejections();
    } finally {
      swallowed.restore();
    }
  });

  // Regressão: a falha de onFeedback (ex.: rede em giveFeedback) escapava como unhandled rejection, sem aviso.
  it('não deixa a falha de onFeedback escapar como unhandled rejection', async () => {
    const swallowed = captureUnhandledRejections();
    try {
      renderBar(null, vi.fn(async () => Promise.reject(new Error('network_error'))));
      fireEvent.click(screen.getByRole('button', { name: 'Gostei' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Gostei' })).toBeEnabled());
      await flushRejections();
      expect(swallowed.reasons).toEqual([]);
    } finally {
      swallowed.restore();
    }
  });
});

// Substitui temporariamente os listeners de unhandledRejection do Vitest para observar
// rejeições que o componente deixa escapar sem derrubar a execução inteira.
function captureUnhandledRejections() {
  const previous = process.listeners('unhandledRejection');
  process.removeAllListeners('unhandledRejection');
  const reasons: unknown[] = [];
  const listener = (reason: unknown) => void reasons.push(reason);
  process.on('unhandledRejection', listener);
  return {
    reasons,
    restore() {
      process.off('unhandledRejection', listener);
      for (const l of previous) process.on('unhandledRejection', l);
    },
  };
}

async function flushRejections() {
  // unhandledRejection é emitido depois da fila de microtarefas; um macrotask garante a emissão.
  await new Promise((r) => setTimeout(r, 10));
}
