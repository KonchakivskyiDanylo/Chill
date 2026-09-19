import type { MajorResult } from '@/data/liquipedia/majors';
import type { RosterPlayer } from '@/data/liquipedia/roster';
import { makeRng, shuffle } from '@/lib/rng';

/** Pure logic for Career Path. */

export type Mode = 'order' | 'random';

/**
 * Every major the player reached, up to this many.
 *
 * The cap is a display limit, not a rule: on the current export the longest
 * path is EpikWhale's 34 and exactly 3 of the 1,175 answerable players go past
 * 30, so it almost never bites. It exists so a future export with a longer
 * record cannot produce a hundred-row clue list.
 */
export const MAX_CLUES = 30;

export interface Clue {
  result: MajorResult;
}

export interface GameState {
  mode: Mode;
  secret: RosterPlayer;
  /** Clues in reveal order. */
  clues: Clue[];
  revealed: number;
  guesses: RosterPlayer[];
  status: 'playing' | 'won' | 'lost';
}

/**
 * A round on a secret player the caller has already chosen.
 *
 * The caller picks, because who comes up next is a rotation question (see
 * `games/shared/rotation.ts`) and the rules of the round are not.
 *
 * `results` must be the player's majors oldest first — `Majors.resultsFor`
 * guarantees that. Order mode walks them as they are; Random shuffles. When a
 * career is longer than `MAX_CLUES` the *most recent* majors are kept, because
 * a path that stops short of where someone got to reads as a career that
 * stopped there.
 */
export function createGame(
  secret: RosterPlayer,
  results: readonly MajorResult[],
  mode: Mode,
  seed: string = String(Date.now()),
): GameState | null {
  if (results.length === 0) return null;
  const rng = makeRng(seed);
  const trimmed = results.slice(-MAX_CLUES).map((result) => ({ result }));
  return {
    mode,
    secret,
    clues: mode === 'order' ? trimmed : shuffle(rng, trimmed),
    revealed: 1,
    guesses: [],
    status: 'playing',
  };
}

export function submitGuess(state: GameState, guess: RosterPlayer): GameState {
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
