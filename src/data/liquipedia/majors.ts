import { loadJson } from './files';
import type { RosterPlayer } from './roster';

/**
 * The majors behind Career Path.
 *
 * `career_path.json` is written by the notebook, from `tournaments.json` and
 * `placements.json`, and read here in place through the `@data` alias — the
 * same contract as `players.json`: no build step, no derived copy.
 *
 * What counts as a major is the notebook's call, not this file's. On the
 * current export it is Liquipedia tier 1 with no tier type, organised by Epic
 * Games, from the 2019 World Cup onwards, minus the console / mobile / Twitch
 * brackets — 188 tournaments. Change the filter, re-run the cell, and the game
 * asks about a different set of events without a line changing here.
 *
 * Deliberately no `tier` column: difficulty is joined from `players.json` by
 * page name, so re-tiering the roster re-tiers this game too and this file
 * never goes stale against it.
 *
 * Content from Liquipedia, CC-BY-SA 3.0. See CREDITS.md.
 */

/** One row of `career_path.json`'s `tournaments`, as the notebook writes it. */
interface RawTournament {
  name: string;
  /** ISO start date. */
  date: string;
  /** Liquipedia's format label: Solo, Duo, Trio, Squad. */
  mode: string | null;
  region: string | null;
  prizePool: number | null;
}

interface RawPayload {
  generated: string;
  minAppearances: number;
  tournaments: RawTournament[];
  /** `results` is `[tournamentIndex, placement]`, oldest first. */
  players: { id: string; results: [number, number][] }[];
}

export interface MajorTournament {
  name: string;
  /** Name with the "Grand Finals" boilerplate taken out, for a clue row. */
  shortName: string;
  date: string;
  year: number;
  mode: string | null;
  region: string | null;
  prizePool: number | null;
}

export interface MajorResult {
  tournament: MajorTournament;
  placement: number;
}

/**
 * "FNCS 2025 - Major 3: Europe - Grand Finals" -> "FNCS 2025 - Major 3: Europe".
 *
 * Every FNCS row in the export ends in some spelling of "Grand Finals", which
 * is the only tournament stage the filter keeps — so on a clue row it is 13
 * characters that distinguish nothing and push the part that does off the end.
 */
function shortName(name: string): string {
  return name
    .replace(/\s*-\s*Grand Finals\s*:?\s*/i, ' — ')
    .replace(/\s*Grand Finals\s*:?\s*/i, ' ')
    .replace(/\s*—\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export class Majors {
  /** When the notebook generated the file. Shown as the game's data date. */
  readonly generated: string;
  /** Majors a player must have reached to be a possible answer. */
  readonly minAppearances: number;
  readonly tournaments: MajorTournament[];

  private readonly byPlayer = new Map<string, MajorResult[]>();
  /** "event|placement" -> everyone who finished exactly there. */
  private readonly byFinish = new Map<string, Set<string>>();

  constructor(payload: RawPayload) {
    this.generated = payload.generated;
    this.minAppearances = payload.minAppearances;
    this.tournaments = payload.tournaments.map((row) => ({
      name: row.name,
      shortName: shortName(row.name),
      date: row.date,
      year: Number(row.date.slice(0, 4)),
      mode: row.mode ?? null,
      region: row.region ?? null,
      prizePool: row.prizePool ?? null,
    }));

    for (const player of payload.players) {
      this.byPlayer.set(
        player.id,
        player.results
          .map(([index, placement]) => ({ tournament: this.tournaments[index], placement }))
          // The notebook writes them in index order and the tournaments are in
          // date order, so this is already chronological — sorted anyway so the
          // guarantee lives here rather than in a comment upstream.
          .sort((a, b) => (a.tournament.date < b.tournament.date ? -1 : 1)),
      );
      for (const [index, placement] of player.results) {
        const key = finishKey(this.tournaments[index].name, placement);
        let set = this.byFinish.get(key);
        if (!set) this.byFinish.set(key, (set = new Set()));
        set.add(player.id);
      }
    }
  }

  /**
   * Everyone who finished exactly where `result` did, its own player included.
   *
   * On a duos or trios event that is the whole team, which is the point: a
   * clue list is only a fair puzzle if it describes one player, and the
   * teammate who stood beside them on every result is the other player it
   * could describe.
   */
  finishers(result: MajorResult): ReadonlySet<string> {
    return this.byFinish.get(finishKey(result.tournament.name, result.placement)) ?? new Set();
  }

  /** Every major this player reached, oldest first. Empty for anyone not in the file. */
  resultsFor(playerId: string): MajorResult[] {
    return this.byPlayer.get(playerId) ?? [];
  }

  /**
   * Roster players this game can ask about.
   *
   * Passed to `roster.playersFor` as its `eligible` filter, so the difficulty
   * counts are counts of answerable players rather than of the roster.
   *
   * Everyone with a record, including the thirteen whose every major was
   * played beside the same partner — Darm and Demus have the same eight
   * results, placement for placement. They were left out for a while, because
   * no clue list can tell them apart. They are back: a wrong guess only costs
   * a clue, so naming the partner first and then the player is a fine round,
   * and dropping them made them the one pair nobody would ever be asked about.
   */
  readonly eligible = (players: readonly RosterPlayer[]): RosterPlayer[] =>
    players.filter((player) => this.byPlayer.has(player.id));
}

function finishKey(event: string, placement: number): string {
  return `${event}|${placement}`;
}

let cached: Promise<Majors> | null = null;

/**
 * Loads (once) and indexes the majors.
 *
 * Dynamic, so 150 KB of results only downloads when Career Path is opened.
 */
export function loadMajors(): Promise<Majors> {
  if (!cached) {
    cached = loadJson('career_path').then((payload) => new Majors(payload as RawPayload));
  }
  return cached;
}
