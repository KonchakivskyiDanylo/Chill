import type { Player } from '@/data/types';

/**
 * Name handling for the typing games (List, Tenaball, Wordle, Guess the
 * Player). Players type fast and on phones, so matching is deliberately
 * forgiving: case, spaces, punctuation and accents are ignored.
 */

/** "Th0mas HD!" -> "TH0MASHD" */
export function normalizeName(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
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
 * Resolves typed text to a player.
 *
 * Exact (normalised) matches win. Otherwise a single one-character typo is
 * accepted for inputs of 5+ characters, but only when exactly one player is
 * that close — so "peterbo" finds Peterbot while an ambiguous stub does not
 * silently pick the wrong player.
 */
export function matchPlayer(input: string, players: readonly Player[]): Player | null {
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
export function suggestPlayers(input: string, players: readonly Player[], limit = 8): Player[] {
  const needle = normalizeName(input);
  if (!needle) return [];
  const prefix: Player[] = [];
  const contains: Player[] = [];
  for (const player of players) {
    const name = normalizeName(player.name);
    if (name.startsWith(needle)) prefix.push(player);
    else if (name.includes(needle)) contains.push(player);
  }
  const byName = (a: Player, b: Player) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1);
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
