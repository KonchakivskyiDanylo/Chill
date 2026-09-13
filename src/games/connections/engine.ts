import type { Dataset } from '@/data/dataset';
import type { Player } from '@/data/types';
import { makeRng, sample, shuffle, type Rng } from '@/lib/rng';
import { buildCriteria, hasNestedPair, type PlayerCriterion } from '@/games/shared/criteria';

/** Pure logic for Connections. */

export const GROUP_SIZE = 4;
export const GROUP_COUNT = 4;
export const MAX_MISTAKES = 4;
const GENERATION_ATTEMPTS = 400;

export interface Group {
  id: string;
  /** The connection, revealed when the group is solved. */
  label: string;
  players: Player[];
}

export interface Puzzle {
  groups: Group[];
  /** All 16 players in display order. */
  board: Player[];
}

export interface GameState {
  puzzle: Puzzle;
  solved: Group[];
  selected: string[];
  mistakes: number;
  status: 'playing' | 'won' | 'lost';
  message: string | null;
}

/** Criteria usable as a Connections group, including teammate links. */
function groupCandidates(dataset: Dataset, rng: Rng): PlayerCriterion[] {
  const base = buildCriteria(dataset, { minMatches: GROUP_SIZE, maxShare: 0.35 }).filter((criterion) =>
    ['country', 'region', 'team', 'fncs-winner', 'lan-winner', 'earnings', 'fncs-wins', 'played-event'].includes(
      criterion.kind,
    ),
  );

  // Teammate groups: "played 200+ tournament matches with X".
  const teammateGroups: PlayerCriterion[] = [];
  for (const anchor of sample(rng, dataset.players, 40)) {
    const links = dataset.teammatesOf(anchor).filter((entry) => entry.matches >= 200);
    if (links.length < GROUP_SIZE) continue;
    const ids = new Set(links.map((entry) => entry.player.id));
    teammateGroups.push({
      id: `teammates:${anchor.id}`,
      kind: 'teammates',
      label: `played 200+ tournament matches with ${anchor.name}`,
      short: `200+ matches with ${anchor.name}`,
      test: (player) => ids.has(player.id),
      matches: links.map((entry) => entry.player),
    });
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
export function generatePuzzle(dataset: Dataset, seed: string = String(Date.now())): Puzzle | null {
  const rng = makeRng(seed);
  const candidates = groupCandidates(dataset, rng);
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
  return { puzzle, solved: [], selected: [], mistakes: 0, status: 'playing', message: null };
}

export function toggle(state: GameState, player: Player): GameState {
  if (state.status !== 'playing') return state;
  if (state.solved.some((group) => group.players.some((p) => p.id === player.id))) return state;

  const selected = state.selected.includes(player.id)
    ? state.selected.filter((id) => id !== player.id)
    : state.selected.length >= GROUP_SIZE
      ? state.selected
      : [...state.selected, player.id];
  return { ...state, selected, message: null };
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
      message: null,
    };
  }

  // "One away" is the standard nudge and makes the game far less frustrating.
  const best = Math.max(
    ...unsolved.map((group) => group.players.filter((player) => selectedIds.has(player.id)).length),
  );
  const mistakes = state.mistakes + 1;
  return {
    ...state,
    mistakes,
    selected: [],
    status: mistakes >= MAX_MISTAKES ? 'lost' : 'playing',
    message: best === GROUP_SIZE - 1 ? 'One away…' : 'Not a group.',
  };
}

/** Groups still hidden — revealed when the board is lost. */
export function unsolvedGroups(state: GameState): Group[] {
  return state.puzzle.groups.filter((group) => !state.solved.some((solved) => solved.id === group.id));
}
