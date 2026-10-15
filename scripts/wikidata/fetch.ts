// Baixa o catálogo curado do Wikidata (CC0) e grava data/catalog.json.
// Uso: npm run catalog:fetch [-- --min-sitelinks=2]  (padrão 2: ~102 mil filmes, DEC-038)
// Respeita o serviço público: consultas sequenciais, pausa entre lotes e retry com backoff.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { MovieSchema, type Movie, type Rating } from '../../core/schemas.ts';
import { mapGenreLabels, mergeRatings, parseScore, toMinutes } from './map.ts';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'CineouCatalogImport/0.1 (https://github.com/Magnumja/cinematch)';
const BATCH = 400;
const PAUSE_MS = 400;
const CACHE_DIR = 'data/wikidata-cache';
const OUT = 'data/catalog.json';

const minSitelinks = Number(process.argv.find((a) => a.startsWith('--min-sitelinks='))?.split('=')[1] ?? 2);

type Row = Record<string, { value: string } | undefined>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const qid = (uri: string) => uri.slice(uri.lastIndexOf('/') + 1);

async function retry(attempt: number, reason: string, query: string): Promise<Row[]> {
  const wait = 2 ** attempt * 5;
  console.warn(`  ${reason}, nova tentativa em ${wait}s`);
  await sleep(wait * 1000);
  return sparql(query, attempt + 1);
}

async function sparql(query: string, attempt = 1): Promise<Row[]> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ query }),
    });
  } catch (error) {
    // Conexão derrubada pelo servidor (ECONNRESET, timeout): falha temporária.
    if (attempt >= 5) throw error;
    return retry(attempt, 'conexão interrompida', query);
  }
  if (res.ok) {
    // O endpoint às vezes responde 200 com o corpo cortado (timeout no meio do envio): tratar como falha temporária.
    try {
      return ((await res.json()) as { results: { bindings: Row[] } }).results.bindings;
    } catch (error) {
      if (attempt >= 5) throw error;
      return retry(attempt, 'resposta incompleta', query);
    }
  }
  if (attempt >= 5 || (res.status !== 429 && res.status < 500)) {
    throw new Error(`SPARQL ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const retryAfter = Number(res.headers.get('retry-after')) || 2 ** attempt * 5;
  console.warn(`  HTTP ${res.status}, nova tentativa em ${retryAfter}s`);
  await sleep(retryAfter * 1000);
  return sparql(query, attempt + 1);
}

async function fetchIds(): Promise<{ id: string; sitelinks: number }[]> {
  const rows = await sparql(`
    SELECT ?f ?l WHERE {
      ?f wdt:P31 wd:Q11424 ; wikibase:sitelinks ?l .
      FILTER(?l >= ${minSitelinks})
      FILTER EXISTS { ?f wdt:P2047 ?d }
    }`);
  return rows.map((r) => ({ id: qid(r.f!.value), sitelinks: Number(r.l!.value) }));
}

function queries(values: string) {
  return {
    core: `SELECT ?f ?labelPt ?labelPtBr ?labelEn ?descPt ?descPtBr ?descEn (MIN(YEAR(?date)) AS ?year) WHERE {
      VALUES ?f { ${values} }
      OPTIONAL { ?f rdfs:label ?labelPt FILTER(LANG(?labelPt) = "pt") }
      OPTIONAL { ?f rdfs:label ?labelPtBr FILTER(LANG(?labelPtBr) = "pt-br") }
      OPTIONAL { ?f rdfs:label ?labelEn FILTER(LANG(?labelEn) = "en") }
      OPTIONAL { ?f schema:description ?descPt FILTER(LANG(?descPt) = "pt") }
      OPTIONAL { ?f schema:description ?descPtBr FILTER(LANG(?descPtBr) = "pt-br") }
      OPTIONAL { ?f schema:description ?descEn FILTER(LANG(?descEn) = "en") }
      OPTIONAL { ?f wdt:P577 ?date }
    } GROUP BY ?f ?labelPt ?labelPtBr ?labelEn ?descPt ?descPtBr ?descEn`,
    duration: `SELECT ?f ?amount ?unit WHERE {
      VALUES ?f { ${values} }
      ?f p:P2047/psv:P2047 ?v . ?v wikibase:quantityAmount ?amount ; wikibase:quantityUnit ?unit .
    }`,
    genres: `SELECT ?f ?label WHERE {
      VALUES ?f { ${values} }
      ?f wdt:P136 ?g . ?g rdfs:label ?label FILTER(LANG(?label) = "en")
    }`,
    languages: `SELECT ?f ?code WHERE {
      VALUES ?f { ${values} }
      ?f wdt:P364 ?l . ?l wdt:P218 ?code .
    }`,
    directors: `SELECT ?f ?d ?name WHERE {
      VALUES ?f { ${values} }
      ?f wdt:P57 ?d . ?d rdfs:label ?name FILTER(LANG(?name) = "en")
    }`,
    scores: `SELECT ?f ?score ?by WHERE {
      VALUES ?f { ${values} }
      ?f p:P444 ?st . ?st ps:P444 ?score ; pq:P447 ?reviewer .
      ?reviewer rdfs:label ?by FILTER(LANG(?by) = "en")
    }`,
  };
}

async function fetchBatch(ids: { id: string; sitelinks: number }[]): Promise<Movie[]> {
  const q = queries(ids.map((i) => `wd:${i.id}`).join(' '));
  const core = await sparql(q.core);
  const duration = await sparql(q.duration);
  const genres = await sparql(q.genres);
  const languages = await sparql(q.languages);
  const directors = await sparql(q.directors);
  const scores = await sparql(q.scores);

  const group = <T>(rows: Row[], pick: (r: Row) => T | null) => {
    const map = new Map<string, T[]>();
    for (const r of rows) {
      const v = pick(r);
      if (v === null) continue;
      const id = qid(r.f!.value);
      map.set(id, [...(map.get(id) ?? []), v]);
    }
    return map;
  };

  const coreById = new Map(core.map((r) => [qid(r.f!.value), r]));
  const minutesById = group(duration, (r) => toMinutes(Number(r.amount!.value), qid(r.unit!.value)));
  const genresById = group(genres, (r) => r.label!.value);
  const langsById = group(languages, (r) => r.code!.value.toLowerCase());
  const directorsById = group(directors, (r) => ({ id: qid(r.d!.value), name: r.name!.value }));
  const scoresById = group<Rating>(scores, (r) => parseScore(r.score!.value, r.by!.value));

  const out: Movie[] = [];
  for (const { id, sitelinks } of ids) {
    const c = coreById.get(id);
    const minutes = minutesById.get(id);
    if (!c || !minutes?.length) continue;
    const titlePt = c.labelPtBr?.value ?? c.labelPt?.value ?? null;
    const titleEn = c.labelEn?.value ?? null;
    if (!titlePt && !titleEn) continue;
    const candidate = {
      id,
      titlePt,
      titleEn,
      year: c.year?.value ? Number(c.year.value) : null,
      // Várias durações (versões do diretor etc.): usamos a menor plausível.
      runtimeMin: Math.min(...minutes),
      genres: mapGenreLabels(genresById.get(id) ?? []),
      languages: [...new Set(langsById.get(id) ?? [])],
      directors: [...new Map((directorsById.get(id) ?? []).map((d) => [d.id, d])).values()],
      ratings: mergeRatings(scoresById.get(id) ?? []),
      popularity: sitelinks,
      descriptionPt: c.descPtBr?.value ?? c.descPt?.value ?? null,
      descriptionEn: c.descEn?.value ?? null,
    };
    const parsed = MovieSchema.safeParse(candidate);
    if (parsed.success) out.push(parsed.data);
    else console.warn(`  ${id} descartado: ${parsed.error.issues[0]?.message}`);
  }
  return out;
}

// Lotes que estouram o tempo do endpoint mesmo com retry são divididos ao meio até um mínimo.
async function fetchBatchSplitting(ids: { id: string; sitelinks: number }[]): Promise<Movie[]> {
  try {
    return await fetchBatch(ids);
  } catch (error) {
    if (ids.length <= 25) throw error;
    const half = Math.ceil(ids.length / 2);
    console.warn(`  lote de ${ids.length} falhou; dividindo em dois`);
    return [...(await fetchBatchSplitting(ids.slice(0, half))), ...(await fetchBatchSplitting(ids.slice(half)))];
  }
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  console.log(`Buscando filmes com >= ${minSitelinks} sitelinks e duração...`);
  const ids = (await fetchIds()).sort((a, b) => b.sitelinks - a.sitelinks || a.id.localeCompare(b.id));
  console.log(`${ids.length} filmes encontrados. Baixando detalhes em lotes de ${BATCH}.`);

  const all: Movie[] = [];
  const total = Math.ceil(ids.length / BATCH);
  for (let i = 0; i < total; i++) {
    const file = `${CACHE_DIR}/min${minSitelinks}-batch-${String(i).padStart(4, '0')}.json`;
    let movies: Movie[];
    if (existsSync(file)) {
      movies = JSON.parse(await readFile(file, 'utf8'));
    } else {
      movies = await fetchBatchSplitting(ids.slice(i * BATCH, (i + 1) * BATCH));
      await writeFile(file, JSON.stringify(movies));
      await sleep(PAUSE_MS);
    }
    all.push(...movies);
    console.log(`  lote ${i + 1}/${total}: ${movies.length} filmes (total ${all.length})`);
  }

  await writeFile(OUT, JSON.stringify(all));
  const withRating = all.filter((m) => m.ratings.length > 0).length;
  const withGenre = all.filter((m) => m.genres.length > 0).length;
  console.log(`Gravado ${OUT}: ${all.length} filmes, ${withGenre} com gênero, ${withRating} com nota.`);
}

await main();
