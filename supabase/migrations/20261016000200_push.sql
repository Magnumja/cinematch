-- Avisos no celular por Web Push (DEC-048): a recomendação agendada também vira notificação na barra
-- do aparelho. A entrega é separada da geração (DEC-024): o scheduled-run grava a recomendação e o
-- deliver-push, em outro horário do cron, avisa quem tem aparelho inscrito.

-- Uma linha por navegador/aparelho inscrito. O endpoint é a URL do serviço de push do navegador.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Só serviços de push conhecidos (o backend faz POST nessa URL); a Edge Function confere de novo.
  endpoint text not null unique check (
    char_length(endpoint) <= 1024
    and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/'
  ),
  -- Chaves do navegador em base64url: ponto P-256 (65 bytes) e segredo de autenticação (16 bytes).
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{86,88}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22,24}$'),
  failures smallint not null default 0,
  last_success_at timestamptz,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- O cliente vê e remove as próprias inscrições; a criação passa pela função abaixo.
create policy "ver as próprias inscrições de push" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "remover as próprias inscrições de push" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- O endpoint pertence ao navegador, não à conta: se outra pessoa entrar no mesmo aparelho, a inscrição
-- passa para ela (a anterior deixa de receber os avisos nesse aparelho). Até 10 aparelhos por conta.
create or replace function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'não autenticado' using errcode = '42501'; end if;
  if (select count(*) from public.push_subscriptions where user_id = uid and endpoint <> p_endpoint) >= 10 then
    raise exception 'limite de 10 aparelhos com avisos' using errcode = '54000';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, failures = 0;
end $$;

revoke execute on function public.register_push_subscription(text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text) to authenticated;

-- Fila de entrega: marca a recomendação no momento da reserva (no máximo um aviso por recomendação;
-- perder um aviso é melhor que mandar dois).
alter table public.recommendations add column push_notified_at timestamptz;
-- As agendadas que já existiam não geram aviso retroativo.
update public.recommendations set push_notified_at = created_at where kind = 'scheduled';
create index recommendations_push_pending_idx on public.recommendations (created_at)
  where kind = 'scheduled' and push_notified_at is null;

-- Reserva até p_limit recomendações agendadas recentes (12 h) de quem tem aparelho inscrito.
-- SKIP LOCKED: duas execuções simultâneas nunca pegam a mesma recomendação.
create or replace function public.claim_push_deliveries(p_limit integer) returns table (
  recommendation_id uuid, user_id uuid, movie_id text, locale text, frequency text
)
language sql security definer set search_path = '' as $$
  with due as (
    select r.id from public.recommendations r
    where r.kind = 'scheduled' and r.push_notified_at is null and r.created_at > now() - interval '12 hours'
      and exists (select 1 from public.push_subscriptions s where s.user_id = r.user_id)
    order by r.created_at
    limit p_limit
    for update skip locked
  ), marked as (
    update public.recommendations r set push_notified_at = now()
    from due where r.id = due.id
    returning r.id, r.user_id
  )
  select m.id, m.user_id, i.movie_id, p.locale, sc.frequency
  from marked m
  join public.recommendation_items i on i.recommendation_id = m.id and i.rank = 1
  join public.profiles p on p.user_id = m.user_id
  left join public.recommendation_schedules sc on sc.user_id = m.user_id;
$$;

revoke execute on function public.claim_push_deliveries(integer) from public, anon, authenticated;

-- LGPD: a exportação passa a listar os aparelhos inscritos (sem as chaves de criptografia).
create or replace function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'não autenticado' using errcode = '42501'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'account', (
      select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at)
      from auth.users u where u.id = uid
    ),
    'profile', (select to_jsonb(p) from public.profiles p where p.user_id = uid),
    'movies', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.updated_at desc) from public.user_movies m where m.user_id = uid
    ), '[]'::jsonb),
    'lists', coalesce((
      select jsonb_agg(
        to_jsonb(l) || jsonb_build_object('items', coalesce((
          select jsonb_agg(jsonb_build_object('movie_id', i.movie_id, 'added_at', i.added_at) order by i.added_at desc)
          from public.user_list_items i where i.list_id = l.id
        ), '[]'::jsonb))
        order by l.created_at
      )
      from public.user_lists l where l.user_id = uid
    ), '[]'::jsonb),
    'schedule', (select to_jsonb(s) from public.recommendation_schedules s where s.user_id = uid),
    'push_devices', coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'created_at', s.created_at, 'last_success_at', s.last_success_at) order by s.created_at)
      from public.push_subscriptions s where s.user_id = uid
    ), '[]'::jsonb),
    'recommendations', coalesce((
      select jsonb_agg(
        to_jsonb(r) || jsonb_build_object('items', coalesce((
          select jsonb_agg(to_jsonb(i) order by i.rank) from public.recommendation_items i where i.recommendation_id = r.id
        ), '[]'::jsonb))
        order by r.created_at desc
      )
      from public.recommendations r where r.user_id = uid
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- Entrega a cada 15 minutos, defasada 7 minutos da geração (scheduled-run roda em :00/:15/:30/:45).
-- Usa os mesmos segredos do Vault do cron de geração (project_url e cron_secret).
select cron.schedule(
  'deliver-push',
  '7-59/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/deliver-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
