import type { Dataset } from '@/data/dataset';
import type { Player } from '@/data/types';
import { makeRng, sample, shuffle } from '@/lib/rng';
import { buildCriteria, hasNestedPair, intersect, type PlayerCriterion } from '@/games/shared/criteria';

/** Pure logic for the 3x3 grid game. */

export const SIZE = 3;
export const MAX_MISTAKES = 3;
/** How many candidate boards to try per pass. */
const GENERATION_ATTEMPTS = 600;

export interface Board {
  rows: PlayerCriterion[];
  cols: PlayerCriterion[];
  /** Valid players per cell, indexed [row][col]. */
  candidates: Player[][][];
}

export interface GameState {
  board: Board;
  /** Filled cells keyed "row,col". */
  filled: Map<string, Player>;
  mistakes: number;
  status: 'playing' | 'won' | 'lost';
}

export const cellKey = (row: number, col: number) => `${row},${col}`;

/**
 * Builds a board whose every cell has at least one valid player AND where all
 * nine cells can be filled with nine *different* players — otherwise the
 * "each player once" rule could make a generated board unwinnable.
 */
export function generateBoard(dataset: Dataset, seed: string = String(Date.now())): Board | null {
  const pool = buildCriteria(dataset, { minMatches: 5, maxShare: 0.45 });
  if (pool.length < SIZE * 2) return null;

  // Prefer a varied, non-redundant board; fall back to any solvable one rather
  // than showing the player an error.
  return attemptBoards(pool, seed, true) ?? attemptBoards(pool, `${seed}:relaxed`, false);
}

function attemptBoards(pool: PlayerCriterion[], seed: string, strict: boolean): Board | null {
  const rng = makeRng(seed);

  for (let attempt = 0; attempt < GENERATION_ATTEMPTS; attempt++) {
    const picked = sample(rng, pool, SIZE * 2);
    const rows = picked.slice(0, SIZE);
    const cols = picked.slice(SIZE);

    // Two axes must not ask the same question.
    if (rows.some((row) => cols.some((col) => col.id === row.id))) continue;
    if (strict) {
      // A board of six "played at X" axes is a dull puzzle, so keep variety…
      if (!isVaried(picked)) continue;
      // …and a row that implies a column ("3+ titles" vs "2+ titles") is redundant.
      if (hasNestedPair(picked)) continue;
    }

    const candidates: Player[][][] = [];
    let viable = true;
    for (let r = 0; r < SIZE && viable; r++) {
      const rowCandidates: Player[][] = [];
      for (let c = 0; c < SIZE; c++) {
        const cell = intersect(rows[r], cols[c]);
        if (cell.length === 0) {
          viable = false;
          break;
        }
        rowCandidates.push(cell);
      }
      if (viable) candidates.push(rowCandidates);
    }
    if (!viable) continue;
    if (!hasDistinctSolution(candidates)) continue;

    return { rows, cols, candidates };
  }
  return null;
}

/** No more than two axes may come from the same kind of criterion. */
function isVaried(criteria: PlayerCriterion[]): boolean {
  const counts = new Map<string, number>();
  for (const criterion of criteria) {
    const next = (counts.get(criterion.kind) ?? 0) + 1;
    if (next > 2) return false;
    counts.set(criterion.kind, next);
  }
  return true;
}

/**
 * Can all nine cells be filled with nine different players?
 * Backtracking over the most constrained cells first — the grid is tiny, so
 * this is instant.
 */
function hasDistinctSolution(candidates: Player[][][]): boolean {
  return canComplete(candidates, new Map());
}

/**
 * Can the cells still empty in `filled` be completed with players nobody has
 * used yet? Used both to vet a fresh board and to keep a board winnable while
 * it is being played.
 */
function canComplete(candidates: Player[][][], filled: Map<string, Player>): boolean {
  const used = new Set([...filled.values()].map((player) => player.id));
  const cells: string[][] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (filled.has(cellKey(r, c))) continue;
      const options = candidates[r][c].map((player) => player.id).filter((id) => !used.has(id));
      if (options.length === 0) return false;
      cells.push(options);
    }
  }
  cells.sort((a, b) => a.length - b.length);

  const solve = (depth: number): boolean => {
    if (depth === cells.length) return true;
    for (const id of cells[depth]) {
      if (used.has(id)) continue;
      used.add(id);
      if (solve(depth + 1)) return true;
      used.delete(id);
    }
    return false;
  };
  return solve(0);
}

export function createGame(board: Board): GameState {
  return { board, filled: new Map(), mistakes: 0, status: 'playing' };
}

export type PlaceOutcome = 'placed' | 'wrong' | 'already-used' | 'occupied' | 'deadlock';

export function place(
  state: GameState,
  row: number,
  col: number,
  player: Player,
): { state: GameState; outcome: PlaceOutcome } {
  if (state.status !== 'playing') return { state, outcome: 'occupied' };
  const key = cellKey(row, col);
  if (state.filled.has(key)) return { state, outcome: 'occupied' };

  // Each player may only appear once on the board.
  for (const used of state.filled.values()) {
    if (used.id === player.id) return { state, outcome: 'already-used' };
  }

  const valid = state.board.rows[row].test(player) && state.board.cols[col].test(player);
  if (!valid) {
    const mistakes = state.mistakes + 1;
    return {
      state: { ...state, mistakes, status: mistakes >= MAX_MISTAKES ? 'lost' : 'playing' },
      outcome: 'wrong',
    };
  }

  const filled = new Map(state.filled).set(key, player);

  // The player is valid for this cell, but spending them here can leave another
  // cell with nobody left. Refuse the move rather than soft-locking a board that
  // was generated as winnable — and do not charge a mistake for it.
  if (filled.size < SIZE * SIZE && !canComplete(state.board.candidates, filled)) {
    return { state, outcome: 'deadlock' };
  }

  return {
    state: { ...state, filled, status: filled.size === SIZE * SIZE ? 'won' : 'playing' },
    outcome: 'placed',
  };
}

/** One valid answer per empty cell, for the reveal after a loss. */
/** Ends the round unsolved, so the remaining cells can be revealed. */
export function giveUp(state: GameState): GameState {
  return state.status === 'playing' ? { ...state, status: 'lost' } : state;
}

export function solutionFor(state: GameState, row: number, col: number): Player[] {
  const usedIds = new Set([...state.filled.values()].map((player) => player.id));
  const options = state.board.candidates[row][col].filter((player) => !usedIds.has(player.id));
  return shuffle(makeRng(`${row}:${col}`), options).slice(0, 3);
}
