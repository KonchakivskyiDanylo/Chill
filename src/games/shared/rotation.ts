import { makeRng, type Rng } from '@/lib/rng';

/**
 * Deal every player in a pool once before anyone comes round again.
 *
 * Fortnitedle picked uniformly at random, so on a 113-player Easy pool the
 * chance of seeing the same secret twice within ten rounds is about 35% — and
 * back-to-back repeats, the ones that actually feel broken, happen roughly
 * once every 113 rounds per player, which is often enough to notice.
 *
 * So the pool is a bag, not a die: `seen` records who has already come out of
 * it, and a draw only considers the rest. When the bag empties it refills in a
 * fresh random order — minus whoever was just dealt, so the wrap-around is the
 * one place a back-to-back repeat could still sneak through and does not.
 *
 * Kept as a pure function over an explicit `seen` list rather than a stateful
 * shuffler, because the list is what gets written to `localStorage`: a cycle
 * survives a reload, and a pool that changed shape (a re-tier, a different
 * region) folds in without the bag having to be rebuilt.
 */

export interface Deal<T> {
  pick: T;
  /** `seen` with the pick appended, or just the pick when the bag wrapped. */
  seen: string[];
  /** True when this draw emptied and refilled the bag. */
  wrapped: boolean;
}

/**
 * Draws one item that has not been drawn this cycle.
 *
 * `seen` may name ids that are no longer in `pool` — it is left over from
 * whatever the pool looked like last time — so they are simply ignored rather
 * than treated as an error.
 */
export function deal<T extends { id: string }>(
  pool: readonly T[],
  seen: readonly string[],
  seed: string | number | Rng = Date.now(),
): Deal<T> | null {
  if (pool.length === 0) return null;
  const rng: Rng = typeof seed === 'function' ? seed : makeRng(seed);

  const used = new Set(seen);
  let candidates = pool.filter((item) => !used.has(item.id));
  const wrapped = candidates.length === 0;

  if (wrapped) {
    // Refill. The last player dealt is the one thing the new cycle must not
    // open with, and with a pool of one there is nothing else to open with.
    const last = seen[seen.length - 1];
    candidates = pool.length > 1 ? pool.filter((item) => item.id !== last) : pool.slice();
  }

  const pick = candidates[Math.floor(rng() * candidates.length)];
  return { pick, seen: wrapped ? [pick.id] : [...seen, pick.id], wrapped };
}

/**
 * Deals from several bags at once, choosing the bag by weight first.
 *
 * Each group — a fame tier, say — is its own no-repeat cycle, refilling when
 * it runs dry, and `weights` decides how often each is drawn from. They share
 * one `seen` list, so the storage key and everything that reads it are
 * unchanged. A group with nobody in the pool is skipped and the rest of the
 * weight is shared out.
 */
export function dealWeighted<T extends { id: string }>(
  pool: readonly T[],
  seen: readonly string[],
  groupOf: (item: T) => string,
  weights: Readonly<Record<string, number>>,
  seed: string | number | Rng = Date.now(),
): Deal<T> | null {
  const rng: Rng = typeof seed === 'function' ? seed : makeRng(seed);
  const groups = new Map<string, T[]>();
  for (const item of pool) {
    const key = groupOf(item);
    if (!(weights[key] > 0)) continue;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  if (groups.size === 0) return deal(pool, seen, rng);

  const total = [...groups.keys()].reduce((sum, key) => sum + weights[key], 0);
  let roll = rng() * total;
  let chosen = [...groups.keys()][groups.size - 1];
  for (const key of groups.keys()) {
    roll -= weights[key];
    if (roll < 0) {
      chosen = key;
      break;
    }
  }

  const members = groups.get(chosen)!;
  const ids = new Set(members.map((item) => item.id));
  const drawn = deal(members, seen.filter((id) => ids.has(id)), rng);
  if (!drawn) return null;
  // Only this group's bag refills; the others keep their place in the cycle.
  const kept = drawn.wrapped ? seen.filter((id) => !ids.has(id)) : [...seen];
  return { ...drawn, seen: [...kept, drawn.pick.id] };
}

/** localStorage key for one pool's cycle. Scope it by every choice that changes the pool. */
export function rotationKey(game: string, ...scope: (string | null | undefined)[]): string {
  return `seen:${game}:${scope.map((part) => part ?? 'all').join(':')}`;
}
