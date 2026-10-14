// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test-utils.tsx';
import { AnimatedLink } from './skiper-ui/AnimatedLink.tsx';
import { GlowButton } from './unlumen-ui/GlowButton.tsx';

it('preserva navegação interna nos links animados', () => {
  renderWithProviders(<Routes><Route path="/" element={<AnimatedLink to="/list">Minha lista</AnimatedLink>} /><Route path="/list" element={<h1>Filmes salvos</h1>} /></Routes>);
  fireEvent.click(screen.getByRole('link', { name: 'Minha lista' }));
  expect(screen.getByRole('heading', { name: 'Filmes salvos' })).toBeInTheDocument();
});

it('preserva submit e disabled no botão com brilho', () => {
  const submit = vi.fn((e: React.FormEvent) => e.preventDefault());
  const { rerender } = renderWithProviders(<form onSubmit={submit}><GlowButton type="submit" disabled>Entrar</GlowButton></form>);
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(submit).not.toHaveBeenCalled();
  rerender(<form onSubmit={submit}><GlowButton type="submit">Entrar</GlowButton></form>);
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(submit).toHaveBeenCalledOnce();
});

// Keep real Motion rendering; only substitute the OS preference (read through matchMedia).
it('desativa a transformação 3D sem bloquear ações quando movimento reduzido está ativo', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  try {
    const { Tilt } = await import('./unlumen-ui/Tilt.tsx');
    const save = vi.fn();
    const { container } = renderWithProviders(<Tilt><button onClick={save}>Salvar filme</button></Tilt>);
    expect(container.querySelector('.tilt-frame > div')).toHaveStyle({ transform: 'none' });
    expect(container.querySelector('.tilt-frame')).not.toHaveStyle({ opacity: '0' });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar filme' }));
    expect(save).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('mostra o card com opacidade 1 enquanto os recursos de animação não carregaram', async () => {
  vi.resetModules();
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  try {
    // First render happens before the async features chunk resolves.
    const { Tilt } = await import('./unlumen-ui/Tilt.tsx');
    const { container } = renderWithProviders(<Tilt><p>Card</p></Tilt>);
    expect(container.querySelector('.tilt-frame')).not.toHaveStyle({ opacity: '0' });
    expect(screen.getByText('Card')).toBeVisible();
  } finally {
    vi.unstubAllGlobals();
    vi.resetModules();
  }
});
