# Landing Cineou — 16/10/2026

## Referências e direção

Pedido: melhorar a landing com [Le Juste Milieu](https://www.le-juste-milieu.ch/) e [Pépite Boisson](https://www.pepiteboisson.ch/).

- Le Juste Milieu: tipografia editorial grande, ritmo espaçado, numeração de seções e composição serena.
- Pépite: narrativa do produto em etapas, objetos em destaque, formas curvas e perguntas frequentes.
- Adaptação: manter o fundo escuro, laranja e logo do Cineou; combinar o display existente com itálico serifado de sistema e uma seção creme. Arte original de ingressos em CSS, sem imagens ou conteúdo copiados das referências.

## Contrato de interface

A landing explica o produto antes de pedir acesso. Ordem: proposta → três etapas → conta → perguntas frequentes. CTA principal seleciona cadastro; acesso no cabeçalho seleciona login. Ambos usam âncora para o formulário existente. Cadastro, login, recuperação, mensagens e campos animados permanecem no componente Auth. Nenhuma autenticação, regra de recomendação ou chamada de API foi alterada.

Texto em PT/EN. Não mostrar filmes, notas, estatísticas ou depoimentos fictícios. Ingressos são decoração, ocultos da árvore de acessibilidade. Uma única h1; FAQ nativa com details/summary; link para pular navegação. Fontes locais ou do sistema. Sem novas dependências.

Entrada do hero e abertura da composição com CSS; cartões respondem ao hover. Navegadores com suporte a view timelines revelam as etapas ao rolar. Nos demais, o conteúdo permanece visível. Movimento reduzido respeitado pelo CSS global.

## Validação

- Build, TypeScript e suíte Vitest.
- Testes de regressão: CTA para cadastro, alternância para login e recuperação, âncoras válidas, uma h1 e tradução inglesa.
- Inspeção real no navegador em desktop, 768px, 390px e 320px; sem overflow horizontal.
- Fluxos de CTA e recuperação verificados sem enviar credenciais ou criar contas.
- Vite informa um chunk principal acima de 500 kB; otimização global de bundle não faz parte desta mudança de landing.
