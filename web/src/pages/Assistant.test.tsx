// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantReply, RecView } from '../lib/api.ts';
import { SessionProvider, useSession } from '../lib/session.tsx';
import { makeItem, makeMovie, renderWithProviders } from '../test-utils.tsx';
import Assistant from './Assistant.tsx';

// Fronteira de rede: api.ts inteiro é substituído (ele exige variáveis de ambiente e cria o cliente Supabase).
const api = vi.hoisted(() => {
  class ApiError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    ApiError,
    askAssistant: vi.fn(),
    requestRecommendation: vi.fn(),
    relaxToContext: vi.fn((c: string) => (c === 'minRating' ? { minRating: null } : {})),
    listUserMovies: vi.fn(async () => []),
    giveFeedback: vi.fn(async () => {}),
    updateUserMovie: vi.fn(async () => {}),
    getProfile: vi.fn(async () => ({ id: 'user-1' })),
    supabase: {
      auth: {
        onAuthStateChange: vi.fn((cb: (event: string, s: unknown) => void) => {
          cb('INITIAL_SESSION', { user: { id: 'user-1' } });
          return { data: { subscription: { unsubscribe: () => {} } } };
        }),
        signOut: vi.fn(async () => {}),
      },
    },
  };
});
vi.mock('../lib/api.ts', () => api);

// Assistant usa useUser(), que só funciona com sessão e perfil carregados (garantido pelo roteador no app).
function Ready({ children }: { children: ReactNode }) {
  const { loading, profile } = useSession();
  return loading || !profile ? null : <>{children}</>;
}

function renderAssistant() {
  return renderWithProviders(
    <SessionProvider>
      <Ready>
        <Assistant />
      </Ready>
    </SessionProvider>,
    { route: '/assistant' },
  );
}

async function ask(question: string) {
  const input = await screen.findByRole('textbox', { name: /Ex\.: um suspense/ });
  fireEvent.change(input, { target: { value: question } });
  fireEvent.click(screen.getByRole('button', { name: 'Pedir' }));
}

function emptyView(relaxations: RecView['relaxations']): RecView {
  return { recommendationId: 'rec-1', kind: 'assistant', createdAt: '2026-10-14T00:00:00Z', items: [], movies: new Map(), relaxations };
}

function recommendation(view: RecView): AssistantReply {
  return {
    kind: 'recommendation',
    interpreted: { preferGenres: ['thriller'], constraints: { minRating: 8 } },
    similarTo: null,
    similarToNotFound: null,
    view,
  };
}

beforeEach(() => {
  api.askAssistant.mockReset();
  api.requestRecommendation.mockReset();
});

describe('Assistant', () => {
  it('desabilita o envio para pedidos com menos de 3 caracteres', async () => {
    renderAssistant();
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'oi' } });
    expect(screen.getByRole('button', { name: 'Pedir' })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'oi!' } });
    expect(screen.getByRole('button', { name: 'Pedir' })).toBeEnabled();
  });

  it('com o assistente desligado mostra o aviso e o link para Descobrir no lugar do formulário', async () => {
    api.askAssistant.mockRejectedValue(new api.ApiError('assistant_disabled'));
    renderAssistant();
    await ask('um suspense curto');
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('O assistente está desligado nesta fase do beta.');
    expect(screen.getByRole('link', { name: 'Descobrir' })).toHaveAttribute('href', '/discover');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pedir' })).not.toBeInTheDocument();
  });

  it('mostra a mensagem de fora do tema quando o pedido não é sobre filmes', async () => {
    api.askAssistant.mockResolvedValue({ kind: 'off_topic' } satisfies AssistantReply);
    renderAssistant();
    await ask('qual a capital da França?');
    expect(await screen.findByText('Só consigo ajudar a escolher filmes. Tente descrever o que quer assistir.')).toBeInTheDocument();
    expect(screen.getByText('“qual a capital da França?”')).toBeInTheDocument();
    expect(api.askAssistant).toHaveBeenCalledWith('qual a capital da França?', []);
  });

  it('mostra a pergunta de esclarecimento do assistente', async () => {
    api.askAssistant.mockResolvedValue({ kind: 'clarify', question: 'Prefere algo leve ou tenso?' } satisfies AssistantReply);
    renderAssistant();
    await ask('quero um filme');
    expect(await screen.findByText('Prefere algo leve ou tenso?')).toBeInTheDocument();
  });

  it('mostra o aviso de limite diário quando o servidor recusa por limite', async () => {
    api.askAssistant.mockRejectedValue(new api.ApiError('daily_limit_reached'));
    renderAssistant();
    await ask('um suspense curto');
    expect(await screen.findByText('Você atingiu o limite de pedidos de hoje. Amanhã libera de novo.')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('mostra aviso genérico quando a rede falha', async () => {
    api.askAssistant.mockRejectedValue(new Error('boom'));
    renderAssistant();
    await ask('um suspense curto');
    expect(await screen.findByText('O assistente não respondeu agora. Tente de novo em instantes.')).toBeInTheDocument();
  });

  it('recomendação sem filmes mostra NoMatch com as restrições liberáveis', async () => {
    api.askAssistant.mockResolvedValue(recommendation(emptyView([{ constraint: 'minRating', wouldMatch: 48 }])));
    renderAssistant();
    await ask('um suspense bem avaliado');
    expect(await screen.findByText('Nenhum filme atende a todos os seus filtros agora.')).toBeInTheDocument();
    const relax = screen.getByRole('button', { name: /Sem nota mínima/ });
    expect(relax).toHaveTextContent('48 filmes');
    expect(screen.getByText('Entendi assim')).toBeInTheDocument();
    expect(screen.getByText('Suspense')).toBeInTheDocument();
  });

  it('recomendação sem filmes e sem restrições liberáveis pede para revisar os filtros', async () => {
    api.askAssistant.mockResolvedValue(recommendation(emptyView([])));
    renderAssistant();
    await ask('um suspense bem avaliado');
    expect(await screen.findByText('Nenhuma restrição isolada resolve. Revise seus filtros no perfil.')).toBeInTheDocument();
  });

  it('liberar uma restrição reaproveita os filtros interpretados sem chamar o assistente de novo', async () => {
    api.askAssistant.mockResolvedValue(recommendation(emptyView([{ constraint: 'minRating', wouldMatch: 48 }])));
    api.requestRecommendation.mockResolvedValue(emptyView([]));
    renderAssistant();
    await ask('um suspense bem avaliado');
    fireEvent.click(await screen.findByRole('button', { name: /Sem nota mínima/ }));
    await waitFor(() => expect(api.requestRecommendation).toHaveBeenCalledTimes(1));
    const [, ctx] = api.requestRecommendation.mock.calls[0] as [string, { constraints: Record<string, unknown>; preferGenres: string[] }];
    expect(ctx.constraints.minRating).toBeNull();
    expect(ctx.preferGenres).toEqual(['thriller']);
    expect(api.askAssistant).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('“um suspense bem avaliado (sem nota mínima)”')).toBeInTheDocument();
  });

  // Regressão: o relax era gravado como 'on_demand' e virava a recomendação principal da Home (DEC-029).
  it('liberar uma restrição no assistente não grava a recomendação como principal da Home (on_demand)', async () => {
    api.askAssistant.mockResolvedValue(recommendation(emptyView([{ constraint: 'minRating', wouldMatch: 48 }])));
    api.requestRecommendation.mockResolvedValue(emptyView([]));
    renderAssistant();
    await ask('um suspense bem avaliado');
    fireEvent.click(await screen.findByRole('button', { name: /Sem nota mínima/ }));
    await waitFor(() => expect(api.requestRecommendation).toHaveBeenCalledTimes(1));
    expect(api.requestRecommendation.mock.calls[0]?.[0]).toBe('assistant');
  });

  it('recomendação com filmes mostra os cards e envia os ids mostrados no pedido seguinte', async () => {
    const movie = makeMovie({ id: 'Q7', titlePt: 'Filme Sete' });
    const view: RecView = { ...emptyView([]), items: [makeItem({ movieId: 'Q7', tier: 'good' })], movies: new Map([[movie.id, movie]]) };
    api.askAssistant.mockResolvedValueOnce(recommendation(view)).mockResolvedValueOnce({ kind: 'off_topic' });
    renderAssistant();
    await ask('um suspense bem avaliado');
    expect(await screen.findByRole('link', { name: 'Filme Sete' })).toHaveAttribute('href', '/movie/Q7');
    expect(screen.getByText('Boa afinidade')).toBeInTheDocument();
    await ask('outro, por favor');
    await waitFor(() => expect(api.askAssistant).toHaveBeenLastCalledWith('outro, por favor', ['Q7']));
  });
});
