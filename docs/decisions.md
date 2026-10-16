# Registro de decisões — Cineou

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
- **Status:** Substituída por DEC-040 · **Data:** 2026-10-14
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
  (Ampliada pela DEC-048: avisos no celular por Web Push.)

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
  (Ampliado para ≥ 2 sitelinks e 102.153 filmes na DEC-038.)
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

### DEC-036 — Hospedagem do frontend na fase de testes: Vercel
- **Status:** Aprovado · **Data:** 2026-10-14
- **Decisão:** Frontend no Vercel (plano Hobby) enquanto o projeto não tiver nenhum uso comercial. Substitui o Cloudflare Pages da DEC-014
  (os arquivos `_headers`/`_redirects` foram trocados por `vercel.json`, com os mesmos cabeçalhos de segurança).
- **Motivo:** preferência do responsável; o cron limitado do Hobby não afeta o app (o agendamento roda no pg_cron do Supabase).
- **Condição:** o Hobby é restrito a uso pessoal e não comercial. **Antes de qualquer monetização**, migrar para plano pago do Vercel ou para outra hospedagem.

### DEC-037 — Assistente de IA ligado com a chave do responsável
- **Status:** Substituída por DEC-040 · **Data:** 2026-10-14
- **Decisão:** Assistente ativo com Claude Haiku 5.5 (`claude-haiku-5-5`), usando a chave da API da Anthropic do responsável,
  configurada só como segredo das Edge Functions (`supabase secrets set`), nunca no repositório nem no frontend.
- **Limites:** 10 pedidos por usuário/dia e teto global de US$ 2/mês (`AI_DAILY_LIMIT_PER_USER`, `AI_MONTHLY_BUDGET_USD`), dentro do teto de R$ 50 (DEC-003).

### DEC-038 — Catálogo ampliado para ~100 mil filmes (2026-10-14)
- **Status:** Aprovado pelo responsável
- **Decisão:** Corte de sitelinks de 7 para 2 (`npm run catalog:fetch -- --min-sitelinks=2`): 102.153 filmes
  (45.239 de 2000 a 2026; 21.615 com nota), ~71 MB na tabela `movies`. Substitui o número da DEC-028.
- **Motivo:** O responsável pediu pelo menos 100 mil filmes; com corte 3 seriam ~85 mil. Cabe no plano grátis (500 MB).
- **Consequências:** Mais filmes obscuros e recentes. O ranking não muda (popularidade continua em escala log
  sobre o máximo do catálogo); `WELL_KNOWN_SITELINKS` fica em 39 como limiar absoluto, então "um dos mais conhecidos"
  continua valendo só para filmes realmente conhecidos. O importador passou a repetir respostas cortadas e conexões
  derrubadas pelo Wikidata e a dividir lotes que falham.

### DEC-039 — Nome do produto: Cineou (2026-10-14)
- **Status:** Aprovado pelo responsável
- **Decisão:** O produto passa a se chamar Cineou (antes CineMatch AI). Repositório no GitHub, `project_id` do Supabase
  local e migrations já aplicadas mantêm o nome antigo, porque são identificadores técnicos.

### DEC-040 — Remoção do assistente de IA (2026-10-15)
- **Status:** Aprovado · **Data:** 2026-10-15
- **Decisão:** O app deixa de ter IA. Saem o assistente (página, Edge Function `assistant`, `core/assistant.ts`),
  o SDK da Anthropic, a chave `ANTHROPIC_API_KEY`, os limites `AI_*` e a tabela `ai_usage` com suas funções
  (migration `20261015000000_remove_assistant.sql`). A exportação LGPD deixa de ter a chave `ai_usage`.
  Substitui DEC-011 e DEC-037.
- **Motivo:** Poder usar a API do TMDB, cujos termos (§1.C) proíbem o uso "em conexão com" aplicação de IA.
  Manter qualquer LLM no produto, mesmo só para extrair filtros, impediria essa integração.
- **Consequências:** "Parecido com X" deixa de ter chamador no app; o canal `requestReferences` do motor
  continua no `core/` e em `generateAndStore`, sem uso. Recomendações antigas com `kind = 'assistant'`
  continuam válidas no banco (a constraint não muda) e são lidas como legado. Explicações já eram
  determinísticas (DEC-023) e não mudam.

### DEC-041 — TMDB para pôsteres, sinopses, nota e onde assistir (2026-10-15)
- **Status:** Aprovado ("caminho 1") · **Data:** 2026-10-15
- **Decisão:** O catálogo continua vindo do Wikidata (ids, títulos, gêneros, duração, notas RT/Metacritic).
  O TMDB complementa cada filme com pôster, imagem de fundo, sinopse PT/EN, tagline, média dos usuários
  e onde assistir no Brasil (dados do JustWatch via TMDB). Ligação pelo P4947 do Wikidata (id do TMDB).
  Script `npm run tmdb:enrich` (service role + `TMDB_READ_TOKEN`, nunca no frontend). Substitui DEC-007 (no
  que diz "sem contato com o TMDB"), DEC-008 e a linha "Não usar" do TMDB em `docs/api-research.md`.
- **Condições dos termos, todas implementadas:**
  - Uso só não comercial, e o produto não tem IA (DEC-040).
  - Logo do TMDB e o aviso "usa a API do TMDB, mas não é endossado nem certificado pelo TMDB" no rodapé e no detalhe do filme.
  - Provedores de streaming sempre com "Fonte: JustWatch".
  - Cache de no máximo 6 meses: `tmdb_fetched_at` mais `purge_stale_tmdb` diário (pg_cron, 180 dias); o script renova os dados com mais de 150 dias.
  - Imagens carregadas direto de `image.tmdb.org`, sem hospedagem própria.
- **Nota:** a média do TMDB entra na média exibida e filtrada só com 100 votos ou mais (`MIN_TMDB_VOTES`).
  `rating_avg` passa a ser uma coluna gerada (`movie_rating_avg`) com a mesma regra de `core/db.ts`.
  `ALGORITHM_VERSION` = `rules-v2`.
- **Consequências:**
  - Se o produto virar comercial, é preciso contrato com o TMDB ou remover a integração.
  - Ao carregar pôsteres, o navegador do usuário acessa `image.tmdb.org`: o TMDB recebe o IP do usuário (consta na política de privacidade).
  - Filme sem pôster mostra o card tipográfico (nunca imagem inventada).

### DEC-042 — Pacote 1 de usabilidade, após a auditoria de uso (2026-10-15)
- **Status:** Aprovado · **Data:** 2026-10-15
- **Contexto:** Numa auditoria de ponta a ponta com uma conta nova, o app pareceu um formulário: o filme ficava abaixo
  da dobra, não havia imagem nem onde assistir, a sinopse vinha em inglês e a busca falhava sem acento.
- **Decisão:**
  - O filme vem primeiro na Home; a explicação vira uma linha que se expande.
  - Selos de onde assistir (assinatura ou grátis), sempre com o crédito "via JustWatch", e botão de trailer
    com link para o YouTube. Não há player embutido: assim a CSP não muda e o YouTube não roda dentro do app.
  - O TMDB passa a guardar também o título pt-BR (só quando é tradução de fato) e o trailer (`titlePt`, `trailerKey`).
  - Sem imagem, o pôster some; a lista mantém o bloco tipográfico.
  - A descrição curta do Wikidata em outro idioma deixa de aparecer.
  - Busca sem acento e também pelo título pt-BR do TMDB (`search_normalize`).
- **Próximo (pacote 2):** filtro "nos meus streamings", cadastro escolhendo pôsteres e similaridade com dados do TMDB.

### DEC-043 — Revisão dos termos do TMDB: nota separada, página de créditos (2026-10-15)
- **Status:** Aprovado · **Data:** 2026-10-15
- **Fontes conferidas:** termos da API do TMDB (versão de 2023-10-20), o FAQ de desenvolvedores e a página de watch providers.
- **Situação do Cineou em cada ponto:**
  - §2.A, comercial: sem receita, anúncios ou cobrança, e na Vercel Hobby. OK enquanto continuar assim.
  - §1.C, IA/ML: sem IA (DEC-040); o motor usa regras fixas.
  - §1.C, cache de 6 meses: renovação aos 150 dias e purge aos 180.
  - §1.C, "image hosting": as imagens vêm direto de image.tmdb.org, sem hospedagem própria.
  - §3 e FAQ, atribuição: logo oficial sem alteração, menor que a marca do Cineou.
  - Watch providers: crédito "via JustWatch" em todo lugar que mostra provedores, e link para a página do TMDB.
  - §1.D, rescisão: apagar o conteúdo com `update public.movies set tmdb = null, tmdb_fetched_at = null, tmdb_id = null;`.
- **Mudanças:**
  1. A nota dos usuários do TMDB sai da média `rating_avg`, do filtro "nota mínima da crítica" e do ranking, e passa a
     ser exibida à parte ("Usuários do TMDB: 7,8"). Misturar as fontes criaria uma nota derivada do conteúdo do TMDB
     (§1.C proíbe "derivatives"), além de chamar usuários de crítica. Migration `rating_critics_only`, `ALGORITHM_VERSION = rules-v3`.
     Substitui a parte de nota da DEC-041.
  2. Página `/about` ("Sobre e créditos"), aberta mesmo sem login, porque o FAQ pede a atribuição numa seção "About"/"Credits".
     Linkada no rodapé e na tela de login.
  3. O aviso passa a usar o texto do §3 ("uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB").
  4. A tela de login deixa de dizer "aprende com o que você assiste", para não sugerir aprendizado de máquina.
- **Riscos que continuam:**
  - O TMDB pode encerrar a chave a qualquer momento (§1.D/§5); o app funciona sem esses dados, como card tipográfico.
  - Qualquer receita futura (anúncio, assinatura, afiliado) exige contrato comercial.
  - Usar `/recommendations` do TMDB para ranquear (pacote 2) também precisa ser avaliado contra a proibição de "derivatives".

### DEC-044 — Trailer dentro do app com brilho ambiente (2026-10-15)
- **Status:** Aprovado · **Data:** 2026-10-15
- **Decisão:** o botão "Trailer" abre um diálogo com o player oficial do YouTube (`youtube-nocookie.com/embed`). Atrás do player
  fica um brilho ambiente feito com a imagem de fundo do filme, desfocada e "respirando"; ele não anima para quem pede menos movimento.
- **Por que não o Video Ambient do Unlumen:** o brilho dele amostra os quadros de um `<video>` com arquivo próprio. O TMDB só fornece
  o id do YouTube, o player do YouTube é um iframe de outra origem (o navegador bloqueia a leitura dos pixels) e baixar o vídeo violaria
  os termos do YouTube. Componente próprio, inspirado no visual, sem código copiado.
- **Privacidade:** o iframe só existe com o diálogo aberto; fechar remove o player e interrompe o vídeo. A política de privacidade cita o YouTube.
- **CSP:** `frame-src https://www.youtube-nocookie.com`. O YouTube exige o Referer da página (erro 153 sem ele); a política
  `strict-origin-when-cross-origin` envia a origem. "Abrir no YouTube" fica como alternativa.

### DEC-045 — Listas personalizadas (2026-10-16)
- **Status:** Aprovado · **Data:** 2026-10-16
- **Decisão:** o usuário cria listas próprias ("pastas"), com nome de 1 a 60 caracteres e descrição de até 280, no estilo do Letterboxd.
  - Tabelas `user_lists` e `user_list_items`, com RLS só para o dono.
  - Nome único por usuário, ignorando maiúsculas e espaços.
  - Limites: 50 listas por usuário e 500 filmes por lista (trigger, erro 54000).
  - As listas entram na exportação LGPD e são apagadas em cascata quando a conta é excluída.
  - As listas do sistema (Quero assistir, Assistidos, Sem interesse) continuam em `user_movies`.
- **Interface:**
  - Botão "+ Lista" no destaque, nos cards, no detalhe e na busca. Ele abre um painel (portal) para marcar listas
    e criar uma nova na hora.
  - "Minhas listas" no topo de Minha lista, com capa de pôsteres sobrepostos.
  - Página `/lists/:id` para editar, excluir e remover filmes.
- **Por enquanto:** as listas são privadas. Compartilhar por link exige revisar RLS e LGPD (ideia 11 da auditoria).

### DEC-046 — Sem créditos de bibliotecas de UI na interface (2026-10-16)
- **Status:** Aprovado · **Data:** 2026-10-16
- **Decisão:** o responsável pediu para tirar da interface os créditos "Unlumen UI · Skiper UI".
  - Os componentes gratuitos do Unlumen não exigem atribuição (licença deles), então o crédito pode sair.
  - O Skiper UI gratuito exige atribuição ("Attribution to Skiper UI is required when using the free version").
    Por isso o único componente vindo dele (`AnimatedLink`) foi trocado por `ArrowLink`, uma implementação própria.
    Sem código do Skiper no app, não há atribuição a manter.
  - O registro interno continua em `docs/ui-component-sources.md`.
  - Os créditos de dados (TMDB, JustWatch, Wikidata) continuam, porque são exigidos pelos termos dessas fontes.

### DEC-047 — Prateleiras de navegação na Home (2026-10-16)
- **Status:** Aprovado · **Data:** 2026-10-16
- **Decisão:** abaixo das recomendações, a Home ganha prateleiras horizontais de pôsteres:
  - "Porque você gosta de {gênero}", até 2, a partir dos gêneros preferidos;
  - "Nos streamings no Brasil": incluso em assinatura ou grátis, com dados do JustWatch;
  - "Lançamentos recentes": últimos 3 anos;
  - "Clássicos aclamados": até 1995, nota da crítica 8 ou mais;
  - "Sessão rápida": até 100 minutos.
- **Regras:**
  - São navegação pelo catálogo (`browseMovies`), não recomendação: não gravam log, não usam o motor e não consomem
    o limite da Edge Function `recommend`.
  - Mesmo assim, as restrições obrigatórias do perfil são aplicadas na consulta, e a tela revalida cada filme com
    `hardFilterReason` (vistos, sem interesse, não gostei).
  - Gêneros marcados como "não curto" também ficam de fora.
  - Um filme aparece uma vez só na página (destaque, grid ou a primeira prateleira em que couber).
  - Prateleira com menos de 4 filmes não aparece.
  - Só filmes com pôster.

### DEC-048 — Avisos no celular por Web Push; Perfil em abas (2026-10-16)
- **Status:** Aprovado · **Data:** 2026-10-16
- **Decisão:** a recomendação programada também chega como notificação na barra do celular, por Web Push
  (padrão dos navegadores), além do card na Home. Amplia a DEC-024.
- **Por que não WebSocket:** WebSocket (inclusive o Realtime do Supabase) só funciona com a página aberta; não
  chega à barra de notificações com o app fechado.
- **Como funciona:**
  - O usuário ativa em Perfil → Avisos, por aparelho. A permissão do navegador só é pedida no clique.
  - O navegador gera a inscrição; o app grava em `push_subscriptions` pela função `register_push_subscription`
    (RLS: o cliente só lê e apaga as próprias; até 10 aparelhos por conta).
  - Entrega separada da geração: a Edge Function `deliver-push` roda no pg_cron 7 minutos depois de cada
    `scheduled-run`, reserva as agendadas das últimas 12 h com `claim_push_deliveries` (SKIP LOCKED, marca
    `push_notified_at`) e envia. Um aviso nunca sai duas vezes; se falhar, a recomendação continua na Home.
  - Criptografia (RFC 8291) e VAPID (RFC 8292) implementadas com WebCrypto, sem dependência
    (`supabase/functions/_shared/webpush.ts`), conferidas contra as bibliotecas `http_ece` e `web-push`.
  - Só envia para serviços de push conhecidos (Google, Mozilla, Apple, Microsoft), checado no banco e na função.
  - Inscrições expiradas (404/410) ou com 5 falhas seguidas são apagadas. Sair da conta desliga os avisos do aparelho.
- **Custo:** R$ 0. Os serviços de push dos navegadores são gratuitos.
- **Limites:** no iPhone, só com o Cineou adicionado à tela de início (iOS 16.4+). Permissão negada só volta pelas
  configurações do navegador.
- **Conteúdo do aviso:** "Seu filme da semana" (ou do dia/mês) + título e ano do filme. Vai cifrado até o aparelho.
- **Perfil em abas:** Gosto, Filtros, Avisos e Conta, com a aba no endereço (`/profile?tab=alerts`). "Nunca
  recomendar" saiu de Gosto e foi para Filtros, junto com os outros limites obrigatórios (DEC-021).

### DEC-049 — Landing page antes do login (2026-10-16)
- **Status:** Aprovado · **Data:** 2026-10-16
- **Decisão:** sem sessão, `/` mostra uma página de apresentação com a identidade visual do app; o login fica em
  `/login` (`/login?mode=signup` abre direto em "Criar conta"). Com sessão, `/` continua sendo a Home.
- **Regras:**
  - Só fatos verificáveis do produto (catálogo de ~102 mil filmes do Wikidata, uma recomendação por vez, sem IA,
    grátis na fase de testes). Sem números de usuários, depoimentos ou filmes/notas inventados.
  - O cartão de exemplo é uma ilustração sem filme real (sem título, pôster ou nota) e diz isso na legenda.
  - Links diretos para telas do app (ex.: `/movie/Q…`) sem sessão continuam abrindo o login no próprio endereço.
  - Rodapé com as fontes e o aviso do TMDB, como no app.

## Pendências abertas

| Item | Situação |
|---|---|
| DEC-010 — reutilização das notas RT/Metacritic | PENDENTE DE VALIDAÇÃO jurídica |
| DEC-012 — Resend no plano grátis para uso comercial | PENDENTE DE VALIDAÇÃO |
| DEC-019 — deploy das Edge Functions inclui `core/` | Validado localmente (edge runtime); PENDENTE no primeiro deploy real |
| DEC-041 — `append_to_response=watch/providers` | Testar com token real do TMDB |
| DEC-048 — Web Push | Testar no primeiro deploy: Android (Chrome) e iPhone com o app na tela de início |
| DEC-031 — design system | Revisar com a logo e as referências visuais |
| Política de privacidade | Rascunho técnico em `docs/privacy-policy-draft.md`; precisa de revisão jurídica e dados do controlador |
| Termos de uso | A redigir antes do beta |
| Familiaridade do responsável com TS/Python | Pergunta da Fase 2 sem resposta (não bloqueia) |
