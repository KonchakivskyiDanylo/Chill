import { loadBios, type Bios } from './bios';
import { useLoaded } from './useLoaded';

/** Real names and organisation stints, loaded on mount. See `useRoster`. */
export function useBios(): { bios: Bios | null; error: string | null } {
  const { value, error } = useLoaded(loadBios, 'Failed to load the player bios');
  return { bios: value, error };
}
