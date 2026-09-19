import { loadTeammates, type Teammates } from './teammates';
import { useLoaded } from './useLoaded';

/** The Who Are Ya teammate counts, loaded on mount. See `useRoster`. */
export function useTeammates(): { teammates: Teammates | null; error: string | null } {
  const { value, error } = useLoaded(
    loadTeammates,
    'Failed to load the teammate counts — has teammates.json been generated?',
  );
  return { teammates: value, error };
}
