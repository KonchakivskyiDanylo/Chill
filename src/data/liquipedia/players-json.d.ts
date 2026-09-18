/**
 * The cleaned Liquipedia export, imported straight from `liquipedia_data/`.
 *
 * Declared rather than inferred on purpose: `resolveJsonModule` would otherwise
 * make TypeScript parse 3.7 MB of rows into a literal type on every check, for
 * a shape `LiquipediaRow` already describes.
 */
declare module '@data/players.json' {
  const rows: unknown[];
  export default rows;
}
