import type { Majors } from '@/data/liquipedia/majors';
import type { Roster, RosterPlayer } from '@/data/liquipedia/roster';
import { reviveClues, type ClueSnapshot } from '@/daily/clue-round';
import type { DailyContext, DailyPuzzles } from '@/daily/types';
import { levelPlayers } from '@/games/shared/levels';
import { createGame, roundOf, type GameState, type Mode } from './engine';

/** The daily career reads oldest first, the way the game opens by default. */
export const DAILY_MODE: Mode = 'order';

type Puzzle = DailyPuzzles['career-path'];

export function pickDaily(roster: Roster, majors: Majors, ctx: DailyContext): Puzzle | null {
  const secret = ctx.pickPlayer('career-path', levelPlayers(roster, 'medium', majors.eligible));
  if (!secret) return null;
  const round = createGame(secret, majors.resultsFor(secret.id), DAILY_MODE, majors, `daily:${ctx.day}:career-path`);
  if (!round) return null;
  return { secret: secret.id, clues: round.clues.map((clue) => clue.result.tournament.name) };
}

/**
 * The round from the descriptor's own clues, so a later change to how clues
 * are chosen cannot change a day that has already been played. Null when the
 * data no longer has one of them.
 */
export function restoreDaily(
  puzzle: Puzzle,
  majors: Majors,
  byId: ReadonlyMap<string, RosterPlayer>,
  saved: ClueSnapshot | null,
): GameState | null {
  const secret = byId.get(puzzle.secret);
  if (!secret) return null;
  const results = new Map(majors.resultsFor(secret.id).map((result) => [result.tournament.name, result]));
  const clues = puzzle.clues.map((name) => results.get(name));
  if (clues.length === 0 || clues.some((clue) => !clue)) return null;
  const fresh = roundOf(secret, clues as NonNullable<(typeof clues)[number]>[], DAILY_MODE);
  return saved ? (reviveClues(fresh, saved, byId) ?? fresh) : fresh;
}
