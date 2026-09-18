import type { Dataset } from '@/data/dataset';
import type { Player } from '@/data/types';
import { makeRng, shuffle } from '@/lib/rng';

/** Pure logic for Who Are Ya? */

export type Mode = 'easy' | 'hard' | 'random';

export const MAX_CLUES = 10;
/**
 * A secret player needs this many recorded teammates before the round is fair.
 *
 * The dataset records the rosters that won events, so even a decorated player
 * tops out at around eight distinct teammates; three is the point where the
 * clue chain still narrows to one person.
 */
export const MIN_CLUES = 3;

export interface TeammateClue {
  player: Player;
  /** Tournaments the clue player and the secret player entered together. */
  events: number;
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

/** Shared-event counts are only shown on Easy. */
export function showsMatches(mode: Mode): boolean {
  return mode === 'easy';
}

export function createGame(dataset: Dataset, mode: Mode, seed: string = String(Date.now())): GameState | null {
  const pool = eligible(dataset);
  if (pool.length === 0) return null;

  const rng = makeRng(seed);
  const secret = pool[Math.floor(rng() * pool.length)];

  // The ten teammates they share the most tournaments with.
  const top = dataset.teammatesOf(secret).slice(0, MAX_CLUES);
  // Easy and Hard walk fewest → most, so the strongest hint lands last.
  const ordered = mode === 'random' ? shuffle(rng, top) : [...top].reverse();

  return {
    mode,
    secret,
    clues: ordered.map((entry) => ({ player: entry.player, events: entry.events })),
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

/** Ends the round unsolved, with every remaining teammate revealed. */
export function giveUp(state: GameState): GameState {
  if (state.status !== 'playing') return state;
  return { ...state, revealed: state.clues.length, status: 'lost' };
}

export function cluesLeft(state: GameState): number {
  return state.clues.length - state.revealed;
}
