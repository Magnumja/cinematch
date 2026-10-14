// Adapted from Unlumen UI GlowButton by Léo (itself inspired by Magic UI).
// Static gradient mode with CSS hover/focus reveal; source/license in docs/ui-component-sources.md.
import type { ButtonHTMLAttributes } from 'react';

export function GlowButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={`unlumen-glow ${className}`}>
      <span className="unlumen-glow-layer" aria-hidden="true" />
      <span className="relative inline-flex items-center justify-center gap-2">{children}</span>
    </button>
  );
}
