# Cineou

Encontra o próximo filme certo para você: uma recomendação por vez, com o motivo explicado, respeitando seus limites e aprendendo com o seu feedback.

- Catálogo: ~102 mil filmes do [Wikidata](https://www.wikidata.org) (CC0). Notas de Rotten Tomatoes e Metacritic via Wikidata.
- Motor de recomendação próprio, baseado em regras e explicável (`core/`).
- Assistente com IA opcional (Claude Haiku 5.5) que só traduz o pedido em filtros.

Documentação: [decisões](docs/decisions.md) · [arquitetura](docs/architecture.md) · [pesquisa de APIs e licenças](docs/api-research.md).

## Rodar localmente

Requisitos: Node 22+, Docker.

```bash
npm install
npx supabase start                                  # Postgres, Auth e Edge Functions locais
cp .env.example .env                                # preencha com os valores de `npx supabase status`
npm run catalog:fetch -- --min-sitelinks=2          # baixa o catálogo do Wikidata (~50 min na primeira vez)
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

## Publicar para testes (Vercel + Supabase)

Passo a passo completo, com onde vai cada chave e problemas comuns: [docs/deploy-supabase-vercel.md](docs/deploy-supabase-vercel.md).

Nada abaixo foi executado. Plano grátis em ambos; o Vercel Hobby só pode ser usado enquanto não houver uso comercial (DEC-036).

1. **Supabase**: criar projeto (plano Free, região mais próxima dos testadores) em supabase.com.
2. **Banco e funções** (na sua máquina, a senha do banco é digitada só no prompt):
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   npx supabase functions deploy recommend scheduled-run assistant
   ```
3. **Segredos das funções** (nunca no repositório nem no chat):
   ```bash
   npx supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
   npx supabase secrets set ALLOWED_ORIGIN=https://<seu-projeto>.vercel.app
   npx supabase secrets set ANTHROPIC_API_KEY=<sua chave>      # assistente com Haiku (DEC-037)
   ```
   Teto de gasto: `AI_MONTHLY_BUDGET_USD` (padrão 2) e `AI_DAILY_LIMIT_PER_USER` (padrão 10).
4. **Vault** (SQL Editor do Supabase), para o agendamento funcionar:
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<o mesmo CRON_SECRET>', 'cron_secret');
   ```
5. **Catálogo**: `npm run catalog:fetch` (se ainda não tiver `data/catalog.json`) e
   `SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service role> npm run catalog:load` — só na sua máquina.
6. **Vercel**: importar o repositório do GitHub (o `vercel.json` já define build, saída, rotas e cabeçalhos de segurança) e
   adicionar as variáveis `VITE_SUPABASE_URL=https://<ref>.supabase.co` e `VITE_SUPABASE_ANON_KEY=<anon key>` (são públicas).
7. **Auth** (Supabase → Authentication → URL Configuration): `Site URL` = domínio do Vercel; em Redirect URLs, o mesmo domínio.
   Para o beta fechado: desligar cadastro aberto e convidar testadores por e-mail; exigir confirmação de e-mail e senha forte.
8. **Backup**: secrets `SUPABASE_DB_URL` e `BACKUP_PASSPHRASE` no GitHub para o workflow semanal.
9. **Antes de abrir para convidados**: revisar `docs/privacy-policy-draft.md` e `docs/terms-of-use-draft.md`.
