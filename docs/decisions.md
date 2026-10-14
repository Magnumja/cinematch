# Registro de decisões — CineMatch AI

Formato: cada decisão tem ID, tema, status, decisão, motivo, alternativas e data.

Status possíveis:

- **Aprovado** — aprovado explicitamente pelo responsável do produto.
- **Aprovado (delegado)** — decidido pelo assistente após o responsável autorizar
  "implementar tudo sem perguntar" (2026-10-14). Revisável a qualquer momento.
- **PENDENTE DE VALIDAÇÃO** — depende de informação que ainda não temos.

---

## Fase 0 — Discovery

### DEC-001 — Natureza do projeto
- **Status:** Aprovado · **Data:** 2026-10-14
- **Decisão:** Lançamento público, sem monetização inicial, com intenção de monetizar no futuro.
- **Motivo:** Validar o produto antes de cobrar.
- **Consequência:** Toda fonte de dados e serviço precisa permitir uso comercial desde já,
  para não exigir migração quando houver monetização.
- **Alternativas:** Portfólio; uso pessoal; comercial desde o início.

### DEC-002 — Idioma e mercado
- **Status:** Aprovado · **Data:** 2026-10-14
- **Decisão:** Bilíngue, PT-BR e EN.

### DEC-003 — Orçamento
- **Status:** Aprovado · **Data:** 2026-10-14
- **Decisão:** R$ 0/mês no início; teto de R$ 50/mês depois (~US$ 9, conversão aproximada).

### DEC-004 — Público-alvo
- **Status:** Aprovado · **Data:** 2026-10-14
- **Decisão:** Espectador indeciso frequente (assina streamings, assiste semanalmente, perde tempo escolhendo).
- **Alternativas:** Cinéfilo; ambos.

### DEC-005 — Objetivo do MVP
- **Status:** Aprovado · **Data:** 2026-10-14
- **Decisão:** Validar a qualidade das recomendações.
- **Métricas (hipóteses, recalibrar no beta):**
  - Taxa de aceitação (quero assistir / salvar / gostei ÷ exibidas) ≥ 40%.
  - Taxa de rejeição forte (não tenho interesse / não gostei ÷ exibidas) ≤ 25%.
- **Consequência:** Registro de cada recomendação e feedback por item são essenciais no MVP.

### DEC-006 — Lançamento
- **Status:** Aprovado · **Data:** 2026-10-14
- **Decisão:** Beta fechado por convite, 20–100 pessoas.

## Fase 1 — APIs e licenciamento

### DEC-007 — Fonte do catálogo
- **Status:** Aprovado · **Data:** 2026-10-14
- **Decisão:** Wikidata (dados estruturados CC0) como única fonte do catálogo. Sem contato com o TMDB por ora.
- **Motivo:** Os termos do TMDB (atualizados em 2023-10-20, §1.C e §2) proíbem uso em aplicações
  baseadas em IA/chatbots sem contrato comercial. Datasets do IMDb e OMDb são não comerciais.
  Ver `docs/api-research.md`.
- **Alternativas:** Licença comercial TMDB; IMDb via AWS Data Exchange (sob consulta).

### DEC-008 — Visual sem pôsteres
- **Status:** Aprovado · **Data:** 2026-10-14
- **Decisão:** MVP sem pôsteres e sem sinopses longas. Cards tipográficos com descrição curta (descrição do Wikidata, CC0).

### DEC-009 — Filtros do MVP
- **Status:** Aprovado · **Data:** 2026-10-14
- **Decisão:** Sem filtro de serviço de streaming. A nota mínima só pode ser satisfeita por filmes
  que tenham nota conhecida: com o filtro ativo, filmes sem nota são excluídos (nunca inventamos nota).
  A fonte da nota é sempre exibida.

### DEC-010 — Fontes de nota aceitas
- **Status:** Aprovado (delegado) · **Data:** 2026-10-14
- **Decisão:** Usar somente notas do Wikidata (P444) atribuídas a Rotten Tomatoes e Metacritic.
  Notas atribuídas ao IMDb são descartadas na importação.
- **Motivo:** Compromisso da Fase 1 de não usar dados derivados do IMDb (licença não comercial).
- **Risco:** A reutilização dessas notas é **PENDENTE DE VALIDAÇÃO** jurídica. Os valores são CC0
  no Wikidata, mas a origem é de terceiros. Se a validação for negativa, desligar o filtro de nota.

### DEC-011 — LLM
- **Status:** Aprovado · **Data:** 2026-10-14
- **Decisão:** Fase R$ 0 sem LLM. Depois, Claude Haiku 5.5 (US$ 0,10 / 0,50 por milhão de tokens)
  com teto diário por usuário e teto global mensal. A LLM nunca escolhe filmes: só extrai filtros.
- **Alternativa descartada:** Gemini gratuito (dados usados para melhorar produtos e revisão humana; incompatível com dados pessoais / LGPD).

### DEC-012 — Uso comercial do Resend no plano grátis
- **Status:** PENDENTE DE VALIDAÇÃO — verificar na fase de notificações por e-mail.

## Fase 2 — Arquitetura

### DEC-013 — Linguagem
- **Status:** Aprovado · **Data:** 2026-10-14
- **Decisão:** TypeScript de ponta a ponta. React + Vite no frontend. Motor de recomendação como módulo de funções puras (`core/`).
- **Alternativas:** React + FastAPI; Next.js full stack.

### DEC-014 — Infraestrutura
- **Status:** Aprovado · **Data:** 2026-10-14
- **Decisão:** Supabase (Postgres, Auth, RLS, Edge Functions, Cron) + frontend estático no Cloudflare Pages.
- **Motivo:** Menos fornecedores; cron com precisão de minuto; Vercel Hobby é só não comercial e o cron dele é diário com ±59 min.
- **Riscos:** Projeto grátis do Supabase pausa após 1 semana sem atividade; sem backup automático; banco de 500 MB.

### DEC-015 — Backup
- **Status:** Aprovado · **Data:** 2026-10-14
- **Decisão:** Dump semanal via GitHub Actions, armazenado como artefato privado.

### DEC-016 — Tamanho do catálogo
- **Status:** Aprovado · **Data:** 2026-10-14
- **Decisão:** Catálogo curado de ~30–50 mil filmes, priorizados por número de sitelinks (artigos da Wikipedia), com duração obrigatória.

### DEC-017 — Redis, filas, pgvector
- **Status:** Aprovado · **Data:** 2026-10-14
- **Decisão:** Nenhum no MVP. Idempotência via constraints no Postgres. pgvector será reavaliado depois.

### DEC-018 — Estrutura do repositório
- **Status:** Aprovado · **Data:** 2026-10-14
- **Decisão:** Repositório único sem ferramenta de monorepo: `web/`, `core/`, `supabase/`, `scripts/`, `docs/`.

## Decisões delegadas de implementação (2026-10-14)

### DEC-019 — Compartilhamento do `core/` com as Edge Functions
- **Status:** Aprovado (delegado)
- **Decisão:** O `core/` usa imports relativos com extensão `.ts` e só depende de `zod`.
  As Edge Functions importam o `core/` por caminho relativo, e o `zod` é resolvido pelo import map do Deno (`supabase/functions/deno.json`).
- **PENDENTE DE VALIDAÇÃO:** confirmar no primeiro deploy que o bundler do Supabase inclui arquivos fora de `supabase/functions/`.
  Plano B: script que copia `core/` para `supabase/functions/_shared/core/` antes do deploy.

### DEC-020 — Modelo de dados enxuto
- **Status:** Aprovado (delegado)
- **Decisão:** Restrições e preferências do perfil ficam em colunas `jsonb` validadas por Zod em vez de várias tabelas de preferência.
  Estado do usuário por filme em `user_movies` (uma linha por usuário+filme). Tabelas de conversa com IA e de entregas de notificação ficam fora até essas funcionalidades existirem.
- **Motivo:** Evitar normalização excessiva; o perfil é sempre lido inteiro.

### DEC-021 — Restrições vs. preferências
- **Status:** Aprovado (delegado)
- **Decisão:** O perfil separa `constraints` (obrigatórias: aplicadas como filtro antes do ranking) de `preferences` (flexíveis: só afetam a pontuação).
  Gêneros "não gosto" são preferência (penalidade); gêneros "evitar sempre" são restrição.
  Pedidos pontuais (contexto) nunca alteram o perfil salvo.

### DEC-022 — Compatibilidade sem porcentagem
- **Status:** Aprovado (delegado)
- **Decisão:** A interface mostra faixas qualitativas de afinidade ("Alta afinidade", "Boa afinidade", "Aposta") e nunca porcentagem,
  porque o score não é uma probabilidade calibrada.

### DEC-023 — Explicações determinísticas
- **Status:** Aprovado (delegado)
- **Decisão:** Os motivos da recomendação são montados a partir dos fatores reais calculados pelo motor (templates PT/EN), sem LLM.
  Assim nenhum motivo cita histórico inexistente.

### DEC-024 — Entrega de recomendações agendadas
- **Status:** Aprovado (delegado)
- **Decisão:** No MVP a entrega é só dentro do app (card "Seu filme da semana"). E-mail fica para depois de DEC-012.
  Geração e entrega são processos separados.

### DEC-025 — Animações sem biblioteca
- **Status:** Aprovado (delegado)
- **Decisão:** Sem Motion no MVP. Transições em CSS (custom properties + transitions) e respeito a `prefers-reduced-motion`.
- **Motivo:** Os efeitos pedidos (fundo ambiente, hover, entrada discreta) não exigem biblioteca.

### DEC-026 — Onboarding curto
- **Status:** Aprovado (delegado)
- **Decisão:** 4 passos em vez de 10 perguntas: (1) gêneros que ama / evita, (2) até 5 filmes favoritos,
  (3) limites (duração máxima, nota mínima opcional, idiomas), (4) frequência da recomendação. Pode ser pulado após o passo 1.
- **Motivo:** Cada pergunta extra aumenta abandono; o resto do perfil é aprendido pelo feedback.

### DEC-027 — Login
- **Status:** Aprovado (delegado)
- **Decisão:** Supabase Auth com e-mail e senha.

### DEC-028 — Catálogo inicial
- **Status:** Aprovado (delegado) · **Data:** 2026-10-14
- **Decisão:** Filmes com ≥ 7 sitelinks e duração plausível (40–400 min): 38.302 filmes, 17.306 com nota, ~25 MB no banco.
  Gêneros do Wikidata mapeados por palavras-chave para 19 gêneros canônicos (`scripts/wikidata/map.ts`).
  Média "x/10" do Rotten Tomatoes e "x/100" do Metacritic; "% de aprovação" do Rotten Tomatoes é ignorado (não é nota).

### DEC-029 — Tipos de recomendação
- **Status:** Aprovado (delegado) · **Data:** 2026-10-14
- **Decisão:** `discover` separado de `on_demand`, para que uma busca pontual com filtros nunca vire a recomendação principal da Home.

### DEC-030 — Gêneros excluídos não são relaxáveis por pedido
- **Status:** Aprovado (delegado) · **Data:** 2026-10-14
- **Decisão:** Quando nada passa nos filtros, o app sugere liberar nota, duração, idioma ou ano para aquela busca. Gênero excluído só muda no perfil (coerente com DEC-021).

### DEC-031 — Design system inicial
- **Status:** Aprovado (delegado) · **Data:** 2026-10-14 · **Revisar quando a logo e as referências forem analisadas (Fase 3).**
- **Decisão:** Fundo `#060607`, superfícies `#16171A`, linhas `#26272B`, texto `#EEEAE3`, secundário `#8F8C86`, acento laranja `#F0872F`.
  Amarelo, vermelho e violeta só como sinais pontuais (faixa de afinidade, "não gostei", "explorar").
  Big Shoulders Display (títulos de filme, como letreiro de cinema, no lugar do pôster) + Schibsted Grotesk (texto), auto-hospedadas.
  Luz ambiente: matiz do gênero principal do filme em foco (hover e foco de teclado), baixa opacidade, transição de 900 ms, desligada com `prefers-reduced-motion`.
- **Motivo das fontes auto-hospedadas:** Google Fonts por CDN envia o IP do usuário a terceiros (LGPD).

### DEC-032 — Backup criptografado
- **Status:** Aprovado (delegado) · **Data:** 2026-10-14
- **Decisão:** O dump semanal é criptografado (GPG AES-256) antes de virar artefato do GitHub Actions; retenção de 30 dias.
- **PENDENTE DE VALIDAÇÃO:** testar uma restauração completa no primeiro backup real.

### DEC-033 — Auditoria de bugs (2026-10-14)
- **Status:** Aprovado (delegado)
- **Corrigidos, cada um com teste de regressão:**
  1. **Crítico:** restrição pontual (contexto) apagava todas as restrições do perfil naquele pedido (nota mínima, idioma, "pode rever"),
     porque o Zod 4 preenche defaults em `.partial()`. Afetava liberar restrição, Descobrir e assistente. → `ContextConstraintsSchema` sem defaults.
  2. Retry de agendamento infinito: `claim_due_schedules` zerava `attempts`. → zera só em sucesso (`mark_schedule_success`).
  3. "Salvar" num card recomendado não contava como aceitação no log (métrica do MVP subestimada). → registra `want`.
  4. "Outra sugestão" sobrescrevia um feedback explícito com `skipped`. → sinais fracos só gravam se não houver feedback.
  5. Home reexibia filme já pulado quando todos tinham sido pulados; "sem interesse" não tirava o filme da tela. → avança ou gera nova.
  6. "Seu filme da semana" aparecia para agendas diárias e mensais, e a agendada ficava 7 dias independentemente da frequência.
  7. Lampejo de "não foi possível carregar seu perfil" ao entrar; sessão órfã (conta apagada) travava o app.
  8. Loop infinito de requisições na Home (`t` do i18n instável) e recomendação duplicada no StrictMode.
  9. Edge Functions nunca tinham passado por checagem de tipos → `deno check` no CI (`npm run check:functions`).
- **Adicionados:** "esqueci minha senha" (fluxo completo), view `recommendation_metrics` (aceitação/rejeição por versão e semana),
  cabeçalhos de segurança (CSP etc.) no Cloudflare Pages, limites de tamanho nos arrays vindos do cliente, `lang` do HTML conforme idioma,
  rascunho da política de privacidade (`docs/privacy-policy-draft.md`).

### DEC-034 — "Hoje não" é filtro do pedido
- **Status:** Aprovado (delegado) · **Data:** 2026-10-14
- **Decisão:** Gêneros evitados num pedido (Descobrir "Hoje não", assistente "nada de terror") são excluídos daquele pedido, não só penalizados.
  Continuam sem alterar o perfil (DEC-021).

### DEC-035 — Segunda auditoria, com trabalho dividido entre agentes (2026-10-14)
- **Status:** Aprovado (delegado)
- **Método:** revisor de código e auditor de segurança em modo só leitura, engenheiro de testes criando apenas testes e agente de banco
  com arquivos exclusivos, em paralelo. Todo achado foi conferido antes de corrigir.
- **Corrigidos (com teste de regressão):**
  - Home reaproveitava recomendação gravada sem reaplicar o perfil e os estados atuais (filme excluído/assistido voltava ao destaque).
  - Limite de 1000 linhas do PostgREST truncava o histórico do usuário (filme "não gostei" antigo podia voltar), a soma do teto
    mensal de IA e a exportação LGPD → histórico paginado; soma e exportação agregadas em SQL.
  - "Parecido com X" do assistente virava "que você curtiu" e podia recomendar o próprio X → canal `requestReferences`, X excluído.
  - "Um dos filmes mais conhecidos" aparecia para filmes obscuros → só acima do p95 do catálogo (39 sitelinks).
  - Nota comparada após arredondar (7,449 passava em 7,5+) → média exata; exibição unificada (`formatRating`).
  - Feedback acumulava estados contraditórios (gostei + sem interesse) → cada feedback grava o estado completo.
  - Liberar restrição no assistente virava a recomendação principal e perdia o "parecido com X".
  - Assistente quebrava após ~10 pedidos (limite de ids); `shown` sem limite na Home.
  - Contagem de relaxamento incluía filmes bloqueados; clique duplo gerava duas recomendações; buscas com resposta atrasada;
    detalhe do filme agindo sobre o filme anterior; "remover" dos assistidos apagava salvo/sem interesse; falha de feedback silenciosa.
  - Retry de agendamento perdia o retry no período seguinte; execução interrompida deixava usuários e `job_runs` presos.
  - Limites de IA com condição de corrida → reserva atômica (`reserve_ai_request`) antes da chamada; `max_tokens` 600; pedido escapado.
  - Abuso de armazenamento (jsonb/tags sem limite) → checks no banco. `feedback_at` definido pelo banco. Revogações extras.
  - Login com mensagem genérica (não revela contas); CORS falha fechado.
- **Testes:** 107 Vitest (motor, componentes, i18n), 48 pgTAP, 11 verificações ponta a ponta.

## Pendências abertas

| Item | Situação |
|---|---|
| DEC-010 — reutilização das notas RT/Metacritic | PENDENTE DE VALIDAÇÃO jurídica |
| DEC-012 — Resend no plano grátis para uso comercial | PENDENTE DE VALIDAÇÃO |
| DEC-019 — deploy das Edge Functions inclui `core/` | Validado localmente (edge runtime); PENDENTE no primeiro deploy real |
| DEC-031 — design system | Revisar com a logo e as referências visuais |
| Política de privacidade | Rascunho técnico em `docs/privacy-policy-draft.md`; precisa de revisão jurídica e dados do controlador |
| Termos de uso | A redigir antes do beta |
| Assistente com a API real da Anthropic | Código checado por tipos e com fallback testado; chamada real NÃO VERIFICADA (sem chave na fase R$ 0) |
| Familiaridade do responsável com TS/Python | Pergunta da Fase 2 sem resposta (não bloqueia) |
