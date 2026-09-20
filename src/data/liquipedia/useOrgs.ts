import { loadOrgs, type Orgs } from './orgs';
import { useLoaded } from './useLoaded';

/** The organisations behind the criteria games, loaded on mount. See `useRoster`. */
export function useOrgs(): { orgs: Orgs | null; error: string | null } {
  const { value, error } = useLoaded(
    loadOrgs,
    'Failed to load the organisations — has orgs.json been generated?',
  );
  return { orgs: value, error };
}
