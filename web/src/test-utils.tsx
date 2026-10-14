// Utilitários compartilhados pelos testes de componente (não é importado pelo app).
import '@testing-library/jest-dom/vitest';
import { cleanup, render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach } from 'vitest';
import type { Factor, Movie } from '../../core/schemas.ts';
import type { RecItem } from './lib/api.ts';
import { LocaleProvider } from './lib/i18n.tsx';

afterEach(() => cleanup());

export function renderWithProviders(ui: ReactElement, { locale = 'pt', route = '/', ...options }: { locale?: 'pt' | 'en'; route?: string } & Omit<RenderOptions, 'wrapper'> = {}) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <LocaleProvider locale={locale}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </LocaleProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}

export function makeMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 'Q1001',
    titlePt: 'O Grande Teste',
    titleEn: 'The Big Test',
    year: 2001,
    runtimeMin: 112,
    genres: ['thriller', 'drama'],
    languages: ['en'],
    directors: [{ id: 'Q9001', name: 'Fulano de Tal' }],
    ratings: [],
    popularity: 10,
    descriptionPt: 'filme sintético para testes',
    descriptionEn: 'synthetic film for tests',
    ...overrides,
  };
}

export function makeItem(overrides: Partial<RecItem> = {}, factors: Factor[] = []): RecItem {
  return {
    movieId: 'Q1001',
    rank: 1,
    score: 0.87,
    tier: 'high',
    factors,
    itemId: 'item-1',
    feedback: null,
    ...overrides,
  };
}
