# Componentes de UI de terceiros

Integração em 2026-10-14, a pedido do responsável. Os componentes abaixo são adaptações de código público das bibliotecas, e não apenas referências visuais. Não redistribuir como biblioteca ou componentes isolados.

## Unlumen UI — Léo

Licença: https://unlumen-ui-docs.vercel.app/docs/license
Permite uso e adaptação em aplicações, inclusive comerciais. Proíbe redistribuição como componente isolado, biblioteca ou registry. Componentes gratuitos não exigem atribuição.

- `web/src/components/unlumen-ui/Tilt.tsx`: fonte https://ui.unlumen.com/r/tilt.json, primitiva usada pelo [Tilt Card](https://ui.unlumen.com/components/tilt-card). Mantém Motion values, springs e transformação 3D. Adaptações: rotação menor, medição em wrapper estável, limites normalizados, exclusão de toque, reset no foco e cancelamento, suporte a movimento reduzido.
- `web/src/components/unlumen-ui/GlowButton.tsx`: fonte https://unlumen-ui-docs.vercel.app/docs/ui/buttons/glow. Adaptação simplificada do modo static: gradiente na paleta local, brilho só em hover/foco, sem loop contínuo; mantém um botão HTML sem wrapper de layout. O original credita Magic UI como inspiração.
- `web/src/components/unlumen-ui/ShimmerSkeleton.tsx`: fonte https://ui.unlumen.com/r/shimmer-skeleton.json. Mantém a API (`rounded`, `animate`) e a faixa de luz em `translateX`. Adaptações: sem `cn`, cores da paleta local, keyframes `unlumen-shimmer` em `styles.css` (sem `<style>` inline), peças `aria-hidden` (o contêiner de cada layout em `Skeletons.tsx` é que tem `role="status"`), sem animação com movimento reduzido.

## Skiper UI (removido em 2026-10-16)

O `AnimatedLink` adaptado do Skiper 40 foi substituído por `web/src/components/ArrowLink.tsx`, implementação própria
(sublinhado por `background-size` e seta tipográfica). A licença gratuita do Skiper exige atribuição visível; sem código
deles no app, o crédito saiu do rodapé, da entrada e da página Sobre, a pedido do responsável.
A atribuição ao Unlumen não é exigida para componentes gratuitos (licença acima), então também não aparece na interface.

## Dependências

Motion instalado via npm, com versão fixada pelo package-lock. A orientação anterior de usar exclusivamente CSS foi revista para atender ao pedido explícito de integrar componentes dessas bibliotecas. CSS continua responsável por transições simples; Motion atende à mola 3D do Tilt. Nenhum componente Pro foi incorporado.
