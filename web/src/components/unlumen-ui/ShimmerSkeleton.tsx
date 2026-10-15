// Adapted from Unlumen UI ShimmerSkeleton by Léo (https://ui.unlumen.com/r/shimmer-skeleton.json).
// Adaptações: sem `cn`; cores da paleta local; keyframes em styles.css (nome próprio, sem <style> inline);
// cada peça é aria-hidden — quem anuncia o carregamento é o contêiner do layout (role="status"), senão o leitor
// de tela ouviria "Loading" uma vez por retângulo; sem animação para quem pede menos movimento.
import type { HTMLAttributes } from 'react';

export interface ShimmerSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  animate?: boolean;
}

const ROUNDED = { none: 'rounded-none', sm: 'rounded-sm', md: 'rounded-md', lg: 'rounded-lg', full: 'rounded-full' } as const;

export function ShimmerSkeleton({ className = '', rounded = 'md', animate = true, ...props }: ShimmerSkeletonProps) {
  return (
    <div aria-hidden="true" className={`relative overflow-hidden bg-matte/55 ${ROUNDED[rounded]} ${className}`} {...props}>
      {animate && <span className="unlumen-shimmer pointer-events-none absolute inset-0 -translate-x-full" />}
    </div>
  );
}
