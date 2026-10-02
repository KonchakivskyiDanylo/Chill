import { ref, type ClueRoundPayload, type Outcome, type Ref } from '@/analytics/types';

/**
 * A round of clues revealed one at a time, with a guess allowed after each:
 * the loop Curveball, Org Chart, IRL, Transfer Window and Which Lobby? share.
 *
 * A wrong guess reveals the next clue, and so does skipping. With every clue
 * showing, a wrong guess ends the round — unless the hand is shorter than
 * `minGuesses`, when the difference is made up with guesses that reveal
 * nothing new (Career Path's `MIN_GUESSES`, the same idea).
 *
 * Career Path and Who Are Ya predate this and keep their own copies, which
 * work the same way; the generic one is for games whose secret is not always a
 * player — an organisation, a tournament — so the secret and the guesses are
 * anything with an id and a name.
 */

export interface Named {
  id: string;
  name: string;
}

export interface ClueRound<S extends Named, C> {
  secret: S;
  /** Clues in reveal order. */
  clues: readonly C[];
  /** How many are showing, at least one. */
  revealed: number;
  /**
   * How many were showing when the round ended. Ending turns every clue face
   * up, so `revealed` can no longer say how much you needed; this can, and
   * the board dims everything past it.
   */
  earned: number;
  guesses: Named[];
  /** Everything done, in order, and which clue was newest: a guess, or null for a skip. */
  steps: { clue: number; guess: Named | null }[];
  status: 'playing' | 'won' | 'lost';
  gaveUp: boolean;
  /** Guesses the round always gets, however few clues it has. */
  minGuesses: number;
}

export function startRound<S extends Named, C>(secret: S, clues: readonly C[], minGuesses = 0): ClueRound<S, C> {
  return {
    secret,
    clues,
    revealed: Math.min(1, clues.length),
    earned: Math.min(1, clues.length),
    guesses: [],
    steps: [],
    status: 'playing',
    gaveUp: false,
    minGuesses,
  };
}

function spare(round: ClueRound<Named, unknown>): number {
  return Math.max(0, round.minGuesses - round.clues.length);
}

function wrongAtEnd(round: ClueRound<Named, unknown>): number {
  const last = round.clues.length - 1;
  return round.steps.filter((step) => step.clue === last && step.guess && step.guess.id !== round.secret.id).length;
}

/** Guesses still to come, the one that would end the round included. */
export function guessesLeft(round: ClueRound<Named, unknown>): number {
  return round.clues.length - round.revealed + 1 + spare(round) - wrongAtEnd(round);
}

export function cluesLeft(round: ClueRound<Named, unknown>): number {
  return round.clues.length - round.revealed;
}

/** Any round, with whatever a game keeps beside it (Curveball's mode) carried through. */
type Round = ClueRound<Named, unknown>;

export function guess<R extends Round>(round: R, guessed: Named): R {
  if (round.status !== 'playing') return round;
  if (round.guesses.some((g) => g.id === guessed.id)) return round;
  const guesses = [...round.guesses, guessed];
  const steps = [...round.steps, { clue: round.revealed - 1, guess: guessed }];
  if (guessed.id === round.secret.id) {
    return { ...round, guesses, steps, revealed: round.clues.length, status: 'won' };
  }
  if (round.revealed >= round.clues.length) {
    const next = { ...round, guesses, steps };
    return { ...next, status: wrongAtEnd(next) > spare(next) ? 'lost' : 'playing' };
  }
  const revealed = round.revealed + 1;
  return { ...round, guesses, steps, revealed, earned: revealed };
}

/** The next clue without a guess. */
export function skip<R extends Round>(round: R): R {
  if (round.status !== 'playing' || round.revealed >= round.clues.length) return round;
  const revealed = round.revealed + 1;
  return { ...round, steps: [...round.steps, { clue: round.revealed - 1, guess: null }], revealed, earned: revealed };
}

/** Ends the round unsolved, every clue face up. */
export function giveUp<R extends Round>(round: R): R {
  if (round.status !== 'playing') return round;
  return { ...round, revealed: round.clues.length, status: 'lost', gaveUp: true };
}

/** The round as the analytics record it; each game says how one of its clues reads. */
export function recordRound<S extends Named, C>(
  round: ClueRound<S, C>,
  clueRef: (clue: C, index: number) => Ref,
): { outcome: Outcome; r: ClueRoundPayload } {
  return {
    outcome: round.status === 'won' ? 'won' : round.gaveUp ? 'gave-up' : 'lost',
    r: {
      secret: ref(round.secret),
      clues: round.clues.map(clueRef),
      steps: round.steps.map((step) => ({
        clue: step.clue,
        guess: step.guess ? ref(step.guess) : null,
        correct: step.guess?.id === round.secret.id,
      })),
    },
  };
}
