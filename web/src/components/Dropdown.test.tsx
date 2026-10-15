// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test-utils.tsx';
import { Dropdown, MultiDropdown } from './Dropdown.tsx';

const RUNTIMES = [
  { value: 90, label: '90 min' },
  { value: 120, label: '120 min' },
  { value: 150, label: '150 min' },
];

const GENRES = [
  { value: 'action', label: 'Ação' },
  { value: 'comedy', label: 'Comédia' },
  { value: 'drama', label: 'Drama' },
  { value: 'horror', label: 'Terror' },
] as const;
type G = (typeof GENRES)[number]['value'];

function Single({ initial = null, onChange }: { initial?: number | null; onChange?: (v: number | null) => void }) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <div>
      <Dropdown label="Duração" value={value} options={RUNTIMES} placeholder="Qualquer" onChange={(v) => { setValue(v); onChange?.(v); }} />
      <button type="button">fora</button>
    </div>
  );
}

function Multi({ initial = [], onChange, max }: { initial?: G[]; onChange?: (v: G[]) => void; max?: number }) {
  const [value, setValue] = useState<G[]>(initial);
  return (
    <MultiDropdown
      label="Com vontade de"
      value={value}
      options={[...GENRES]}
      placeholder="Qualquer gênero"
      max={max}
      onChange={(v) => { setValue(v); onChange?.(v); }}
    />
  );
}

const trigger = (name: RegExp) => screen.getByRole('button', { name });
const listbox = () => screen.getByRole('listbox', { hidden: true });

describe('Dropdown', () => {
  it('abre e fecha pelo botão, refletindo aria-expanded', () => {
    renderWithProviders(<Single />);
    const button = trigger(/Duração/);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeVisible();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('tem os atributos ARIA do padrão listbox e o rótulo associado', () => {
    renderWithProviders(<Single initial={120} />);
    const button = trigger(/Duração/);
    expect(button).toHaveAttribute('aria-haspopup', 'listbox');
    expect(button).toHaveAccessibleName('Duração 120 min');
    fireEvent.click(button);
    const list = screen.getByRole('listbox', { name: 'Duração' });
    expect(button).toHaveAttribute('aria-controls', list.id);
    expect(list).not.toHaveAttribute('aria-multiselectable');
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Qualquer', '90 min', '120 min', '150 min']);
    expect(screen.getByRole('option', { name: '120 min' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: '90 min' })).toHaveAttribute('aria-selected', 'false');
    // Ao abrir, a opção ativa é a selecionada e a lista recebe o foco.
    expect(list).toHaveFocus();
    expect(list).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: '120 min' }).id);
  });

  it('seleção única: escolhe, fecha, devolve o foco e permite voltar a "Qualquer"', () => {
    const onChange = vi.fn();
    renderWithProviders(<Single onChange={onChange} />);
    fireEvent.click(trigger(/Duração/));
    fireEvent.click(screen.getByRole('option', { name: '150 min' }));
    expect(onChange).toHaveBeenLastCalledWith(150);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger(/Duração/)).toHaveFocus();
    expect(trigger(/Duração/)).toHaveAccessibleName('Duração 150 min');

    fireEvent.click(trigger(/Duração/));
    fireEvent.click(screen.getByRole('option', { name: 'Qualquer' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(trigger(/Duração/)).toHaveAccessibleName('Duração Qualquer');
  });

  it('sem allowClear não oferece "Qualquer"', () => {
    renderWithProviders(<Dropdown label="Hora" value={1} options={[{ value: 1, label: '01:00' }]} placeholder="—" allowClear={false} onChange={vi.fn()} />);
    fireEvent.click(trigger(/Hora/));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['01:00']);
  });

  it('teclado: setas, Home/End, Enter seleciona e Esc fecha devolvendo o foco', () => {
    const onChange = vi.fn();
    renderWithProviders(<Single onChange={onChange} />);
    const button = trigger(/Duração/);
    button.focus();
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    const list = listbox();
    expect(list).toHaveFocus();
    const active = () => document.getElementById(list.getAttribute('aria-activedescendant')!)?.textContent;
    expect(active()).toBe('Qualquer');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(active()).toBe('120 min');
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(active()).toBe('90 min');
    fireEvent.keyDown(list, { key: 'End' });
    expect(active()).toBe('150 min');
    fireEvent.keyDown(list, { key: 'ArrowDown' }); // não passa do fim
    expect(active()).toBe('150 min');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(active()).toBe('Qualquer');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(90);
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(listbox()).toHaveFocus();
    fireEvent.keyDown(listbox(), { key: 'Escape' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('Espaço seleciona e Tab fecha', () => {
    const onChange = vi.fn();
    renderWithProviders(<Single onChange={onChange} />);
    fireEvent.click(trigger(/Duração/));
    fireEvent.keyDown(listbox(), { key: 'End' });
    fireEvent.keyDown(listbox(), { key: ' ' });
    expect(onChange).toHaveBeenLastCalledWith(150);

    fireEvent.click(trigger(/Duração/));
    fireEvent.keyDown(listbox(), { key: 'Tab' });
    expect(trigger(/Duração/)).toHaveAttribute('aria-expanded', 'false');
  });

  it('clique fora fecha sem selecionar', () => {
    const onChange = vi.fn();
    renderWithProviders(<Single onChange={onChange} />);
    fireEvent.click(trigger(/Duração/));
    fireEvent.mouseDown(screen.getByRole('button', { name: 'fora' }));
    expect(trigger(/Duração/)).toHaveAttribute('aria-expanded', 'false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clique dentro do painel não fecha', () => {
    renderWithProviders(<Single />);
    fireEvent.click(trigger(/Duração/));
    fireEvent.mouseDown(screen.getByRole('option', { name: '90 min' }));
    expect(trigger(/Duração/)).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('MultiDropdown', () => {
  it('marca várias opções sem fechar e resume no botão', () => {
    const onChange = vi.fn();
    renderWithProviders(<Multi onChange={onChange} />);
    const button = trigger(/Com vontade de/);
    expect(button).toHaveAccessibleName('Com vontade de Qualquer gênero');
    fireEvent.click(button);
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-multiselectable', 'true');
    for (const name of ['Ação', 'Comédia', 'Drama', 'Terror']) fireEvent.click(screen.getByRole('option', { name }));
    expect(onChange).toHaveBeenLastCalledWith(['action', 'comedy', 'drama', 'horror']);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('option').every((o) => o.getAttribute('aria-selected') === 'true')).toBe(true);
    expect(button).toHaveAccessibleName('Com vontade de Ação, Comédia +2');

    // Clicar de novo desmarca.
    fireEvent.click(screen.getByRole('option', { name: 'Comédia' }));
    expect(onChange).toHaveBeenLastCalledWith(['action', 'drama', 'horror']);
    expect(screen.getByRole('option', { name: 'Comédia' })).toHaveAttribute('aria-selected', 'false');
  });

  it('teclado: Enter e Espaço alternam a opção ativa e mantêm a lista aberta', () => {
    const onChange = vi.fn();
    renderWithProviders(<Multi onChange={onChange} />);
    fireEvent.click(trigger(/Com vontade de/));
    const list = listbox();
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(['comedy']);
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: ' ' });
    expect(onChange).toHaveBeenLastCalledWith(['comedy', 'drama']);
    expect(list).toHaveFocus();
    fireEvent.keyDown(list, { key: 'Escape' });
    expect(trigger(/Com vontade de/)).toHaveFocus();
  });

  it('"Limpar" no painel desmarca tudo', () => {
    const onChange = vi.fn();
    renderWithProviders(<Multi initial={['action', 'drama']} onChange={onChange} />);
    fireEvent.click(trigger(/Com vontade de/));
    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(trigger(/Com vontade de/)).toHaveAccessibleName('Com vontade de Qualquer gênero');
  });

  it('respeita o máximo: opções não marcadas ficam desabilitadas', () => {
    const onChange = vi.fn();
    renderWithProviders(<Multi initial={['action']} max={1} onChange={onChange} />);
    fireEvent.click(trigger(/Com vontade de/));
    const drama = screen.getByRole('option', { name: 'Drama' });
    expect(drama).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(drama);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clique fora fecha', () => {
    renderWithProviders(<Multi />);
    fireEvent.click(trigger(/Com vontade de/));
    fireEvent.mouseDown(document.body);
    expect(trigger(/Com vontade de/)).toHaveAttribute('aria-expanded', 'false');
  });
});
