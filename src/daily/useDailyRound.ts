import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalState } from '@/lib/storage';
import { useDailySet } from './client';
import { DAILY_START, puzzleNumber } from './day';
import { logResult, savedRound, saveRound } from './progress';
import type { DailyGame, DailyPuzzles, DailyResult } from './types';
import { useToday } from './useDay';

/**
 * Daily or practice.
 *
 * The live site is daily only (the user, 3 Oct 2026: "I would probably have
 * only daily puzzles, setup is only for dev") from `DAILY_START` on — before
 * it, it plays as it always did, and it turns daily by itself at midnight on
 * the day (the user: "let's start it actually on 5th October"). A dev server
 * keeps the setup screens behind a toggle in each game's toolbar, for working
 * on the games; the choice is remembered in the browser.
 */
export const DEV_TOGGLE = import.meta.env?.DEV === true;

export function usePlayMode(): [daily: boolean, setDaily: (daily: boolean) => void] {
  const [mode, setMode] = useLocalState<'daily' | 'practice'>('dev:play-mode', 'daily');
  const today = useToday();
  const set = useCallback((daily: boolean) => setMode(daily ? 'daily' : 'practice'), [setMode]);
  return [DEV_TOGGLE ? mode === 'daily' : today >= DAILY_START, set];
}

export interface DailyRound<S> {
  /** The round, once the day's puzzle and the game's data are both in. */
  state: S | null;
  setState: (next: S) => void;
  /**
   * `loading` until the round exists; `missing` when today has no puzzle for
   * this game or the data can no longer rebuild it; `error` when the puzzles
   * did not load.
   */
  status: 'off' | 'loading' | 'ready' | 'missing' | 'error';
  error: string | null;
  day: string;
  number: number;
  /**
   * True once the round has ended while this page was open. A round that was
   * already over when the page loaded was recorded the first time, so the
   * analytics recorder waits on this rather than on the round being over.
   */
  endedHere: boolean;
}

/**
 * The day's round for one game: rebuilt from the day's descriptor, carried on
 * from the browser's saved copy, and saved again on every move.
 *
 * `restore` is only called once `ready` is true — the game's own data loaded —
 * and again when the day turns over with the page open.
 */
export function useDailyRound<G extends DailyGame, S, Snap>(
  game: G,
  options: {
    on: boolean;
    ready: boolean;
    restore: (puzzle: DailyPuzzles[G], saved: Snap | null) => S | null;
    snapshot: (state: S) => Snap;
    finished: (state: S) => boolean;
    result: (state: S) => DailyResult;
  },
): DailyRound<S> {
  const day = useToday();
  const { set, error } = useDailySet(options.on ? day : null);
  const [round, setRound] = useState<{ day: string; state: S | null } | null>(null);
  const [endedHere, setEndedHere] = useState(false);
  const latest = useRef(options);
  latest.current = options;

  const puzzle = set?.puzzles[game] as DailyPuzzles[G] | undefined;
  useEffect(() => {
    if (!options.on || !options.ready || !set) return;
    const restored = puzzle ? latest.current.restore(puzzle, savedRound<Snap>(game, day, puzzle)) : null;
    setRound({ day, state: restored });
    setEndedHere(false);
  }, [options.on, options.ready, set, puzzle, game, day]);

  const current = round && round.day === day ? round : null;
  const shown = useRef<S | null>(null);
  shown.current = current?.state ?? null;

  const setState = useCallback(
    (next: S) => {
      const { snapshot, finished, result } = latest.current;
      const was = shown.current;
      if (was && !finished(was) && finished(next)) setEndedHere(true);
      shown.current = next;
      setRound({ day, state: next });
      saveRound(game, day, puzzle, snapshot(next));
      if (finished(next)) logResult(game, day, result(next));
    },
    [game, day, puzzle],
  );

  const status: DailyRound<S>['status'] = !options.on
    ? 'off'
    : error
      ? 'error'
      : !current
        ? 'loading'
        : current.state
          ? 'ready'
          : 'missing';
  return { state: current?.state ?? null, setState, status, error, day, number: puzzleNumber(day), endedHere };
}
