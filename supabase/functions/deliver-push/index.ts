// POST /functions/v1/deliver-push — chamado pelo pg_cron a cada 15 minutos (DEC-048).
// Entrega, separada da geração (DEC-024): pega as recomendações agendadas recentes de quem tem aparelho
// inscrito e manda o aviso por Web Push. claim_push_deliveries marca cada recomendação ao reservá-la,
// então um aviso nunca sai duas vezes. Inscrições expiradas (404/410) ou que falham 5 vezes seguidas são apagadas.
import { scheduledPushMessage, type Frequency } from '../../../core/notify.ts';
import { json, moviesByIds, serviceClient, timingSafeEqual } from '../_shared/service.ts';
import { sendWebPush, type VapidKeys } from '../_shared/webpush.ts';

const BATCH = 50;
const TIME_BUDGET_MS = 20_000;
const MAX_FAILURES = 5;

type Claimed = { recommendation_id: string; user_id: string; movie_id: string; locale: 'pt' | 'en'; frequency: Frequency | null };
type Subscription = { id: string; endpoint: string; p256dh: string; auth: string; failures: number };

Deno.serve(async (req) => {
  const started = Date.now();
  const secret = Deno.env.get('CRON_SECRET');
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!secret || !timingSafeEqual(token, secret)) return json({ error: 'unauthorized' }, 401);

  const vapid: VapidKeys = {
    publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
    privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
    subject: Deno.env.get('VAPID_SUBJECT') ?? '',
  };
  // Sem chaves configuradas, não reserva nada: as recomendações continuam na fila até a configuração.
  if (!vapid.publicKey || !vapid.privateKey || !vapid.subject) return json({ error: 'vapid_not_configured' }, 503);

  const db = serviceClient();
  const { data: run, error: runError } = await db.from('job_runs').insert({ job: 'deliver-push' }).select('id').single();
  if (runError) return json({ error: 'job_log_failed' }, 500);

  let sent = 0;
  let failed = 0;
  let removed = 0;
  let skipped = 0;
  try {
    const { data, error } = await db.rpc('claim_push_deliveries', { p_limit: BATCH });
    if (error) throw error;
    const claimed = (data ?? []) as Claimed[];
    const movies = new Map((await moviesByIds(db, [...new Set(claimed.map((c) => c.movie_id))])).map((m) => [m.id, m]));

    for (const c of claimed) {
      // Já reservadas: se o tempo acabar, ficam sem aviso (nunca duplicam).
      if (Date.now() - started > TIME_BUDGET_MS) {
        skipped++;
        continue;
      }
      const movie = movies.get(c.movie_id);
      if (!movie) {
        skipped++;
        continue;
      }
      const message = scheduledPushMessage(movie, c.locale, c.frequency);
      const { data: subs, error: subsError } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth, failures').eq('user_id', c.user_id);
      if (subsError) throw subsError;

      for (const s of (subs ?? []) as Subscription[]) {
        try {
          const out = await sendWebPush(s, message, vapid, { topic: 'scheduled', ttlSeconds: 12 * 3600 });
          if (out.ok) {
            sent++;
            await db.from('push_subscriptions').update({ failures: 0, last_success_at: new Date().toISOString() }).eq('id', s.id);
          } else if (out.gone || s.failures + 1 >= MAX_FAILURES) {
            removed++;
            await db.from('push_subscriptions').delete().eq('id', s.id);
          } else {
            failed++;
            console.error('push rejected', { userId: c.user_id, status: out.status });
            await db.from('push_subscriptions').update({ failures: s.failures + 1 }).eq('id', s.id);
          }
        } catch (err) {
          failed++;
          console.error('push failed', { userId: c.user_id, error: err instanceof Error ? err.message : String(err) });
          await db.from('push_subscriptions').update({ failures: s.failures + 1 }).eq('id', s.id);
        }
      }
    }

    const { error: finishError } = await db.from('job_runs').update({
      status: failed > 0 ? 'failed' : 'succeeded',
      processed: sent,
      failed,
      error: failed > 0 ? `${failed} envio(s) recusado(s) pelo serviço de push` : null,
      finished_at: new Date().toISOString(),
    }).eq('id', run.id);
    if (finishError) console.error('job_runs finish failed', { error: finishError.message });
    return json({ claimed: claimed.length, sent, failed, removed, skipped });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('deliver-push failed', { error: message });
    await db.from('job_runs').update({ status: 'failed', processed: sent, failed, error: message, finished_at: new Date().toISOString() }).eq('id', run.id);
    return json({ error: 'job_failed' }, 500);
  }
});
