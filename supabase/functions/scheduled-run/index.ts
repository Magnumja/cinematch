// POST /functions/v1/scheduled-run — chamado pelo pg_cron a cada 15 minutos.
// Idempotência em duas camadas: claim_due_schedules (SKIP LOCKED) e unique (user_id, period_key).
import { periodKey } from '../../../core/db.ts';
import { generateAndStore, json, serviceClient } from '../_shared/service.ts';

const BATCH = 50;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!secret || !timingSafeEqual(token, secret)) return json({ error: 'unauthorized' }, 401);

  const db = serviceClient();
  const { data: run, error: runError } = await db.from('job_runs').insert({ job: 'scheduled-run' }).select('id').single();
  if (runError) return json({ error: 'job_log_failed' }, 500);

  let processed = 0;
  let failed = 0;
  let duplicates = 0;
  try {
    const { data: due, error } = await db.rpc('claim_due_schedules', { p_limit: BATCH });
    if (error) throw error;
    for (const s of due as { user_id: string; frequency: 'daily' | 'weekly' | 'monthly'; timezone: string; due_at: string }[]) {
      try {
        const out = await generateAndStore(db, s.user_id, {
          kind: 'scheduled',
          periodKey: periodKey(s.frequency, new Date(s.due_at), s.timezone),
        });
        if (out.duplicate) duplicates++;
        processed++;
        await db.rpc('mark_schedule_success', { p_user_id: s.user_id });
      } catch (err) {
        failed++;
        console.error('scheduled generation failed', { userId: s.user_id, error: err instanceof Error ? err.message : String(err) });
        await db.rpc('retry_schedule', { p_user_id: s.user_id });
      }
    }
    await db.from('job_runs').update({
      status: failed > 0 ? 'failed' : 'succeeded',
      processed,
      failed,
      error: failed > 0 ? `${failed} usuário(s) com falha; retry agendado` : null,
      finished_at: new Date().toISOString(),
    }).eq('id', run.id);
    return json({ processed, failed, duplicates });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from('job_runs').update({ status: 'failed', processed, failed, error: message, finished_at: new Date().toISOString() }).eq('id', run.id);
    return json({ error: 'job_failed' }, 500);
  }
});
