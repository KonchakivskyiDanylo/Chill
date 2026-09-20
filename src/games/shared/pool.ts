import type { Pools } from '@/data/liquipedia/pools';
import type { Roster, RosterPlayer } from '@/data/liquipedia/roster';
import type { RegionChoice } from '@/components/RegionPicker';
import { useLocalState } from '@/lib/storage';
import { DIFFICULTIES, type Difficulty } from './difficulty';

/**
 * Who a game may ask about.
 *
 * Three independent narrowings used to live in three games in three different
 * shapes; this is the one answer. A choice is either an *event pool* or the
 * roster, and they behave differently on purpose:
 *
 *   event pool   a fixed field — the eighty players at the Esports World Cup,
 *                the eighty-two at the Globals. Nothing narrows it further.
 *                Eighty players is already the smallest a game can run on, and
 *                "Globals, Asia, Hard" would leave three.
 *   roster       everything, narrowed by region, difficulty and whether the
 *                player is still competing.
 *
 * So the picker is genuinely modal, and the UI says so rather than greying out
 * five controls the moment a pool is chosen.
 */

/**
 * Active or retired.
 *
 * The export has three values — Active 2,869, Retired 2,671, Inactive 138 —
 * and the game offers two. `retired` therefore means "not currently
 * competing", which is where an Inactive player belongs: the question a player
 * is answering is "could I see this person in a lobby tomorrow", and for all
 * 138 the answer is no.
 */
export type StatusChoice = 'all' | 'active' | 'retired';

/**
 * A difficulty, or `any` for no difficulty at all.
 *
 * `any` is not a fourth tier — it is the absence of the choice, drawing from
 * every band at once. Worth having because the three bands are cut by
 * earnings, so Easy is a hundred people you could name in your sleep and Hard
 * is four thousand you could not, and "surprise me" is a real way to want to
 * play that neither of those offers.
 */
export type Level = Difficulty | 'any';

export const LEVELS: Level[] = ['easy', 'medium', 'hard', 'any'];

export interface PoolChoice {
  /** An event pool id, or null for the roster. */
  event: string | null;
  region: RegionChoice;
  difficulty: Level;
  status: StatusChoice;
}

export const DEFAULT_POOL: PoolChoice = {
  event: null,
  region: null,
  difficulty: 'medium',
  status: 'all',
};

/**
 * The chosen pool, remembered across games and reloads.
 *
 * One setting for the whole site, like the difficulty it replaces: picking the
 * Globals in Fortnitedle and then opening Career Path should keep you on the
 * Globals.
 */
export function usePoolChoice(): [PoolChoice, (next: PoolChoice) => void] {
  const [value, setValue] = useLocalState<PoolChoice>('pool', DEFAULT_POOL);
  // Written by an older build, or hand-edited: fill in anything missing rather
  // than dropping someone back to the default for one absent key.
  return [{ ...DEFAULT_POOL, ...value }, setValue];
}

export function matchesStatus(player: RosterPlayer, status: StatusChoice): boolean {
  if (status === 'all') return true;
  const active = player.status === 'active';
  return status === 'active' ? active : !active;
}

/** A game's own eligibility filter, e.g. "has at least five tournaments". */
export type Eligible = (players: RosterPlayer[]) => RosterPlayer[];

/** `eligible` with the status filter folded in, so difficulty counts stay honest. */
function withStatus(status: StatusChoice, eligible?: Eligible): Eligible {
  return (players) => {
    const kept = status === 'all' ? players : players.filter((p) => matchesStatus(p, status));
    return eligible ? eligible(kept) : kept;
  };
}

/**
 * The players a game may draw from.
 *
 * `minimum` only applies to the roster branch: a tier too small to play widens
 * into the next one (see `Roster.playersFor`). An event pool never widens —
 * there is nothing to widen into, and silently adding players who did not
 * qualify would be a lie about what the pool is.
 */
export function resolvePool(
  roster: Roster,
  pools: Pools | null,
  choice: PoolChoice,
  eligible?: Eligible,
  minimum = 1,
): RosterPlayer[] {
  const pool = pools?.get(choice.event);
  if (pool) {
    const byId = new Map(roster.players.map((player) => [player.id, player]));
    const players = pool.players
      .map((id) => byId.get(id))
      .filter((player): player is RosterPlayer => Boolean(player));
    return eligible ? eligible(players) : players;
  }
  const filter = withStatus(choice.status, eligible);
  if (choice.difficulty === 'any') {
    // Every band at once, so there is nothing to widen into and no minimum to
    // meet — this is already the widest the roster goes.
    return DIFFICULTIES.flatMap((level) => roster.exactly(level, { region: choice.region, eligible: filter }));
  }
  return roster.playersFor(choice.difficulty, {
    minimum,
    region: choice.region,
    eligible: filter,
  });
}

/** Exactly this tier under the current choice, with no widening — what a card counts. */
export function countFor(
  roster: Roster,
  choice: PoolChoice,
  difficulty: Level,
  eligible?: Eligible,
): number {
  const filter = withStatus(choice.status, eligible);
  if (difficulty === 'any') {
    return DIFFICULTIES.reduce(
      (n, level) => n + roster.exactly(level, { region: choice.region, eligible: filter }).length,
      0,
    );
  }
  return roster.exactly(difficulty, { region: choice.region, eligible: filter }).length;
}

/**
 * The parts of a choice that change who is in the bag.
 *
 * Fed to `rotationKey`, so switching region or difficulty starts its own
 * no-repeat cycle instead of poisoning the one you were on. An event pool is
 * keyed by itself alone — the other three do not apply to it, and including
 * them would split one eighty-player cycle into a dozen.
 */
export function poolScope(choice: PoolChoice): (string | null)[] {
  if (choice.event) return ['event', choice.event];
  return ['roster', choice.region, choice.difficulty, choice.status];
}

/** Short label for the chip shown while playing. */
export function poolLabel(choice: PoolChoice, pools: Pools | null): string {
  return pools?.get(choice.event)?.label ?? (choice.region ?? 'All regions');
}

/** The career-earnings range a difficulty actually covers. */
export interface TierBand {
  min: number;
  max: number;
}

/**
 * What each difficulty means in money, read off the roster rather than written
 * down.
 *
 * The cards used to say "113 players to play", which answers a question nobody
 * asked — the pool size tells you nothing about whether you will recognise
 * anyone. The band does: Easy is everyone above roughly a quarter of a million
 * in career earnings, and that is a sentence you can act on.
 *
 * Derived, never hardcoded, because the tiers are cut by percentile in the
 * notebook and the boundaries move every time the export grows. With a region
 * chosen it reads `regionTier`, so the numbers describe the band you are
 * actually about to play — Asia's Easy is not Europe's Easy.
 */
export function tierBands(roster: Roster, choice: PoolChoice): Partial<Record<Difficulty, TierBand>> {
  const out: Partial<Record<Difficulty, TierBand>> = {};
  for (const level of DIFFICULTIES) {
    const players = roster.exactly(level, {
      region: choice.region,
      eligible: withStatus(choice.status),
    });
    if (players.length === 0) continue;
    let min = Infinity;
    let max = 0;
    for (const player of players) {
      if (player.earnings < min) min = player.earnings;
      if (player.earnings > max) max = player.earnings;
    }
    out[level] = { min, max };
  }
  return out;
}
