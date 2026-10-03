import type { Roster } from '@/data/liquipedia/roster';
import type { DailyContext, DailyPuzzles, DailyResult } from '@/daily/types';
import { levelPlayers } from '@/games/shared/levels';
import { eligible, gameFor, MAX_GUESSES, scoreGuess, type GameState } from './engine';

/**
 * Fortnitedle's daily puzzle: one name for everyone, from the famous names and
 * the regulars, with Medium's digit help — a # where a digit sits, from guess
 * three.
 */
export const DAILY_LEVEL = 'medium' as const;

type Puzzle = DailyPuzzles['wordle'];

/** Everything the round needs to come back after a reload. */
export interface Snapshot {
  guesses: string[];
  status: GameState['status'];
}

export function pickDaily(roster: Roster, ctx: DailyContext): Puzzle | null {
  const secret = ctx.pickPlayer('wordle', levelPlayers(roster, 'medium', eligible));
  return secret ? { secret: secret.id } : null;
}

export function restoreDaily(puzzle: Puzzle, roster: Roster, saved: Snapshot | null): GameState | null {
  const secret = roster.players.find((player) => player.id === puzzle.secret);
  if (!secret) return null;
  const fresh = gameFor(secret, DAILY_LEVEL);
  return saved ? { ...fresh, guesses: saved.guesses, status: saved.status } : fresh;
}

export function snapshot(state: GameState): Snapshot {
  return { guesses: state.guesses, status: state.status };
}

export function result(state: GameState): DailyResult {
  const won = state.status === 'won';
  return {
    outcome: won ? 'won' : state.guesses.length >= MAX_GUESSES ? 'lost' : 'gave-up',
    score: `${won ? state.guesses.length : 'X'}/${MAX_GUESSES}`,
  };
}

const TILE = { correct: '🟩', present: '🟨', absent: '⬛' } as const;

/** Wordle's own grid: one row of tiles per guess, letters left out. */
export function shareGrid(state: GameState): string[] {
  return state.guesses.map((guess) =>
    scoreGuess(guess, state.answer)
      .map((tile) => TILE[tile])
      .join(''),
  );
}
