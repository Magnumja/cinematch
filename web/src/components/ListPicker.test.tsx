// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test-utils.tsx';
import * as api from '../lib/api.ts';
import { ListPicker } from './ListPicker.tsx';

vi.mock('../lib/api.ts', () => {
  class ApiError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    ApiError,
    listMyLists: vi.fn(),
    listsContaining: vi.fn(),
    addToList: vi.fn(async () => undefined),
    removeFromList: vi.fn(async () => undefined),
    createList: vi.fn(async () => 'nova'),
  };
});
vi.mock('../lib/session.tsx', () => ({ useUser: () => ({ userId: 'u1' }) }));

const lists = [
  { id: 'l1', name: 'Terror', description: null, updatedAt: '', count: 3, covers: [] },
  { id: 'l2', name: 'Família', description: null, updatedAt: '', count: 0, covers: [] },
];

beforeEach(() => {
  vi.mocked(api.listMyLists).mockResolvedValue(lists);
  vi.mocked(api.listsContaining).mockResolvedValue(new Set(['l1']));
});

describe('ListPicker', () => {
  it('abre com as listas do usuário e marca as que já têm o filme', async () => {
    renderWithProviders(<ListPicker movieId="Q1" />);
    fireEvent.click(screen.getByRole('button', { name: '+ Lista' }));
    expect(await screen.findByRole('dialog', { name: 'Adicionar a uma lista' })).toBeInTheDocument();
    expect(await screen.findByRole('checkbox', { name: /Terror/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Família/ })).not.toBeChecked();
  });

  it('marcar adiciona e desmarcar remove o filme da lista', async () => {
    renderWithProviders(<ListPicker movieId="Q1" />);
    fireEvent.click(screen.getByRole('button', { name: '+ Lista' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Família/ }));
    await waitFor(() => expect(api.addToList).toHaveBeenCalledWith('l2', 'Q1'));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Família/ })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('checkbox', { name: /Terror/ }));
    await waitFor(() => expect(api.removeFromList).toHaveBeenCalledWith('l1', 'Q1'));
  });

  it('cria lista nova e já adiciona o filme', async () => {
    renderWithProviders(<ListPicker movieId="Q1" />);
    fireEvent.click(screen.getByRole('button', { name: '+ Lista' }));
    await screen.findByRole('checkbox', { name: /Terror/ });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nova lista' }), { target: { value: 'Clássicos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    await waitFor(() => expect(api.createList).toHaveBeenCalledWith('u1', 'Clássicos'));
    await waitFor(() => expect(api.addToList).toHaveBeenCalledWith('nova', 'Q1'));
  });

  it('mostra o erro de nome repetido em vez de falhar em silêncio', async () => {
    vi.mocked(api.createList).mockRejectedValueOnce(new api.ApiError('list_duplicate'));
    renderWithProviders(<ListPicker movieId="Q1" />);
    fireEvent.click(screen.getByRole('button', { name: '+ Lista' }));
    await screen.findByRole('checkbox', { name: /Terror/ });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nova lista' }), { target: { value: 'terror' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Você já tem uma lista com esse nome.');
  });

  it('Esc fecha e devolve o foco ao botão', async () => {
    renderWithProviders(<ListPicker movieId="Q1" />);
    const trigger = screen.getByRole('button', { name: '+ Lista' });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
