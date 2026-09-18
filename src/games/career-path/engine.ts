import type { Dataset } from '@/data/dataset';
import type { Player, PlayerResult, TournamentEvent } from '@/data/types';
import { makeRng, shuffle } from '@/lib/rng';

/** Pure logic for Career Path. */

export type Mode = 'order' | 'random';

/** Minimum majors a player needs before their path is worth guessing. */
const MIN_CLUES = 4;
/** Never show more than this many clues, even for long careers. */
const MAX_CLUES = 10;

export interface Clue {
  event: TournamentEvent;
  result: PlayerResult;
}

export interface GameState {
  mode: Mode;
  secret: Player;
  /** Clues in reveal order. */
  clues: Clue[];
  revealed: number;
  guesses: Player[];
  status: 'playing' | 'won' | 'lost';
}

/** Players with a rich enough major-event career to build a path from. */
export function eligible(dataset: Dataset): Player[] {
  return dataset.players.filter((player) => dataset.careerOf(player).length >= MIN_CLUES);
}

export function createGame(dataset: Dataset, mode: Mode, seed: string = String(Date.now())): GameState | null {
  const pool = eligible(dataset);
  if (pool.length === 0) return null;

  const rng = makeRng(seed);
  const secret = pool[Math.floor(rng() * pool.length)];

  // The path starts at the first major the player actually reached and ends at
  // their latest one — no "did not qualify" gaps, only confirmed results.
  const career = dataset.careerOf(secret);
  const trimmed = career.length > MAX_CLUES ? pickSpread(career, MAX_CLUES) : career;
  const clues = mode === 'order' ? trimmed : shuffle(rng, trimmed);

  return { mode, secret, clues, revealed: 1, guesses: [], status: 'playing' };
}

/**
 * Keeps the first and last result (the real start and end of the career) and
 * spreads the rest evenly, so a long career still reads as a path.
 */
function pickSpread(career: Clue[], count: number): Clue[] {
  const step = (career.length - 1) / (count - 1);
  const indices = new Set<number>();
  for (let i = 0; i < count; i++) indices.add(Math.round(i * step));
  return [...indices].sort((a, b) => a - b).map((index) => career[index]);
}

export function submitGuess(state: GameState, guess: Player): GameState {
  if (state.status !== 'playing') return state;
  if (state.guesses.some((g) => g.id === guess.id)) return state;

  const guesses = [...state.guesses, guess];
  if (guess.id === state.secret.id) return { ...state, guesses, status: 'won' };

  // A wrong guess burns a clue; running out of clues ends the round.
  if (state.revealed >= state.clues.length) return { ...state, guesses, status: 'lost' };
  return { ...state, guesses, revealed: state.revealed + 1 };
}

/** Voluntarily reveal the next clue without guessing. */
export function revealNext(state: GameState): GameState {
  if (state.status !== 'playing') return state;
  if (state.revealed >= state.clues.length) return state;
  return { ...state, revealed: state.revealed + 1 };
}

/** Ends the round unsolved, with every remaining clue turned face up. */
export function giveUp(state: GameState): GameState {
  if (state.status !== 'playing') return state;
  return { ...state, revealed: state.clues.length, status: 'lost' };
}

export function cluesLeft(state: GameState): number {
  return state.clues.length - state.revealed;
}
