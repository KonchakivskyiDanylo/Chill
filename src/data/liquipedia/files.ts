/**
 * One place that knows how to read the export's JSON files.
 *
 * Three of them (`facts`, `rankings`, `pools`) are written by the notebook in
 * `notebook_cells.md` and legitimately do not exist on a fresh clone. A plain
 * `import('@data/pools.json')` cannot express that: Vite resolves it while
 * transforming the module, so a missing file is a *build* error and the
 * `.catch()` around it never gets the chance to run.
 *
 * `import.meta.glob` resolves against the filesystem instead and simply omits
 * what is not there, which turns "the notebook has not been run yet" back into
 * a value we can branch on. The loaders it produces are lazy, so nothing is
 * downloaded until a game asks for it.
 *
 * The brace list is explicit rather than `*.json` on purpose: the same folder
 * holds `placements.json` at 154 MB, and a glob that matched it would have
 * Rollup emit it as a chunk.
 */

const DIR = '../../../liquipedia_data/clean_data/fortnite';

export type DataFile =
  | 'players'
  | 'career_path'
  | 'teammates'
  | 'orgs'
  | 'facts'
  | 'rankings'
  | 'pools';

type Loader = () => Promise<{ default: unknown }>;

/**
 * Vite's view of the folder, or empty under plain Node.
 *
 * `scripts/check-games.ts` runs these same modules through tsx, where
 * `import.meta.glob` does not exist — it is a Vite transform, not a language
 * feature. The call still has to appear literally for Vite to rewrite it, so
 * it is guarded by try/catch rather than by a conditional.
 */
let FILES: Record<string, Loader> = {};
try {
  FILES = import.meta.glob<{ default: unknown }>(
    '../../../liquipedia_data/clean_data/fortnite/{players,career_path,teammates,orgs,facts,rankings,pools}.json',
  );
} catch {
  /* not running under Vite — `readFromDisk` below takes over */
}

/** Node-only: read the file straight off disk, relative to the repo root. */
async function readFromDisk(name: DataFile): Promise<unknown> {
  const [{ readFile }, { fileURLToPath }, path] = await Promise.all([
    import(/* @vite-ignore */ 'node:fs/promises'),
    import(/* @vite-ignore */ 'node:url'),
    import(/* @vite-ignore */ 'node:path'),
  ]);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = path.join(here, DIR, `${name}.json`);
  return JSON.parse(await readFile(file, 'utf8'));
}

/**
 * Loads one file's contents.
 *
 * Rejects with a message naming the file when it has not been generated, which
 * is what every `loadX()` surfaces through `LiquipediaGate`.
 */
export async function loadJson(name: DataFile): Promise<unknown> {
  const loader = FILES[`${DIR}/${name}.json`];
  if (loader) return (await loader()).default;

  // Under Vite an absent key means an absent file, and that is the whole point
  // of the glob. Under Node the map is empty either way, so go and look.
  if (Object.keys(FILES).length > 0) {
    throw new Error(`${name}.json has not been generated yet — run the cells in notebook_cells.md.`);
  }
  try {
    return await readFromDisk(name);
  } catch {
    throw new Error(`${name}.json has not been generated yet — run the cells in notebook_cells.md.`);
  }
}
