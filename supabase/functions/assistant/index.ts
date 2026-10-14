// POST /functions/v1/assistant — Modo B. A LLM extrai filtros; o motor escolhe os filmes.
// Desligado enquanto ANTHROPIC_API_KEY não estiver configurada (fase R$ 0, DEC-011).
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import {
  ASSISTANT_MODEL,
  ASSISTANT_SYSTEM_PROMPT,
  estimateCostUsd,
  ExtractedRequestSchema,
  MAX_REQUEST_CHARS,
  toContext,
} from '../../../core/assistant.ts';
import { CORS_HEADERS, generateAndStore, json, serviceClient, userIdFromRequest } from '../_shared/service.ts';

const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT_PER_USER') ?? 10);
const MONTHLY_BUDGET_USD = Number(Deno.env.get('AI_MONTHLY_BUDGET_USD') ?? 2);

const BodySchema = z.object({
  message: z.string().trim().min(3).max(MAX_REQUEST_CHARS),
  excludeMovieIds: z.array(z.string()).max(50).default([]),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'assistant_disabled' }, 503);

  const db = serviceClient();
  const userId = await userIdFromRequest(db, req);
  if (!userId) return json({ error: 'unauthorized' }, 401);

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: 'invalid_body' }, 400);

  // Limites antes de gastar: por usuário/dia e teto global do mês.
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const [{ data: mine }, { data: month, error: monthError }] = await Promise.all([
    db.from('ai_usage').select('requests').eq('user_id', userId).eq('day', today).maybeSingle(),
    db.from('ai_usage').select('input_tokens,output_tokens').gte('day', monthStart),
  ]);
  if (monthError) return json({ error: 'internal_error' }, 500);
  if ((mine?.requests ?? 0) >= DAILY_LIMIT) return json({ error: 'daily_limit_reached', limit: DAILY_LIMIT }, 429);
  const spent = (month ?? []).reduce((acc, r) => acc + estimateCostUsd(r.input_tokens, r.output_tokens), 0);
  if (spent >= MONTHLY_BUDGET_USD) return json({ error: 'monthly_budget_reached' }, 503);

  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 20_000 });
  let response;
  try {
    response = await client.messages.parse({
      model: ASSISTANT_MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low', format: zodOutputFormat(ExtractedRequestSchema) },
      system: ASSISTANT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `<request>\n${parsed.data.message}\n</request>` }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'assistant_busy' }, 503);
    if (err instanceof Anthropic.APIConnectionError) return json({ error: 'assistant_unavailable' }, 503);
    if (err instanceof Anthropic.APIError) {
      console.error('anthropic error', { status: err.status });
      return json({ error: 'assistant_unavailable' }, 503);
    }
    throw err;
  }

  // Registra consumo mesmo quando a saída é inútil: o custo existiu.
  await db.rpc('record_ai_usage', {
    p_user_id: userId,
    p_input: response.usage.input_tokens,
    p_output: response.usage.output_tokens,
  });

  if (response.stop_reason === 'refusal') return json({ kind: 'off_topic' });
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) return json({ error: 'assistant_unparseable' }, 502);

  // Revalidação local: nunca confiar só no formato do provedor.
  const check = ExtractedRequestSchema.safeParse(response.parsed_output);
  if (!check.success) return json({ error: 'assistant_unparseable' }, 502);
  const extracted = check.data;

  if (extracted.intent === 'off_topic') return json({ kind: 'off_topic' });
  if (extracted.intent === 'clarify') return json({ kind: 'clarify', question: extracted.clarificationQuestion });

  // "Parecido com X": resolvemos o título no NOSSO catálogo; se não existir, não fingimos que existe.
  let similarTo: { id: string; titlePt: string | null; titleEn: string | null } | null = null;
  if (extracted.similarToTitle) {
    const { data } = await db
      .from('movies')
      .select('id,title_pt,title_en')
      .ilike('search_text', `%${extracted.similarToTitle.toLowerCase().replace(/[%_]/g, '').slice(0, 100)}%`)
      .order('popularity', { ascending: false })
      .limit(1);
    const row = data?.[0];
    if (row) similarTo = { id: row.id, titlePt: row.title_pt, titleEn: row.title_en };
  }

  try {
    const out = await generateAndStore(db, userId, {
      kind: 'assistant',
      context: { ...toContext(extracted), excludeMovieIds: parsed.data.excludeMovieIds },
      extraFavoriteIds: similarTo ? [similarTo.id] : [],
    });
    return json({
      kind: 'recommendation',
      interpreted: toContext(extracted),
      similarTo,
      similarToNotFound: extracted.similarToTitle !== null && similarTo === null ? extracted.similarToTitle : null,
      recommendationId: out.recommendationId,
      itemIds: out.itemIds,
      items: out.result.items,
      relaxations: out.result.relaxations,
      movies: out.movies,
    });
  } catch (err) {
    console.error('assistant recommend failed', { userId, error: err instanceof Error ? err.message : String(err) });
    return json({ error: 'internal_error' }, 500);
  }
});
