-- Busca por título sem depender de acento ("amelie" acha "Amélie") e também pelo título pt-BR do TMDB
-- (filmes sem rótulo em português no Wikidata). O cliente normaliza o termo do mesmo jeito (web/src/lib/api.ts).
create extension if not exists unaccent with schema extensions;

-- unaccent() não é imutável (depende do dicionário configurado); fixando o dicionário, pode virar coluna gerada.
create or replace function public.search_normalize(p text)
returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p, '')))
$$;

drop index if exists public.movies_search_idx;
alter table public.movies drop column search_text;
alter table public.movies
  add column search_text text generated always as (
    public.search_normalize(coalesce(title_pt, '') || ' ' || coalesce(title_en, '') || ' ' || coalesce(tmdb->>'titlePt', ''))
  ) stored;
create index movies_search_idx on public.movies using gin (search_text gin_trgm_ops);
