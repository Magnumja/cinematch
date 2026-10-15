-- Enriquecimento do catálogo com dados do TMDB (DEC-041): pôster, fundo, sinopse, nota e onde assistir.
-- Uso permitido: não comercial, com atribuição ao TMDB (e ao JustWatch nos provedores), sem IA no app (DEC-040).
-- Os termos do TMDB proíbem cache por mais de 6 meses: tudo que vem de lá carrega tmdb_fetched_at
-- e é apagado automaticamente após 180 dias se não for renovado (purge_stale_tmdb + pg_cron).

alter table public.movies
  add column tmdb_id integer,
  -- { posterPath, backdropPath, overviewPt, overviewEn, taglinePt, voteAverage, voteCount,
  --   providers: [{type,name,logoPath}], watchLink }
  add column tmdb jsonb,
  add column tmdb_fetched_at timestamptz,
  add constraint movies_tmdb_object check (tmdb is null or jsonb_typeof(tmdb) = 'object');

create index movies_tmdb_id_idx on public.movies (tmdb_id) where tmdb_id is not null;
create index movies_tmdb_fetched_idx on public.movies (tmdb_fetched_at);

-- Média exibida/filtrada = média das notas da crítica (ratings, vindas do Wikidata) + nota do TMDB quando há
-- pelo menos 100 votos. Mesma regra de core/db.ts (tmdbRating) — os dois lados precisam bater (há teste).
-- Calculada pelo banco: recarregar o catálogo do Wikidata não apaga a nota do TMDB, e vice-versa.
create or replace function public.movie_rating_avg(p_ratings jsonb, p_tmdb jsonb)
returns numeric
language sql immutable as $$
  select round(avg(v), 3)
  from (
    select (r->>'value')::numeric as v from jsonb_array_elements(coalesce(p_ratings, '[]'::jsonb)) r
    where r->>'source' in ('rotten_tomatoes', 'metacritic')
    union all
    select (p_tmdb->>'voteAverage')::numeric
    where p_tmdb is not null
      and jsonb_typeof(p_tmdb->'voteAverage') = 'number'
      and coalesce((p_tmdb->>'voteCount')::integer, 0) >= 100
  ) notas
$$;

drop index if exists public.movies_rating_idx;
alter table public.movies drop column rating_avg;
alter table public.movies
  add column rating_avg numeric(6, 3) generated always as (public.movie_rating_avg(ratings, tmdb)) stored;
create index movies_rating_idx on public.movies (rating_avg) where rating_avg is not null;

-- Remove dados do TMDB vencidos (a média se recalcula sozinha pela coluna gerada).
create or replace function public.purge_stale_tmdb(p_max_age interval default interval '180 days')
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  affected integer;
begin
  update public.movies
  set tmdb = null, tmdb_fetched_at = null
  where tmdb_fetched_at is not null and tmdb_fetched_at < now() - p_max_age;
  get diagnostics affected = row_count;
  return affected;
end $$;

revoke execute on function public.purge_stale_tmdb(interval) from public, anon, authenticated;

select cron.schedule('purge-stale-tmdb', '17 4 * * *', $$ select public.purge_stale_tmdb(); $$);

-- Escrita em lote pelo script de enriquecimento (service role). Um upsert do PostgREST não serve aqui
-- porque o insert-tuple violaria os NOT NULL das colunas que não são enviadas.
create or replace function public.set_tmdb_ids(p_rows jsonb)
returns integer
language sql security definer set search_path = '' as $$
  with dados as (select * from jsonb_to_recordset(p_rows) as x(id text, tmdb_id integer)),
  alterados as (
    update public.movies m set tmdb_id = d.tmdb_id from dados d where m.id = d.id returning 1
  )
  select count(*)::integer from alterados;
$$;

create or replace function public.apply_tmdb(p_rows jsonb)
returns integer
language sql security definer set search_path = '' as $$
  with dados as (select * from jsonb_to_recordset(p_rows) as x(id text, tmdb jsonb)),
  alterados as (
    update public.movies m set tmdb = d.tmdb, tmdb_fetched_at = now() from dados d where m.id = d.id returning 1
  )
  select count(*)::integer from alterados;
$$;

revoke execute on function public.set_tmdb_ids(jsonb) from public, anon, authenticated;
revoke execute on function public.apply_tmdb(jsonb) from public, anon, authenticated;
