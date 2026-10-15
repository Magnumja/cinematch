-- DEC-043: a nota dos usuários do TMDB deixa de entrar na média. rating_avg volta a ser só a crítica
-- (Rotten Tomatoes + Metacritic, via Wikidata). Misturar as fontes criaria uma nota derivada do conteúdo do
-- TMDB (termos da API, §1.C) e chamaria usuários do TMDB de "crítica" no filtro "nota mínima da crítica".
-- A nota do TMDB continua em tmdb.voteAverage e é só exibida, à parte (core/db.ts: tmdbUserScore).

create or replace function public.movie_critics_avg(p_ratings jsonb)
returns numeric
language sql immutable as $$
  select round(avg((r->>'value')::numeric), 3)
  from jsonb_array_elements(coalesce(p_ratings, '[]'::jsonb)) r
  where r->>'source' in ('rotten_tomatoes', 'metacritic')
$$;

drop index if exists public.movies_rating_idx;
alter table public.movies drop column rating_avg;
alter table public.movies
  add column rating_avg numeric(6, 3) generated always as (public.movie_critics_avg(ratings)) stored;
create index movies_rating_idx on public.movies (rating_avg) where rating_avg is not null;

drop function if exists public.movie_rating_avg(jsonb, jsonb);
