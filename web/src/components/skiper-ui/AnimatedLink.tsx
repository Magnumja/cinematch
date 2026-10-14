// Skiper 40 / Link001, adapted for React Router and keyboard focus.
// Author: @gurvinder-singh02, https://skiper-ui.com/v1/skiper40
// Free to use and modify for personal/commercial projects with Skiper UI attribution.
// Original inspired by cursor.com; independent recreation, not affiliated with Cursor.
import { Link, type LinkProps } from 'react-router-dom';

export function AnimatedLink({ children, className = '', ...props }: LinkProps) {
  return (
    <Link {...props} className={`skiper-link ${className}`}>
      <span className="skiper-link-label">{children}</span>
      <svg className="skiper-link-arrow" fill="none" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M1.004 9.166 9.337.833m0 0v8.333m0-8.333H1.004" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
