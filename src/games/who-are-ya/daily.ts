import type { Facts } from '@/data/liquipedia/facts';
import type { Roster, RosterPlayer } from '@/data/liquipedia/roster';
import type { Teammates } from '@/data/liquipedia/teammates';
import { reviveClues, type ClueSnapshot } from '@/daily/clue-round';
import type { DailyContext, DailyPuzzles } from '@/daily/types';
import { levelPlayers } from '@/games/shared/levels';
import { createGame, MIN_CLUES, MIN_TOURNAMENTS, roundOf, usableClues, type GameState, type Mode } from './engine';

/** Counts shown, weakest teammate first — the game's default order. */
export const DAILY_MODE: Mode = 'easy';

type Puzzle = DailyPuzzles['who-are-ya'];

/** The same bar the game sets on the whole roster: enough teammates and enough majors. */
export function canBeAnswer(
  teammates: Teammates,
  facts: Facts,
  byId: ReadonlyMap<string, RosterPlayer>,
): (players: RosterPlayer[]) => RosterPlayer[] {
  return (players) =>
    players.filter(
      (player) =>
        usableClues(teammates.cluesFor(player.id, byId)).length >= MIN_CLUES &&
        facts.of(player.id).apps >= MIN_TOURNAMENTS,
    );
}

export function pickDaily(
  roster: Roster,
  teammates: Teammates,
  facts: Facts,
  byId: ReadonlyMap<string, RosterPlayer>,
  ctx: DailyContext,
): Puzzle | null {
  const secret = ctx.pickPlayer('who-are-ya', dailyPool(roster, teammates, facts, byId));
  return secret ? puzzleFor(secret, teammates, byId, ctx.seed('who-are-ya')) : null;
}

/** Who the daily may be about — also what the schedule editor offers. */
export function dailyPool(
  roster: Roster,
  teammates: Teammates,
  facts: Facts,
  byId: ReadonlyMap<string, RosterPlayer>,
): RosterPlayer[] {
  return levelPlayers(roster, 'medium', canBeAnswer(teammates, facts, byId));
}

/** The puzzle on a secret already chosen: its teammates, drawn and ordered. */
export function puzzleFor(
  secret: RosterPlayer,
  teammates: Teammates,
  byId: ReadonlyMap<string, RosterPlayer>,
  seed: string,
): Puzzle | null {
  const round = createGame(secret, teammates.cluesFor(secret.id, byId), DAILY_MODE, seed);
  return round ? { secret: secret.id, clues: round.clues.map((clue) => clue.player.id) } : null;
}

export function restoreDaily(
  puzzle: Puzzle,
  teammates: Teammates,
  byId: ReadonlyMap<string, RosterPlayer>,
  saved: ClueSnapshot | null,
): GameState | null {
  const secret = byId.get(puzzle.secret);
  if (!secret) return null;
  const all = new Map(teammates.cluesFor(secret.id, byId).map((clue) => [clue.player.id, clue]));
  const clues = puzzle.clues.map((id) => all.get(id));
  if (clues.length === 0 || clues.some((clue) => !clue)) return null;
  const fresh = roundOf(secret, clues as NonNullable<(typeof clues)[number]>[], DAILY_MODE);
  return saved ? (reviveClues(fresh, saved, byId) ?? fresh) : fresh;
}
