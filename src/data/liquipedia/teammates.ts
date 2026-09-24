import { loadJson } from './files';
import type { RosterPlayer } from './roster';

/**
 * Who has played alongside whom, across every tournament in the export.
 *
 * `teammates.json` is written by the notebook from `placements.json` and read
 * here in place through the `@data` alias — the same contract as
 * `players.json`: no build step, no derived copy.
 *
 * A pair counts once per placement row they share, which is what "played
 * together" means: 213,666 of the 442,736 placement rows are a roster of two
 * or more, and two solo players at the same event are not teammates. That
 * gives 39,038 distinct pairs, and counts with some weight behind them —
 * Peterbot and Pollo have entered 126 tournaments together.
 *
 * Participants Liquipedia has placements for but no player page (61,016 names,
 * 205,641 rows) cannot be shown or guessed, so they are skipped upstream. A
 * count is therefore "tournaments together that Liquipedia can name us both
 * in", not an absolute.
 *
 * Content from Liquipedia, CC-BY-SA 3.0. See CREDITS.md.
 */

interface RawPayload {
  generated: string;
  /** How many teammates per player the file keeps. */
  top: number;
  /** `mates` is `[teammatePageName, tournamentsTogether]`, most shared first. */
  players: { id: string; mates: [string, number][] }[];
}

export interface TeammateClue {
  player: RosterPlayer;
  /** Tournaments this pair entered together. */
  events: number;
}

export class Teammates {
  readonly generated: string;
  readonly top: number;

  private readonly byPlayer = new Map<string, [string, number][]>();

  constructor(payload: RawPayload) {
    this.generated = payload.generated;
    this.top = payload.top;
    for (const player of payload.players) this.byPlayer.set(player.id, player.mates);
  }

  /**
   * A player's teammates, most shared first, resolved against the roster.
   *
   * `byId` is the caller's roster index. Resolving here rather than upstream
   * keeps one rule for who is playable: a teammate the notebook has marked
   * `unused` is not in the roster, so there is no row to render and no name to
   * guess, and they drop out of the clue list rather than appearing as a
   * blank.
   */
  cluesFor(playerId: string, byId: ReadonlyMap<string, RosterPlayer>): TeammateClue[] {
    const mates = this.byPlayer.get(playerId);
    if (!mates) return [];
    const out: TeammateClue[] = [];
    for (const [id, events] of mates) {
      const player = byId.get(id);
      if (player) out.push({ player, events });
    }
    return out;
  }

  /**
   * Tournaments two players entered as teammates, or 0.
   *
   * Complete for any count that matters: the file keeps fifty teammates per
   * player, and nobody's fiftieth has more than nine events with them, so a
   * pair on ten or more is listed on both sides.
   */
  together(a: string, b: string): number {
    for (const [id, events] of this.byPlayer.get(a) ?? []) {
      if (id === b) return events;
    }
    return 0;
  }
}

let cached: Promise<Teammates> | null = null;

/** Loads (once) and indexes the teammate counts. ~680 KB, so only on demand. */
export function loadTeammates(): Promise<Teammates> {
  if (!cached) {
    cached = loadJson('teammates').then((payload) => new Teammates(payload as RawPayload));
  }
  return cached;
}
