-- Listas personalizadas (DEC-045), no estilo do Letterboxd: o usuário cria "pastas" com nome e descrição
-- ("Para ver com a família", "Favoritos de terror") e guarda filmes nelas. As listas do sistema
-- (Quero assistir, Assistidos, Sem interesse) continuam em user_movies. Listas são privadas por enquanto.

create table public.user_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text check (description is null or char_length(description) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Nome único por usuário (sem diferenciar maiúsculas nem espaços nas pontas): evita duas pastas "Terror".
create unique index user_lists_name_uniq on public.user_lists (user_id, lower(btrim(name)));
create index user_lists_user_idx on public.user_lists (user_id, updated_at desc);

create table public.user_list_items (
  list_id uuid not null references public.user_lists (id) on delete cascade,
  movie_id text not null references public.movies (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (list_id, movie_id)
);
create index user_list_items_recent_idx on public.user_list_items (list_id, added_at desc);
create index user_list_items_movie_idx on public.user_list_items (movie_id);

alter table public.user_lists enable row level security;
alter table public.user_list_items enable row level security;

create policy "gerenciar as próprias listas" on public.user_lists
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "gerenciar itens das próprias listas" on public.user_list_items
  for all to authenticated
  using (exists (select 1 from public.user_lists l where l.id = list_id and l.user_id = (select auth.uid())))
  with check (exists (select 1 from public.user_lists l where l.id = list_id and l.user_id = (select auth.uid())));

-- Limites contra abuso (o cliente escreve direto via PostgREST): 50 listas por usuário, 500 filmes por lista.
create or replace function public.enforce_list_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'user_lists' then
    if (select count(*) from public.user_lists where user_id = new.user_id) >= 50 then
      raise exception 'limite de 50 listas atingido' using errcode = '54000';
    end if;
  else
    if (select count(*) from public.user_list_items where list_id = new.list_id) >= 500 then
      raise exception 'limite de 500 filmes por lista atingido' using errcode = '54000';
    end if;
    -- A lista "sobe" na ordenação quando ganha um filme.
    update public.user_lists set updated_at = now() where id = new.list_id;
  end if;
  return new;
end $$;

create trigger user_lists_limit before insert on public.user_lists
  for each row execute function public.enforce_list_limits();
create trigger user_list_items_limit before insert on public.user_list_items
  for each row execute function public.enforce_list_limits();

create or replace function public.touch_user_list() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger user_lists_touch before update on public.user_lists
  for each row execute function public.touch_user_list();

-- LGPD: a exportação passa a incluir as listas e seus filmes.
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
revoke execute on function public.enforce_list_limits() from public, anon, authenticated;
