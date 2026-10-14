// POST /functions/v1/recommend — recomendação sob demanda ou "descobrir algo diferente".
import { z } from 'zod';
import { ContextSchema } from '../../../core/schemas.ts';
import { CORS_HEADERS, generateAndStore, json, serviceClient, tooManyRequests, userIdFromRequest } from '../_shared/service.ts';

const BodySchema = z.object({
  // assistant = "liberar restrição" de um pedido do assistente, reaproveitando os filtros já interpretados (sem LLM).
  kind: z.enum(['on_demand', 'discover', 'explore', 'assistant']).default('on_demand'),
  context: ContextSchema.optional(),
  limit: z.number().int().min(1).max(10).default(5),
  // "Parecido com X" de um pedido do assistente, para manter a referência ao liberar restrições.
  similarToId: z.string().regex(/^Q\d{1,15}$/).optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const db = serviceClient();
  const userId = await userIdFromRequest(db, req);
  if (!userId) return json({ error: 'unauthorized' }, 401);

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: 'invalid_body', issues: parsed.error.issues }, 400);

  try {
    if (await tooManyRequests(db, userId, 20)) return json({ error: 'rate_limited' }, 429);
    const { kind, context, limit, similarToId } = parsed.data;
    const out = await generateAndStore(db, userId, {
      kind,
      context: kind === 'explore' ? { ...context, mode: 'explore' } : context,
      limit,
      requestReferenceIds: similarToId ? [similarToId] : [],
    });
    return json({
      recommendationId: out.recommendationId,
      itemIds: out.itemIds,
      algorithmVersion: out.result.algorithmVersion,
      items: out.result.items,
      relaxations: out.result.relaxations,
      rejected: out.result.rejected,
      appliedConstraints: out.result.appliedConstraints,
      movies: out.movies,
    });
  } catch (err) {
    // Log sem dados pessoais: só o tipo do erro e o id interno do usuário.
    console.error('recommend failed', { userId, error: err instanceof Error ? err.message : String(err) });
    return json({ error: 'internal_error' }, 500);
  }
});
