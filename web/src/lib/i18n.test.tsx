// @vitest-environment jsdom
import { render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import '../test-utils.tsx';
import { LocaleProvider, translate, useI18n, type MessageKey } from './i18n.tsx';
import source from './i18n.tsx?raw';

// Os dicionários não são exportados: lemos as chaves do código-fonte e os valores via translate().
function keysOf(dictName: 'pt' | 'en'): string[] {
  const start = source.search(new RegExp(`^const ${dictName}\\b[^=]*= \\{`, 'm'));
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf('\n};', start);
  const body = source.slice(start, end);
  return [...body.matchAll(/^\s+'([^']+)':/gm)].map((m) => m[1] as string);
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translate', () => {
  it('interpola variáveis numéricas e de texto', () => {
    expect(translate('pt', 'movie.ratingFrom', { value: '8.5', sources: 'Metacritic' })).toBe('Nota 8.5 (Metacritic)');
    expect(translate('en', 'movie.minutes', { n: 95 })).toBe('95 min');
  });

  it('não deixa marcadores {var} depois de interpolar', () => {
    const text = translate('pt', 'relax.count', { n: 3 });
    expect(text).toBe('3 filmes');
    expect(text).not.toContain('{n}');
  });

  it('mantém o marcador quando a variável não é informada', () => {
    expect(translate('pt', 'relax.count')).toBe('{n} filmes');
  });

  it('ignora variáveis que não existem no texto', () => {
    expect(translate('pt', 'movie.save', { n: 1 })).toBe('Salvar');
  });
});

describe('dicionários', () => {
  const ptKeys = keysOf('pt');
  const enKeys = keysOf('en');

  it('encontra as chaves no código-fonte', () => {
    expect(ptKeys.length).toBeGreaterThan(50);
  });

  it('pt e en têm exatamente as mesmas chaves, sem duplicatas', () => {
    expect(new Set(ptKeys).size).toBe(ptKeys.length);
    expect(new Set(enKeys).size).toBe(enKeys.length);
    expect([...enKeys].sort()).toEqual([...ptKeys].sort());
  });

  it('nenhum valor é vazio em nenhum idioma', () => {
    const empty = ptKeys.flatMap((k) =>
      (['pt', 'en'] as const).filter((l) => {
        const v: unknown = translate(l, k as MessageKey);
        return typeof v !== 'string' || v.trim() === '';
      }).map((l) => `${l}:${k}`),
    );
    expect(empty).toEqual([]);
  });

  it('as variáveis de cada texto são as mesmas em pt e en', () => {
    const mismatched = ptKeys.filter((k) => placeholders(translate('pt', k as MessageKey)).join() !== placeholders(translate('en', k as MessageKey)).join());
    expect(mismatched).toEqual([]);
  });
});

describe('LocaleProvider / useI18n', () => {
  it('fornece o idioma e um t() que traduz', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider locale="en">{children}</LocaleProvider>;
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.locale).toBe('en');
    expect(result.current.t('movie.save')).toBe('Save');
  });

  it('define o atributo lang do documento', () => {
    const { rerender } = render(<LocaleProvider locale="pt">x</LocaleProvider>);
    expect(document.documentElement.lang).toBe('pt-BR');
    rerender(<LocaleProvider locale="en">x</LocaleProvider>);
    expect(document.documentElement.lang).toBe('en');
  });

  it('mantém t() estável entre renderizações no mesmo idioma', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider locale="pt">{children}</LocaleProvider>;
    const { result, rerender } = renderHook(() => useI18n(), { wrapper });
    const first = result.current.t;
    rerender();
    expect(result.current.t).toBe(first);
  });
});
