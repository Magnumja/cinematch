// POST /functions/v1/assistant — Modo B. A LLM extrai filtros; o motor escolhe os filmes.
// Desligado enquanto ANTHROPIC_API_KEY não estiver configurada (fase R$ 0, DEC-011).
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import {
  ASSISTANT_MODEL,
  ASSISTANT_SYSTEM_PROMPT,
  buildUserPrompt,
  clampClarification,
  ExtractedRequestSchema,
  MAX_REQUEST_CHARS,
  toContext,
} from '../../../core/assistant.ts';
import { CORS_HEADERS, generateAndStore, json, serviceClient, userIdFromRequest } from '../_shared/service.ts';

const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT_PER_USER') ?? 10);
const MONTHLY_BUDGET_USD = Number(Deno.env.get('AI_MONTHLY_BUDGET_USD') ?? 2);

async function addTokens(db: ReturnType<typeof serviceClient>, userId: string, input: number, output: number): Promise<void> {
  const { error } = await db.rpc('add_ai_tokens', { p_user_id: userId, p_input: input, p_output: output });
  if (error) console.error('ai token accounting failed', { userId, error: error.message });
}

const BodySchema = z.object({
  message: z.string().trim().min(3).max(MAX_REQUEST_CHARS),
  excludeMovieIds: z.array(z.string().regex(/^Q\d{1,15}$/)).max(500).default([]),
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

  // Reserva atômica ANTES de gastar (limite por usuário/dia e teto global do mês, somado no banco).
  const { data: reservation, error: reserveError } = await db.rpc('reserve_ai_request', {
    p_user_id: userId,
    p_daily_limit: DAILY_LIMIT,
    p_budget_usd: MONTHLY_BUDGET_USD,
  });
  if (reserveError) {
    console.error('ai reservation failed', { userId, error: reserveError.message });
    return json({ error: 'internal_error' }, 500);
  }
  if (reservation === 'daily') return json({ error: 'daily_limit_reached', limit: DAILY_LIMIT }, 429);
  if (reservation === 'budget') return json({ error: 'monthly_budget_reached' }, 503);
  if (reservation !== 'ok') {
    console.error('ai reservation unexpected result', { userId });
    return json({ error: 'internal_error' }, 500);
  }

  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 20_000 });
  let response;
  try {
    // create (não parse): o parse do SDK lança erro em saída inválida e perderíamos o usage.
    // A saída é validada aqui embaixo, depois de registrar os tokens.
    response = await client.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: 600,
      output_config: { effort: 'low', format: zodOutputFormat(ExtractedRequestSchema) },
      system: ASSISTANT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(parsed.data.message) }],
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

  // Registra os tokens antes de qualquer validação: mesmo saída inútil teve custo.
  await addTokens(db, userId, response.usage.input_tokens, response.usage.output_tokens);

  if (response.stop_reason === 'refusal') return json({ kind: 'off_topic' });
  if (response.stop_reason === 'max_tokens') return json({ error: 'assistant_unparseable' }, 502);

  // Validação local: nunca confiar só no formato do provedor.
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text;
  let raw: unknown = null;
  try {
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  const check = ExtractedRequestSchema.safeParse(raw);
  if (!check.success) return json({ error: 'assistant_unparseable' }, 502);
  const extracted = check.data;

  if (extracted.intent === 'off_topic') return json({ kind: 'off_topic' });
  if (extracted.intent === 'clarify') return json({ kind: 'clarify', question: clampClarification(extracted.clarificationQuestion) });

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
      requestReferenceIds: similarTo ? [similarTo.id] : [],
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
