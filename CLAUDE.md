# CineMatch AI — contexto para sessões de desenvolvimento

App web de recomendação de filmes: uma recomendação por vez, explicada, respeitando restrições do usuário e aprendendo com feedback.
Decisões e motivos: `docs/decisions.md` (fonte da verdade). Arquitetura: `docs/architecture.md`. Licenças: `docs/api-research.md`.

## Processo
- O responsável decide produto, orçamento e trade-offs. Decisões novas entram em `docs/decisions.md` (DEC-XXX).
- Orçamento: R$ 0 agora, teto de R$ 50/mês. Não criar recursos pagos, não fazer deploy, não consumir API paga sem autorização.
- Nunca apresentar dado simulado como real. Nunca inventar nota, duração, disponibilidade ou filme.

## Stack aprovada
- TypeScript de ponta a ponta. React 19 + Vite + Tailwind v4 (`web/`). Sem biblioteca de animação (CSS).
- Supabase: Postgres + Auth + RLS + Edge Functions (Deno) + pg_cron. Frontend estático no Cloudflare Pages.
- Catálogo: **somente Wikidata (CC0)**. TMDB, IMDb datasets e OMDb são proibidos (licença). Notas só de Rotten Tomatoes (média x/10) e Metacritic, via Wikidata.
- LLM: Claude Haiku 5.5 (`claude-haiku-5-5`), só no assistente, desligado sem `ANTHROPIC_API_KEY`.

## Estrutura
- `core/` — domínio puro (sem I/O): `schemas.ts` (Zod), `engine/` (filtros → ranking → diversidade), `explain.ts`, `assistant.ts`, `db.ts` (mapeamento de linhas).
- `supabase/migrations/` — esquema, RLS, funções SQL. `supabase/tests/` — pgTAP.
- `supabase/functions/` — `recommend`, `scheduled-run`, `assistant`; `_shared/service.ts` carrega dados e chama o `core/`.
- `scripts/wikidata/` — `fetch.ts` (SPARQL → `data/catalog.json`) e `load.ts` (upsert). `scripts/smoke-test.ts` — teste ponta a ponta.
- `web/src/` — `lib/` (api, sessão, i18n), `components/`, `pages/`.

## Comandos
```
npm run dev            # frontend (precisa de .env, ver .env.example)
npm test               # Vitest (core + scripts)
npm run typecheck
npm run check:functions   # deno check das Edge Functions (o runtime não checa tipos)
npm run build
npx supabase start     # stack local (Docker)
npx supabase test db   # pgTAP
npx supabase functions serve --env-file supabase/functions/.env
npm run catalog:fetch  # baixa ~38 mil filmes do Wikidata (~15 min, com cache por lote)
npm run catalog:load   # requer SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
node scripts/smoke-test.ts  # requer SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
```

## Regras arquiteturais
- Restrições obrigatórias (`constraints`) são filtros aplicados ANTES do ranking; preferências (`preferences`) só pontuam. Nunca misturar.
- Contexto de um pedido nunca altera o perfil salvo. Contexto não reabre gênero excluído.
- Sem resultado compatível → lista vazia + sugestões de relaxamento. Nunca recomendar fora dos filtros.
- Mudou pesos/lógica do ranking → subir `ALGORITHM_VERSION` em `core/engine/score.ts`.
- A LLM nunca escolhe filmes: só extrai filtros (saída estruturada + revalidação Zod). Explicações são determinísticas a partir dos fatores.
- Compatibilidade é mostrada em faixas qualitativas, nunca em porcentagem.
- Recomendação agendada: idempotente por `claim_due_schedules` (SKIP LOCKED) + `unique (user_id, period_key)`. Geração e entrega são separadas.
- Tipos de recomendação: `on_demand` (principal da Home), `discover` (busca pontual, nunca vira a principal), `explore`, `scheduled`, `assistant`.
- `core/` importa só `zod` e arquivos relativos com extensão `.ts` (roda em Node, Vite e Deno).

## Segurança e privacidade
- Chave service role e `ANTHROPIC_API_KEY` nunca no frontend nem no repositório. `.env` é ignorado pelo git.
- Toda tabela tem RLS. Cliente não escreve em `recommendations`; em `recommendation_items` só nas colunas de feedback.
- Logs sem dados pessoais (só id interno e mensagem de erro).
- LGPD: exportação de dados e exclusão de conta (cascata) no Perfil. Fontes auto-hospedadas (sem Google Fonts).

## Testes
- Toda regra do motor tem teste em `core/**/*.test.ts`, incluindo teste de propriedade das restrições.
- Mudança em migration → atualizar `supabase/tests/database.test.sql`.
- Antes de concluir algo que toca backend: `npx supabase test db` e `node scripts/smoke-test.ts` contra o stack local.
