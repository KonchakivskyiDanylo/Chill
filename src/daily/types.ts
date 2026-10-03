import type { Rng } from '@/lib/rng';
import type { RosterPlayer } from '@/data/liquipedia/roster';

/**
 * The daily puzzles: one per game per day, the same for everyone.
 *
 * A day's puzzles are a `DailySet` — for each game a small descriptor naming
 * what to play (a secret player and the clues in order, a Tenaball board, the
 * six rules of a grid), never the puzzle itself. The server makes the set the
 * first time anyone asks for a day and keeps it, so a deploy or a data update
 * at noon cannot swap the puzzle under the people who have not played it yet
 * (`server/index.ts`, `GET /api/daily/<day>`). Each game rebuilds its round
 * from the descriptor (`games/<game>/daily.ts`).
 */

/** The games with a daily puzzle. Higher or Lower stays an endless run. */
export const DAILY_GAMES = ['wordle', 'career-path', 'who-are-ya', 'tenaball', 'list', 'tic-tac-toe'] as const;

export type DailyGame = (typeof DAILY_GAMES)[number];

export interface DailyPuzzles {
  wordle: { secret: string };
  /** `clues` are tournament names, in the order they are revealed. */
  'career-path': { secret: string; clues: string[] };
  /** `clues` are teammate ids, in the order they are revealed. */
  'who-are-ya': { secret: string; clues: string[] };
  /** `sig` fingerprints who was on the board that day (`reuse.ts`), so a changed board can come back. */
  tenaball: { board: string; sig?: string };
  list: { list: string; sig?: string };
  'tic-tac-toe': { rows: string[]; cols: string[] };
}

export interface DailySet {
  /** The day, "YYYY-MM-DD" in Central European time (`day.ts`). */
  day: string;
  /**
   * One per game. A game missing here could not be made that day — the data it
   * needs was absent — and its page says so instead of inventing a puzzle.
   */
  puzzles: Partial<DailyPuzzles>;
}

/** What a game's daily picker gets to choose with. */
export interface DailyContext {
  day: string;
  /** The seed string for one purpose — for an engine that takes a seed of its own. */
  seed: (purpose: string) => string;
  /** A generator of its own per purpose, so adding a draw in one game moves nothing in another. */
  rng: (purpose: string) => Rng;
  /**
   * The secret player for a one-player game: famous or a regular (`DAILY_MIX`),
   * never one dealt in another game the same day, and not one from the recent
   * past while anyone else is left.
   */
  pickPlayer: (game: DailyGame, pool: readonly RosterPlayer[]) => RosterPlayer | null;
  /**
   * This game's descriptors on the days around this one, nearest first, with how
   * many days away each is — before or after, for a schedule made ahead.
   */
  recent: <G extends DailyGame>(game: G) => { daysAgo: number; puzzle: DailyPuzzles[G] }[];
}

/** How a game's daily round went, kept in the browser for streaks and the home page. */
export interface DailyResult {
  outcome: 'won' | 'lost' | 'gave-up' | 'cleared';
  /** The headline, e.g. "4/6", "7/10", "23 names". */
  score: string;
}
