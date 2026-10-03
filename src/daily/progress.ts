import { readLocal, useLocalState, writeLocal } from '@/lib/storage';
import { addDays } from './day';
import { DAILY_GAMES, type DailyGame, type DailyResult } from './types';

/**
 * A player's daily history, in this browser only — there are no accounts yet
 * (the user, 3 Oct 2026: "streaks live only in the browser until accounts
 * exist").
 *
 *   daily:<game>       the round in progress or just finished: which day, and
 *                      the game's own snapshot of it, so a reload carries on
 *   daily-log:<game>   every finished day, day -> how it went; streaks and the
 *                      home page read it
 */

export interface SavedRound<Snap> {
  day: string;
  /**
   * The puzzle the round was played on, as its descriptor in JSON. A saved
   * round only comes back onto the same puzzle: the day's set is fixed on the
   * live site, but a dev server can make a different one for the same day.
   */
  puzzle?: string;
  snap: Snap;
}

export type DailyLog = Record<string, DailyResult>;

const EMPTY_LOG: DailyLog = {};

export const roundKey = (game: DailyGame) => `daily:${game}`;
export const logKey = (game: DailyGame) => `daily-log:${game}`;

/** The saved round for `day` and `puzzle`, or null — yesterday's unfinished round is simply dropped. */
export function savedRound<Snap>(game: DailyGame, day: string, puzzle: unknown): Snap | null {
  const saved = readLocal<SavedRound<Snap> | null>(roundKey(game), null);
  return saved && saved.day === day && saved.puzzle === JSON.stringify(puzzle) ? saved.snap : null;
}

export function saveRound<Snap>(game: DailyGame, day: string, puzzle: unknown, snap: Snap): void {
  writeLocal<SavedRound<Snap>>(roundKey(game), { day, puzzle: JSON.stringify(puzzle), snap });
}

/** Writes a finished day once; finishing it again (a reload) changes nothing. */
export function logResult(game: DailyGame, day: string, result: DailyResult): void {
  const log = readLocal<DailyLog>(logKey(game), EMPTY_LOG);
  if (log[day]) return;
  writeLocal(logKey(game), { ...log, [day]: result });
}

export function useDailyLog(game: DailyGame): DailyLog {
  return useLocalState<DailyLog>(logKey(game), EMPTY_LOG)[0];
}

/**
 * Every daily game's log at once, for the home page. One hook per game in a
 * fixed order — `DAILY_GAMES` is a constant, so the order never changes.
 */
export function useDailyLogs(): Record<DailyGame, DailyLog> {
  const out = {} as Record<DailyGame, DailyLog>;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  for (const game of DAILY_GAMES) out[game] = useLocalState<DailyLog>(logKey(game), EMPTY_LOG)[0];
  return out;
}

export interface DailyStats {
  played: number;
  won: number;
  /**
   * Days in a row with the daily played, win or lose, up to today — or up to
   * yesterday while today is still to play, so a streak does not read 0 all
   * morning. A streak counts playing, not winning: a hard day should not undo
   * a month of turning up.
   */
  streak: number;
  best: number;
}

export function statsOf(days: Iterable<string>, today: string, won = 0): DailyStats {
  const set = new Set(days);
  let streak = 0;
  let cursor = set.has(today) ? today : addDays(today, -1);
  while (set.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  let best = 0;
  for (const day of set) {
    if (set.has(addDays(day, -1))) continue;
    let run = 0;
    for (let at = day; set.has(at); at = addDays(at, 1)) run++;
    best = Math.max(best, run);
  }
  return { played: set.size, won, streak, best };
}

export function gameStats(log: DailyLog, today: string): DailyStats {
  return statsOf(
    Object.keys(log),
    today,
    Object.values(log).filter((entry) => entry.outcome === 'won' || entry.outcome === 'cleared').length,
  );
}
