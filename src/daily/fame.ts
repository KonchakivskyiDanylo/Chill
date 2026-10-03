import type { Roster, RosterPlayer } from '@/data/liquipedia/roster';

/**
 * Who counts as well known for a daily puzzle — the one puzzle the whole site
 * plays, so it is built from names a follower of the scene can be expected to
 * know, never from one region's regulars.
 *
 * The Easy band (the household names, $320K and up) and the best-known of the
 * Medium band by career earnings. The whole Medium band is seven hundred
 * players and reaches down into every region's own scene, which is a fair
 * Medium for practice and a coin toss for a daily: "Top 10 duos of 2024 —
 * Asia" passed a "six regulars on the board" test on Medium alone.
 */
export const DAILY_REGULARS = 250;

const cache = new WeakMap<Roster, ReadonlySet<string>>();

export function knownPlayers(roster: Roster): ReadonlySet<string> {
  let known = cache.get(roster);
  if (!known) {
    const regulars = roster.players
      .filter((player) => player.tier === 'medium')
      .sort((a, b) => b.earnings - a.earnings)
      .slice(0, DAILY_REGULARS);
    known = new Set([...roster.players.filter((player) => player.tier === 'easy'), ...regulars].map((p) => p.id));
    cache.set(roster, known);
  }
  return known;
}

export function isKnown(roster: Roster, player: RosterPlayer | string): boolean {
  return knownPlayers(roster).has(typeof player === 'string' ? player : player.id);
}
