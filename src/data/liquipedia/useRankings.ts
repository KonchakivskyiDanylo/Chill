import { loadRankings, type Rankings } from './rankings';
import { useLoaded } from './useLoaded';

/** The Tenaball boards, loaded on mount. See `useRoster`. */
export function useRankings(): { rankings: Rankings | null; error: string | null } {
  const { value, error } = useLoaded(
    loadRankings,
    'Failed to load the leaderboards — has rankings.json been generated?',
  );
  return { rankings: value, error };
}
