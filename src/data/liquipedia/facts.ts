import { loadJson } from './files';
import type { RosterPlayer } from './roster';

/**
 * Career facts `players.json` cannot answer.
 *
 * `facts.json` is written by the notebook from `tournaments.json` and
 * `placements.json`, and read here in place through the `@data` alias — the
 * same contract as `players.json`: no build step, no derived copy.
 *
 * It exists because the criteria games were starved. Griefer, Tic Tac Toe and
 * Connections generated most of their rules from country and region alone,
 * which is exactly why a Griefer board about "competes in Brazil" was solvable
 * by reading the flags rather than knowing the players. Where a player *won*,
 * how many LANs they turned up to, which headline events they played — all of
 * it is in the export and none of it was reaching a game.
 *
 * Deliberately no `tier` column: difficulty joins from `players.json` by page
 * name, so re-tiering the roster re-tiers every game and this never goes stale.
 *
 * Content from Liquipedia, CC-BY-SA 3.0. See CREDITS.md.
 */

/** What kind of event this is. `lan` is a venue, the rest are brackets. */
export type EventKind = 'global' | 'fncs' | 'lan' | 'major';

/** One row of `facts.json`'s `events`. */
interface RawEvent {
  name: string;
  short: string;
  date: string;
  kind: EventKind;
  lan: boolean;
  region: string | null;
  mode: string | null;
  prizePool: number | null;
}

interface RawPlayer {
  id: string;
  played: number[];
  won: number[];
  apps: number;
  lanApps: number;
  fncsApps: number;
  wins: { global: number; fncs: number; lan: number; major: number };
  winRegions: string[];
  winYears: number[];
}

interface RawPayload {
  generated: string;
  events: RawEvent[];
  players: RawPlayer[];
}

export interface HeadlineEvent extends RawEvent {
  /** Index into `Facts.events` — what `played` and `won` hold. */
  index: number;
  year: number;
}

export interface PlayerFacts {
  id: string;
  played: readonly number[];
  won: readonly number[];
  /** Every tournament in the export, not just headline ones. */
  apps: number;
  lanApps: number;
  fncsApps: number;
  wins: { global: number; fncs: number; lan: number; major: number };
  winRegions: readonly string[];
  winYears: readonly number[];
}

/** What a player with no recorded results looks like, so callers never branch. */
const NONE: PlayerFacts = {
  id: '',
  played: [],
  won: [],
  apps: 0,
  lanApps: 0,
  fncsApps: 0,
  wins: { global: 0, fncs: 0, lan: 0, major: 0 },
  winRegions: [],
  winYears: [],
};

export class Facts {
  readonly generated: string;
  readonly events: HeadlineEvent[];

  private readonly byPlayer = new Map<string, PlayerFacts>();
  /** event index -> player ids who were there. Built lazily, once. */
  private participants: Map<number, Set<string>> | null = null;

  constructor(payload: RawPayload) {
    this.generated = payload.generated;
    this.events = payload.events.map((event, index) => ({
      ...event,
      index,
      year: Number(event.date.slice(0, 4)),
    }));
    for (const player of payload.players) this.byPlayer.set(player.id, player);
  }

  /** This player's facts, or an all-zero record when they have no results. */
  of(playerId: string): PlayerFacts {
    return this.byPlayer.get(playerId) ?? NONE;
  }

  has(playerId: string): boolean {
    return this.byPlayer.has(playerId);
  }

  /** Everyone recorded at one headline event. */
  playedAt(eventIndex: number): ReadonlySet<string> {
    if (!this.participants) {
      const map = new Map<number, Set<string>>();
      for (const [id, facts] of this.byPlayer) {
        for (const index of facts.played) {
          let set = map.get(index);
          if (!set) map.set(index, (set = new Set()));
          set.add(id);
        }
      }
      this.participants = map;
    }
    return this.participants.get(eventIndex) ?? new Set();
  }

  /**
   * Events worth naming in a rule.
   *
   * A regional FNCS grand final is a fine thing to have played at and a poor
   * thing to be asked about — there are well over a hundred of them and their
   * names differ by one word. Globals and LANs are the ones people remember.
   */
  get headlineEvents(): HeadlineEvent[] {
    return this.events.filter((event) => event.kind === 'global' || event.lan);
  }

  /**
   * Roster players with enough recorded history to be a fair answer.
   *
   * Passed to `roster.playersFor` as its `eligible` filter, so a difficulty
   * card counts answerable players rather than rows in the export.
   */
  readonly eligible =
    (minApps: number) =>
    (players: readonly RosterPlayer[]): RosterPlayer[] =>
      players.filter((player) => this.of(player.id).apps >= minApps);
}

let cached: Promise<Facts> | null = null;

/** Loads (once) and indexes the career facts. Dynamic — only on demand. */
export function loadFacts(): Promise<Facts> {
  if (!cached) {
    cached = loadJson('facts').then((payload) => new Facts(payload as RawPayload));
  }
  return cached;
}
