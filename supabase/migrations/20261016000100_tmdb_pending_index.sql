-- Fila do enriquecimento do TMDB (scripts/tmdb/enrich.ts). Sem este índice, "próximos filmes sem dados, por
-- popularidade" percorria o índice de popularidade descartando os ~95 mil já preenchidos e estourava o
-- statement_timeout perto do fim (erro 57014). Parcial: só contém os pendentes, então fica menor a cada lote.
create index if not exists movies_tmdb_pending_idx on public.movies (popularity desc, id)
  where tmdb_id is not null and tmdb_fetched_at is null;
