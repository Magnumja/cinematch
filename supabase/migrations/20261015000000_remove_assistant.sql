-- Remoção do assistente de IA (DEC-038).
-- O app deixa de usar LLM para poder usar a API do TMDB (termos §1.C proíbem uso em conexão com IA).
-- A constraint de recommendations.kind continua aceitando 'assistant': linhas antigas seguem válidas.

-- ---------------------------------------------------------------------------
-- 1. Funções e tabela de controle de uso/custo da IA.
-- ---------------------------------------------------------------------------
drop function if exists public.reserve_ai_request(uuid, integer, numeric);
drop function if exists public.add_ai_tokens(uuid, integer, integer);
drop function if exists public.record_ai_usage(uuid, integer, integer);
drop table if exists public.ai_usage;

-- ---------------------------------------------------------------------------
-- 2. Exportação LGPD sem a chave ai_usage (mesma assinatura e permissões da 20261014000300).
-- ---------------------------------------------------------------------------
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
    'schedule', (select to_jsonb(s) from public.recommendation_schedules s where s.user_id = uid),
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
