# Arquitetura — CineMatch AI (MVP)

## Visão geral

```
                      ┌────────────────── Vercel (Hobby) ───────────────┐
                      │  web/ (React + Vite)  — só chave pública + RLS   │
                      └───────────────┬──────────────────────────────────┘
                                      │ supabase-js (JWT do usuário)
┌─────────────────────────── Supabase ───────────────────────────────────┐
│  Auth                                                                   │
│  Postgres + RLS: movies, profiles, user_movies, recommendations,        │
│                  recommendation_items, recommendation_schedules,        │
│                  job_runs, ai_usage                                     │
│  Edge Functions (Deno):                                                 │
│     recommend ─────┐                                                    │
│     assistant ─────┼──► _shared/service.ts ──► core/engine (TS puro)    │
│     scheduled-run ─┘                                                    │
│  pg_cron (*/15 min) ──► scheduled-run (Bearer CRON_SECRET via Vault)    │
└─────────────────────────────────────────────────────────────────────────┘
        ▲                                         │ (só assistant, opcional)
        │ upsert (service role, mensal)           ▼
  scripts/wikidata (SPARQL CC0)            Anthropic API — Haiku 5.5
```

## Pipeline de recomendação (`core/engine`)

1. **Contexto**: `mergeConstraints(perfil, contexto)` — o contexto substitui valores só no pedido; gêneros excluídos são somados.
2. **Candidatos**: o banco pré-filtra (igual ou mais permissivo que o motor) e traz até 1.000 populares + 1.000 dos gêneros em foco (limite `max_rows` do PostgREST).
3. **Filtros obrigatórios** (`filters.ts`): sessão, sem interesse, não gostei, já assistido (salvo `allowRewatch`), gênero excluído, duração, nota mínima (sem nota = excluído), ano, idioma.
4. **Ranking** (`score.ts`, `rules-v1`): gêneros declarados, gêneros que não gosta (penalidade), afinidade aprendida (≥ 3 interações), similaridade com favoritos (diretor + gêneros), nota da crítica, popularidade, gêneros do contexto, novidade (modo explorar). Pesos são hipóteses.
5. **Diversidade** (`recommend.ts`): MMR com λ = 0,75.
6. **Explicação** (`explain.ts`): até 2 frases a partir dos fatores reais.
7. **Sem resultado**: lista vazia + quantos filmes cada restrição removida liberaria (contagem no banco). O usuário escolhe; nada é relaxado sozinho.

Tudo é registrado em `recommendations` (versão, restrições aplicadas, rejeitados por motivo) e `recommendation_items` (score, faixa, fatores, feedback).

## Fluxos

- **Home**: reaproveita a recomendação agendada da semana ou a `on_demand` das últimas 24 h. Só gera nova se não houver nenhuma.
- **Outra sugestão**: grava feedback `skipped`, mostra o próximo item; esgotou → novo pedido excluindo os já mostrados.
- **Descobrir** (`discover`): filtros pontuais, sem LLM.
- **Assistente** (`assistant`): Haiku extrai filtros (structured outputs + Zod) → `toContext` descarta valores fora de faixa → motor. "Parecido com X" só vale se X existir no catálogo. Limites: 10 pedidos/dia/usuário e US$ 2/mês (configuráveis).
- **Agendada**: `claim_due_schedules` reserva e já avança `next_run_at`; `period_key` único por usuário impede duplicata; falha → `retry_schedule` (até 3x, 15 min). Tudo registrado em `job_runs`.

## Modelo de dados

| Tabela | Conteúdo | Quem escreve |
|---|---|---|
| `movies` | catálogo Wikidata (título PT/EN, ano, duração, gêneros, idiomas, diretores, notas, popularidade) | script de carga |
| `profiles` | `constraints` e `preferences` (jsonb validado por Zod), idioma, `onboarded_at` | usuário (RLS) |
| `user_movies` | estado por filme: assistido, salvo, gostou/não gostou, sem interesse, tags | usuário (RLS) |
| `recommendations` / `recommendation_items` | log do algoritmo e feedback | backend; usuário só altera `feedback` |
| `recommendation_schedules` | frequência, dia, hora, fuso; `next_run_at` calculado no banco | usuário (colunas limitadas) |
| `job_runs`, `ai_usage` | observabilidade de jobs e custo de IA | backend |

Métricas do MVP (DEC-005): `select * from recommendation_metrics order by week desc;` no SQL Editor (só service role).

Exclusão de conta: `delete_my_account()` apaga `auth.users`; todo o resto cai em cascata.

## Custos (estimativa, beta com até 100 usuários)

| Item | Custo |
|---|---|
| Supabase (plano grátis: 500 MB; catálogo ocupa ~25 MB) | R$ 0 |
| Vercel Hobby (só não comercial, DEC-036) | R$ 0 |
| GitHub Actions (CI + backup) | R$ 0 em repositório público; em privado, dentro da cota grátis (NÃO VERIFICADO) |
| Wikidata | R$ 0 |
| Haiku 5.5 (se ligado): ~US$ 0,0005 por pedido; 100 usuários × 40 pedidos ≈ US$ 2/mês | teto configurado em US$ 2 |

## Limitações conhecidas

- Gêneros do Wikidata às vezes incompletos (ex.: filme de terror marcado só como ação).
- ~50% dos filmes sem título em português (mostra o título em inglês).
- ~45% dos filmes com nota; com nota mínima ativa, o restante não aparece.
- Sem disponibilidade em streaming (DEC-009) e sem pôsteres (DEC-008).
- Bundle do frontend ~180 KB gzip (Zod compartilhado); dividir por rota se crescer.
