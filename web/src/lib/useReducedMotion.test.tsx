// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { renderWithProviders as render } from '../test-utils.tsx';
import { afterEach, expect, it, vi } from 'vitest';
import { useReducedMotion } from './useReducedMotion.ts';

function fakeMedia(initial: boolean) {
  const listeners = new Set<() => void>();
  const list = {
    matches: initial,
    addEventListener: vi.fn((_: string, fn: () => void) => listeners.add(fn)),
    removeEventListener: vi.fn((_: string, fn: () => void) => listeners.delete(fn)),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => list));
  return { list, listeners, set(value: boolean) { list.matches = value; listeners.forEach(fn => fn()); } };
}
afterEach(() => vi.unstubAllGlobals());

function Probe() {
  return <p>{useReducedMotion() ? 'reduzido' : 'normal'}</p>;
}

it('reage quando a preferência de movimento muda com a página aberta', () => {
  const media = fakeMedia(false);
  const { unmount } = render(<Probe />);
  expect(screen.getByText('normal')).toBeInTheDocument();
  act(() => media.set(true));
  expect(screen.getByText('reduzido')).toBeInTheDocument();
  act(() => media.set(false));
  expect(screen.getByText('normal')).toBeInTheDocument();
  unmount();
  expect(media.listeners.size).toBe(0);
});

it('lê a preferência já ativa na montagem', () => {
  fakeMedia(true);
  render(<Probe />);
  expect(screen.getByText('reduzido')).toBeInTheDocument();
});

it('assume movimento normal sem matchMedia', () => {
  vi.stubGlobal('matchMedia', undefined);
  render(<Probe />);
  expect(screen.getByText('normal')).toBeInTheDocument();
});
