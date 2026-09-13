import { Dataset } from './dataset';
import type { Player, TournamentEvent } from './types';

/**
 * The single seam between the games and wherever player data comes from.
 *
 * Today it is satisfied by a generated sample dataset. To go live, write an
 * `ApiPlayerRepository` that fetches from Liquipedia / Fortnite Tracker / your
 * own backend, return it from `getRepository()`, and every game keeps working.
 */
export interface PlayerRepository {
  getPlayers(): Promise<Player[]>;
  getEvents(): Promise<TournamentEvent[]>;
}

class SamplePlayerRepository implements PlayerRepository {
  async getPlayers(): Promise<Player[]> {
    const { SAMPLE_PLAYERS } = await import('./sample/build');
    return SAMPLE_PLAYERS;
  }

  async getEvents(): Promise<TournamentEvent[]> {
    const { SAMPLE_EVENTS } = await import('./sample/build');
    return SAMPLE_EVENTS;
  }
}

let repository: PlayerRepository = new SamplePlayerRepository();

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
      const [players, events] = await Promise.all([repo.getPlayers(), repo.getEvents()]);
      return new Dataset(players, events);
    })();
  }
  return cached;
}
