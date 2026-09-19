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
  return best;
}
