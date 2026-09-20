import type { Board, BoardRow } from '@/data/liquipedia/rankings';

/** Pure logic for Tenaball. */

export type Difficulty = 'easy' | 'hard';

export const HARD_LIVES = 3;
export const SLOTS = 10;

export interface Slot {
  rank: number;
  row: BoardRow;
}

export function slotsOf(board: Board): Slot[] {
  return board.rows.map((row, index) => ({ rank: index + 1, row }));
}

export interface GameState {
  board: Board;
  difficulty: Difficulty;
  /** Ranks already filled in. */
  found: Set<number>;
  /** Labels of wrong answers, in the order they were given. */
  wrong: string[];
  lives: number;
  status: 'playing' | 'won' | 'lost';
}

export function createGame(board: Board, difficulty: Difficulty): GameState {
  return {
    board,
    difficulty,
    found: new Set(),
    wrong: [],
    lives: difficulty === 'hard' ? HARD_LIVES : Number.POSITIVE_INFINITY,
    status: 'playing',
  };
}

/** Ends the board unsolved, so the remaining ten can be revealed. */
export function giveUp(state: GameState): GameState {
  return state.status === 'playing' ? { ...state, status: 'lost' } : state;
}

export type GuessOutcome =
  | { kind: 'correct'; rank: number }
  | { kind: 'duplicate'; rank: number }
  /** Level with the cut-off but ranked out of it — costs nothing. */
  | { kind: 'tied' }
  | { kind: 'wrong' }
  /** The text did not resolve to anything the board could judge. */
  | { kind: 'unknown' };

/**
 * Scores a guess.
 *
 * `key` is the canonical id the board ranks on — a page name, an org id or a
 * country name — which the caller resolves from what was typed.
 *
 * The near-miss rule can only see one place past the cut. `next` is the 11th
 * entry and is the case that actually stings: naming the player who is level
 * with 10th and lost the tiebreak. A 12th also level with 11th is invisible
 * here, because the board ships ten rows and one spare rather than the whole
 * ranking — which is the trade that keeps the file small enough to ship.
 */
export function applyGuess(
  state: GameState,
  key: string | null,
  label?: string,
): { state: GameState; outcome: GuessOutcome } {
  if (state.status !== 'playing') return { state, outcome: { kind: 'wrong' } };
  if (!key) return { state, outcome: { kind: 'unknown' } };

  const index = state.board.rows.findIndex((row) => row.key === key);
  if (index >= 0) {
    const rank = index + 1;
    if (state.found.has(rank)) return { state, outcome: { kind: 'duplicate', rank } };
    const found = new Set(state.found).add(rank);
    return {
      state: { ...state, found, status: found.size === state.board.rows.length ? 'won' : 'playing' },
      outcome: { kind: 'correct', rank },
    };
  }

  if (key === state.board.next.key) return { state, outcome: { kind: 'tied' } };

  const lives = state.difficulty === 'hard' ? state.lives - 1 : state.lives;
  return {
    state: {
      ...state,
      wrong: [...state.wrong, label ?? key],
      lives,
      status: lives <= 0 ? 'lost' : 'playing',
    },
    outcome: { kind: 'wrong' },
  };
}
