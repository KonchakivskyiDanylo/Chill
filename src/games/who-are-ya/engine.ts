import type { Dataset } from '@/data/dataset';
import type { Player } from '@/data/types';
import { makeRng, shuffle } from '@/lib/rng';

/** Pure logic for Who Are Ya? */

export type Mode = 'easy' | 'hard' | 'random';

export const MAX_CLUES = 10;
/** A secret player needs this many teammates before the round is fair. */
const MIN_CLUES = 6;

export interface TeammateClue {
  player: Player;
  matches: number;
}

export interface GameState {
  mode: Mode;
  secret: Player;
  clues: TeammateClue[];
  revealed: number;
  guesses: Player[];
  status: 'playing' | 'won' | 'lost';
}

export function eligible(dataset: Dataset): Player[] {
  return dataset.players.filter((player) => dataset.teammatesOf(player).length >= MIN_CLUES);
}

/** Match counts are only shown on Easy. */
export function showsMatches(mode: Mode): boolean {
  return mode === 'easy';
}

export function createGame(dataset: Dataset, mode: Mode, seed: string = String(Date.now())): GameState | null {
  const pool = eligible(dataset);
  if (pool.length === 0) return null;

  const rng = makeRng(seed);
  const secret = pool[Math.floor(rng() * pool.length)];

  // The ten most-played tournament teammates.
  const top = dataset.teammatesOf(secret).slice(0, MAX_CLUES);
  // Easy and Hard walk fewest → most, so the strongest hint lands last.
  const ordered = mode === 'random' ? shuffle(rng, top) : [...top].reverse();

  return {
    mode,
    secret,
    clues: ordered.map((entry) => ({ player: entry.player, matches: entry.matches })),
    revealed: 1,
    guesses: [],
    status: 'playing',
  };
}

export function submitGuess(state: GameState, guess: Player): GameState {
  if (state.status !== 'playing') return state;
  if (state.guesses.some((g) => g.id === guess.id)) return state;

  const guesses = [...state.guesses, guess];
  if (guess.id === state.secret.id) return { ...state, guesses, status: 'won' };
  if (state.revealed >= state.clues.length) return { ...state, guesses, status: 'lost' };
  return { ...state, guesses, revealed: state.revealed + 1 };
}

export function revealNext(state: GameState): GameState {
  if (state.status !== 'playing' || state.revealed >= state.clues.length) return state;
  return { ...state, revealed: state.revealed + 1 };
}

export function cluesLeft(state: GameState): number {
  return state.clues.length - state.revealed;
}
