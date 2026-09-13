import { Dataset } from './dataset';
import type { EventEntry, Player, TournamentEvent } from './types';

/**
 * The single seam between the games and wherever player data comes from.
 *
 * Today it is satisfied by the generated tables under `data/fortnite/`. To go
 * live, write an `ApiPlayerRepository` that fetches from your own backend,
 * return it from `getRepository()`, and every game keeps working.
 */
export interface PlayerRepository {
  getPlayers(): Promise<Player[]>;
  getEvents(): Promise<TournamentEvent[]>;
  getEntries(): Promise<EventEntry[]>;
}

class FortnitePlayerRepository implements PlayerRepository {
  async getPlayers(): Promise<Player[]> {
    const { FORTNITE_PLAYERS } = await import('./fortnite/build');
    return FORTNITE_PLAYERS;
  }

  async getEvents(): Promise<TournamentEvent[]> {
    const { FORTNITE_EVENTS } = await import('./fortnite/build');
    return FORTNITE_EVENTS;
  }

  async getEntries(): Promise<EventEntry[]> {
    const { FORTNITE_ENTRIES } = await import('./fortnite/build');
    return FORTNITE_ENTRIES;
  }
}

let repository: PlayerRepository = new FortnitePlayerRepository();

export function getRepository(): PlayerRepository {
  return repository;
}

/** Test/bootstrap hook for pointing the site at a different data source. */
export function setRepository(next: PlayerRepository): void {
  repository = next;
}

let cached: Promise<Dataset> | null = null;

/** Loads (once) and indexes the dataset every game queries. */
export function loadDataset(): Promise<Dataset> {
  if (!cached) {
    cached = (async () => {
      const repo = getRepository();
      const [players, events, entries] = await Promise.all([
        repo.getPlayers(),
        repo.getEvents(),
        repo.getEntries(),
      ]);
      return new Dataset(players, events, entries);
    })();
  }
  return cached;
}
