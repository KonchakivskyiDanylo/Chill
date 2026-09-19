import { useEffect, useState } from 'react';

/**
 * A module-cached loader, resolved on mount.
 *
 * The Liquipedia files are per-game rather than app-wide — it is pointless to
 * download a megabyte of teammates for the eight games that never read them —
 * so each has a `loadX()` with its own cache and a hook that waits on it.
 * This is the waiting part, once, for all of them.
 */
export interface Loaded<T> {
  value: T | null;
  error: string | null;
}

export function useLoaded<T>(load: () => Promise<T>, fallbackMessage: string): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ value: null, error: null });

  useEffect(() => {
    let cancelled = false;
    load().then(
      (value) => {
        if (!cancelled) setState({ value, error: null });
      },
      (err: unknown) => {
        if (!cancelled) {
          setState({ value: null, error: err instanceof Error ? err.message : fallbackMessage });
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // Runs once. `load` is always a module-level function over a module-level
    // cache, so re-running it on identity would only ever re-resolve the same
    // promise — and would loop forever if a caller ever passed an inline one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
