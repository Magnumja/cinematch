// POST /functions/v1/scheduled-run — chamado pelo pg_cron a cada 15 minutos.
// Idempotência em duas camadas: claim_due_schedules (SKIP LOCKED) e unique (user_id, period_key).
// Resiliência: lote pequeno + orçamento de tempo; quem foi reservado e não processado volta à fila
// (release_schedule); execuções anteriores interrompidas são marcadas como falhas no início.
import { periodKey } from '../../../core/db.ts';
import { generateAndStore, json, serviceClient, timingSafeEqual } from '../_shared/service.ts';

const BATCH = 10;
// Abaixo do timeout de 30 s do pg_net e do limite de execução da Edge Function.
const TIME_BUDGET_MS = 20_000;
const STALE_AFTER_MS = 10 * 60_000;

type Due = { user_id: string; frequency: 'daily' | 'weekly' | 'monthly'; timezone: string; due_at: string };

// Chamada RPC com erro checado e logado (só id interno e mensagem; nada de dado pessoal).
async function rpcLogged(db: ReturnType<typeof serviceClient>, fn: string, args: Record<string, unknown>, userId: string): Promise<boolean> {
  const { error } = await db.rpc(fn, args);
  if (error) console.error(`${fn} failed`, { userId, error: error.message });
  return !error;
}

Deno.serve(async (req) => {
  const started = Date.now();
  const secret = Deno.env.get('CRON_SECRET');
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!secret || !timingSafeEqual(token, secret)) return json({ error: 'unauthorized' }, 401);

  const db = serviceClient();

  // Execuções que ficaram em 'running' (timeout ou queda do processo) não podem parecer em andamento para sempre.
  const { error: staleError } = await db.from('job_runs')
    .update({ status: 'failed', error: 'execução interrompida (timeout ou queda)', finished_at: new Date().toISOString() })
    .eq('status', 'running')
    .lt('started_at', new Date(started - STALE_AFTER_MS).toISOString());
  if (staleError) console.error('stale job_runs cleanup failed', { error: staleError.message });

  const { data: run, error: runError } = await db.from('job_runs').insert({ job: 'scheduled-run' }).select('id').single();
  if (runError) return json({ error: 'job_log_failed' }, 500);

  let processed = 0;
  let failed = 0;
  let duplicates = 0;
  let released = 0;
  let rpcErrors = 0;
  try {
    const { data, error } = await db.rpc('claim_due_schedules', { p_limit: BATCH });
    if (error) throw error;
    const due = (data ?? []) as Due[];
    let i = 0;
    for (; i < due.length && Date.now() - started < TIME_BUDGET_MS; i++) {
      const s = due[i]!;
      try {
        const out = await generateAndStore(db, s.user_id, {
          kind: 'scheduled',
          periodKey: periodKey(s.frequency, new Date(s.due_at), s.timezone),
        });
        if (out.duplicate) duplicates++;
        processed++;
        if (!(await rpcLogged(db, 'mark_schedule_success', { p_user_id: s.user_id }, s.user_id))) rpcErrors++;
      } catch (err) {
        failed++;
        console.error('scheduled generation failed', { userId: s.user_id, error: err instanceof Error ? err.message : String(err) });
        if (!(await rpcLogged(db, 'retry_schedule', { p_user_id: s.user_id }, s.user_id))) rpcErrors++;
      }
    }
    // Orçamento de tempo esgotado: devolve à fila quem foi reservado e não processado.
    for (const s of due.slice(i)) {
      if (await rpcLogged(db, 'release_schedule', { p_user_id: s.user_id, p_due_at: s.due_at }, s.user_id)) released++;
      else rpcErrors++;
    }

    const problems = [
      failed > 0 ? `${failed} usuário(s) com falha; retry agendado` : null,
      rpcErrors > 0 ? `${rpcErrors} chamada(s) de controle do agendamento falharam` : null,
    ].filter((p): p is string => p !== null);
    const { error: finishError } = await db.from('job_runs').update({
      status: problems.length > 0 ? 'failed' : 'succeeded',
      processed,
      failed,
      error: problems.length > 0 ? problems.join('; ') : null,
      finished_at: new Date().toISOString(),
    }).eq('id', run.id);
    if (finishError) console.error('job_runs finish failed', { error: finishError.message });
    return json({ processed, failed, duplicates, released });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('scheduled-run failed', { error: message });
    await db.from('job_runs').update({ status: 'failed', processed, failed, error: message, finished_at: new Date().toISOString() }).eq('id', run.id);
    return json({ error: 'job_failed' }, 500);
  }
});
