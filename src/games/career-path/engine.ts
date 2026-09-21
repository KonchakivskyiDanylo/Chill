import type { MajorResult } from '@/data/liquipedia/majors';
import type { RosterPlayer } from '@/data/liquipedia/roster';
import { makeRng, sample, shuffle } from '@/lib/rng';

/** Pure logic for Career Path. */

export type Mode = 'order' | 'random';

/** Clues in a round. Ten is enough for an arc and short enough to read. */
export const MAX_CLUES = 10;

export interface Clue {
  result: MajorResult;
}

export interface GameState {
  mode: Mode;
  secret: RosterPlayer;
  /** Clues in reveal order. */
  clues: Clue[];
  revealed: number;
  /**
   * How many clues were showing when the round ended.
   *
   * Ending a round turns the whole clue list face up, so `revealed` alone can
   * no longer answer "how much did I actually need". This is the number the
   * score is really made of, and the list dims everything past it.
   */
  earned: number;
  guesses: RosterPlayer[];
  status: 'playing' | 'won' | 'lost';
}

/**
 * How much a result says about a career.
 *
 * Two things make a result worth showing: the event was big, and the player
 * did well. A 91st at a regional qualifier is true and tells you nothing —
 * which was the old game's problem, since it walked the whole career in order
 * and most careers are mostly noise.
 *
 * Prize pool on a log scale so a $15M World Cup outranks a $100k major without
 * drowning it; placement on a log scale too, because the gap between 1st and
 * 4th matters and the gap between 40th and 60th does not.
 */
export function notability(result: MajorResult): number {
  const pool = Math.log10((result.tournament.prizePool ?? 0) + 1);
  const finish = Math.max(0, 6 - Math.log2(Math.max(1, result.placement)));
  return pool + finish;
}

/**
 * The ten results that tell the career as a story.
 *
 * The first major and the most recent one are always in — they are the two
 * that frame everything else, "arrived in 2019" and "still here in 2026". The
 * middle eight come one per equal slice of the span between them, each slice
 * contributing its best result.
 *
 * Slicing by position in the career rather than taking the eight best overall
 * is the whole point: the best eight of a long career cluster in whichever
 * eighteen months the player peaked, and a clue list of five events from 2021
 * reads as a career that started and ended in 2021.
 */
export function careerStory(results: readonly MajorResult[], limit = MAX_CLUES): MajorResult[] {
  if (results.length <= limit) return [...results];

  const first = results[0];
  const last = results[results.length - 1];
  const middle = results.slice(1, -1);
  const slots = limit - 2;

  const picked: MajorResult[] = [];
  for (let slot = 0; slot < slots; slot++) {
    const from = Math.floor((middle.length * slot) / slots);
    const to = Math.floor((middle.length * (slot + 1)) / slots);
    const window = middle.slice(from, to);
    if (window.length === 0) continue;
    picked.push(window.reduce((best, entry) => (notability(entry) > notability(best) ? entry : best)));
  }

  return [first, ...picked, last].sort((a, b) => (a.tournament.date < b.tournament.date ? -1 : 1));
}

/**
 * A round on a secret player the caller has already chosen.
 *
 * The caller picks, because who comes up next is a rotation question (see
 * `games/shared/rotation.ts`) and the rules of the round are not.
 *
 * `results` must be the player's majors oldest first — `Majors.resultsFor`
 * guarantees that. Order walks the career story; Random draws ten at random
 * from the whole career and shuffles them, which is a genuinely different
 * game: no arc to read, just ten facts.
 */
export function createGame(
  secret: RosterPlayer,
  results: readonly MajorResult[],
  mode: Mode,
  seed: string = String(Date.now()),
): GameState | null {
  if (results.length === 0) return null;
  const rng = makeRng(seed);

  const chosen =
    mode === 'order'
      ? careerStory(results)
      : shuffle(rng, sample(rng, results, Math.min(MAX_CLUES, results.length)));

  return {
    mode,
    secret,
    clues: chosen.map((result) => ({ result })),
    revealed: 1,
    earned: 1,
    guesses: [],
    status: 'playing',
  };
}

export function submitGuess(state: GameState, guess: RosterPlayer): GameState {
  if (state.status !== 'playing') return state;
  if (state.guesses.some((g) => g.id === guess.id)) return state;

  const guesses = [...state.guesses, guess];
  // Winning turns the rest of the clue list face up. Getting it in three means
  // seven results you never saw, and they are the payoff for getting it in
  // three — the career you just identified from a quarter of the evidence.
  if (guess.id === state.secret.id) {
    return { ...state, guesses, revealed: state.clues.length, status: 'won' };
  }

  // A wrong guess burns a clue; running out of clues ends the round.
  if (state.revealed >= state.clues.length) return { ...state, guesses, status: 'lost' };
  const revealed = state.revealed + 1;
  return { ...state, guesses, revealed, earned: revealed };
}

/** Voluntarily reveal the next clue without guessing. */
export function revealNext(state: GameState): GameState {
  if (state.status !== 'playing') return state;
  if (state.revealed >= state.clues.length) return state;
  const revealed = state.revealed + 1;
  return { ...state, revealed, earned: revealed };
}

/** Ends the round unsolved, with every remaining clue turned face up. */
export function giveUp(state: GameState): GameState {
  if (state.status !== 'playing') return state;
  return { ...state, revealed: state.clues.length, status: 'lost' };
}

export function cluesLeft(state: GameState): number {
  return state.clues.length - state.revealed;
}
