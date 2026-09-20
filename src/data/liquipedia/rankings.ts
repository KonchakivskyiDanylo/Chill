import { makeRng, pick, type Rng } from '@/lib/rng';
import { loadJson } from './files';

/**
 * Every Tenaball board, precomputed.
 *
 * `rankings.json` is written by the notebook from `placements.json`,
 * `tournaments.json`, `players.json` and `orgs.json`, and read here in place
 * through the `@data` alias.
 *
 * Precomputed rather than derived in the browser because the source is 442,736
 * placement rows and 154 MB: aggregating that per board, per page load, is not
 * something a phone should be asked to do. The boards only change when the
 * export does, so they are built once where the data already lives.
 *
 * Content from Liquipedia, CC-BY-SA 3.0. See CREDITS.md.
 */

/**
 * What a board is answered with.
 *
 * New for Tenaball. Until now every board wanted a player; "Top 10
 * organisations by earnings" wants an org and "Top 10 countries by FNCS wins"
 * wants a country, so the board has to say which and the game picks the
 * matching resolver.
 */
export type EntityKind = 'player' | 'org' | 'country';

export interface BoardRow {
  /** Canonical id — a page name for players, an org id, a country name. */
  key: string;
  /** What the player types and reads. */
  label: string;
  value: number;
  /** Preformatted, because only the notebook knows if this is money or a count. */
  display: string;
}

export interface Board {
  id: string;
  /** Picker heading: Players, By region, Tournaments, Organisations, … */
  group: string;
  title: string;
  entity: EntityKind;
  tieRule: string;
  rows: BoardRow[];
  /**
   * 11th place. Used to spot a guess level with the cut-off and call it a near
   * miss instead of a mistake — the rule the board already states.
   */
  next: { key: string; label: string; value: number };
  /** True for finishing positions, where 1 beats 2. */
  lowerIsBetter?: boolean;
}

interface RawPayload {
  generated: string;
  slots: number;
  boards: Board[];
}

export class Rankings {
  readonly generated: string;
  readonly slots: number;
  readonly boards: Board[];

  private readonly byId = new Map<string, Board>();

  constructor(payload: RawPayload) {
    this.generated = payload.generated;
    this.slots = payload.slots;
    this.boards = payload.boards;
    for (const board of this.boards) this.byId.set(board.id, board);
  }

  get(id: string): Board | null {
    return this.byId.get(id) ?? null;
  }

  /** Group name -> its boards, in the order the notebook wrote them. */
  get grouped(): Map<string, Board[]> {
    const out = new Map<string, Board[]>();
    for (const board of this.boards) {
      const list = out.get(board.group);
      if (list) list.push(board);
      else out.set(board.group, [board]);
    }
    return out;
  }

  /** Any board, for the Random category. */
  random(seed: string | number | Rng = Date.now()): Board | null {
    if (this.boards.length === 0) return null;
    const rng: Rng = typeof seed === 'function' ? seed : makeRng(seed);
    return pick(rng, this.boards);
  }

  /** Boards whose title or group contains `query`, for the picker's search. */
  search(query: string): Board[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return this.boards;
    return this.boards.filter(
      (board) =>
        board.title.toLowerCase().includes(needle) || board.group.toLowerCase().includes(needle),
    );
  }
}

let cached: Promise<Rankings> | null = null;

/** Loads (once) and indexes the boards. Dynamic — only Tenaball reads them. */
export function loadRankings(): Promise<Rankings> {
  if (!cached) {
    cached = loadJson('rankings').then((payload) => new Rankings(payload as RawPayload));
  }
  return cached;
}
