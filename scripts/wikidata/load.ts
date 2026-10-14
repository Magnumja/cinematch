// Carrega data/catalog.json na tabela movies (upsert por id). Idempotente: pode rodar a cada atualização mensal.
// Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run catalog:load
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { movieToRow } from '../../core/db.ts';
import { MovieSchema } from '../../core/schemas.ts';

const CHUNK = 500;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (nunca versione a chave).');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const movies = MovieSchema.array().parse(JSON.parse(await readFile('data/catalog.json', 'utf8')));
const updatedAt = new Date().toISOString();

for (let i = 0; i < movies.length; i += CHUNK) {
  const rows = movies.slice(i, i + CHUNK).map((m) => ({ ...movieToRow(m), updated_at: updatedAt }));
  const { error } = await db.from('movies').upsert(rows, { onConflict: 'id' });
  if (error) {
    console.error(`Falha no lote ${i / CHUNK + 1}:`, error.message);
    process.exit(1);
  }
  console.log(`  ${Math.min(i + CHUNK, movies.length)}/${movies.length}`);
}
console.log(`Catálogo carregado: ${movies.length} filmes.`);
