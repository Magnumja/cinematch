// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test-utils.tsx';
import { AnimatedInput } from './AnimatedInput.tsx';

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return { left: 0, top: 0, right: 300, bottom: 48, width: this.tagName === 'INPUT' ? 300 : (this.textContent?.length ?? 0) * 8, height: 48, x: 0, y: 0, toJSON() {} };
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const style = { padding: '12px', fontSize: '16px', lineHeight: '24px', borderWidth: '0px' };

it('anima só a letra inserida e mantém foco, seleção e o mesmo input', () => {
  function Field() {
    const [value, setValue] = useState('');
    return <AnimatedInput style={style} aria-label="Busca" value={value} onChange={e => setValue(e.target.value)} />;
  }
  renderWithProviders(<Field />);
  const input = screen.getByRole('textbox') as HTMLInputElement;
  input.focus();
  fireEvent.input(input, { target: { value: 'c' }, data: 'c', inputType: 'insertText' });
  expect(document.querySelector('.input-letter')).toHaveTextContent('c');
  fireEvent.input(input, { target: { value: 'ci' }, data: 'i', inputType: 'insertText' });
  expect(document.querySelectorAll('.input-letter')).toHaveLength(1);
  expect(document.querySelector('.input-letter')).toHaveTextContent('i');
  expect(input).toHaveFocus();
  expect(screen.getByRole('textbox')).toBe(input);
  input.setSelectionRange(0, 1);
  expect(input.selectionStart).toBe(0);
  fireEvent.pointerDown(input);
  expect(document.querySelector('.input-letter')).toBeNull();
});

it('anima somente uma bolinha na senha, sem replicar o segredo no DOM', () => {
  renderWithProviders(<AnimatedInput style={style} aria-label="Senha" type="password" autoComplete="current-password" />);
  const input = screen.getByLabelText('Senha');
  fireEvent.input(input, { target: { value: 'segredo' }, data: 'o', inputType: 'insertText' });
  expect(input).toHaveAttribute('type', 'password');
  expect(input).toHaveAttribute('autocomplete', 'current-password');
  expect(document.body.textContent).not.toContain('segredo');
  expect(document.querySelector('.input-letter')).toHaveTextContent('●');
});

it('mede a senha com o disco da máscara nativa e posiciona a bolinha depois do prefixo mascarado', () => {
  const measured: string[] = [];
  vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
    if (this.tagName === 'SPAN') measured.push(this.textContent ?? '');
    return { left: 0, top: 0, right: 300, bottom: 48, width: this.tagName === 'INPUT' ? 300 : (this.textContent?.length ?? 0) * 8, height: 48, x: 0, y: 0, toJSON() {} };
  });
  const setProperty = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty');
  renderWithProviders(<AnimatedInput style={{ ...style, fontFamily: 'Schibsted Grotesk Variable' }} aria-label="Senha" type="password" />);
  const input = screen.getByLabelText('Senha') as HTMLInputElement;
  fireEvent.input(input, { target: { value: 'segredo' }, data: 'o', inputType: 'insertText' });
  // WebKit draws U+25CF; the measuring span also gets -webkit-text-security: disc.
  expect(measured).toContain('●●●●●●');
  expect(measured.join('')).not.toMatch(/[•a-z]/);
  expect(setProperty).toHaveBeenCalledWith('-webkit-text-security', 'disc');
  const mask = document.querySelector<HTMLElement>('.input-letter-mask');
  expect(mask?.style.left).toBe(`${12 + 6 * 8}px`);
  // Font copied from longhands: the shorthand can be empty in Firefox.
  expect(mask?.style.fontSize).toBe('16px');
  expect(mask?.style.fontFamily).toContain('Schibsted Grotesk Variable');
});

it('no Safari, não anima de novo o input que chega depois do compositionend', async () => {
  renderWithProviders(<AnimatedInput style={style} aria-label="Nome" />);
  const input = screen.getByRole('textbox');
  fireEvent.compositionStart(input);
  fireEvent.input(input, { target: { value: 'あ' }, data: 'あ', isComposing: true });
  fireEvent.compositionEnd(input, { data: 'あ' });
  const first = document.querySelector('.input-letter');
  expect(first).toHaveTextContent('あ');
  // Safari order: compositionend, then a non-composing input for the same text.
  fireEvent.input(input, { target: { value: 'あ' }, data: 'あ', inputType: 'insertFromComposition' });
  expect(document.querySelectorAll('.input-letter')).toHaveLength(1);
  expect(document.querySelector('.input-letter')).toBe(first);
  // The next real keystroke still animates.
  await new Promise(resolve => setTimeout(resolve, 0));
  fireEvent.input(input, { target: { value: 'あb' }, data: 'b', inputType: 'insertText' });
  expect(document.querySelector('.input-letter')).toHaveTextContent('b');
});

it('espera composição IME e limpa ao sair; não anima remoções', async () => {
  renderWithProviders(<AnimatedInput style={style} aria-label="Nome" />);
  const input = screen.getByRole('textbox');
  fireEvent.compositionStart(input);
  fireEvent.input(input, { target: { value: 'あ' }, data: 'あ', isComposing: true });
  expect(document.querySelector('.input-letter')).toBeNull();
  fireEvent.compositionEnd(input, { data: 'あ' });
  expect(document.querySelector('.input-letter')).toHaveTextContent('あ');
  await new Promise(resolve => setTimeout(resolve, 0));
  fireEvent.input(input, { target: { value: '' }, data: null, inputType: 'deleteContentBackward' });
  expect(document.querySelector('.input-letter')).toBeNull();
});

it('mostra apenas o input nativo quando movimento reduzido está ativo', () => {
  vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
  renderWithProviders(<AnimatedInput style={style} aria-label="Busca" />);
  fireEvent.input(screen.getByRole('textbox'), { target: { value: 'a' }, data: 'a', inputType: 'insertText' });
  expect(screen.getByRole('textbox')).toHaveValue('a');
  expect(document.querySelector('.input-letter')).toBeNull();
});

describe('AnimatedInput sem Intl.Segmenter', () => {
  it('carrega e funciona em navegadores sem Intl.Segmenter (não derruba o app)', async () => {
    const intl = Intl as { Segmenter?: typeof Intl.Segmenter };
    const original = intl.Segmenter;
    delete intl.Segmenter; // simula navegador antigo
    try {
      vi.resetModules();
      const mod = await import('./AnimatedInput.tsx');
      expect(mod.graphemeCount('ação')).toBe(4);
      expect(typeof mod.AnimatedInput).toBe('function');
    } finally {
      intl.Segmenter = original;
      vi.resetModules();
    }
  });
});
