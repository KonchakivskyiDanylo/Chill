import { ref, type GamePayloads, type Outcome } from '@/analytics/types';
import type { RosterPlayer } from '@/data/liquipedia/roster';
import { makeRng, sample } from '@/lib/rng';
import {
  buildCriteria,
  hasNestedPair,
  intersect,
  intersects,
  NEAR_NESTED,
  type CriteriaSource,
  type PlayerCriterion,
} from '@/games/shared/criteria';

export { NEAR_NESTED };

/** Pure logic for the 3x3 grid game. */

export const SIZE = 3;
/** Easy and Medium allow this many wrong answers. Hard counts guesses instead. */
export const MAX_MISTAKES = 3;
/** Hard gives exactly one guess per cell, so every one has to land. */
export const HARD_GUESSES = SIZE * SIZE;
/** How many candidate boards to try per pass. */
const GENERATION_ATTEMPTS = 600;

/**
 * The one setting the game has.
 *
 * It used to have two — a fame band from the shared pool picker and an
 * Easy/Hard ruleset under it — and the fame band did something no player would
 * guess: it also narrowed who you could *type*. On Hard the search box held
 * only the four thousand least-known players, so naming Bugha for a cell he
 * obviously fits was impossible. Now the level decides what the board is
 * built around and how forgiving the rules are, and any valid player is
 * accepted at every level.
 */
export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * What a board at each level promises.
 *
 * `answers` is how many players from the level's fame band every cell must
 * have — three household names per cell on Easy, so there is always one you
 * know, and a single answer from anywhere on Hard.
 */
export const LEVELS: Record<Difficulty, { answers: number }> = {
  easy: { answers: 3 },
  medium: { answers: 2 },
  hard: { answers: 1 },
};

export interface Board {
  rows: PlayerCriterion[];
  cols: PlayerCriterion[];
  /**
   * Every accepted player per cell, indexed [row][col], biggest earner first.
   *
   * Drawn from the whole accepted pool rather than the fame band the board was
   * built around, because it is what `canComplete` reasons over: a board that
   * only knew the famous answers would refuse moves an obscure answer makes
   * perfectly safe.
   */
  candidates: RosterPlayer[][][];
}

export interface BoardPools {
  /** The fame band the board is built around — every cell has answers here. */
  answers: readonly RosterPlayer[];
  /** Everyone the guess box accepts. */
  accepted: readonly RosterPlayer[];
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
 * Builds a board whose every cell has enough answers from the level's fame
 * band AND where all nine cells can be filled with nine *different* players —
 * otherwise the "each player once" rule could make a generated board
 * unwinnable.
 *
 * The rules are built against `pools.answers`, so "has played for FaZe" on an
 * Easy board is a question about the famous FaZe players, and the guess box
 * then takes anyone in `pools.accepted` who fits.
 */
export function generateBoard(
  source: Omit<CriteriaSource, 'players'>,
  pools: BoardPools,
  difficulty: Difficulty,
  seed: string = String(Date.now()),
): Board | null {
  const pool = buildCriteria({ ...source, players: pools.answers }, { minMatches: 5, maxShare: 0.45 });
  if (pool.length < SIZE * 2) return null;

  // Prefer a varied, non-redundant board; fall back to any solvable one rather
  // than showing the player an error. A small field — an event mode on Easy —
  // may not have three answers per cell anywhere, and a board with two beats
  // "cannot start".
  for (let answers = LEVELS[difficulty].answers; answers >= 1; answers--) {
    const found =
      attemptBoards(pool, seed, true, answers) ??
      attemptBoards(pool, `${seed}:relaxed`, false, answers);
    if (found) return { ...found, candidates: acceptedPerCell(found, pools.accepted) };
  }
  return null;
}

/** Everyone in `accepted` who fits each cell, biggest earner first. */
function acceptedPerCell(
  board: Pick<Board, 'rows' | 'cols'>,
  accepted: readonly RosterPlayer[],
): RosterPlayer[][][] {
  const ranked = [...accepted].sort((a, b) => b.earnings - a.earnings);
  return board.rows.map((row) =>
    board.cols.map((col) => ranked.filter((player) => row.test(player) && col.test(player))),
  );
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
function attemptBoards(
  pool: PlayerCriterion[],
  seed: string,
  strict: boolean,
  answers: number,
): Board | null {
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
      // A row that implies a column ("3+ titles" vs "2+ titles") is redundant,
      // and so is one that nearly does ("Won NA FNCS" vs "North America").
      if (hasNestedPair(picked, NEAR_NESTED)) continue;
    }

    const candidates: RosterPlayer[][][] = rows.map((row) =>
      cols.map((col) => intersect(row, col)),
    );
    if (candidates.some((line) => line.some((cell) => cell.length < answers))) continue;
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
 * Submits a typed player and resolves where they go.
 *
 * The board no longer asks you to pick a cell first. You name a player and the
 * grid works out where they belong, because in all but a handful of cases
 * there is only one answer to that and making someone click it was busywork.
 *
 * The cells a player is offered are the ones they fit *and* that leave every
 * other empty cell still fillable with players nobody has used. That second
 * test used to run after you chose: Koyota fitted two cells, you were asked
 * which, and the one you tapped was refused with "would leave another cell
 * impossible" — a question with a wrong answer the game already knew. A cell
 * that strands another is now never offered, so when only one cell is safe
 * the player goes straight there.
 *
 * That also covers what the old sole-answer rule did: if you are the last
 * person who fits a cell, putting you anywhere else strands it, so that cell
 * is the only safe one.
 *
 * A player who fits always has at least one safe cell. The board is
 * completable before the move, so some assignment fills every empty cell with
 * distinct players. If it uses this player, the cell it gives them is safe; if
 * it does not, every cell they fit is, because they can take that cell's
 * place in it. `deadlock` is kept as the guard on `place`, not as a path play
 * reaches.
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

  const safe = fits.filter((cell) => keepsBoardWinnable(state, cell, player));
  if (safe.length === 0) return { state, outcome: { kind: 'deadlock', cell: fits[0] } };
  if (safe.length === 1) return place(state, safe[0], player);
  return { state, outcome: { kind: 'choose', cells: safe } };
}

/** Whether every other empty cell can still be filled once `player` sits in `cell`. */
function keepsBoardWinnable(state: GameState, cell: Cell, player: RosterPlayer): boolean {
  const filled = new Map(state.filled).set(cellKey(cell.row, cell.col), player);
  return filled.size === SIZE * SIZE || canComplete(state.board.candidates, filled);
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
  // `submit` only ever offers safe cells, so this guards the export rather
  // than a path play can reach: a move that strands another cell is refused,
  // and it costs nothing.
  if (!keepsBoardWinnable(state, cell, player)) {
    return { state, outcome: { kind: 'deadlock', cell } };
  }
  const filled = new Map(state.filled).set(cellKey(cell.row, cell.col), player);

  const next = charge({ ...state, filled }, true);
  return {
    state: { ...next, status: filled.size === SIZE * SIZE ? 'won' : next.status },
    outcome: { kind: 'placed', cell },
  };
}

/**
 * Books a guess and ends the round if it was the last one available.
 *
 * Easy and Medium count mistakes and forgive three. Hard counts guesses and
 * gives exactly nine — one per cell — so a wrong answer is not punished
 * separately, it simply costs a cell you can no longer fill.
 */
function charge(state: GameState, correct: boolean): GameState {
  const guesses = state.guesses + 1;
  const mistakes = state.mistakes + (correct ? 0 : 1);
  const out = { ...state, guesses, mistakes };
  if (state.difficulty !== 'hard') {
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

/**
 * A few valid answers per empty cell, for the reveal after a loss.
 *
 * The biggest earners rather than a random three: the reveal is where you
 * learn the answer you should have known, and three at random from a cell with
 * three hundred players in it were nearly always three nobody had heard of.
 */
export function solutionFor(state: GameState, row: number, col: number): RosterPlayer[] {
  const usedIds = new Set([...state.filled.values()].map((player) => player.id));
  return state.board.candidates[row][col].filter((player) => !usedIds.has(player.id)).slice(0, 3);
}

/**
 * The board as the analytics record it: the six rules and who went where.
 * Cells are counted by the pair of rules, not the position, so "Won EU FNCS ×
 * FaZe" adds up across every board it appears on.
 */
export function record(state: GameState): { outcome: Outcome; r: GamePayloads['tic-tac-toe'] } {
  const outOfGuesses =
    state.difficulty === 'hard'
      ? HARD_GUESSES - state.guesses < SIZE * SIZE - state.filled.size
      : state.mistakes >= MAX_MISTAKES;
  const rule = (criterion: PlayerCriterion) => ({ id: criterion.id, name: criterion.short });
  return {
    outcome: state.status === 'won' ? 'won' : outOfGuesses ? 'lost' : 'gave-up',
    r: {
      rows: state.board.rows.map(rule),
      cols: state.board.cols.map(rule),
      placed: [...state.filled].map(([key, player]) => {
        const [row, col] = key.split(',').map(Number);
        return { row, col, player: ref(player) };
      }),
      mistakes: state.mistakes,
    },
  };
}
