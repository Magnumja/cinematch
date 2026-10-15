# Cineou — contexto para sessões de desenvolvimento

App web de recomendação de filmes: uma recomendação por vez, explicada, respeitando restrições do usuário e aprendendo com feedback.
Decisões e motivos: `docs/decisions.md` (fonte da verdade). Arquitetura: `docs/architecture.md`. Licenças: `docs/api-research.md`.

## Processo
- O responsável decide produto, orçamento e trade-offs. Decisões novas entram em `docs/decisions.md` (DEC-XXX).
- Orçamento: R$ 0 agora, teto de R$ 50/mês. Não criar recursos pagos, não fazer deploy, não consumir API paga sem autorização.
- Nunca apresentar dado simulado como real. Nunca inventar nota, duração, disponibilidade ou filme.

## Stack aprovada
- TypeScript de ponta a ponta. React 19 + Vite + Tailwind v4 (`web/`). CSS para transições simples; Motion para componentes Unlumen UI (integração solicitada pelo responsável; ver `docs/ui-component-sources.md`).
- Supabase: Postgres + Auth + RLS + Edge Functions (Deno) + pg_cron. Frontend estático no Vercel Hobby (`vercel.json`) na fase de testes — só uso não comercial (DEC-036).
- Catálogo: base no Wikidata (CC0). O TMDB complementa com pôster, sinopse, nota (≥100 votos) e onde assistir (DEC-041). O uso tem que ser não comercial, com o logo e o aviso do TMDB, o crédito "JustWatch" nos provedores e cache de no máximo 180 dias (`purge_stale_tmdb`). IMDb datasets e OMDb são proibidos.
- Sem IA/LLM no produto (DEC-040): o assistente foi removido para permitir o uso da API do TMDB (termos §1.C).

## Estrutura
- `core/` — domínio puro (sem I/O): `schemas.ts` (Zod), `engine/` (filtros → ranking → diversidade), `explain.ts`, `db.ts` (mapeamento de linhas).
- `supabase/migrations/` — esquema, RLS, funções SQL. `supabase/tests/` — pgTAP.
- `supabase/functions/` — `recommend`, `scheduled-run`; `_shared/service.ts` carrega dados e chama o `core/`.
- `scripts/tmdb/` — `enrich.ts` (P4947 → id do TMDB; detalhes → `apply_tmdb`) e `map.ts` (resposta → `TmdbInfo`).
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
npm run catalog:fetch -- --min-sitelinks=2  # baixa ~102 mil filmes do Wikidata (~50 min, com cache por lote)
npm run catalog:load   # requer SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
node scripts/smoke-test.ts  # requer SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
```

## Regras arquiteturais
- Restrições obrigatórias (`constraints`) são filtros aplicados ANTES do ranking; preferências (`preferences`) só pontuam. Nunca misturar.
- Contexto de um pedido nunca altera o perfil salvo. Contexto não reabre gênero excluído. "Hoje não" (avoidGenres) filtra o pedido.
- Filme citado num pedido ("parecido com X") entra por `requestReferences`: guia a similaridade, nunca é recomendado nem vira histórico.
- PostgREST corta respostas em 1000 linhas (max_rows): paginar com `.range()` ou agregar em SQL; nunca somar/exportar no cliente.
- Recomendação gravada é revalidada contra o perfil e os estados atuais antes de ser exibida de novo.
- Sem resultado compatível → lista vazia + sugestões de relaxamento. Nunca recomendar fora dos filtros.
- Mudou pesos/lógica do ranking → subir `ALGORITHM_VERSION` em `core/engine/score.ts`.
- Explicações são determinísticas a partir dos fatores (sem LLM).
- Compatibilidade é mostrada em faixas qualitativas, nunca em porcentagem.
- Recomendação agendada: idempotente por `claim_due_schedules` (SKIP LOCKED) + `unique (user_id, period_key)`. Geração e entrega são separadas.
- Tipos de recomendação: `on_demand` (principal da Home), `discover` (busca pontual, nunca vira a principal), `explore`, `scheduled`. `assistant` só existe em linhas antigas do banco (legado, DEC-040): ler, nunca gerar.
- `core/` importa só `zod` e arquivos relativos com extensão `.ts` (roda em Node, Vite e Deno).

## Segurança e privacidade
- Chave service role nunca no frontend nem no repositório. `.env` é ignorado pelo git.
- Toda tabela tem RLS. Cliente não escreve em `recommendations`; em `recommendation_items` só nas colunas de feedback.
- Logs sem dados pessoais (só id interno e mensagem de erro).
- LGPD: exportação de dados e exclusão de conta (cascata) no Perfil. Fontes auto-hospedadas (sem Google Fonts).

## Testes
- Toda regra do motor tem teste em `core/**/*.test.ts`, incluindo teste de propriedade das restrições.
- Mudança em migration → atualizar `supabase/tests/database.test.sql`.
- Antes de concluir algo que toca backend: `npx supabase test db` e `node scripts/smoke-test.ts` contra o stack local.
