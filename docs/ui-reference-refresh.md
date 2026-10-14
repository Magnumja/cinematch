# Refinamento de interface — 14/10/2026

Referências fornecidas pelo responsável:
- [Movie Streaming Mobile App UI/UX](https://www.behance.net/gallery/256117051/Movie-Streaming-Mobile-App-UIUX): superfícies escuras, acento quente, destaque de conteúdo e controles arredondados.
- [Unlumen](https://ui.unlumen.com): linguagem contida de superfícies e navegação.
- [Skiper UI](https://skiper-ui.com): navegação compacta e resposta visual nas interações.

## Contrato visual

A Home deve ajudar a escolher um filme: um destaque, explicação da afinidade, salvar ou pedir outra sugestão. Títulos continuam sendo o elemento visual principal (DEC-008); não introduzir pôsteres, notas ou disponibilidade inventados. Preservar a paleta e fontes locais da DEC-031, clareando o texto secundário para melhorar contraste.

Cards recebem profundidade sutil por gênero e movimento somente em dispositivos com hover que não pedem movimento reduzido. Navegação ativa usa preenchimento de alto contraste. Botões compartilhados, chips e feedback têm altura mínima de 44px. Telas estreitas mantêm menu expansível e empilham conteúdo; a introdução de login fica mais curta para aproximar o formulário. Login, cadastro, recuperação, carregamento, erro e vazio continuam disponíveis em PT/EN.

A primeira etapa usou CSS/React próprio. A integração posterior de componentes gratuitos da Unlumen e Skiper está detalhada em [ui-component-sources.md](ui-component-sources.md).

## Validação

Build e 107 testes aprovados. Login inspecionado no navegador em desktop e 320px, sem overflow horizontal; alternância para cadastro verificada. As telas autenticadas precisam de inspeção visual com uma sessão de usuário; os componentes existentes passaram nos testes.

## Movimento

Entrada de páginas em 360ms; sequência dos cards com intervalos de 60ms e atraso máximo de 180ms; abertura do menu em 200ms. Botões respondem a hover e pressão, seleções têm confirmação curta e os campos transitam suavemente no foco. Órbitas decorativas se acomodam uma única vez, sem movimento contínuo. Nesta primeira etapa, tudo em CSS; `prefers-reduced-motion` desativa animações e transições.

## Digitação e entrada ao rolar

Após esclarecimento do responsável, `AnimatedInput` anima a própria letra recém-inserida com subida de 6px, escala e fade por 180ms. Uma camada decorativa temporária cobre somente o glifo novo, mantendo input, cursor e seleção nativos. Em senha a camada contém exclusivamente uma bolinha, nunca o caractere real. Movimento reduzido, colagem de vários caracteres e texto fora da área visível usam o comportamento nativo. A camada é removida após a animação, ao selecionar, navegar, rolar, redimensionar ou sair do campo. Composição IME é animada apenas ao terminar.

Aplicado a login, cadastro, recuperação de senha, busca, assistente, favoritos e confirmação de perfil. O efeito anterior de brilho e a digitação automática dos títulos foram removidos.

Os cards compactos usam a entrada no viewport do Motion, uma vez por montagem, com fade, deslocamento vertical de 24px e escala de 0.98 a 1. Na Home, o intervalo entre cards é 80ms. Foco por teclado também revela o card. Sem IntersectionObserver, o conteúdo continua visível. O wrapper de entrada é separado da superfície Tilt. Destaque e formulário recebem entrada CSS de 600ms.
