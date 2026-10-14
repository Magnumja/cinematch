# CineMatch AI

Encontra o próximo filme certo para você: uma recomendação por vez, com o motivo explicado, respeitando seus limites e aprendendo com o seu feedback.

- Catálogo: ~38 mil filmes do [Wikidata](https://www.wikidata.org) (CC0). Notas de Rotten Tomatoes e Metacritic via Wikidata.
- Motor de recomendação próprio, baseado em regras e explicável (`core/`).
- Assistente com IA opcional (Claude Haiku 5.5) que só traduz o pedido em filtros.

Documentação: [decisões](docs/decisions.md) · [arquitetura](docs/architecture.md) · [pesquisa de APIs e licenças](docs/api-research.md).

## Rodar localmente

Requisitos: Node 22+, Docker.

```bash
npm install
npx supabase start                                  # Postgres, Auth e Edge Functions locais
cp .env.example .env                                # preencha com os valores de `npx supabase status`
npm run catalog:fetch                               # baixa o catálogo do Wikidata (~15 min na primeira vez)
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run catalog:load
echo "CRON_SECRET=local-dev-cron-secret" > supabase/functions/.env
npx supabase functions serve --env-file supabase/functions/.env   # em outro terminal
npm run dev                                         # http://127.0.0.1:5173
```

## Testes

```bash
npm test                 # motor, schemas, mapeamento do Wikidata (Vitest)
npm run typecheck
npx supabase test db     # RLS, agendamento e idempotência (pgTAP)
node scripts/smoke-test.ts   # ponta a ponta contra o stack local (variáveis no topo do arquivo)
```

## Publicar o beta (passos que exigem conta e decisão sua)

Nada abaixo foi executado. Todos os serviços são gratuitos nos limites do beta.

1. **Supabase**: criar projeto (plano Free). `npx supabase link --project-ref <ref>` e `npx supabase db push`.
2. **Segredos das funções**: `npx supabase secrets set CRON_SECRET=<aleatório> ALLOWED_ORIGIN=https://<seu-domínio>`.
   Deixe `ANTHROPIC_API_KEY` vazio para manter o assistente desligado (fase R$ 0).
3. **Vault** (SQL Editor): `select vault.create_secret('https://<ref>.supabase.co', 'project_url');` e
   `select vault.create_secret('<mesmo CRON_SECRET>', 'cron_secret');`
4. **Funções**: `npx supabase functions deploy recommend scheduled-run assistant`.
   Confirmar que o deploy inclui `core/` (DEC-019).
5. **Catálogo**: `npm run catalog:load` com a URL e a service role key do projeto (só na sua máquina).
6. **Auth**: em Authentication → URL Configuration, apontar `Site URL` para o domínio do Cloudflare Pages.
   Para o beta fechado, desligar cadastro aberto e convidar por e-mail.
7. **Cloudflare Pages**: build `npm run build`, saída `dist`, variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
   O arquivo `web/public/_redirects` já faz o roteamento de SPA.
8. **Backup**: secrets `SUPABASE_DB_URL` e `BACKUP_PASSPHRASE` no GitHub para o workflow semanal.
9. **Antes de abrir para convidados**: política de privacidade (LGPD) e validação jurídica das notas (DEC-010).
