// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test-utils.tsx';
import { GenreChip, NoMatch } from './ui.tsx';

describe('NoMatch', () => {
  it('lista cada restrição liberável com o rótulo e quantos filmes passariam', () => {
    renderWithProviders(
      <NoMatch
        relaxations={[
          { constraint: 'minRating', wouldMatch: 48 },
          { constraint: 'maxRuntimeMin', wouldMatch: 7 },
        ]}
        onRelax={vi.fn()}
      />,
    );
    expect(screen.getByText('Nenhum filme atende a todos os seus filtros agora.')).toBeInTheDocument();
    const rating = screen.getByRole('button', { name: /Sem nota mínima/ });
    expect(rating).toHaveTextContent('Sem nota mínima');
    expect(rating).toHaveTextContent('48 filmes');
    expect(screen.getByRole('button', { name: /Sem duração máxima/ })).toHaveTextContent('7 filmes');
    expect(screen.queryByText(/Revise seus filtros/)).not.toBeInTheDocument();
  });

  it('chama onRelax com a restrição do botão clicado', () => {
    const onRelax = vi.fn();
    renderWithProviders(
      <NoMatch
        relaxations={[
          { constraint: 'minRating', wouldMatch: 48 },
          { constraint: 'languages', wouldMatch: 3 },
        ]}
        onRelax={onRelax}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Qualquer idioma/ }));
    expect(onRelax).toHaveBeenCalledTimes(1);
    expect(onRelax).toHaveBeenCalledWith('languages');
  });

  it('sem restrições liberáveis pede para revisar os filtros e não mostra botões', () => {
    renderWithProviders(<NoMatch relaxations={[]} onRelax={vi.fn()} />);
    expect(screen.getByText('Nenhuma restrição isolada resolve. Revise seus filtros no perfil.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('GenreChip', () => {
  const labels = { on: 'Gosto', negative: 'Não curto' };

  it('desligado: não pressionado e rótulo só com o gênero', () => {
    renderWithProviders(<GenreChip genre="thriller" state="off" onClick={vi.fn()} labels={labels} />);
    const chip = screen.getByRole('button', { name: 'Suspense' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('ligado: pressionado e rótulo com o estado positivo', () => {
    renderWithProviders(<GenreChip genre="thriller" state="on" onClick={vi.fn()} labels={labels} />);
    expect(screen.getByRole('button', { name: 'Suspense: Gosto' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('negativo: pressionado e rótulo com o estado negativo', () => {
    renderWithProviders(<GenreChip genre="thriller" state="negative" onClick={vi.fn()} labels={labels} />);
    expect(screen.getByRole('button', { name: 'Suspense: Não curto' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('sem labels usa só o nome do gênero mesmo quando ligado', () => {
    renderWithProviders(<GenreChip genre="comedy" state="on" onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Comédia' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('traduz o nome do gênero para o idioma atual', () => {
    renderWithProviders(<GenreChip genre="thriller" state="off" onClick={vi.fn()} />, { locale: 'en' });
    expect(screen.getByRole('button', { name: 'Thriller' })).toBeInTheDocument();
  });

  it('chama onClick ao ser clicado', () => {
    const onClick = vi.fn();
    renderWithProviders(<GenreChip genre="thriller" state="off" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suspense' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
