import type { RosterPlayer } from '@/data/liquipedia/roster';
import type { Teammates } from '@/data/liquipedia/teammates';
import { makeRng, sample, shuffle, type Rng } from '@/lib/rng';
import {
  buildCriteria,
  hasNestedPair,
  type CriteriaSource,
  type PlayerCriterion,
} from '@/games/shared/criteria';

/** Pure logic for Connections. */

export const GROUP_SIZE = 4;
export const GROUP_COUNT = 4;
export const MAX_MISTAKES = 4;
const GENERATION_ATTEMPTS = 400;

export interface Group {
  id: string;
  /** The connection, revealed when the group is solved. */
  label: string;
  players: RosterPlayer[];
}

export interface Puzzle {
  groups: Group[];
  /** All 16 players in display order. */
  board: RosterPlayer[];
}

export interface GameState {
  puzzle: Puzzle;
  solved: Group[];
  selected: string[];
  mistakes: number;
  status: 'playing' | 'won' | 'lost';
  /** How many of the last four belonged to one group, when it was not four. */
  near: number | null;
}

/** Criteria usable as a Connections group, including teammate links. */
function groupCandidates(
  source: CriteriaSource,
  teammates: Teammates | null,
  rng: Rng,
): PlayerCriterion[] {
  const base = buildCriteria(source, { minMatches: GROUP_SIZE, maxShare: 0.35 });

  // Teammate groups: "has played alongside X".
  const teammateGroups: PlayerCriterion[] = [];
  if (teammates) {
    const byId = new Map(source.players.map((player) => [player.id, player]));
    for (const anchor of sample(rng, source.players, 40)) {
      const links = teammates
        .cluesFor(anchor.id, byId)
        .filter((entry) => entry.events >= 2 && entry.player.id !== anchor.id);
      if (links.length < GROUP_SIZE) continue;
      const ids = new Set(links.map((entry) => entry.player.id));
      teammateGroups.push({
        id: `teammates:${anchor.id}`,
        kind: 'played-event',
        label: `has played 2+ tournaments alongside ${anchor.name}`,
        short: `2+ events with ${anchor.name}`,
        test: (player) => ids.has(player.id),
        matches: links.map((entry) => entry.player),
      });
    }
  }

  return shuffle(rng, [...base, ...teammateGroups]);
}

/**
 * Builds a board of four groups of four.
 *
 * Each player is drawn from the *exclusive* pool of its group — players who fit
 * that connection and none of the other three. That guarantees the groups are
 * disjoint and that every intended group has exactly one right answer.
 */
export function generatePuzzle(
  source: CriteriaSource,
  teammates: Teammates | null,
  seed: string = String(Date.now()),
): Puzzle | null {
  const rng = makeRng(seed);
  const candidates = groupCandidates(source, teammates, rng);
  if (candidates.length < GROUP_COUNT) return null;

  for (let attempt = 0; attempt < GENERATION_ATTEMPTS; attempt++) {
    const picked = sample(rng, candidates, GROUP_COUNT);
    // Four groups of the same kind (four countries, say) make a flat puzzle.
    const kinds = new Map<string, number>();
    for (const criterion of picked) kinds.set(criterion.kind, (kinds.get(criterion.kind) ?? 0) + 1);
    if ([...kinds.values()].some((count) => count > 2)) continue;
    if (hasNestedPair(picked)) continue;

    const groups: Group[] = [];
    let viable = true;

    for (const criterion of picked) {
      const others = picked.filter((other) => other.id !== criterion.id);
      const exclusive = criterion.matches.filter((player) => !others.some((other) => other.test(player)));
      if (exclusive.length < GROUP_SIZE) {
        viable = false;
        break;
      }
      groups.push({
        id: criterion.id,
        label: criterion.label,
        players: sample(rng, exclusive, GROUP_SIZE),
      });
    }
    if (!viable) continue;

    // Exclusive pools cannot overlap, but assert it rather than assume it.
    const all = groups.flatMap((group) => group.players);
    if (new Set(all.map((player) => player.id)).size !== GROUP_SIZE * GROUP_COUNT) continue;

    return { groups, board: shuffle(rng, all) };
  }
  return null;
}

export function createGame(puzzle: Puzzle): GameState {
  return { puzzle, solved: [], selected: [], mistakes: 0, status: 'playing', near: null };
}

export function toggle(state: GameState, player: RosterPlayer): GameState {
  if (state.status !== 'playing') return state;
  if (state.solved.some((group) => group.players.some((p) => p.id === player.id))) return state;

  const selected = state.selected.includes(player.id)
    ? state.selected.filter((id) => id !== player.id)
    : state.selected.length >= GROUP_SIZE
      ? state.selected
      : [...state.selected, player.id];
  return { ...state, selected, near: null };
}

export function submit(state: GameState): GameState {
  if (state.status !== 'playing' || state.selected.length !== GROUP_SIZE) return state;

  const unsolved = state.puzzle.groups.filter(
    (group) => !state.solved.some((solved) => solved.id === group.id),
  );
  const selectedIds = new Set(state.selected);

  const exact = unsolved.find((group) => group.players.every((player) => selectedIds.has(player.id)));
  if (exact) {
    const solved = [...state.solved, exact];
    return {
      ...state,
      solved,
      selected: [],
      status: solved.length === GROUP_COUNT ? 'won' : 'playing',
      near: null,
    };
  }

  /*
   * How close the guess was, as a number rather than the traditional "One
   * away…".
   *
   * "One away" only ever fires on three-of-four, so it says nothing on a guess
   * that was two-and-two — which is the guess a player most needs telling
   * about, because it means they have merged two different groups. Reporting
   * the best overlap covers both and is a stronger hint besides.
   */
  const best = Math.max(
    ...unsolved.map((group) => group.players.filter((player) => selectedIds.has(player.id)).length),
  );
  const mistakes = state.mistakes + 1;
  return {
    ...state,
    mistakes,
    selected: [],
    status: mistakes >= MAX_MISTAKES ? 'lost' : 'playing',
    near: best,
  };
}

/** Ends the round unsolved, so the remaining groups can be revealed. */
export function giveUp(state: GameState): GameState {
  return state.status === 'playing' ? { ...state, selected: [], status: 'lost' } : state;
}

export function unsolvedGroups(state: GameState): Group[] {
  return state.puzzle.groups.filter((group) => !state.solved.some((solved) => solved.id === group.id));
}

/** Lives remaining, for the hearts row. */
export function livesLeft(state: GameState): number {
  return Math.max(0, MAX_MISTAKES - state.mistakes);
}
