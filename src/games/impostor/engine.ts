import type { RosterPlayer } from '@/data/liquipedia/roster';
import { makeRng, randInt, sample, shuffle } from '@/lib/rng';
import { buildCriteria, type CriteriaSource, type PlayerCriterion } from '@/games/shared/criteria';

/** Pure logic for Griefer. */

export type Mode = 'all-at-once' | 'one-by-one';

/** Two rows of five. */
export const BOARD_SIZE = 10;
export const MIN_MEMBERS = 4;
export const MAX_MEMBERS = 6;

export interface Round {
  criterion: PlayerCriterion;
  /** Board order — the players who fit and the griefers, mixed. */
  board: RosterPlayer[];
  /** The players who actually satisfy the rule. These are what you pick. */
  memberIds: Set<string>;
}

export interface GameState {
  mode: Mode;
  round: Round;
  /** Players the user has flagged (all-at-once) or already found (one-by-one). */
  selected: Set<string>;
  status: 'playing' | 'won' | 'lost';
  /** The pick that ended a one-by-one round, for the result message. */
  mistake: RosterPlayer | null;
}

/**
 * The kinds of rule worth putting on a board.
 *
 * Country and region were left out for a long time, and the reason has expired.
 * They used to be almost the only rules available *and* the cards carried
 * flags, so "every player here competes in Brazil" was solvable by looking
 * rather than knowing. The cards are a bare handle now and there are ten other
 * kinds of rule in the draw, so a nationality board is one rule in twelve
 * rather than the game — and "which of these ten are French" is a genuine
 * question once the flags are gone.
 */
const USABLE = new Set([
  'country',
  'region',
  'org',
  'fncs-winner',
  'global-winner',
  'lan-winner',
  'tournament-winner',
  'earnings',
  'fncs-wins',
  'won-fncs-region',
  'won-fncs-year',
  'played-event',
]);

/**
 * One criterion per kind, then shuffled — not one shuffle over all of them.
 *
 * The flat shuffle was effectively an org generator. `buildCriteria` produces
 * roughly 250 rules over a full pool and about 174 of them are organisations,
 * so a uniform draw served "has played for X" seven times in ten and reached
 * the four earnings rules under twice in a hundred rounds. Every kind now gets
 * one seat in the draw, so a career-earnings board is as likely as an org one.
 */
function byKind(criteria: PlayerCriterion[], rng: ReturnType<typeof makeRng>): PlayerCriterion[] {
  const buckets = new Map<string, PlayerCriterion[]>();
  for (const criterion of criteria) {
    const bucket = buckets.get(criterion.kind);
    if (bucket) bucket.push(criterion);
    else buckets.set(criterion.kind, [criterion]);
  }
  // A few rounds deep per kind, so a kind whose first pick cannot fill a board
  // gets another go before the draw falls back to everything else.
  const ordered: PlayerCriterion[] = [];
  for (let round = 0; round < 3; round++) {
    const layer: PlayerCriterion[] = [];
    for (const bucket of buckets.values()) {
      const pick = bucket[Math.floor(rng() * bucket.length)];
      if (pick && !ordered.includes(pick) && !layer.includes(pick)) layer.push(pick);
    }
    ordered.push(...shuffle(rng, layer));
  }
  return [...ordered, ...shuffle(rng, criteria)];
}

export function createRound(source: CriteriaSource, seed: string = String(Date.now())): Round | null {
  const rng = makeRng(seed);
  const criteria = buildCriteria(source, { minMatches: MIN_MEMBERS, maxShare: 0.4 }).filter(
    (criterion) => USABLE.has(criterion.kind),
  );
  if (criteria.length === 0) return null;

  for (const criterion of byKind(criteria, rng)) {
    const outsiders = source.players.filter((player) => !criterion.test(player));
    /*
     * Ten cards, four to six of which fit, and the board never says how many.
     *
     * It used to be six to eight cards with half of them fitting, printed above
     * them as "find the 3". Both halves of that made the round easier than it
     * looked: a known count turns the last pick into arithmetic, and a small
     * count means most cards are griefers, so guessing is cheap. Ten is two
     * tidy rows of five and enough cards that four-of-ten and six-of-ten feel
     * genuinely different from the outside.
     */
    // Six unless the rule cannot field six — a rule with five players to its
    // name is still a good board, it is just never a six.
    const most = Math.min(MAX_MEMBERS, criterion.matches.length);
    if (most < MIN_MEMBERS) continue;
    const memberCount = randInt(rng, MIN_MEMBERS, most);
    const grieferCount = BOARD_SIZE - memberCount;
    if (outsiders.length < grieferCount) continue;

    const members = sample(rng, criterion.matches, memberCount);
    const griefers = sample(rng, outsiders, grieferCount);
    return {
      criterion,
      board: shuffle(rng, [...members, ...griefers]),
      memberIds: new Set(members.map((player) => player.id)),
    };
  }
  return null;
}

export function createGame(round: Round, mode: Mode): GameState {
  return { mode, round, selected: new Set(), status: 'playing', mistake: null };
}

/** All-at-once: toggle a pick before checking. */
export function toggle(state: GameState, player: RosterPlayer): GameState {
  if (state.status !== 'playing' || state.mode !== 'all-at-once') return state;
  const selected = new Set(state.selected);
  if (selected.has(player.id)) selected.delete(player.id);
  else selected.add(player.id);
  return { ...state, selected };
}

/** All-at-once: the selection must match the set of players who fit, exactly. */
export function check(state: GameState): GameState {
  if (state.status !== 'playing' || state.mode !== 'all-at-once') return state;
  const { memberIds } = state.round;
  const exact =
    state.selected.size === memberIds.size && [...state.selected].every((id) => memberIds.has(id));
  return { ...state, status: exact ? 'won' : 'lost' };
}

/**
 * One-by-one: a wrong pick ends the round immediately.
 *
 * The board asks for confirmation before calling this — a single stray click
 * used to end a round with no way back, which is a harsh way to lose to a
 * mis-tap on a phone.
 */
export function pick(state: GameState, player: RosterPlayer): GameState {
  if (state.status !== 'playing' || state.mode !== 'one-by-one') return state;
  if (state.selected.has(player.id)) return state;

  if (!state.round.memberIds.has(player.id)) {
    return { ...state, status: 'lost', mistake: player };
  }
  const selected = new Set(state.selected).add(player.id);
  return {
    ...state,
    selected,
    status: selected.size === state.round.memberIds.size ? 'won' : 'playing',
  };
}

/** Ends the round unsolved, so the board can be revealed. */
export function giveUp(state: GameState): GameState {
  return state.status === 'playing' ? { ...state, status: 'lost' } : state;
}

/** How many players who fit the rule are still to be found. */
export function membersLeft(state: GameState): number {
  return (
    state.round.memberIds.size -
    [...state.selected].filter((id) => state.round.memberIds.has(id)).length
  );
}
