import type { Player } from '@/data/types';
import type { Difficulty } from '@/games/shared/difficulty';
import { makeRng, shuffle } from '@/lib/rng';

/** Pure game logic for Higher or Lower — no React, no DOM. */

export type Category = 'age' | 'earnings';
export type Answer = 'higher' | 'lower' | 'equal';

export type { Difficulty };

/**
 * Only Hard offers the Equal button — and once it is on the board, using it is
 * compulsory. Easy and Medium accept either direction on a tie.
 */
export function hasEqualButton(difficulty: Difficulty): boolean {
  return difficulty === 'hard';
}

export type Status = 'playing' | 'revealed' | 'gameover' | 'cleared';

export interface CategoryMeta {
  id: Category;
  label: string;
  hint: string;
  /** Sentence used in the prompt, e.g. "Career Earnings". */
  title: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: 'age', label: 'Age', hint: 'How old is the player today?', title: 'Age' },
  {
    id: 'earnings',
    label: 'Career Earnings',
    hint: 'Total prize money won across their career.',
    title: 'Career Earnings',
  },
];

export function valueOf(player: Player, category: Category): number {
  return category === 'age' ? (player.age ?? 0) : player.earnings;
}

/** Players usable for a category — guards against missing data (e.g. no birth date). */
export function eligible(players: readonly Player[], category: Category): Player[] {
  // An unverified total is a lower bound built from the per-year tables, and
  // comparing one against a published total can make a right answer look wrong.
  return players.filter((player) =>
    category === 'age' ? player.age !== null : player.earningsKnown && player.earnings > 0,
  );
}

export interface GameState {
  category: Category;
  difficulty: Difficulty;
  /** Players not yet shown this run. */
  queue: Player[];
  current: Player;
  challenger: Player;
  score: number;
  status: Status;
  lastAnswer: Answer | null;
  /** How many players the run started with — used for the "cleared it" message. */
  poolSize: number;
}

/**
 * Starts a run. `players` is the difficulty's pool: the caller narrows the
 * roster to one fame tier first, so a run only compares players of comparable
 * renown.
 */
export function createGame(
  players: readonly Player[],
  category: Category,
  difficulty: Difficulty,
  seed: string = String(Date.now()),
): GameState | null {
  const pool = shuffle(makeRng(seed), eligible(players, category));
  if (pool.length < 2) return null;

  const [current, challenger, ...queue] = pool;
  return {
    category,
    difficulty,
    queue,
    current,
    challenger,
    score: 0,
    status: 'playing',
    lastAnswer: null,
    poolSize: pool.length,
  };
}

/** The correct answer for the current pair. */
export function correctAnswer(state: GameState): Answer {
  const a = valueOf(state.challenger, state.category);
  const b = valueOf(state.current, state.category);
  if (a > b) return 'higher';
  if (a < b) return 'lower';
  return 'equal';
}

export function isCorrect(state: GameState, answer: Answer): boolean {
  const truth = correctAnswer(state);
  // Without an Equal button a tie has to accept either direction.
  if (!hasEqualButton(state.difficulty) && truth === 'equal') {
    return answer === 'higher' || answer === 'lower';
  }
  return answer === truth;
}

/** Applies an answer: reveals the hidden value, and scores or ends the run. */
export function submitAnswer(state: GameState, answer: Answer): GameState {
  if (state.status !== 'playing') return state;
  const correct = isCorrect(state, answer);
  return {
    ...state,
    lastAnswer: answer,
    score: correct ? state.score + 1 : state.score,
    status: correct ? 'revealed' : 'gameover',
  };
}

/**
 * Moves to the next pair. The revealed player slides across and becomes the
 * known side, so no player is ever shown twice in a run.
 */
export function nextRound(state: GameState): GameState {
  if (state.status !== 'revealed') return state;
  if (state.queue.length === 0) return { ...state, status: 'cleared' };

  const [next, ...rest] = state.queue;
  return {
    ...state,
    current: state.challenger,
    challenger: next,
    queue: rest,
    lastAnswer: null,
    status: 'playing',
  };
}
