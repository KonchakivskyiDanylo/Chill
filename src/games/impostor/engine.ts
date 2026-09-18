import type { Dataset } from '@/data/dataset';
import type { Player } from '@/data/types';
import { makeRng, randInt, sample, shuffle } from '@/lib/rng';
import { buildCriteria, type PlayerCriterion } from '@/games/shared/criteria';

/** Pure logic for Impostor. */

export type Mode = 'all-at-once' | 'one-by-one';

export interface Round {
  criterion: PlayerCriterion;
  /** Board order — members and impostors mixed. */
  board: Player[];
  impostorIds: Set<string>;
}

export interface GameState {
  mode: Mode;
  round: Round;
  /** Players the user has flagged (all-at-once) or already caught (one-by-one). */
  selected: Set<string>;
  status: 'playing' | 'won' | 'lost';
  /** The pick that ended a one-by-one round, for the result message. */
  mistake: Player | null;
}

export function createRound(dataset: Dataset, seed: string = String(Date.now())): Round | null {
  const rng = makeRng(seed);
  // Only the simple, reliable criteria for V1.
  const criteria = buildCriteria(dataset, { minMatches: 6, maxShare: 0.4 }).filter((criterion) =>
    ['country', 'region', 'team', 'fncs-winner', 'lan-winner', 'earnings', 'fncs-wins', 'played-event'].includes(
      criterion.kind,
    ),
  );
  if (criteria.length === 0) return null;

  for (const criterion of shuffle(rng, criteria)) {
    const outsiders = dataset.players.filter((player) => !criterion.test(player));
    const boardSize = randInt(rng, 6, 8);
    const impostorCount = randInt(rng, 1, 3);
    const memberCount = boardSize - impostorCount;
    if (criterion.matches.length < memberCount || outsiders.length < impostorCount) continue;

    const members = sample(rng, criterion.matches, memberCount);
    const impostors = sample(rng, outsiders, impostorCount);
    return {
      criterion,
      board: shuffle(rng, [...members, ...impostors]),
      impostorIds: new Set(impostors.map((player) => player.id)),
    };
  }
  return null;
}

export function createGame(round: Round, mode: Mode): GameState {
  return { mode, round, selected: new Set(), status: 'playing', mistake: null };
}

/** All-at-once: toggle a suspect before checking. */
export function toggle(state: GameState, player: Player): GameState {
  if (state.status !== 'playing' || state.mode !== 'all-at-once') return state;
  const selected = new Set(state.selected);
  if (selected.has(player.id)) selected.delete(player.id);
  else selected.add(player.id);
  return { ...state, selected };
}

/** All-at-once: the selection must match the impostor set exactly. */
export function check(state: GameState): GameState {
  if (state.status !== 'playing' || state.mode !== 'all-at-once') return state;
  const { impostorIds } = state.round;
  const exact =
    state.selected.size === impostorIds.size && [...state.selected].every((id) => impostorIds.has(id));
  return { ...state, status: exact ? 'won' : 'lost' };
}

/** One-by-one: a wrong pick ends the round immediately. */
export function pick(state: GameState, player: Player): GameState {
  if (state.status !== 'playing' || state.mode !== 'one-by-one') return state;
  if (state.selected.has(player.id)) return state;

  if (!state.round.impostorIds.has(player.id)) {
    return { ...state, status: 'lost', mistake: player };
  }
  const selected = new Set(state.selected).add(player.id);
  return {
    ...state,
    selected,
    status: selected.size === state.round.impostorIds.size ? 'won' : 'playing',
  };
}

/** Ends the round unsolved, so the board can be revealed. */
export function giveUp(state: GameState): GameState {
  return state.status === 'playing' ? { ...state, status: 'lost' } : state;
}

export function impostorsLeft(state: GameState): number {
  return state.round.impostorIds.size - [...state.selected].filter((id) => state.round.impostorIds.has(id)).length;
}
