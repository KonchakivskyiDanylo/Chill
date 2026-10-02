import { loadJson } from './files';
import { loadOrgs, type Orgs } from './orgs';

/**
 * What the roster leaves out about a person: their real name, and every spell
 * at an organisation with the day it started and ended.
 *
 * `bios.json` is written by `scripts/build_data.py` (`build_bios` in
 * `scripts/pipeline/enrich.py`) from `players.json` and `transfers.json`, and
 * read here in place — the same contract as every other file in that folder.
 * IRL reads the names; Org Chart, Transfer Window and Rewind read the stints.
 *
 * A clone that has not run the build since bios.json existed still plays:
 * the names come from `players.json`, which has always carried them, and the
 * stints from `orgs.json`'s who-ever-played lists — one stint per org with no
 * dates and no order. `dated` says which, so a game can switch off the modes
 * that need the calendar.
 *
 * Content from Liquipedia, CC-BY-SA 3.0. See CREDITS.md.
 */

/** One spell at an organisation. */
export interface Stint {
  /** The org's key in `orgs.json`: its team page, or the raw name for an org with no page. */
  org: string;
  /** ISO day joined. Null when only the leave is on record, and always in the undated fallback. */
  from: string | null;
  /**
   * ISO day left. Null while the stint is open: the org the player is at now,
   * or one whose leave Liquipedia never recorded — `Orgs.current` tells them apart.
   */
  to: string | null;
}

interface RawPayload {
  generated: string;
  names: Record<string, string>;
  /** `[org, joined, left]`, oldest first. */
  stints: Record<string, [string, string | null, string | null][]>;
}

export class Bios {
  /** When the build wrote bios.json; null for the fallback. */
  readonly generated: string | null;
  /** True when the stints carry dates and come oldest first (bios.json). */
  readonly dated: boolean;

  private readonly names: ReadonlyMap<string, string>;
  private readonly byPlayer: ReadonlyMap<string, Stint[]>;
  /** org -> player -> their stints there. Built lazily, once. */
  private byOrg: Map<string, Map<string, Stint[]>> | null = null;

  constructor(
    names: ReadonlyMap<string, string>,
    byPlayer: ReadonlyMap<string, Stint[]>,
    dated: boolean,
    generated: string | null,
  ) {
    this.names = names;
    this.byPlayer = byPlayer;
    this.dated = dated;
    this.generated = generated;
  }

  /** The name on the player's Liquipedia page, or null when none is published. */
  realName(playerId: string): string | null {
    return this.names.get(playerId) ?? null;
  }

  /** Every spell at an organisation, oldest first when `dated`. */
  stintsOf(playerId: string): readonly Stint[] {
    return this.byPlayer.get(playerId) ?? [];
  }

  /** The organisations a player has been at, each once, in the order first joined. */
  orgsOf(playerId: string): string[] {
    return [...new Set(this.stintsOf(playerId).map((stint) => stint.org))];
  }

  /** Everyone who had a spell at one org, and their spells there. */
  membersOf(org: string): ReadonlyMap<string, readonly Stint[]> {
    if (!this.byOrg) {
      const index = new Map<string, Map<string, Stint[]>>();
      for (const [player, stints] of this.byPlayer) {
        for (const stint of stints) {
          let members = index.get(stint.org);
          if (!members) index.set(stint.org, (members = new Map()));
          members.set(player, [...(members.get(player) ?? []), stint]);
        }
      }
      this.byOrg = index;
    }
    return this.byOrg.get(org) ?? new Map();
  }
}

function fromFile(raw: RawPayload): Bios {
  const stints = new Map<string, Stint[]>();
  for (const [player, rows] of Object.entries(raw.stints)) {
    stints.set(player, rows.map(([org, from, to]) => ({ org, from, to })));
  }
  return new Bios(new Map(Object.entries(raw.names)), stints, true, raw.generated);
}

/** No bios.json: real names from players.json, undated stints from orgs.json. */
async function fallback(): Promise<Bios> {
  const [rows, orgs] = await Promise.all([
    loadJson('players').catch(() => []) as Promise<{ pagename: string; id?: string; name?: string }[]>,
    loadOrgs().catch(() => null) as Promise<Orgs | null>,
  ]);
  const names = new Map<string, string>();
  for (const row of rows) {
    const name = row.name?.replace(/\s+/g, ' ').trim();
    if (name && name.toLowerCase() !== (row.id ?? row.pagename).toLowerCase()) names.set(row.pagename, name);
  }
  const stints = new Map<string, Stint[]>();
  for (const org of orgs?.orgs ?? []) {
    for (const player of org.ever) {
      stints.set(player, [...(stints.get(player) ?? []), { org: org.id, from: null, to: null }]);
    }
  }
  return new Bios(names, stints, false, null);
}

let cached: Promise<Bios> | null = null;

/** Loads (once) and indexes the bios. ~700 KB, so only for the games that read it. */
export function loadBios(): Promise<Bios> {
  if (!cached) {
    cached = loadJson('bios').then((payload) => fromFile(payload as RawPayload), fallback);
  }
  return cached;
}
