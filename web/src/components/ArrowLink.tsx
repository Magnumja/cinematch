// Link com sublinhado que cresce da esquerda e seta que avança no hover/foco. Implementação própria do Cineou
// (sublinhado por background-size, seta tipográfica), sem código de bibliotecas de terceiros.
import { Link, type LinkProps } from 'react-router-dom';

export function ArrowLink({ children, className = '', ...props }: LinkProps) {
  return (
    <Link {...props} className={`arrow-link ${className}`}>
      <span className="arrow-link-text">{children}</span>
      <span aria-hidden="true" className="arrow-link-icon">→</span>
    </Link>
  );
}
