import type { TeammateClue } from '@/data/liquipedia/teammates';
import type { RosterPlayer } from '@/data/liquipedia/roster';
import { makeRng, shuffle } from '@/lib/rng';

/** Pure logic for Who Are Ya? */

/** What the clue list does, not how famous the answer is — that is the difficulty. */
export type Mode = 'easy' | 'hard' | 'random';

export const MAX_CLUES = 10;
/**
 * Teammates a secret player needs before the round is fair.
 *
 * Three is where the chain still narrows to one person.
 */
export const MIN_CLUES = 3;

/**
 * Tournaments a secret player needs on record.
 *
 * Separate from the teammate count and stricter than it. A player can pick up
 * three teammates across three tournaments in a career that is otherwise
 * invisible, and being asked to name them from three names is not a puzzle,
 * it is a coin toss. Five entries means there is a career to recognise.
 */
export const MIN_TOURNAMENTS = 5;

export interface GameState {
  mode: Mode;
  secret: RosterPlayer;
  /** Clues in reveal order. */
  clues: TeammateClue[];
  revealed: number;
  /**
   * How many clues were showing when the round ended — see the same field in
   * Career Path. Ending a round turns the rest of the clue list face up, so
   * this is the number that says how much you actually needed.
   */
  earned: number;
  guesses: RosterPlayer[];
  status: 'playing' | 'won' | 'lost';
}

/** Shared-tournament counts are only shown on the first mode. */
export function showsMatches(mode: Mode): boolean {
  return mode === 'easy';
}

/**
 * A round on a secret player the caller has already chosen.
 *
 * `clues` must be that player's teammates most-shared first, which is how
 * `Teammates.cluesFor` returns them. Easy and Hard then walk them backwards so
 * the weakest hint lands first and the strongest last; Random shuffles.
 */
export function createGame(
  secret: RosterPlayer,
  clues: readonly TeammateClue[],
  mode: Mode,
  seed: string = String(Date.now()),
): GameState | null {
  if (clues.length < MIN_CLUES) return null;
  const rng = makeRng(seed);
  const top = clues.slice(0, MAX_CLUES);
  const ordered = mode === 'random' ? shuffle(rng, top) : [...top].reverse();
  return { mode, secret, clues: ordered, revealed: 1, earned: 1, guesses: [], status: 'playing' };
}

export function submitGuess(state: GameState, guess: RosterPlayer): GameState {
  if (state.status !== 'playing') return state;
  if (state.guesses.some((g) => g.id === guess.id)) return state;

  const guesses = [...state.guesses, guess];
  // Winning shows the rest of the clue list — the teammates the round was
  // holding back, not every teammate on record. Ten names you can read against
  // the ones you were given; the full career list was a different question.
  if (guess.id === state.secret.id) {
    return { ...state, guesses, revealed: state.clues.length, status: 'won' };
  }
  if (state.revealed >= state.clues.length) return { ...state, guesses, status: 'lost' };
  const revealed = state.revealed + 1;
  return { ...state, guesses, revealed, earned: revealed };
}

export function revealNext(state: GameState): GameState {
  if (state.status !== 'playing' || state.revealed >= state.clues.length) return state;
  const revealed = state.revealed + 1;
  return { ...state, revealed, earned: revealed };
}

/** Ends the round unsolved, with every remaining teammate revealed. */
export function giveUp(state: GameState): GameState {
  if (state.status !== 'playing') return state;
  return { ...state, revealed: state.clues.length, status: 'lost' };
}

export function cluesLeft(state: GameState): number {
  return state.clues.length - state.revealed;
}
