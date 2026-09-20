import type { RosterPlayer } from '@/data/liquipedia/roster';
import { makeRng, randInt, sample, shuffle } from '@/lib/rng';
import { buildCriteria, type CriteriaSource, type PlayerCriterion } from '@/games/shared/criteria';

/** Pure logic for Griefer. */

export type Mode = 'all-at-once' | 'one-by-one';

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
 * Deliberately excludes country and region. They are perfectly good rules and
 * they used to be almost the only ones available, which made the game a
 * flag-reading exercise rather than a knowledge one — and they are still the
 * two facts a player is most likely to be able to guess from a handle alone.
 * The rest all require actually knowing the player's career.
 */
const USABLE = new Set([
  'org',
  'fncs-winner',
  'global-winner',
  'lan-winner',
  'tournament-winner',
  'earnings',
  'fncs-wins',
  'won-in-region',
  'won-in-year',
  'played-event',
]);

export function createRound(source: CriteriaSource, seed: string = String(Date.now())): Round | null {
  const rng = makeRng(seed);
  const criteria = buildCriteria(source, { minMatches: 4, maxShare: 0.4 }).filter((criterion) =>
    USABLE.has(criterion.kind),
  );
  if (criteria.length === 0) return null;

  for (const criterion of shuffle(rng, criteria)) {
    const outsiders = source.players.filter((player) => !criterion.test(player));
    const boardSize = randInt(rng, 6, 8);
    // The players who fit are the minority: the round is a hunt for them, and
    // picking six of eight would be clicking rather than deciding.
    const memberCount = randInt(rng, 2, 3);
    const grieferCount = boardSize - memberCount;
    if (criterion.matches.length < memberCount || outsiders.length < grieferCount) continue;

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
