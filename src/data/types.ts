/**
 * Domain model for the whole site.
 *
 * Every game reads players through `PlayerRepository` (see `repository.ts`) and
 * never imports a data module directly. To move to another source (an internal
 * API, Fortnite Tracker, ...) implement `PlayerRepository` against it and swap
 * it in `repository.ts` — no game code changes.
 *
 * The shape is deliberately relational rather than one-row-per-player:
 *
 *   TournamentEvent   one tournament (a regional grand final, a global, a LAN)
 *   EventEntry        one *roster* finishing at one event — the join row that
 *                     carries the placement, the prize and who played together
 *   OrgStint          one spell at one organisation, with the dates
 *   Player            the person, plus views derived from the rows above
 *
 * Teammates, career results, FNCS title counts and current org are all derived
 * from `EventEntry` / `OrgStint` in `fortnite/build.ts`; they are never authored
 * by hand, so they cannot drift out of sync with the underlying rows.
 */

export type Region = 'NAE' | 'NAW' | 'NAC' | 'EU' | 'BR' | 'OCE' | 'ASIA' | 'ME';

export const REGION_LABEL: Record<Region, string> = {
  NAE: 'NA East',
  NAW: 'NA West',
  NAC: 'NA Central',
  EU: 'Europe',
  BR: 'Brazil',
  OCE: 'Oceania',
  ASIA: 'Asia',
  ME: 'Middle East',
};

/** Kind of event. Only these are considered "major" for Career Path etc. */
export type EventTier =
  | 'global' // World Cup / Global Championship / Invitational
  | 'fncs' // FNCS regional grand finals
  | 'lan' // Major offline event (DreamHack, Gamers8, EWC)
  | 'major'; // Major online/international event (Skirmishes, Winter Royale, ...)

/** Where a row came from. Anything but `estimated` is sourced from a citation. */
export type DataSource = 'wikipedia' | 'liquipedia' | 'estimated';

export interface TournamentEvent {
  id: string;
  /** Full display name, e.g. "FNCS Chapter 4 Season 4 — EU Grand Finals". */
  name: string;
  /** Compact label used inside game clues, e.g. "FNCS Ch4S4". */
  shortName: string;
  tier: EventTier;
  year: number;
  /** ISO date used for chronological ordering (end of the event window). */
  date: string;
  /** Human date range as published, e.g. "October–November 2020". */
  dateLabel: string;
  /** Region the finals were played in; `null` for global/cross-region events. */
  region: Region | null;
  /** Team size of the event format. */
  format: 'solo' | 'duo' | 'trio' | 'squad';
  /** Season key such as "C4S4"; `null` for non-FNCS events. */
  season: string | null;
  /** Platform split for the 2020 events that ran PC and console separately. */
  platform: string | null;
}

/**
 * One roster's finish at one event.
 *
 * `playerIds` is the whole team, so a trio win is a single row referencing three
 * players rather than three disconnected rows. This is what makes "who did X
 * play with" answerable.
 */
export interface EventEntry {
  id: string;
  eventId: string;
  /** 1-based finishing position. */
  placement: number;
  /** Prize money per player, in USD. */
  prize: number;
  /** Everyone who competed in this entry, in roster order. */
  playerIds: string[];
  /** Organisation the roster represented, when known. */
  org: string | null;
  source: DataSource;
}

/** A spell at one organisation. */
export interface OrgStint {
  org: string;
  /** ISO date the player joined, or null when only the spell itself is recorded. */
  from: string | null;
  /** ISO date they left, or `null` while they are still on the roster. */
  to: string | null;
  source: DataSource;
}

export interface PlayerResult {
  eventId: string;
  /** The entry this result belongs to — use it to reach the teammates. */
  entryId: string;
  /** 1-based finishing position. */
  placement: number;
  /** Prize money earned from this event, in USD. */
  prize: number;
}

export interface TeammateLink {
  playerId: string;
  /** Number of tournament entries the two players shared. */
  events: number;
  /** Event ids they played together, oldest first. */
  eventIds: string[];
}

export interface Player {
  id: string;
  /** Competitive handle — the canonical name shown everywhere in the UI. */
  name: string;
  realName: string | null;
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  countryName: string;
  /** Region the player is most associated with (most recent competed region). */
  region: Region;
  /** Every region the player has produced a recorded result in. */
  regions: Region[];
  /** ISO date of birth, or `null` when unknown. */
  birthDate: string | null;
  /** Age in years at `DATA_UPDATED_AT`. */
  age: number | null;
  /** Career prize money in USD. 0 when no verified figure exists upstream. */
  earnings: number;
  /** False when the player sits outside Liquipedia's published earnings tables. */
  earningsKnown: boolean;
  /** Prize money per calendar year; keys are years as strings. */
  earningsByYear: Record<string, number>;
  /** Current organisation, or `null` for free agents. Derived from `orgHistory`. */
  team: string | null;
  /** Every organisation the player has represented, oldest first. */
  orgHistory: OrgStint[];
  /** Number of FNCS titles (1st place in an FNCS-tier event). Derived. */
  fncsWins: number;
  /** Number of 1st places at global/LAN/major events. Derived. */
  majorWins: number;
  /** Major results only, sorted oldest to newest. Derived from entries. */
  results: PlayerResult[];
  /** Tournament teammates, most shared events first. Derived from entries. */
  teammates: TeammateLink[];
  /** Optional headshot URL. */
  photoUrl: string | null;
  status: 'active' | 'inactive';
}

/**
 * Difficulty tier a player belongs to.
 *
 * Not a property of the person — a property of *guessing* them. `easy` is the
 * famous end of the roster, `hard` the players only a follower of the scene
 * would name.
 */
export type FameTier = 'easy' | 'medium' | 'hard';

/**
 * One player's place in the fame ranking.
 *
 * Produced by `fame_calculation.ipynb` and stored in
 * `fortnite/fame-ranking.json`: 70% normalised log career earnings, 30%
 * tournament wins weighted by how big the tournament was — a World Cup title
 * counts for far more than a console cup. Re-running the notebook after the
 * dataset grows re-tiers everyone, which is the point: earnings alone would
 * rank a grinder above a World Cup champion.
 *
 * Tiers are cut by rank, not by score: the top 10% are `easy`, the next 30%
 * `medium`, the rest `hard`.
 */
export interface FameEntry {
  playerId: string;
  /** Handle as it was when the ranking was generated — for debugging only. */
  name: string;
  /** Composite fame, 0-1, where 1 is the most famous player in the dataset. */
  fameScore: number;
  /** Rank as a fraction: 0 is the most famous, 1 the least. */
  famePercentile: number;
  tier: FameTier;
  /** Weighted tournament-win points that fed the score. */
  prestigePoints: number;
}

/** Date the underlying data snapshot was taken. Shown in the rules panels. */
export const DATA_UPDATED_AT = '2026-09-13';
export const DATA_SOURCE_LABEL = 'Wikipedia + Liquipedia (Sept 2026)';
