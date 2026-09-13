import { useCallback, useEffect, useState } from 'react';

/**
 * localStorage with graceful degradation — private windows, blocked site data
 * and quota errors must never break a game, they just lose persistence.
 */

const PREFIX = 'chillfn:';

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeLocal<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — carry on without persistence */
  }
}

/** State backed by localStorage. */
export function useLocalState<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readLocal(key, initial));

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        writeLocal(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [value, update];
}

/**
 * A best score that only ever moves up. `scope` lets one game keep separate
 * records per category/difficulty.
 */
export function useBestScore(scope: string): { best: number; submit: (score: number) => boolean } {
  const key = `best:${scope}`;
  const [best, setBest] = useState<number>(() => readLocal(key, 0));

  useEffect(() => {
    setBest(readLocal(key, 0));
  }, [key]);

  const submit = useCallback(
    (score: number) => {
      if (score <= best) return false;
      writeLocal(key, score);
      setBest(score);
      return true;
    },
    [key, best],
  );

  return { best, submit };
}
