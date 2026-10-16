// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test-utils.tsx';
import Auth from './Auth.tsx';

vi.mock('../lib/api.ts', () => ({ supabase: { auth: {} } }));

describe('landing e acesso', () => {
  it('leva o CTA ao cadastro e preserva a alternância para login e recuperação', () => {
    renderWithProviders(<Auth />);
    const start = screen.getByRole('link', { name: /Encontrar meu filme/ });
    expect(start).toHaveAttribute('href', '#account');
    fireEvent.click(start);
    expect(screen.getByRole('heading', { name: 'Criar conta' })).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'new-password');
    fireEvent.click(screen.getByRole('link', { name: /^Entrar/ }));
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar link de redefinição' })).toBeInTheDocument();
  });

  it('mantém um título principal e destinos existentes para as âncoras', () => {
    const { container } = renderWithProviders(<Auth />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    for (const anchor of container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      const target = anchor.getAttribute('href')!.slice(1);
      if (target) expect(document.getElementById(target)).not.toBeNull();
    }
    expect(container.querySelectorAll('details')).toHaveLength(3);
  });

  it('apresenta landing e acesso em inglês', () => {
    renderWithProviders(<Auth />, { locale: 'en' });
    expect(screen.getByRole('heading', { name: 'Less deciding. More cinema.' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /Find my next film/ }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });
});
