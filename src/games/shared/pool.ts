import type { Pools } from '@/data/liquipedia/pools';
import type { Roster, RosterPlayer } from '@/data/liquipedia/roster';
import type { RegionChoice } from '@/components/RegionPicker';
import { useLocalState } from '@/lib/storage';
import { DIFFICULTIES, type Difficulty } from './difficulty';
import { deal, dealWeighted, type Deal } from './rotation';

/**
 * Who a game may ask about.
 *
 * Two independent decisions, deliberately kept apart:
 *
 *   the event mode   a fixed field — the eighty players at the Esports World
 *                    Cup, the eighty-two at the Globals. Chosen once on the
 *                    home page and in force across the whole site, because
 *                    "this week everything is about the Globals" is a mood you
 *                    are in, not a per-game setting. See `mode.ts`.
 *   the pool choice  how the roster is narrowed when no event is in force:
 *                    random, or region + difficulty + status.
 *
 * The event used to be a fourth field in `PoolChoice`, picked from a row of
 * cards at the top of all eight setup screens. That put a site-wide mood inside
 * a per-game form, and left every setup screen carrying four sections where
 * three of them switched off the moment you used the first.
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

/**
 * Random, or narrowed by hand.
 *
 * The setup screen opens on `random` and shows nothing but Start. Eight games
 * used to greet a first-time player with stacked sections of option cards —
 * who, where, how hard, still competing — before they could find out what the
 * game even was. None of that is a decision anyone can make usefully before
 * their first round; all of it is worth having by the tenth.
 */
export type PickMode = 'random' | 'custom';

export interface PoolChoice {
  mode: PickMode;
  /** Remembered while on `random`, so switching back to Custom restores it. */
  region: RegionChoice;
  difficulty: Level;
  status: StatusChoice;
}

export const DEFAULT_POOL: PoolChoice = {
  mode: 'random',
  region: null,
  difficulty: 'medium',
  status: 'all',
};

/** What `random` actually means: no narrowing of any kind. */
const RANDOM: Omit<PoolChoice, 'mode'> = {
  region: null,
  difficulty: 'any',
  status: 'all',
};

/**
 * The narrowing a choice actually applies.
 *
 * On `random` the stored region/difficulty/status are ignored rather than
 * overwritten, so a player who spent a minute building "Europe, Hard, Active",
 * hit Random for one round and came back still has it.
 */
export function effective(choice: PoolChoice): Omit<PoolChoice, 'mode'> {
  return choice.mode === 'random' ? RANDOM : choice;
}

/**
 * The chosen pool, remembered across games and reloads.
 *
 * One setting for the whole site, like the difficulty it replaces: narrowing to
 * Europe in Fortnitedle and then opening Career Path should keep you on Europe.
 */
export function usePoolChoice(): [PoolChoice, (next: PoolChoice) => void] {
  const [value, setValue] = useLocalState<PoolChoice>('pool', DEFAULT_POOL);
  // Written by an older build, or hand-edited: fill in anything missing rather
  // than dropping someone back to the default for one absent key. Older builds
  // stored an `event` here too; it is read from `mode.ts` now, and a stale copy
  // riding along in this object is harmless because nothing looks at it.
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

/** The roster rows that make up one event's field, in roster order. */
export function poolPlayers(
  roster: Roster,
  pools: Pools | null,
  event: string | null,
): RosterPlayer[] {
  const pool = pools?.get(event);
  if (!pool) return [];
  const byId = new Map(roster.players.map((player) => [player.id, player]));
  return pool.players
    .map((id) => byId.get(id))
    .filter((player): player is RosterPlayer => Boolean(player));
}

/**
 * The players a game may draw from.
 *
 * `minimum` only applies to the roster branch: a tier too small to play widens
 * into the next one (see `Roster.playersFor`). An event field never widens —
 * there is nothing to widen into, and silently adding players who did not
 * qualify would be a lie about what the field is.
 */
export function resolvePool(
  roster: Roster,
  pools: Pools | null,
  event: string | null,
  choice: PoolChoice,
  eligible?: Eligible,
  minimum = 1,
): RosterPlayer[] {
  if (pools?.get(event)) {
    const players = poolPlayers(roster, pools, event);
    return eligible ? eligible(players) : players;
  }
  const { region, difficulty, status } = effective(choice);
  const filter = withStatus(status, eligible);
  if (difficulty === 'any') {
    // Every band at once, so there is nothing to widen into and no minimum to
    // meet — this is already the widest the roster goes.
    return DIFFICULTIES.flatMap((level) => roster.exactly(level, { region, eligible: filter }));
  }
  return roster.playersFor(difficulty, { minimum, region, eligible: filter });
}

/**
 * How Random splits its secret players across the fame tiers.
 *
 * Random used to draw evenly from everyone eligible, and everyone eligible is
 * mostly the Hard tier: 80% of Fortnitedle's answers, 71% of Guess the
 * Player's. Four rounds in five were a name nobody had heard of, which made
 * the default setting a letter puzzle rather than a Fortnite one. Now half the
 * rounds are household names, a third regulars and the rest deep cuts, so the
 * surprise is still there without being the whole game.
 */
export const RANDOM_MIX: Readonly<Record<Difficulty, number>> = { easy: 0.5, medium: 0.35, hard: 0.15 };

/**
 * Deals the next secret player for a game that has one.
 *
 * Random weights the draw by tier (see `RANDOM_MIX`). Everything else deals
 * evenly: an event field is the field, a chosen tier is one tier, and Choose →
 * Any promises "no ranking applied" and keeps it.
 */
export function dealSecret<T extends RosterPlayer>(
  players: readonly T[],
  seen: readonly string[],
  pools: Pools | null,
  event: string | null,
  choice: PoolChoice,
): Deal<T> | null {
  if (!pools?.get(event) && choice.mode === 'random') {
    return dealWeighted(players, seen, (player) => player.tier, RANDOM_MIX);
  }
  return deal(players, seen);
}

/** Exactly this tier under the current choice, with no widening — what a card counts. */
export function countFor(
  roster: Roster,
  choice: PoolChoice,
  level: Level,
  eligible?: Eligible,
): number {
  const { region, status } = effective(choice);
  const filter = withStatus(status, eligible);
  if (level === 'any') {
    return DIFFICULTIES.reduce(
      (n, band) => n + roster.exactly(band, { region, eligible: filter }).length,
      0,
    );
  }
  return roster.exactly(level, { region, eligible: filter }).length;
}

/**
 * The parts of a choice that change who is in the bag.
 *
 * Fed to `rotationKey`, so switching region or difficulty starts its own
 * no-repeat cycle instead of poisoning the one you were on. An event field is
 * keyed by itself alone — the other three do not apply to it, and including
 * them would split one eighty-player cycle into a dozen.
 */
export function poolScope(event: string | null, choice: PoolChoice): (string | null)[] {
  if (event) return ['event', event];
  const { region, difficulty, status } = effective(choice);
  return ['roster', region, difficulty, status];
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
export function tierBands(
  roster: Roster,
  choice: PoolChoice,
): Partial<Record<Difficulty, TierBand>> {
  const { region, status } = effective(choice);
  const out: Partial<Record<Difficulty, TierBand>> = {};
  for (const level of DIFFICULTIES) {
    const players = roster.exactly(level, { region, eligible: withStatus(status) });
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
