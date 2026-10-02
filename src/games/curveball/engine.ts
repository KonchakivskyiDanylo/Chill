import type { ClueRoundPayload, Outcome } from '@/analytics/types';
import type { RosterPlayer } from '@/data/liquipedia/roster';
import { moneyShort } from '@/lib/format';
import { recordRound, startRound, type ClueRound } from '@/games/shared/clue-round';

/**
 * Pure logic for Curveball: a player's prize money drawn as a curve, one year
 * at a time, until you name them.
 *
 * Built to the user's roadmap (2 Oct 2026). Its V1 is the reveal loop, V2 the
 * graph, V3 the three pools. The roadmap's second curve, PR, is Fortnite
 * Tracker's power ranking and nowhere in the Liquipedia export; a world rank
 * by prize money stood in for it briefly and was dropped at the user's word —
 * one curve, earnings.
 */

/** Years with prize money a curve needs: two points are a line, not a curve. */
export const MIN_YEARS = 3;

/** Guesses a round always gets, so a three-year curve is not three guesses. */
export const MIN_GUESSES = 5;

export interface Point {
  year: number;
  /** Prize money that calendar year, 0 for a year in the middle with none. */
  earnings: number;
}

/** The years a player earned prize money, oldest first. */
function moneyYears(player: RosterPlayer): number[] {
  return Object.keys(player.earningsByYear)
    .map(Number)
    .filter((year) => player.earningsByYear[year] > 0)
    .sort((a, b) => a - b);
}

/**
 * The curve: every year from the first with prize money to the last, the
 * empty years between included — a gap year is part of the shape.
 */
export function curveOf(player: RosterPlayer): Point[] {
  const years = moneyYears(player);
  if (years.length === 0) return [];
  const out: Point[] = [];
  for (let year = years[0]; year <= years[years.length - 1]; year++) {
    out.push({ year, earnings: player.earningsByYear[year] ?? 0 });
  }
  return out;
}

/** Players with a curve worth drawing. */
export function eligible(players: readonly RosterPlayer[]): RosterPlayer[] {
  return players.filter((player) => moneyYears(player).length >= MIN_YEARS);
}

export type GameState = ClueRound<RosterPlayer, Point>;

export function createGame(secret: RosterPlayer): GameState {
  return startRound(secret, curveOf(secret), MIN_GUESSES);
}

/** One point as the curve labels it. */
export function pointLabel(point: Point): string {
  return point.earnings > 0 ? moneyShort(point.earnings) : '$0';
}

export function record(state: GameState): { outcome: Outcome; r: ClueRoundPayload } {
  return recordRound(state, (point) => ({ id: String(point.year), name: `${point.year} — ${pointLabel(point)}` }));
}
