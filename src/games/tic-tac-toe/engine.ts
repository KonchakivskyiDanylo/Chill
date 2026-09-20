import type { RosterPlayer } from '@/data/liquipedia/roster';
import { makeRng, sample, shuffle } from '@/lib/rng';
import {
  buildCriteria,
  hasNestedPair,
  intersect,
  intersects,
  type CriteriaSource,
  type PlayerCriterion,
} from '@/games/shared/criteria';

/** Pure logic for the 3x3 grid game. */

export const SIZE = 3;
/** Easy allows this many wrong answers. Hard allows none — see `Difficulty`. */
export const MAX_MISTAKES = 3;
/** Hard gives exactly one guess per cell, so every one has to land. */
export const HARD_GUESSES = SIZE * SIZE;
/** How many candidate boards to try per pass. */
const GENERATION_ATTEMPTS = 600;

export type Difficulty = 'easy' | 'hard';

export interface Board {
  rows: PlayerCriterion[];
  cols: PlayerCriterion[];
  /** Valid players per cell, indexed [row][col]. */
  candidates: RosterPlayer[][][];
}

export interface GameState {
  board: Board;
  difficulty: Difficulty;
  /** Filled cells keyed "row,col". */
  filled: Map<string, RosterPlayer>;
  mistakes: number;
  /** Every player submitted, right or wrong. Hard is capped on this. */
  guesses: number;
  status: 'playing' | 'won' | 'lost';
}

export const cellKey = (row: number, col: number) => `${row},${col}`;

/**
 * Builds a board whose every cell has at least one valid player AND where all
 * nine cells can be filled with nine *different* players — otherwise the
 * "each player once" rule could make a generated board unwinnable.
 */
export function generateBoard(source: CriteriaSource, seed: string = String(Date.now())): Board | null {
  const pool = buildCriteria(source, { minMatches: 5, maxShare: 0.45 });
  if (pool.length < SIZE * 2) return null;

  // Prefer a varied, non-redundant board; fall back to any solvable one rather
  // than showing the player an error.
  return attemptBoards(pool, seed, true) ?? attemptBoards(pool, `${seed}:relaxed`, false);
}

/**
 * Builds a board by construction rather than by guessing.
 *
 * Picking six criteria at random and checking all nine cells afterwards used
 * to work, and stopped once the criteria came from the Liquipedia export: of
 * the 276 rules it produces over a typical pool, 138 are organisations, and
 * two organisations almost never share a player. A random six therefore
 * contained an empty cell nearly every time — 36 of 40 seeds produced nothing
 * at all.
 *
 * So the columns are chosen from the criteria that already intersect all three
 * rows. Every cell is non-empty because it was never allowed to be otherwise,
 * and the only check left to fail is whether nine *different* players can fill
 * it.
 */
function attemptBoards(pool: PlayerCriterion[], seed: string, strict: boolean): Board | null {
  const rng = makeRng(seed);

  for (let attempt = 0; attempt < GENERATION_ATTEMPTS; attempt++) {
    const rows = sample(rng, pool, SIZE);
    // A board of three "played at X" rows is a dull puzzle before it is a hard
    // one, so reject the shape early — before the expensive part below.
    if (strict && !isVaried(rows)) continue;

    const usable = pool.filter(
      (candidate) =>
        !rows.some((row) => row.id === candidate.id) &&
        rows.every((row) => intersects(row, candidate)),
    );
    if (usable.length < SIZE) continue;

    const cols = sample(rng, usable, SIZE);
    const picked = [...rows, ...cols];
    if (strict) {
      if (!isVaried(picked)) continue;
      // A row that implies a column ("3+ titles" vs "2+ titles") is redundant.
      if (hasNestedPair(picked)) continue;
    }

    const candidates: RosterPlayer[][][] = rows.map((row) =>
      cols.map((col) => intersect(row, col)),
    );
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
function hasDistinctSolution(candidates: RosterPlayer[][][]): boolean {
  return canComplete(candidates, new Map());
}

/**
 * Can the cells still empty in `filled` be completed with players nobody has
 * used yet? Used both to vet a fresh board and to keep a board winnable while
 * it is being played.
 */
function canComplete(candidates: RosterPlayer[][][], filled: Map<string, RosterPlayer>): boolean {
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

export function createGame(board: Board, difficulty: Difficulty): GameState {
  return { board, difficulty, filled: new Map(), mistakes: 0, guesses: 0, status: 'playing' };
}

export function guessesLeft(state: GameState): number {
  return state.difficulty === 'hard' ? HARD_GUESSES - state.guesses : Number.POSITIVE_INFINITY;
}

export interface Cell {
  row: number;
  col: number;
}

/**
 * What submitting a player did.
 *
 * `choose` is the only outcome that needs the user again — everything else
 * either landed or did not.
 */
export type Submission =
  | { kind: 'placed'; cell: Cell }
  | { kind: 'choose'; cells: Cell[] }
  | { kind: 'rejected' }
  | { kind: 'already-used' }
  | { kind: 'deadlock'; cell: Cell };

/** Empty cells this player satisfies, ignoring who else could go there. */
function fittingCells(state: GameState, player: RosterPlayer): Cell[] {
  const cells: Cell[] = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (state.filled.has(cellKey(row, col))) continue;
      if (state.board.rows[row].test(player) && state.board.cols[col].test(player)) {
        cells.push({ row, col });
      }
    }
  }
  return cells;
}

/**
 * Cells where this player is the *only* remaining valid answer.
 *
 * This is what makes typing a name feel like it reads your mind. Put "World
 * Cup winner × United States" and "North America × FNCS winner" on the same
 * board and type Bugha: he fits both, but he is the only person alive who fits
 * the first, so that is obviously where he is meant to go. Sending him there
 * without asking is right, and asking would be faintly insulting.
 */
function soleCells(state: GameState, player: RosterPlayer, fits: Cell[]): Cell[] {
  const used = new Set([...state.filled.values()].map((entry) => entry.id));
  return fits.filter(({ row, col }) => {
    const options = state.board.candidates[row][col].filter((entry) => !used.has(entry.id));
    return options.length === 1 && options[0].id === player.id;
  });
}

/**
 * Submits a typed player and resolves where they go.
 *
 * The board no longer asks you to pick a cell first. You name a player and the
 * grid works out where they belong, because in all but a handful of cases
 * there is only one answer to that and making someone click it was busywork.
 */
export function submit(
  state: GameState,
  player: RosterPlayer,
): { state: GameState; outcome: Submission } {
  if (state.status !== 'playing') return { state, outcome: { kind: 'rejected' } };

  for (const used of state.filled.values()) {
    if (used.id === player.id) return { state, outcome: { kind: 'already-used' } };
  }

  const fits = fittingCells(state, player);
  if (fits.length === 0) return { state: charge(state, false), outcome: { kind: 'rejected' } };

  const sole = soleCells(state, player, fits);
  const target = sole.length > 0 ? sole[0] : fits.length === 1 ? fits[0] : null;
  if (!target) return { state, outcome: { kind: 'choose', cells: fits } };

  return place(state, target, player);
}

/**
 * Commits a player to a cell they are known to fit.
 *
 * Exported for the ambiguous case, where the user picked the cell themselves.
 */
export function place(
  state: GameState,
  cell: Cell,
  player: RosterPlayer,
): { state: GameState; outcome: Submission } {
  const filled = new Map(state.filled).set(cellKey(cell.row, cell.col), player);

  // The player is valid here, but spending them here can leave another cell
  // with nobody left. Refuse the move rather than soft-locking a board that was
  // generated as winnable — and do not charge a guess for it.
  if (filled.size < SIZE * SIZE && !canComplete(state.board.candidates, filled)) {
    return { state, outcome: { kind: 'deadlock', cell } };
  }

  const next = charge({ ...state, filled }, true);
  return {
    state: { ...next, status: filled.size === SIZE * SIZE ? 'won' : next.status },
    outcome: { kind: 'placed', cell },
  };
}

/**
 * Books a guess and ends the round if it was the last one available.
 *
 * Easy counts mistakes and forgives three. Hard counts guesses and gives
 * exactly nine — one per cell — so a wrong answer is not punished separately,
 * it simply costs a cell you can no longer fill.
 */
function charge(state: GameState, correct: boolean): GameState {
  const guesses = state.guesses + 1;
  const mistakes = state.mistakes + (correct ? 0 : 1);
  const out = { ...state, guesses, mistakes };
  if (state.difficulty === 'easy') {
    return mistakes >= MAX_MISTAKES ? { ...out, status: 'lost' } : out;
  }
  // Hard: nine guesses total, and every unfilled cell needs one of them.
  const remaining = SIZE * SIZE - out.filled.size;
  return HARD_GUESSES - guesses < remaining ? { ...out, status: 'lost' } : out;
}

/** Ends the round unsolved, so the remaining cells can be revealed. */
export function giveUp(state: GameState): GameState {
  return state.status === 'playing' ? { ...state, status: 'lost' } : state;
}

/** A few valid answers per empty cell, for the reveal after a loss. */
export function solutionFor(state: GameState, row: number, col: number): RosterPlayer[] {
  const usedIds = new Set([...state.filled.values()].map((player) => player.id));
  const options = state.board.candidates[row][col].filter((player) => !usedIds.has(player.id));
  return shuffle(makeRng(`${row}:${col}`), options).slice(0, 3);
}
