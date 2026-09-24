import { ref, type GamePayloads, type Outcome } from '@/analytics/types';
import { clueOutcome } from '@/games/career-path/engine';
import type { TeammateClue } from '@/data/liquipedia/teammates';
import type { RosterPlayer } from '@/data/liquipedia/roster';
import { makeRng, randInt, shuffle, type Rng } from '@/lib/rng';

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
  /** Every guess and every skip, with the clue showing at the time — as in Career Path. */
  steps: { clue: number; guess: RosterPlayer | null }[];
  status: 'playing' | 'won' | 'lost';
}

/** Shared-tournament counts are only shown on the first mode. */
export function showsMatches(mode: Mode): boolean {
  return mode === 'easy';
}

/**
 * The ten clues a round is built from, drawn across the whole teammate list.
 *
 * It used to be `clues.slice(0, MAX_CLUES)` — the ten strongest, every time.
 * With `teammates.json` keeping fifty per player that is now a choice rather
 * than the only option, and it was the wrong one: the same secret player dealt
 * the same ten names in the same order every time you met them, so a round was
 * memorable rather than repeatable.
 *
 * The draw keeps the number one teammate — the duo partner is the fact that
 * makes the chain solvable — and takes the other nine one per stratum across
 * everyone else, so a hand looks like 1, 3, 9, 14, 19, 25, 30, 36, 41, 47. That
 * is a spread by construction: you cannot be dealt the ten weakest, and the
 * average clue sits where the average teammate sits.
 */
function draw(clues: readonly TeammateClue[], rng: Rng): TeammateClue[] {
  if (clues.length <= MAX_CLUES) return [...clues];
  const picked = [clues[0]];
  const rest = clues.length - 1;
  const bucket = rest / (MAX_CLUES - 1);
  for (let i = 0; i < MAX_CLUES - 1; i++) {
    const from = 1 + Math.floor(i * bucket);
    const to = Math.min(clues.length - 1, Math.floor(1 + (i + 1) * bucket) - 1);
    picked.push(clues[randInt(rng, from, Math.max(from, to))]);
  }
  return picked;
}

/**
 * A round on a secret player the caller has already chosen.
 *
 * `clues` must be that player's teammates most-shared first, which is how
 * `Teammates.cluesFor` returns them. Ten are drawn from them (see `draw`);
 * Easy and Hard then walk those backwards so the weakest hint lands first and
 * the strongest last, and Random shuffles.
 */
export function createGame(
  secret: RosterPlayer,
  clues: readonly TeammateClue[],
  mode: Mode,
  seed: string = String(Date.now()),
): GameState | null {
  if (clues.length < MIN_CLUES) return null;
  const rng = makeRng(seed);
  const hand = draw(clues, rng);
  const ordered = mode === 'random' ? shuffle(rng, hand) : [...hand].reverse();
  return {
    mode,
    secret,
    clues: ordered,
    revealed: 1,
    earned: 1,
    guesses: [],
    steps: [],
    status: 'playing',
  };
}

export function submitGuess(state: GameState, guess: RosterPlayer): GameState {
  if (state.status !== 'playing') return state;
  if (state.guesses.some((g) => g.id === guess.id)) return state;

  const guesses = [...state.guesses, guess];
  const steps = [...state.steps, { clue: state.revealed - 1, guess }];
  // Winning shows the rest of the clue list — the teammates the round was
  // holding back, not every teammate on record. Ten names you can read against
  // the ones you were given; the full career list was a different question.
  if (guess.id === state.secret.id) {
    return { ...state, guesses, steps, revealed: state.clues.length, status: 'won' };
  }
  if (state.revealed >= state.clues.length) return { ...state, guesses, steps, status: 'lost' };
  const revealed = state.revealed + 1;
  return { ...state, guesses, steps, revealed, earned: revealed };
}

export function revealNext(state: GameState): GameState {
  if (state.status !== 'playing' || state.revealed >= state.clues.length) return state;
  const revealed = state.revealed + 1;
  const steps = [...state.steps, { clue: state.revealed - 1, guess: null }];
  return { ...state, steps, revealed, earned: revealed };
}

/** Ends the round unsolved, with every remaining teammate revealed. */
export function giveUp(state: GameState): GameState {
  if (state.status !== 'playing') return state;
  return { ...state, revealed: state.clues.length, status: 'lost' };
}

export function cluesLeft(state: GameState): number {
  return state.clues.length - state.revealed;
}

/** The round as the analytics record it. A clue is the teammate, not the slot. */
export function record(state: GameState): { outcome: Outcome; r: GamePayloads['who-are-ya'] } {
  return {
    outcome: clueOutcome(state),
    r: {
      secret: ref(state.secret),
      clues: state.clues.map((clue) => ref(clue.player)),
      steps: state.steps.map((step) => ({
        clue: step.clue,
        guess: step.guess ? ref(step.guess) : null,
        correct: step.guess?.id === state.secret.id,
      })),
    },
  };
}
