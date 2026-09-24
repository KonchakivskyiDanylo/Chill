import { ref, type GamePayloads, type Outcome } from '@/analytics/types';
import type { RosterPlayer } from '@/data/liquipedia/roster';
import { makeRng } from '@/lib/rng';
import { normalizeName } from '@/lib/text';

/** Pure Wordle logic over player handles. */

export type TileState = 'correct' | 'present' | 'absent';
export const MAX_GUESSES = 6;

export interface GameState {
  secret: RosterPlayer;
  /** The secret reduced to A-Z0-9 — what the player actually types. */
  answer: string;
  guesses: string[];
  status: 'playing' | 'won' | 'lost';
}

/**
 * Players whose handle makes a fair puzzle once punctuation is stripped.
 *
 * Length is the obvious rule; the other two are answers that are technically
 * guessable and miserable in practice:
 *
 *   - a parenthetical is Liquipedia page bookkeeping, not part of a handle, and
 *     it leaks straight into the answer — "Nate (NA player)" becomes the
 *     twelve-tile word NATENAPLAYER, which no one can be expected to reach.
 *   - one distinct character means the grid gives nothing back. "666" scores
 *     every tile green or every tile grey and the round is a coin flip.
 */
export function eligible(players: readonly RosterPlayer[]): RosterPlayer[] {
  return players.filter((player) => {
    if (/[(）)]/.test(player.name)) return false;
    const key = normalizeName(player.name);
    if (key.length < 3 || key.length > 12) return false;
    return new Set(key).size >= 2;
  });
}

/**
 * A round on a secret player the caller has already chosen.
 *
 * Separate from `createGame` because the board no longer picks: the game deals
 * from a no-repeat rotation (`games/shared/rotation.ts`) and hands the result
 * here, so the choice of player and the rules of the round stay apart.
 */
export function gameFor(secret: RosterPlayer): GameState {
  return { secret, answer: normalizeName(secret.name), guesses: [], status: 'playing' };
}

export function createGame(
  players: readonly RosterPlayer[],
  seed: string = String(Date.now()),
): GameState | null {
  const pool = eligible(players);
  if (pool.length === 0) return null;
  const rng = makeRng(seed);
  return gameFor(pool[Math.floor(rng() * pool.length)]);
}

// ------------------------------------------------------- digit reveals --

/** No digit is given away before this many guesses — see `revealSchedule`. */
export const FIRST_REVEAL = 3;
/** ...and none is held back past this one. */
export const LAST_REVEAL = 5;

/**
 * When each digit in the answer stops being a secret.
 *
 * Digits are the one thing in this game a player cannot reason about. A letter
 * tile tells you something every round — it is in the name, or it is not, or it
 * is somewhere else. A digit tells you nothing until you happen to type it, and
 * 342 of the 5,678 handles have one, so those rounds were a lottery rather than
 * a puzzle: TH0MASHD is unreachable if you never think to try a zero.
 *
 * So they are given, but not before guess three. Digit `k` arrives after guess
 * `3 + k`, and nothing waits past guess five:
 *
 *   one digit      after 3
 *   two digits     after 3, 4
 *   three digits   after 3, 4, 5
 *   four digits    after 3, 4, 5, 5
 *
 * The previous schedule spread the reveals evenly across all six guesses, which
 * handed the first digit of a four-digit handle over before the player had
 * typed anything. Eleven handles carry three digits or more and two carry four
 * (`LEO2004`, `Stef2317`), so that case was rare and, when it came up, gave the
 * round away on sight. Three guesses of nothing is the point: you get half the
 * round to find it yourself, and the same half every time.
 *
 * Returns position in the answer -> guesses required.
 */
export function revealSchedule(answer: string): Map<number, number> {
  const schedule = new Map<number, number>();
  let index = 0;
  for (let i = 0; i < answer.length; i++) {
    if (answer[i] >= '0' && answer[i] <= '9') {
      schedule.set(i, Math.min(FIRST_REVEAL + index, LAST_REVEAL));
      index++;
    }
  }
  return schedule;
}

/**
 * The digits the player can see right now, as position -> character.
 *
 * Empty for the great majority of rounds, whose answers are all letters.
 */
export function revealedDigits(state: GameState): Map<number, string> {
  const shown = new Map<number, string>();
  const done = state.status !== 'playing';
  for (const [position, after] of revealSchedule(state.answer)) {
    if (done || state.guesses.length >= after) shown.set(position, state.answer[position]);
  }
  return shown;
}

/** True when this answer has any digit at all — the hint strip is hidden otherwise. */
export function hasDigits(answer: string): boolean {
  return /[0-9]/.test(answer);
}

/**
 * Standard two-pass Wordle scoring: exact hits first, then misplaced ones
 * against whatever letters are left over, so duplicates behave correctly.
 */
export function scoreGuess(guess: string, answer: string): TileState[] {
  const result: TileState[] = new Array(guess.length).fill('absent');
  const leftover = new Map<string, number>();

  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === answer[i]) {
      result[i] = 'correct';
    } else {
      leftover.set(answer[i], (leftover.get(answer[i]) ?? 0) + 1);
    }
  }
  for (let i = 0; i < guess.length; i++) {
    if (result[i] === 'correct') continue;
    const available = leftover.get(guess[i]) ?? 0;
    if (available > 0) {
      result[i] = 'present';
      leftover.set(guess[i], available - 1);
    }
  }
  return result;
}

export type SubmitResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: string };

export function submitGuess(state: GameState, rawGuess: string): SubmitResult {
  if (state.status !== 'playing') return { ok: false, reason: 'This round is already over.' };

  const guess = normalizeName(rawGuess);
  if (guess.length === 0) {
    return { ok: false, reason: `Type ${state.answer.length} characters first.` };
  }
  // Say what is wrong and by how much, rather than restating the rule: a player
  // two letters short should not have to count the tiles to find that out.
  if (guess.length < state.answer.length) {
    const missing = state.answer.length - guess.length;
    return { ok: false, reason: `${missing} more character${missing === 1 ? '' : 's'} needed.` };
  }
  if (guess.length > state.answer.length) {
    return { ok: false, reason: `Too long — the name is ${state.answer.length} characters.` };
  }
  if (state.guesses.includes(guess)) {
    return { ok: false, reason: `You already tried ${guess}.` };
  }

  const guesses = [...state.guesses, guess];
  const won = guess === state.answer;
  return {
    ok: true,
    state: {
      ...state,
      guesses,
      status: won ? 'won' : guesses.length >= MAX_GUESSES ? 'lost' : 'playing',
    },
  };
}

/** Ends the round unsolved, so the answer can be revealed. */
export function giveUp(state: GameState): GameState {
  return state.status === 'playing' ? { ...state, status: 'lost' } : state;
}

/**
 * Best-known state per character, for colouring the on-screen keyboard.
 *
 * Best, not latest: a character green in one guess stays green even if a later
 * guess puts a second copy of it somewhere the answer does not have one. That
 * second copy is grey on the grid — correctly, there is only one — but greying
 * the key would retract information the player has already earned.
 */
export function keyboardState(state: GameState): Map<string, TileState> {
  const best = new Map<string, TileState>();
  const rank: Record<TileState, number> = { absent: 0, present: 1, correct: 2 };

  for (const guess of state.guesses) {
    const scores = scoreGuess(guess, state.answer);
    guess.split('').forEach((char, index) => {
      const current = best.get(char);
      if (!current || rank[scores[index]] > rank[current]) best.set(char, scores[index]);
    });
  }

  // A revealed digit is a character the player has been *told* is in the answer,
  // at a position they can see. Leaving its key uncoloured made the hint strip
  // and the keyboard disagree about a fact the game had already given away —
  // and the key is where you look before you type.
  for (const char of revealedDigits(state).values()) {
    if (rank[best.get(char) ?? 'absent'] < rank.correct) best.set(char, 'correct');
  }
  return best;
}

/** The round as the analytics record it. Lost with guesses left means given up. */
export function record(state: GameState): { outcome: Outcome; r: GamePayloads['wordle'] } {
  return {
    outcome:
      state.status === 'won' ? 'won' : state.guesses.length >= MAX_GUESSES ? 'lost' : 'gave-up',
    r: { secret: ref(state.secret), guesses: state.guesses.length },
  };
}
