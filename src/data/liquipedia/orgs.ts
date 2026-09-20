import { loadJson } from './files';

/**
 * Organisations, and who has ever played for them.
 *
 * `orgs.json` is written by the notebook from `transfers.json`, `teams.json`
 * and `players.json`, and read here in place through the `@data` alias.
 *
 * It was generated before anything read it. This is what now reads it: every
 * criteria game wrote a "plays for NRG" rule and none of them could ever fire,
 * because the old Wikipedia import knew of seventeen organisations with one or
 * two players each — under every threshold the generators used. Griefer's own
 * rules panel advertised a rule the data could not produce.
 *
 * Content from Liquipedia, CC-BY-SA 3.0. See CREDITS.md.
 */

export interface Org {
  /** `teams.json` page name, or the raw name when `hasPage` is false. */
  id: string;
  name: string;
  hasPage: boolean;
  region: string | null;
  status: string | null;
  /** The organisation's prize money, not a player's. */
  earnings: number;
  /** Page names on the roster today. */
  current: string[];
  /** Page names who were ever there, `current` included. */
  ever: string[];
}

interface RawPayload {
  generated: string;
  minPlayers: number;
  orgs: Org[];
}

export class Orgs {
  readonly generated: string;
  readonly minPlayers: number;
  /** Richest first, as the notebook writes them. */
  readonly orgs: Org[];

  private readonly byId = new Map<string, Org>();

  constructor(payload: RawPayload) {
    this.generated = payload.generated;
    this.minPlayers = payload.minPlayers;
    this.orgs = payload.orgs;
    for (const org of this.orgs) this.byId.set(org.id, org);
  }

  get(id: string): Org | null {
    return this.byId.get(id) ?? null;
  }

  /**
   * Organisations worth building a rule around.
   *
   * Headcount is the wrong sort and the file says so: the biggest roster in it
   * is a grassroots org with 142 players and no Liquipedia page that nobody
   * watching the scene would name. A team page plus real prize money is what
   * "an org you have heard of" actually looks like.
   */
  notable(minEarnings = 100_000): Org[] {
    return this.orgs.filter((org) => org.hasPage && org.earnings >= minEarnings);
  }
}

let cached: Promise<Orgs> | null = null;

/** Loads (once) and indexes the organisations. ~236 KB, so only on demand. */
export function loadOrgs(): Promise<Orgs> {
  if (!cached) {
    cached = loadJson('orgs').then((payload) => new Orgs(payload as RawPayload));
  }
  return cached;
}
