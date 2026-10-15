# Pesquisa de APIs e licenciamento

**Data da verificação:** 2026-10-14. Itens não confirmados em fonte oficial estão marcados como **NÃO VERIFICADO**.

## Conclusão principal

**Atualização 2026-10-15 (DEC-040/DEC-041):** o assistente de IA foi removido, e o TMDB passou a ser usado,
só para fins não comerciais, como complemento do catálogo do Wikidata: pôsteres, sinopses, nota e onde assistir.
A análise abaixo continua válida para qualquer uso comercial ou com IA.

Antes da atualização, o TMDB não podia ser usado pelo Cineou sem contrato comercial. Termos da API (atualizados em 2023-10-20):

- §1.C proíbe *"Use the TMDB APIs or TMDB Content in connection with, including for training, a machine learning (ML)
  or artificial intelligence (AI) based Application."* — vale mesmo para uso não comercial.
- §2 classifica como uso comercial *"interactive query-response system (including large language model (LLM), artificial intelligence,
  or any other machine learning based interactive query-response systems or chatbots)"*.
- Cache máximo de 6 meses; atribuição com logo obrigatória.

Separar tecnicamente a LLM dos dados do TMDB **não** resolve, porque a restrição é sobre a aplicação. Por isso o catálogo vem do Wikidata (DEC-007).

## Tabela

| Serviço | Finalidade | Comercial | Uso com IA | Custo | Cache / redistribuição | Decisão | Fonte |
|---|---|---|---|---|---|---|---|
| TMDB API | Catálogo, imagens, sinopses | Só com contrato | Proibido sem contrato | Grátis não comercial; comercial sob consulta | 6 meses; logo obrigatório; provedores com atribuição ao JustWatch | **Usar** (não comercial, sem IA — DEC-041) | [Termos](https://www.themoviedb.org/api-terms-of-use) · [FAQ](https://developer.themoviedb.org/docs/faq) |
| IMDb Datasets | Títulos, ratings (TSV diário) | Não ("personal and non-commercial use") | NÃO VERIFICADO | Grátis | Cópia local permitida, uso não comercial | Não usar | [Datasets](https://data.imdb.com/non-commercial-datasets/) |
| IMDb API | Dados oficiais via AWS Data Exchange | Com contrato | NÃO VERIFICADO | Sob consulta | Contratual | Fora do orçamento (provável) | [Docs](https://data.imdb.com/documentation/) |
| Wikidata | Catálogo estruturado | Sim — CC0 | Sim | Grátis | Livre | **Usar** | [Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing) |
| Watchmode | Disponibilidade em streaming (inclui BR) | Só pago (US$ 349+/mês) | NÃO VERIFICADO | Grátis: 2.500 créditos/mês, não comercial | Grátis: renovar ou apagar em 30 dias | Fora do MVP | [Site](https://api.watchmode.com/) |
| JustWatch | Disponibilidade em streaming | Sob contrato | NÃO VERIFICADO | Sob consulta | NÃO VERIFICADO | Fora do MVP | [API](https://www.justwatch.com/us/JustWatch-Streaming-API) |
| Streaming Availability | Disponibilidade em streaming | NÃO VERIFICADO | NÃO VERIFICADO | Plano grátis existe | NÃO VERIFICADO | Reavaliar | [GitHub](https://github.com/movieofthenight/streaming-availability-api) |
| OMDb | Metadados | Não (CC BY-NC 4.0) | — | Doação | — | Não usar | [Site](https://www.omdbapi.com/) |
| Anthropic API | LLM | Sim | Sim | Sem plano grátis; créditos pré-pagos. Haiku 5.5: US$ 0,10 entrada / 0,50 saída por milhão de tokens | — | Não usado desde DEC-040 (assistente removido) | [Pricing](https://claude.com/pricing) |
| Gemini API grátis | LLM | Sim | Sim | Grátis com limites | Dados usados para melhorar produtos; revisão humana; 18+ | Não usar (LGPD) | [Termos](https://ai.google.dev/gemini-api/terms) |
| Resend | E-mail | NÃO VERIFICADO no plano grátis | — | Grátis 3.000/mês, 100/dia; Pro US$ 20 | — | Adiado (DEC-012) | [Pricing](https://resend.com/pricing) |

## Cobertura do Wikidata (consulta SPARQL, 2026-10-14, aproximada)

- ~277 mil filmes com ID do IMDb (P345).
- ~147 mil com duração (P2047).
- ~26 mil com alguma nota (P444), de fontes misturadas.
- Não há sinopses (só descrições curtas), nem pôsteres livres.

## Infraestrutura (planos grátis, 2026-10-14)

| Serviço | Plano grátis | Atenção | Fonte |
|---|---|---|---|
| Supabase | 500 MB de banco, 50 mil MAU, 500 mil invocações de função, 2 projetos | Pausa após 1 semana sem atividade; sem backup automático; Pro US$ 25 | [Pricing](https://supabase.com/pricing) |
| Supabase Cron | Intervalo a partir de 1 s; histórico em `cron.job_run_details` | Disponibilidade no plano grátis NÃO VERIFICADO na página | [Docs](https://supabase.com/docs/guides/cron) |
| Neon | 1 GB/projeto, 100 CU-hora | Sem auth/cron | [Pricing](https://neon.com/pricing) |
| Vercel Hobby | 1 milhão de invocações | Só uso não comercial; cron 1x/dia com ±59 min | [Fair use](https://vercel.com/docs/limits/fair-use-guidelines) · [Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing) |
| Cloudflare Pages | 500 builds/mês | Sem restrição comercial na página de limites (termos gerais NÃO VERIFICADO) | [Limits](https://developers.cloudflare.com/pages/platform/limits/) |
