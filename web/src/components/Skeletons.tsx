// Esqueletos de carregamento com o formato do conteúdo que vai aparecer (menos "pulo" quando ele chega).
// Cada um é uma região role="status" com rótulo; as peças internas são decorativas.
import type { ReactNode } from 'react';
import { useI18n } from '../lib/i18n.tsx';
import { ShimmerSkeleton as S } from './unlumen-ui/ShimmerSkeleton.tsx';

function Loading({ label, className = '', children }: { label?: string; className?: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div role="status" aria-busy="true" aria-label={label ?? t('loading')} className={className}>
      {children}
    </div>
  );
}

// Destaque da Home: pôster, selo, título grande, metadados, sinopse e o painel de motivos.
export function HeroSkeleton({ label }: { label?: string }) {
  return (
    <Loading label={label} className="rounded-[28px] bg-graphite/40 p-5 ring-1 ring-matte sm:p-10 lg:p-14">
      <div className="grid gap-6 sm:grid-cols-[auto_1fr] lg:grid-cols-[auto_1.4fr_1fr] lg:gap-12">
        <S className="aspect-[2/3] w-28 sm:w-44 lg:w-56" rounded="lg" />
        <div className="min-w-0 space-y-4">
          <S className="h-7 w-36" rounded="full" />
          <S className="h-12 w-11/12 sm:h-20" rounded="lg" />
          <S className="h-12 w-2/3 sm:h-20" rounded="lg" />
          <S className="h-4 w-1/2" />
          <div className="flex gap-2">
            <S className="h-6 w-24" rounded="full" />
            <S className="h-6 w-20" rounded="full" />
          </div>
          <S className="h-3.5 w-full" />
          <S className="h-3.5 w-5/6" />
        </div>
        <div className="space-y-3 rounded-2xl border border-paper/10 p-5 sm:col-span-2 lg:col-span-1">
          <S className="h-3.5 w-1/3" />
          <S className="h-5 w-11/12" />
          <S className="h-5 w-3/4" />
          <div className="flex gap-2 pt-4">
            <S className="h-11 w-24" rounded="full" />
            <S className="h-11 w-32" rounded="full" />
          </div>
        </div>
      </div>
    </Loading>
  );
}

// Cartões compactos (Descobrir, "Mais para o seu perfil").
export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Loading className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-2xl p-4 ring-1 ring-matte sm:p-5">
          <div className="flex justify-between gap-3">
            <S className="h-4 w-20" />
            <S className="aspect-[2/3] w-14 sm:w-20" rounded="md" />
          </div>
          <S className="h-7 w-11/12" rounded="lg" />
          <S className="h-3.5 w-2/3" />
          <S className="h-3.5 w-1/2" />
        </div>
      ))}
    </Loading>
  );
}

// Linhas de lista (Busca, Minha lista).
export function RowListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <Loading>
      <ul>
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="flex items-center gap-4 border-b border-matte py-4">
            <S className="aspect-[2/3] w-12 shrink-0" rounded="md" />
            <div className="flex-1 space-y-2">
              <S className="h-5 w-3/5" />
              <S className="h-3.5 w-2/5" />
            </div>
            <S className="hidden h-9 w-20 sm:block" rounded="full" />
          </li>
        ))}
      </ul>
    </Loading>
  );
}

// Detalhe do filme.
export function DetailSkeleton() {
  return (
    <Loading className="grid gap-8 md:grid-cols-[auto_1fr] md:gap-12">
      <S className="aspect-[2/3] w-36 sm:w-52 md:w-64" rounded="lg" />
      <div className="space-y-4">
        <S className="h-14 w-4/5 sm:h-20" rounded="lg" />
        <S className="h-4 w-1/2" />
        <S className="h-4 w-2/5" />
        <div className="space-y-2 pt-4">
          <S className="h-4 w-full" />
          <S className="h-4 w-11/12" />
          <S className="h-4 w-4/5" />
        </div>
        <S className="h-11 w-28" rounded="full" />
      </div>
    </Loading>
  );
}

// Página genérica (rotas carregando, sessão).
export function PageSkeleton() {
  return (
    <Loading className="space-y-8">
      <div className="space-y-3">
        <S className="h-3 w-40" />
        <S className="h-12 w-2/3 sm:w-1/2" rounded="lg" />
        <S className="h-4 w-1/2 sm:w-1/3" />
      </div>
      <S className="h-56 w-full sm:h-72" rounded="lg" />
    </Loading>
  );
}
