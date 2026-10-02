import type { FameTier, Roster, RosterPlayer } from '@/data/liquipedia/roster';
import { readLocal, writeLocal } from '@/lib/storage';
import { deal } from './rotation';

/**
 * The one Easy / Medium / Hard of the games added in October 2026 — Curveball,
 * Contextinho, IRL, Transfer Window, Org Chart, Rewind, Which Lobby? — which
 * open on `LevelSetup` like Pyramid and Bingo rather than on the shared
 * Random / Choose picker.
 *
 * The roadmap for them asked for player pools that widen: Easy the
 * recognisable names, Medium a broader pool of the scene, Hard anyone on
 * record — so the bands add up rather than slice the roster the way the
 * picker's tiers do. Hard can and will deal someone only the scene knows.
 */
export type Level = 'easy' | 'medium' | 'hard';

export const LEVEL_IDS: Level[] = ['easy', 'medium', 'hard'];

export const LEVEL_BANDS: Record<Level, FameTier[]> = {
  easy: ['easy'],
  medium: ['easy', 'medium'],
  hard: ['easy', 'medium', 'hard'],
};

export const LEVEL_LABEL: Record<Level, string> = {
  easy: '🟢 Easy',
  medium: '🟡 Medium',
  hard: '🔴 Hard',
};

/** The roster players a level may deal, through the game's own filter. */
export function levelPlayers(
  roster: Roster,
  level: Level,
  eligible: (players: RosterPlayer[]) => RosterPlayer[] = (players) => players,
): RosterPlayer[] {
  return LEVEL_BANDS[level].flatMap((band) => roster.exactly(band, { eligible }));
}

/**
 * Deals the next secret from a pool without repeats, the bag kept in the
 * browser under the game and whatever else changes who is in it (the level,
 * a mode). See `rotation.ts`.
 */
export function dealFresh<T extends { id: string }>(game: string, scope: readonly string[], pool: readonly T[]): T | null {
  const key = `seen:${game}:${scope.join(':')}`;
  const drawn = deal(pool, readLocal<string[]>(key, []));
  if (!drawn) return null;
  writeLocal(key, drawn.seen);
  return drawn.pick;
}
