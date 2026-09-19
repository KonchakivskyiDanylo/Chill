import { loadMajors, type Majors } from './majors';
import { useLoaded } from './useLoaded';

/** The Career Path majors, loaded on mount. See `useRoster`. */
export function useMajors(): { majors: Majors | null; error: string | null } {
  const { value, error } = useLoaded(
    loadMajors,
    'Failed to load the tournament results — has career_path.json been generated?',
  );
  return { majors: value, error };
}
