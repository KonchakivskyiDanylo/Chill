import { useCallback } from 'react';
import type { GameId } from '@/analytics/types';
import { useLocalState } from '@/lib/storage';

/**
 * Which puzzles you have played, per game, on this device.
 *
 * Keyed by a puzzle id the game chooses: a Tenaball board or a List category
 * today, and a date once the games go one-a-day — so yesterday's puzzle in an
 * archive can still say you played it.
 *
 * Only two states are stored. "Not played" is the absence of an entry, and a
 * completed puzzle never goes back to "tried": replaying a board you once
 * cleared and giving up does not take the green away.
 */
export type PuzzleStatus = 'won' | 'tried';

type Progress = Record<string, PuzzleStatus>;

const EMPTY: Progress = {};

/**
 * A random puzzle for the Random button: one not played yet if any are left,
 * else one only tried, else any.
 */
export function pickFresh<T extends { id: string }>(
  puzzles: readonly T[],
  statusOf: (puzzle: string) => PuzzleStatus | null,
  rng: () => number = Math.random,
): T | null {
  for (const wanted of [null, 'tried', 'won'] as const) {
    const left = puzzles.filter((puzzle) => statusOf(puzzle.id) === wanted);
    if (left.length > 0) return left[Math.floor(rng() * left.length)];
  }
  return null;
}

export function useProgress(game: GameId): {
  statusOf: (puzzle: string) => PuzzleStatus | null;
  /** Records a finished round. Safe to call again with the same result. */
  mark: (puzzle: string, won: boolean) => void;
} {
  const [progress, setProgress] = useLocalState<Progress>(`progress:${game}`, EMPTY);

  const statusOf = useCallback((puzzle: string) => progress[puzzle] ?? null, [progress]);

  const mark = useCallback(
    (puzzle: string, won: boolean) => {
      const upgrade = (was: PuzzleStatus | undefined): PuzzleStatus =>
        won || was === 'won' ? 'won' : 'tried';
      // Checked first so a repeat call writes nothing and re-renders nobody.
      if (progress[puzzle] === upgrade(progress[puzzle])) return;
      setProgress((all) => ({ ...all, [puzzle]: upgrade(all[puzzle]) }));
    },
    [progress, setProgress],
  );

  return { statusOf, mark };
}
