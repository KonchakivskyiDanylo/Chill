/**
 * Downloads the upstream sources into `scripts/etl/.cache/`.
 *
 * Run with: npm run etl:fetch
 *
 * Two sources, both fetched through documented, robots-friendly endpoints:
 *
 *  - Wikipedia "Competitive Fortnite records and statistics" raw wikitext —
 *    every FNCS winner by season and region, the major non-FNCS winners, the
 *    FNCS title records, and the $500k+ earners table.
 *  - Liquipedia's MediaWiki API — the birthday list and the player earnings
 *    portal (total plus one page per year).
 *
 * Liquipedia rate-limits `action=parse` hard (roughly one call per 30s, with a
 * cooldown once tripped), so pages are fetched one at a time with a gap and
 * anything already cached is skipped. Re-running after a 429 picks up where it
 * left off. Their terms require a descriptive User-Agent; see
 * https://liquipedia.net/api-terms-of-use.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = join(HERE, '.cache');

const USER_AGENT =
  'ChillFN-DataBot/1.0 (https://github.com/KonchakivskyiDanylo/Chill; fan project dataset)';

/** Liquipedia asks for one `action=parse` call at a time; be generous. */
const LIQUIPEDIA_GAP_MS = 32_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const WIKIPEDIA_PAGE = 'Competitive_Fortnite_records_and_statistics';
export const EARNINGS_YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026] as const;

export const cachePath = (name: string): string => join(CACHE_DIR, name);

export async function readCache(name: string): Promise<string | null> {
  const path = cachePath(name);
  if (!existsSync(path)) return null;
  return readFile(path, 'utf8');
}

async function save(name: string, body: string): Promise<void> {
  await writeFile(cachePath(name), body, 'utf8');
  console.log(`  cached ${name} (${body.length.toLocaleString('en-US')} bytes)`);
}

async function fetchWikipedia(): Promise<void> {
  const name = 'wikipedia-records.wikitext';
  if (existsSync(cachePath(name))) {
    console.log(`  skip ${name} (cached)`);
    return;
  }
  const url = `https://en.wikipedia.org/w/index.php?title=${WIKIPEDIA_PAGE}&action=raw`;
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Wikipedia ${response.status} for ${url}`);
  await save(name, await response.text());
}

/** One `action=parse` call against the Fortnite wiki, returning rendered HTML. */
async function fetchLiquipedia(page: string, name: string): Promise<boolean> {
  if (existsSync(cachePath(name))) {
    console.log(`  skip ${name} (cached)`);
    return true;
  }
  const url =
    'https://liquipedia.net/fortnite/api.php?action=parse&format=json&prop=text&page=' +
    encodeURIComponent(page);
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip' },
  });
  if (response.status === 429) {
    console.log(`  ! rate limited on ${page} — rerun later to resume`);
    return false;
  }
  if (!response.ok) throw new Error(`Liquipedia ${response.status} for ${page}`);
  const payload = (await response.json()) as { parse?: { text?: { '*'?: string } } };
  const html = payload.parse?.text?.['*'];
  if (!html) throw new Error(`Liquipedia returned no content for ${page}`);
  await save(name, html);
  return true;
}

async function main(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });

  console.log('Wikipedia:');
  await fetchWikipedia();

  console.log('Liquipedia:');
  const jobs: { page: string; name: string }[] = [
    { page: 'Birthday_list', name: 'liquipedia-birthdays.html' },
    { page: 'Portal:Statistics/Player earnings', name: 'liquipedia-earnings-total.html' },
    ...EARNINGS_YEARS.map((year) => ({
      page: `Portal:Statistics/${year}/Player earnings`,
      name: `liquipedia-earnings-${year}.html`,
    })),
  ];

  let missed = 0;
  for (const [index, job] of jobs.entries()) {
    const wasCached = existsSync(cachePath(job.name));
    const ok = await fetchLiquipedia(job.page, job.name);
    if (!ok) missed++;
    if (!wasCached && index < jobs.length - 1) await sleep(LIQUIPEDIA_GAP_MS);
  }

  if (missed > 0) {
    console.log(`\n${missed} page(s) rate limited. Re-run "npm run etl:fetch" to resume — cached pages are skipped.`);
  } else {
    console.log('\nAll sources cached.');
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('fetch-sources.ts')) {
  await main();
}
