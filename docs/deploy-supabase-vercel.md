# Publicar o Cineou: Supabase + Vercel, passo a passo

Guia para colocar o Cineou no ar com o Supabase hospedado (plano grátis) e a Vercel Hobby (DEC-036, uso não comercial).
Custo: R$ 0. Nenhum passo pede cartão.

Regra de ouro das chaves:

| Chave | Onde vai | Pode aparecer no navegador? |
|---|---|---|
| Project URL | Vercel (`VITE_SUPABASE_URL`) | Sim |
| anon public key | Vercel (`VITE_SUPABASE_ANON_KEY`) | Sim (protegida por RLS) |
| service_role key | Só no seu terminal, para carregar o catálogo | **Nunca** |
| Senha do banco | Só no `supabase link` | **Nunca** |
| `CRON_SECRET` | Segredo das Edge Functions | **Nunca** |

Nunca coloque service_role, senha do banco ou `CRON_SECRET` na Vercel, no `.env` versionado ou no chat.

---

## Parte 1: criar o projeto no Supabase

1. Entre em https://supabase.com/dashboard e clique em **New project**.
2. Preencha:
   - **Name:** `cineou`
   - **Database Password:** clique em *Generate a password* e **guarde essa senha** (num gerenciador de senhas). Ela será pedida no passo 2.2.
   - **Region:** *South America (São Paulo)*, a mais perto dos usuários e da Vercel (`gru1`).
   - **Plan:** Free.
3. Clique em **Create new project** e espere uns 2 minutos até ficar verde.
4. Anote o **Project ref**: é o código na URL do painel, `https://supabase.com/dashboard/project/<PROJECT_REF>`
   (também aparece em *Project Settings → General*).
5. Em **Project Settings → API** (ou *API Keys*), anote:
   - **Project URL:** `https://<PROJECT_REF>.supabase.co`
   - **anon public:** a chave pública
   - **service_role:** a chave secreta (clique em *Reveal*; use só na Parte 4)

## Parte 2: ligar o repositório ao projeto e subir o banco

Rode tudo na pasta do projeto (`cinematch/`).

2.1. Faça login na CLI (abre o navegador):
```bash
npx supabase login
```

2.2. Vincule o repositório ao projeto (vai pedir a senha do banco da Parte 1):
```bash
npx supabase link --project-ref <PROJECT_REF>
```

2.3. Suba as 4 migrations (tabelas, RLS, funções SQL, cron):
```bash
npx supabase db push
```
Confirme com `Y`. Ao final, em *Table Editor* devem aparecer `movies`, `profiles`, `recommendations` e as demais tabelas.

## Parte 3: Edge Functions e segredos

3.1. Gere um segredo para o cron (copie a saída):
```bash
openssl rand -hex 32
```

3.2. Grave os segredos das funções (troque os valores entre `< >`):
```bash
npx supabase secrets set ALLOWED_ORIGIN=https://cineou.vercel.app CRON_SECRET=<saida-do-openssl>
```
- `ALLOWED_ORIGIN` precisa ser **exatamente** o domínio do site, sem barra no fim. As funções aceitam um único domínio; URLs de prévia da Vercel não vão funcionar.
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem nas funções hospedadas; não precisa definir.

3.3. Publique as duas funções:
```bash
npx supabase functions deploy recommend scheduled-run
```
A `scheduled-run` sobe sem verificação de JWT (definido em `supabase/config.toml`), porque quem a chama é o cron com o `CRON_SECRET`.

3.4. Ligue o cron das recomendações agendadas. No painel, abra **SQL Editor → New query**, cole e rode
(o segundo valor é **o mesmo** `CRON_SECRET` do passo 3.2):
```sql
select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
select vault.create_secret('<mesmo-valor-do-CRON_SECRET>', 'cron_secret');
```
Para conferir que o agendamento existe:
```sql
select jobname, schedule from cron.job;
```
Deve listar `scheduled-recommendations` a cada 15 minutos.

## Parte 4: carregar o catálogo de filmes

O catálogo já está baixado em `data/catalog.json` (Wikidata, CC0). Carregue no banco hospedado.
Este é o **único** uso da service_role. Ela vai só na linha de comando, sem salvar em arquivo:
```bash
SUPABASE_URL=https://<PROJECT_REF>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service_role> npm run catalog:load
```
São 102.153 filmes (~71 MB); leva de 5 a 10 minutos e pode ser repetido sem duplicar filmes. Confira em *Table Editor → movies*.

## Parte 5: login e e-mails

Em **Authentication → URL Configuration**:
- **Site URL:** `https://cineou.vercel.app`
- **Redirect URLs:** adicione `https://cineou.vercel.app/**`

Sem isso, os links de confirmação e de "Esqueci minha senha" apontam para o endereço local.

Em **Authentication → Sign In / Providers → Email** fica a opção **Confirm email** (vem ligada):
- **Ligada (recomendado):** quem cria conta recebe um link e confirma antes de entrar. O app já mostra "Enviamos um link de confirmação".
  O e-mail grátis do Supabase tem limite baixo de envios por hora, suficiente para poucos testadores.
- **Desligada:** a conta entra direto, mais prático para um teste fechado, mas qualquer e-mail (até falso) cria conta.

## Parte 6: Vercel

6.1. No projeto da Vercel, abra **Settings → Environment Variables** e crie, marcando **Production** e **Preview**:

| Nome | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://<PROJECT_REF>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | a chave **anon public** |

6.2. Confira em **Settings → Build and Deployment**:
- Framework: *Vite*. Install, build e output vêm do `vercel.json` (`npm ci`, `npm run build`, `dist`).
- Node.js Version: **22.x** (ou 24.x). O projeto exige Node 22+.
- **Production Branch:** `main`. O que estiver na `main` vai para `cineou.vercel.app`.

6.3. **Faça redeploy.** As variáveis `VITE_*` são gravadas no momento do build; mudar a variável sem redeploy não muda o site.
Em **Deployments**, no último deploy de produção, clique em **⋯ → Redeploy**.

6.4. Para testadores sem conta na Vercel conseguirem abrir: **Settings → Deployment Protection → Vercel Authentication**, desligue (ou deixe só para prévias).
O domínio de produção `cineou.vercel.app` em geral já é público; a proteção afeta principalmente as URLs de prévia.

## Parte 7: conferir que funcionou

1. Abra https://cineou.vercel.app: deve aparecer a tela de login (não uma página em branco).
2. Crie uma conta, confirme o e-mail (se a confirmação estiver ligada), faça o onboarding.
3. A Home deve mostrar uma recomendação e os cards "Mais para o seu perfil".
4. Perfil → exportar dados deve baixar `cineou-meus-dados.json`.

## Problemas comuns

| Sintoma | Causa provável | Como resolver |
|---|---|---|
| Página em branco; console: `Configure VITE_SUPABASE_URL…` | Variáveis da Parte 6 ausentes ou sem redeploy | Criar as variáveis e fazer Redeploy |
| "Algo falhou ao carregar" na Home; erro de CORS no console | `ALLOWED_ORIGIN` diferente do domínio aberto | Ajustar no passo 3.2 (sem barra no fim) |
| Home sem filmes / nenhuma recomendação compatível | Catálogo não carregado | Parte 4 |
| Link do e-mail abre `127.0.0.1` | Site URL não configurada | Parte 5 |
| Recomendações agendadas nunca chegam | Segredos do Vault ausentes ou diferentes do `CRON_SECRET` | Passo 3.4 |
| Erro em chamadas para `*.supabase.co` bloqueadas pela CSP | Domínio do Supabase personalizado | Ajustar `connect-src` em `vercel.json` |

## Atualizações futuras

- Mudou migration: `npx supabase db push`.
- Mudou função: `npx supabase functions deploy <nome>`.
- Mudou o frontend: merge na `main`; a Vercel publica sozinha.
- Atualizar catálogo: `npm run catalog:fetch` e depois o comando da Parte 4.
