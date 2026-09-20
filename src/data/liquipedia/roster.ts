import type { FameTier } from '@/data/types';
import { COUNTRY_CODES } from './countries';
import { loadJson } from './files';

/**
 * The Liquipedia roster.
 *
 * Reads `liquipedia_data/clean_data/fortnite/players.json` — the cleaned export
 * — directly, with no build step and no derived copy. Nothing here computes a
 * ranking or decides who is playable: `tier` and `fncs_wins` are columns in that
 * file, written by the notebook that maintains it. Re-tiering the roster means
 * editing one column and reloading; no code changes, and nothing to regenerate.
 *
 * Deliberately separate from `data/fortnite`, which is the earlier Wikipedia
 * import: 316 players with per-event results, teammates and org history, still
 * driving the eight games that ask questions only a career history can answer.
 * This one is wide and shallow — 5,700 players with a handle, a country, a
 * birthday and an earnings figure — which is exactly what Higher or Lower and
 * Fortnitedle need.
 *
 * Content from Liquipedia, CC-BY-SA 3.0. See CREDITS.md.
 */

/**
 * When the Liquipedia export behind `players.json` was taken.
 *
 * Hand-maintained: the export carries no timestamp column, and a file mtime
 * does not survive a clone. Bump it when you re-export.
 */
export const EXPORT_DATE = '2026-09-16';

/** Where the roster comes from, for the attribution line every game shows. */
export const SOURCE = {
  name: 'Liquipedia Fortnite',
  url: 'https://liquipedia.net/fortnite',
  license: 'CC-BY-SA 3.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
} as const;

/** One row of `players.json`, as the notebook writes it. */
export interface LiquipediaRow {
  pageid: number;
  /** Unique page name, e.g. `Aqua_(Japanese_player)`. */
  pagename: string;
  /** Competitive handle — what the UI shows. */
  id: string;
  /** Former or alternate spellings, e.g. `Shark` for `shxrk`. */
  alternateid_list: string[];
  /** Real name, or null when the page does not give one. */
  name: string | null;
  type: string;
  status: string | null;
  nationalities: string[];
  region: string | null;
  birthdate: string | null;
  teampagename: string | null;
  earnings: number | null;
  /** Difficulty band, maintained in the dataset. `unused` never reaches a game. */
  tier: FameTier | 'unused';
  /**
   * Difficulty band *within* `region`, maintained in the same notebook.
   *
   * `tier` ranks all 5,678 rows against each other, which is the right answer
   * for "pick a difficulty" and the wrong one for "pick Asia, then pick a
   * difficulty": on the global ranking Asia, Oceania and the Middle East have
   * no Easy players at all. Optional, because a roster exported before the
   * column existed still has to load — those rows fall back to `tier`, and the
   * count under each difficulty card shows what that leaves.
   */
  region_tier?: FameTier | 'unused';
  fncs_wins: number;
}

/** A roster row in the shape the games read. */
export interface RosterPlayer {
  /** Page name — unique, so it is the identity. */
  id: string;
  /** Competitive handle. */
  name: string;
  realName: string | null;
  /** Other spellings this player answers to. */
  aliases: string[];
  /** ISO 3166-1 alpha-2, or null when no nationality is published. */
  country: string | null;
  countryName: string | null;
  /** Liquipedia's own region label, e.g. "North America". */
  region: string | null;
  birthDate: string | null;
  /** Age in whole years today, or null when no birth date is published. */
  age: number | null;
  earnings: number;
  /** False when no prize money is published, so the UI shows a dash not a zero. */
  earningsKnown: boolean;
  team: string | null;
  status: string | null;
  fncsWins: number;
  tier: FameTier;
  /** Difficulty band among players from the same region. */
  regionTier: FameTier;
  /** Always null — the export ships no headshots. Kept for `PlayerAvatar`. */
  photoUrl: null;
}

function ageOn(birthDate: string | null, today: Date): number | null {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return null;
  let age = today.getFullYear() - born.getFullYear();
  const months = today.getMonth() - born.getMonth();
  if (months < 0 || (months === 0 && today.getDate() < born.getDate())) age--;
  return age;
}

/**
 * `Void_Esports` -> `Void Esports`.
 *
 * The export's team display names live in `teams.json`, which is not shipped;
 * of the 403 organisations actually referenced, 9 have a display name that this
 * does not reproduce exactly (`KoS_Esports` is really "Knights of Shadows").
 * A slightly-off org name is a cosmetic line under a player's handle, which is
 * not worth another megabyte of data.
 */
function teamName(pageName: string | null): string | null {
  if (!pageName) return null;
  return pageName.replace(/_\(.*\)$/, '').replace(/_/g, ' ');
}

/** Tier order to widen through when a pool is too small, closest first. */
const TIER_FALLBACK: Record<FameTier, FameTier[]> = {
  easy: ['easy', 'medium', 'hard'],
  medium: ['medium', 'easy', 'hard'],
  hard: ['hard', 'medium', 'easy'],
};

/** Options shared by both pool queries. */
export interface PoolOptions {
  /**
   * The caller's own filter, applied per tier — Higher or Lower drops players
   * with no birth date from an Age run, Fortnitedle drops handles of the wrong
   * length.
   */
  eligible?: (players: RosterPlayer[]) => RosterPlayer[];
  /**
   * A Liquipedia region label (`'Asia'`), or null for the whole roster. With a
   * region the band read is `regionTier`, because a global ranking has no Easy
   * players outside NA/EU/SA.
   */
  region?: string | null;
}

export class Roster {
  /** Everyone a game may use — `unused` rows are dropped on the way in. */
  readonly players: RosterPlayer[];

  private readonly byTier = new Map<FameTier, RosterPlayer[]>([
    ['easy', []],
    ['medium', []],
    ['hard', []],
  ]);

  /** region -> regionTier -> players. Built once, same shape as `byTier`. */
  private readonly byRegion = new Map<string, Map<FameTier, RosterPlayer[]>>();

  constructor(rows: readonly LiquipediaRow[], today: Date = new Date()) {
    this.players = [];
    for (const row of rows) {
      // The dataset's own opinion about who is playable. A row can be excluded
      // for any reason the notebook likes — no earnings, no longer with us — and
      // the games never need to know which.
      if (row.tier === 'unused') continue;

      const nationality = row.nationalities?.[0] ?? null;
      const earnings = row.earnings ?? 0;
      this.players.push({
        id: row.pagename,
        name: row.id,
        realName: row.name || null,
        aliases: row.alternateid_list ?? [],
        country: nationality ? (COUNTRY_CODES[nationality] ?? null) : null,
        countryName: nationality,
        region: row.region ?? null,
        birthDate: row.birthdate ?? null,
        age: ageOn(row.birthdate ?? null, today),
        earnings,
        earningsKnown: earnings > 0,
        team: teamName(row.teampagename ?? null),
        status: row.status ? row.status.toLowerCase() : null,
        fncsWins: row.fncs_wins ?? 0,
        tier: row.tier,
        // A roster exported before the column existed still has to load, and
        // the global band is the only honest answer when there is no other.
        regionTier: row.region_tier && row.region_tier !== 'unused' ? row.region_tier : row.tier,
        photoUrl: null,
      });
    }
    for (const player of this.players) {
      this.byTier.get(player.tier)?.push(player);
      if (!player.region) continue;
      let bands = this.byRegion.get(player.region);
      if (!bands) {
        bands = new Map([
          ['easy', []],
          ['medium', []],
          ['hard', []],
        ]);
        this.byRegion.set(player.region, bands);
      }
      bands.get(player.regionTier)?.push(player);
    }
    this.regions = [...this.byRegion.entries()]
      .map(([region, bands]) => ({
        region,
        size: [...bands.values()].reduce((n, list) => n + list.length, 0),
      }))
      .sort((a, b) => b.size - a.size || (a.region < b.region ? -1 : 1))
      .map((entry) => entry.region);
  }

  /**
   * Region labels that have at least one playable row, biggest first.
   *
   * Read off the data rather than listed anywhere, so a region the export
   * starts publishing appears in the picker without a code change.
   */
  readonly regions: string[];

  /**
   * Exactly this tier, with no widening — what a difficulty card counts.
   *
   * Separate from `playersFor` on purpose: a card that says "0 players" and a
   * card that quietly shows you Medium players are different promises, and the
   * setup screen makes the first one and disables the option.
   */
  exactly(tier: FameTier, options: PoolOptions = {}): RosterPlayer[] {
    const { eligible, region } = options;
    const pool = region ? (this.byRegion.get(region)?.get(tier) ?? []) : (this.byTier.get(tier) ?? []);
    return eligible ? eligible(pool) : pool;
  }

  /**
   * The pool a game may draw from at one difficulty.
   *
   * `eligible` runs per tier, because whether a tier is big enough is a
   * question about the players the game can actually use. If that leaves fewer
   * than `minimum`, the next-closest tier is folded in rather than failing —
   * within the chosen region, never across regions, because "Asia" is the
   * promise the player made and the difficulty is the one they can live with.
   */
  playersFor(
    tier: FameTier,
    options: PoolOptions & { minimum?: number } = {},
  ): RosterPlayer[] {
    const { minimum = 1, ...rest } = options;
    const out: RosterPlayer[] = [];
    for (const step of TIER_FALLBACK[tier]) {
      out.push(...this.exactly(step, rest));
      if (out.length >= minimum) break;
    }
    return out;
  }
}

let cached: Promise<Roster> | null = null;

/**
 * Loads (once) and indexes the roster.
 *
 * Imported dynamically so the player rows stay out of the app bundle and only
 * download when someone opens a game that reads them.
 */
export function loadRoster(): Promise<Roster> {
  if (!cached) {
    cached = loadJson('players').then((rows) => new Roster(rows as LiquipediaRow[]));
  }
  return cached;
}
