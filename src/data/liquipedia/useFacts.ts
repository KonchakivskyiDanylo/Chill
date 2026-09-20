import { loadFacts, type Facts } from './facts';
import { useLoaded } from './useLoaded';

/** The career facts behind the criteria games, loaded on mount. See `useRoster`. */
export function useFacts(): { facts: Facts | null; error: string | null } {
  const { value, error } = useLoaded(
    loadFacts,
    'Failed to load the career facts — has facts.json been generated?',
  );
  return { facts: value, error };
}
