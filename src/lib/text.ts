/**
 * Name handling for the typing games (List, Tenaball, Wordle, Guess the
 * Player). Players type fast and on phones, so matching is deliberately
 * forgiving: case, spaces, punctuation and accents are ignored.
 */

/**
 * Cyrillic and Greek letters that look exactly like Latin ones.
 *
 * Three handles in the roster are spelled with them — `Drobbаn` carries a
 * Cyrillic а (U+0430), `Crystаal` two, `Dуfs` a Cyrillic у. Without this they
 * are silently *deleted* by the A-Z0-9 filter below, so Drobban becomes the
 * six-tile word DROBBN: a Fortnitedle puzzle nobody can type their way out of,
 * and a name no search will ever find. Folding them to their Latin twins fixes
 * both, and covers any future ones the source picks up.
 */
const HOMOGLYPHS: Record<string, string> = {
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C',
  Т: 'T', У: 'Y', Х: 'X', І: 'I', Ј: 'J', Ѕ: 'S', Α: 'A', Β: 'B', Ε: 'E',
  Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T',
  Υ: 'Y', Χ: 'X',
};

/** "Th0mas HD!" -> "TH0MASHD" */
export function normalizeName(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^\x00-\x7F]/g, (char) => HOMOGLYPHS[char] ?? char)
    .replace(/[^A-Z0-9]/g, '');
}

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > max) return max + 1;
    prev = curr;
  }
  return prev[b.length];
}

/**
 * The minimum a row needs to be found by name.
 *
 * Structural rather than `Player`, because the two data sources are two
 * different shapes and both are searched: the Wikipedia import's `Player` and
 * the Liquipedia roster's `RosterPlayer`.
 */
export interface Nameable {
  id: string;
  name: string;
}

/**
 * Resolves typed text to a player.
 *
 * Exact (normalised) matches win. Otherwise a single one-character typo is
 * accepted for inputs of 5+ characters, but only when exactly one player is
 * that close — so "peterbo" finds Peterbot while an ambiguous stub does not
 * silently pick the wrong player.
 */
export function matchPlayer<T extends Nameable>(input: string, players: readonly T[]): T | null {
  const needle = normalizeName(input);
  if (needle.length < 2) return null;

  const exact = players.filter((p) => normalizeName(p.name) === needle);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return exact[0];

  if (needle.length >= 5) {
    const near = players.filter((p) => levenshtein(normalizeName(p.name), needle, 1) <= 1);
    if (near.length === 1) return near[0];
  }
  return null;
}

/** Autocomplete suggestions: prefix matches first, then substring matches. */
export function suggestPlayers<T extends Nameable>(input: string, players: readonly T[], limit = 8): T[] {
  const needle = normalizeName(input);
  if (!needle) return [];
  const prefix: T[] = [];
  const contains: T[] = [];
  for (const player of players) {
    const name = normalizeName(player.name);
    if (name.startsWith(needle)) prefix.push(player);
    else if (name.includes(needle)) contains.push(player);
  }
  const byName = (a: T, b: T) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1);
  return [...prefix.sort(byName), ...contains.sort(byName)].slice(0, limit);
}

/** Deterministic avatar colour from a player id. */
export function avatarColors(id: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return [`hsl(${hue} 62% 46%)`, `hsl(${(hue + 42) % 360} 64% 36%)`];
}

/** Up to two initials for the avatar fallback. */
export function initials(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9 ]/g, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase() || '??';
}
