import type { Player } from '@/data/types';
import { makeRng } from '@/lib/rng';
import { normalizeName } from '@/lib/text';

/** Pure Wordle logic over player handles. */

export type TileState = 'correct' | 'present' | 'absent';
export const MAX_GUESSES = 6;

export interface GameState {
  secret: Player;
  /** The secret reduced to A-Z0-9 — what the player actually types. */
  answer: string;
  guesses: string[];
  status: 'playing' | 'won' | 'lost';
}

/** Players whose handle makes a fair puzzle once spaces are stripped. */
export function eligible(players: readonly Player[]): Player[] {
  return players.filter((player) => {
    const key = normalizeName(player.name);
    return key.length >= 3 && key.length <= 12;
  });
}

export function createGame(players: readonly Player[], seed: string = String(Date.now())): GameState | null {
  const pool = eligible(players);
  if (pool.length === 0) return null;
  const rng = makeRng(seed);
  const secret = pool[Math.floor(rng() * pool.length)];
  return { secret, answer: normalizeName(secret.name), guesses: [], status: 'playing' };
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
  if (guess.length !== state.answer.length) {
    return { ok: false, reason: `Needs to be ${state.answer.length} characters.` };
  }
  if (state.guesses.includes(guess)) {
    return { ok: false, reason: 'You already tried that.' };
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

/** Best-known state per character, for colouring the on-screen keyboard. */
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
