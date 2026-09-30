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
