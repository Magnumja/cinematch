// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Genre } from '../../../core/domain/genres.ts';
import { renderWithProviders } from '../test-utils.tsx';
import { TasteGenres } from './Pickers.tsx';

// Pickers.tsx importa funções de rede de api.ts (FavoritesPicker); TasteGenres não as usa.
vi.mock('../lib/api.ts', () => ({
  moviesByIds: vi.fn(async () => []),
  searchMovies: vi.fn(async () => []),
}));

describe('TasteGenres', () => {
  it('off → gosto: adiciona o gênero aos curtidos', () => {
    const onChange = vi.fn();
    renderWithProviders(<TasteGenres liked={['drama']} disliked={['horror']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suspense' }));
    expect(onChange).toHaveBeenCalledWith(['drama', 'thriller'], ['horror']);
  });

  it('gosto → não curto: move o gênero dos curtidos para os não curtidos', () => {
    const onChange = vi.fn();
    renderWithProviders(<TasteGenres liked={['drama', 'thriller']} disliked={['horror']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suspense: Gosto' }));
    expect(onChange).toHaveBeenCalledWith(['drama'], ['horror', 'thriller']);
  });

  it('não curto → off: remove o gênero dos não curtidos', () => {
    const onChange = vi.fn();
    renderWithProviders(<TasteGenres liked={['drama']} disliked={['horror', 'thriller']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suspense: Não curto' }));
    expect(onChange).toHaveBeenCalledWith(['drama'], ['horror']);
  });

  it('ciclo completo com estado controlado volta ao início', () => {
    const calls: [Genre[], Genre[]][] = [];
    function Harness() {
      const [liked, setLiked] = useState<Genre[]>([]);
      const [disliked, setDisliked] = useState<Genre[]>([]);
      return (
        <TasteGenres
          liked={liked}
          disliked={disliked}
          onChange={(l, d) => {
            calls.push([l, d]);
            setLiked(l);
            setDisliked(d);
          }}
        />
      );
    }
    renderWithProviders(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Suspense' }));
    expect(screen.getByRole('button', { name: 'Suspense: Gosto' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Suspense: Gosto' }));
    expect(screen.getByRole('button', { name: 'Suspense: Não curto' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Suspense: Não curto' }));
    expect(screen.getByRole('button', { name: 'Suspense' })).toHaveAttribute('aria-pressed', 'false');
    expect(calls).toEqual([
      [['thriller'], []],
      [[], ['thriller']],
      [[], []],
    ]);
  });

  it('mostra um chip por gênero, refletindo o estado de cada um', () => {
    renderWithProviders(<TasteGenres liked={['drama']} disliked={['horror']} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Drama: Gosto' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Terror: Não curto' })).toHaveAttribute('aria-pressed', 'true');
    const pressed = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(2);
  });
});
