import { loadRoster, type Roster } from './roster';
import { useLoaded } from './useLoaded';

/**
 * The Liquipedia roster, loaded on mount.
 *
 * A hook rather than a provider because only the Liquipedia games read it, and
 * it is pointless to download 3.7 MB of players for the ones that do not. The
 * cache lives in `loadRoster()`, so leaving and re-entering a game is free.
 */
export function useRoster(): { roster: Roster | null; error: string | null } {
  const { value, error } = useLoaded(loadRoster, 'Failed to load the player roster');
  return { roster: value, error };
}
