import { useEffect, useRef, useState, type ComponentPropsWithRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

type Letter = { id: number; text: string; style: CSSProperties };
// Intl.Segmenter não existe em parte dos navegadores do alvo do build (ex.: Firefox 114–124).
// Criá-lo no carregamento do módulo derrubava o app inteiro; agora é opcional, com Array.from como alternativa.
const SEGMENTER = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
export function graphemeCount(text: string): number {
  return SEGMENTER ? [...SEGMENTER.segment(text)].length : Array.from(text).length;
}

// Chromium/WebKit mask passwords with -webkit-text-security: disc, which draws the engine's own
// glyph whatever the text is; Firefox masks with U+25CF. Using both keeps the overlay aligned.
const PASSWORD_MASK = '\u25CF';

// `font` (shorthand) can be empty in Firefox's computed style; copy the longhands instead.
function fontOf(css: CSSStyleDeclaration) {
  return { fontStyle: css.fontStyle, fontWeight: css.fontWeight, fontSize: css.fontSize, fontFamily: css.fontFamily, fontStretch: css.fontStretch };
}

// Only the newly inserted glyph is temporarily painted above the native input.
// Password values are never copied: their visual glyph is always the mask disc.
export function AnimatedInput({ className = '', onInput, onBlur, onFocus, onKeyDown, onPointerDown, onScroll, onCompositionStart, onCompositionEnd, ...props }: ComponentPropsWithRef<'input'>) {
  const [letter, setLetter] = useState<Letter | null>(null);
  const composing = useRef(false);
  // Safari fires compositionend before the final input event; that input must not animate again.
  const afterComposition = useRef(false);
  const previous = useRef(props.type === 'password' ? '' : String(props.value ?? props.defaultValue ?? ''));
  const sequence = useRef(0);

  useEffect(() => {
    if (!letter) return;
    const clear = () => setLetter(null);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const timer = window.setTimeout(clear, 220);
    window.addEventListener('scroll', clear, true);
    window.addEventListener('resize', clear);
    media.addEventListener('change', clear);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', clear, true);
      window.removeEventListener('resize', clear);
      media.removeEventListener('change', clear);
    };
  }, [letter]);

  function animateLetter(input: HTMLInputElement, inserted: string | null, inputType?: string) {
    const old = previous.current;
    previous.current = input.type === 'password' ? '' : input.value;
    setLetter(null);
    if (props.disabled || props.readOnly || !inserted || inputType?.startsWith('delete') ||
      !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      graphemeCount(inserted) !== 1) return;

    const password = input.type === 'password';
    let end = input.selectionStart;
    // Email inputs do not expose selectionStart. Locate the edit against the
    // previous non-secret value, including insertion in the middle of an email.
    if (end === null) {
      let start = 0;
      while (start < old.length && start < input.value.length && old[start] === input.value[start]) start++;
      end = Math.min(input.value.length, start + inserted.length);
    }
    const start = Math.max(0, end - inserted.length);
    const prefix = password ? PASSWORD_MASK.repeat(graphemeCount(input.value.slice(0, start))) : input.value.slice(0, start);
    const text = password ? PASSWORD_MASK : inserted;
    const css = getComputedStyle(input);
    if (css.direction === 'rtl' || css.textAlign === 'center' || css.textAlign === 'right') return;
    const rect = input.getBoundingClientRect();
    const measure = document.createElement('span');
    Object.assign(measure.style, { position: 'fixed', visibility: 'hidden', whiteSpace: 'pre', ...fontOf(css), letterSpacing: css.letterSpacing });
    if (password) measure.style.setProperty('-webkit-text-security', 'disc');
    document.body.append(measure);
    measure.textContent = prefix;
    const offset = measure.getBoundingClientRect().width;
    measure.textContent = text;
    const width = measure.getBoundingClientRect().width;
    measure.remove();
    const left = rect.left + parseFloat(css.borderLeftWidth || '0') + parseFloat(css.paddingLeft || '0') + offset - input.scrollLeft;
    const rightEdge = rect.right - parseFloat(css.paddingRight || '0');
    if (!width || left < rect.left + parseFloat(css.paddingLeft || '0') || left + width > rightEdge) return;
    const height = parseFloat(css.lineHeight) || parseFloat(css.fontSize) * 1.2;
    setLetter({ id: ++sequence.current, text, style: {
      left, top: rect.top + (rect.height - height) / 2, width, height,
      ...fontOf(css), lineHeight: `${height}px`, letterSpacing: css.letterSpacing,
      color: css.color, backgroundColor: css.backgroundColor,
      ...(password ? { WebkitTextSecurity: 'disc' } as CSSProperties : {}),
    } });
  }

  return (
    <>
      <input
        {...props}
        className={`animated-input ${className}`}
        onFocus={event => { previous.current = event.currentTarget.type === 'password' ? '' : event.currentTarget.value; onFocus?.(event); }}
        onInput={event => {
          const native = event.nativeEvent as InputEvent;
          if (afterComposition.current) {
            afterComposition.current = false;
            previous.current = event.currentTarget.type === 'password' ? '' : event.currentTarget.value;
          } else if (!composing.current && !native.isComposing) animateLetter(event.currentTarget, native.data, native.inputType);
          onInput?.(event);
        }}
        onCompositionStart={event => { composing.current = true; setLetter(null); onCompositionStart?.(event); }}
        onCompositionEnd={event => {
          composing.current = false;
          animateLetter(event.currentTarget, event.data);
          // Only the input dispatched in the same task belongs to this composition (Safari).
          afterComposition.current = true;
          window.setTimeout(() => { afterComposition.current = false; }, 0);
          onCompositionEnd?.(event);
        }}
        onBlur={event => { setLetter(null); composing.current = false; previous.current = ''; onBlur?.(event); }}
        onPointerDown={event => { setLetter(null); onPointerDown?.(event); }}
        onKeyDown={event => { setLetter(null); onKeyDown?.(event); }}
        onScroll={event => { setLetter(null); onScroll?.(event); }}
      />
      {letter && createPortal(
        <span key={letter.id} aria-hidden="true" className="input-letter-mask" style={letter.style}>
          <span className="input-letter" onAnimationEnd={() => setLetter(null)}>{letter.text}</span>
        </span>, document.body,
      )}
    </>
  );
}
