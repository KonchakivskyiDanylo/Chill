/**
 * The derived files the notebook writes next to `players.json`.
 *
 * Declared rather than inferred, for the same reason `players-json.d.ts`
 * declares the roster: `resolveJsonModule` would otherwise turn hundreds of
 * kilobytes of rows into a literal type on every typecheck, for shapes the
 * modules that read them already describe.
 *
 * Both are generated — see `notebook_cells.md`. Until those cells have been
 * run the files do not exist and the two games that read them cannot build,
 * which is the intended failure: there is nothing for them to run on.
 */

declare module '@data/career_path.json' {
  const payload: unknown;
  export default payload;
}

declare module '@data/teammates.json' {
  const payload: unknown;
  export default payload;
}
