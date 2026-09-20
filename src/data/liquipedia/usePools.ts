import { loadPools, type Pools } from './pools';
import { useLoaded } from './useLoaded';

/**
 * The event-scoped pools, loaded on mount.
 *
 * Never errors — `loadPools` falls back to an empty set — so a game can offer
 * pools when they exist and simply not mention them when they do not.
 */
export function usePools(): { pools: Pools | null } {
  const { value } = useLoaded(loadPools, 'Failed to load the event pools');
  return { pools: value };
}
