-- Correções da auditoria de 2026-10-14.

-- 1. Retry infinito: claim_due_schedules zerava `attempts`, então retry_schedule nunca chegava ao limite de 3.
--    Agora o contador só é zerado quando a geração dá certo (mark_schedule_success).
create or replace function public.claim_due_schedules(p_limit integer default 50)
returns table (user_id uuid, frequency text, timezone text, due_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select s.user_id, s.next_run_at
    from public.recommendation_schedules s
    where s.active and s.next_run_at <= now()
    order by s.next_run_at
    limit p_limit
    for update skip locked
  )
  update public.recommendation_schedules s
  set next_run_at = public.compute_next_run(s.frequency, s.weekday, s.day_of_month, s.hour, s.timezone, now())
  from due
  where s.user_id = due.user_id
  returning s.user_id, s.frequency, s.timezone, due.next_run_at;
end $$;

create or replace function public.mark_schedule_success(p_user_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.recommendation_schedules set attempts = 0 where user_id = p_user_id and attempts <> 0;
$$;

revoke execute on function public.claim_due_schedules(integer) from public, anon, authenticated;
revoke execute on function public.mark_schedule_success(uuid) from public, anon, authenticated;

-- 2. Métricas do objetivo do MVP (DEC-005): aceitação e rejeição por versão do algoritmo e semana.
--    Aceitação = quero assistir / gostei / já assisti; rejeição forte = não gostei / sem interesse.
--    Denominador = itens gerados (a Home mostra os 5 itens de cada recomendação).
--    Só para o responsável (SQL Editor / service role); usuários não têm acesso.
create or replace view public.recommendation_metrics
with (security_invoker = true) as
select
  r.algorithm_version,
  date_trunc('week', r.created_at)::date as week,
  r.kind,
  count(*) as items_shown,
  count(*) filter (where i.feedback in ('want', 'liked', 'watched')) as accepted,
  count(*) filter (where i.feedback in ('disliked', 'not_interested')) as rejected,
  count(*) filter (where i.feedback = 'skipped') as skipped,
  round(100.0 * count(*) filter (where i.feedback in ('want', 'liked', 'watched')) / nullif(count(*), 0), 1) as acceptance_pct,
  round(100.0 * count(*) filter (where i.feedback in ('disliked', 'not_interested')) / nullif(count(*), 0), 1) as rejection_pct
from public.recommendations r
join public.recommendation_items i on i.recommendation_id = r.id
group by 1, 2, 3;

revoke all on public.recommendation_metrics from public, anon, authenticated;
