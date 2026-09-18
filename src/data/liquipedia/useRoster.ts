import { useEffect, useState } from 'react';
import { loadRoster, type Roster } from './roster';

interface RosterState {
  roster: Roster | null;
  error: string | null;
}

/**
 * The Liquipedia roster, loaded on mount.
 *
 * A hook rather than a provider because only one game reads it, and it is
 * pointless to download 1.3 MB of players for the other nine. The cache lives
 * in `loadRoster()`, so leaving and re-entering the game is free.
 */
export function useRoster(): RosterState {
  const [state, setState] = useState<RosterState>({ roster: null, error: null });

  useEffect(() => {
    let cancelled = false;
    loadRoster().then(
      (roster) => {
        if (!cancelled) setState({ roster, error: null });
      },
      (err: unknown) => {
        if (!cancelled) {
          setState({
            roster: null,
            error: err instanceof Error ? err.message : 'Failed to load the player roster',
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
