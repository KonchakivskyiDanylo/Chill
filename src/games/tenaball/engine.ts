import type { GamePayloads, Outcome } from '@/analytics/types';
import { membersOf, type Board, type BoardMember, type BoardRow } from '@/data/liquipedia/rankings';

/** Pure logic for Tenaball. */

export type Difficulty = 'easy' | 'hard';

export const HARD_LIVES = 3;
export const SLOTS = 10;

export interface Slot {
  rank: number;
  row: BoardRow;
  /**
   * Everyone this slot wants named.
   *
   * One person on almost every board. A tournament played in duos or trios
   * ranks *placements*, so 1st is a team and the slot only closes once every
   * name on it has been given.
   */
  members: BoardMember[];
}

export function slotsOf(board: Board): Slot[] {
  return board.rows.map((row, index) => ({ rank: index + 1, row, members: membersOf(row) }));
}

export interface GameState {
  board: Board;
  difficulty: Difficulty;
  /** Ranks with every member named. */
  found: Set<number>;
  /**
   * Rank -> the member keys named so far, including the ranks now in `found`.
   *
   * The partial ones are the point: a duo row someone has half of is worth
   * showing on the board, and worth protecting from being scored as a miss.
   */
  named: Map<number, Set<string>>;
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
    named: new Map(),
    wrong: [],
    lives: difficulty === 'hard' ? HARD_LIVES : Number.POSITIVE_INFINITY,
    status: 'playing',
  };
}

const EMPTY: ReadonlySet<string> = new Set();

/** The member keys already given for one rank. */
export function namedIn(state: GameState, rank: number): ReadonlySet<string> {
  return state.named.get(rank) ?? EMPTY;
}

/** Ends the board unsolved, so the remaining ten can be revealed. */
export function giveUp(state: GameState): GameState {
  return state.status === 'playing' ? { ...state, status: 'lost' } : state;
}

export type GuessOutcome =
  | { kind: 'correct'; rank: number }
  /** Right row, but the team it ranks is not complete yet. */
  | { kind: 'partial'; rank: number; remaining: number }
  | { kind: 'duplicate'; rank: number }
  /** One place past the cut-off — costs nothing. `level` when genuinely tied. */
  | { kind: 'tied'; level: boolean }
  | { kind: 'wrong' }
  /** The text did not resolve to anything the board could judge. */
  | { kind: 'unknown' };

/**
 * Scores a guess.
 *
 * `key` is the canonical id the board ranks on — a page name, an org id or a
 * country name — which the caller resolves from what was typed. On a team board
 * it is one player's page name, and the row it belongs to is the one that owns
 * that name.
 *
 * The near-miss rule can only see one place past the cut. `next` is the 11th
 * entry and is the case that actually stings: naming the player who is level
 * with 10th and lost the tiebreak. A 12th also level with 11th is invisible
 * here, because the board ships ten rows and one spare rather than the whole
 * ranking — which is the trade that keeps the file small enough to ship.
 *
 * `level` says whether the 11th is really tied with the 10th or merely next in
 * line: on a money board it almost never is, and on a board of finishing
 * positions it never is, so the message the two deserve is not the same one.
 */
export function applyGuess(
  state: GameState,
  key: string | null,
  label?: string,
): { state: GameState; outcome: GuessOutcome } {
  if (state.status !== 'playing') return { state, outcome: { kind: 'wrong' } };
  if (!key) return { state, outcome: { kind: 'unknown' } };

  const index = state.board.rows.findIndex((row) =>
    membersOf(row).some((member) => member.key === key),
  );
  if (index >= 0) {
    const rank = index + 1;
    const wanted = membersOf(state.board.rows[index]);
    const already = namedIn(state, rank);
    if (already.has(key)) return { state, outcome: { kind: 'duplicate', rank } };

    const names = new Set(already).add(key);
    const named = new Map(state.named).set(rank, names);
    if (names.size < wanted.length) {
      return {
        state: { ...state, named },
        outcome: { kind: 'partial', rank, remaining: wanted.length - names.size },
      };
    }
    const found = new Set(state.found).add(rank);
    return {
      state: {
        ...state,
        named,
        found,
        status: found.size === state.board.rows.length ? 'won' : 'playing',
      },
      outcome: { kind: 'correct', rank },
    };
  }

  const last = state.board.rows[state.board.rows.length - 1];
  if (membersOf(state.board.next).some((member) => member.key === key)) {
    return { state, outcome: { kind: 'tied', level: state.board.next.value === last.value } };
  }

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

/**
 * The board as the analytics record it: every answer on it, found or not,
 * which is what "most and least guessable" is counted from. On a team row
 * each name counts on its own — half a duo is half the knowledge.
 *
 * Only Hard can be lost; a board that ends unsolved any other way was given up.
 */
export function record(state: GameState): { outcome: Outcome; r: GamePayloads['tenaball'] } {
  return {
    outcome: state.status === 'won' ? 'won' : state.lives <= 0 ? 'lost' : 'gave-up',
    r: {
      board: { id: state.board.id, name: state.board.title },
      answers: slotsOf(state.board).flatMap((slot) =>
        slot.members.map((member) => ({
          name: member.label,
          found: namedIn(state, slot.rank).has(member.key),
        })),
      ),
      wrong: state.wrong,
    },
  };
}
