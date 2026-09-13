/**
 * Domain model for the whole site.
 *
 * Every game reads players through `PlayerRepository` (see `repository.ts`) and
 * never imports the sample dataset directly. To move to real data (Liquipedia,
 * Fortnite Tracker, an internal API, ...) implement `PlayerRepository` against
 * the new source and swap it in `repository.ts` — no game code changes.
 */

export type Region = 'NAE' | 'NAW' | 'EU' | 'BR' | 'OCE' | 'ASIA' | 'ME';

export const REGION_LABEL: Record<Region, string> = {
  NAE: 'NA East',
  NAW: 'NA West',
  EU: 'Europe',
  BR: 'Brazil',
  OCE: 'Oceania',
  ASIA: 'Asia',
  ME: 'Middle East',
};

/** Kind of event. Only these are considered "major" for Career Path etc. */
export type EventTier =
  | 'global' // World Cup / Global Championship
  | 'fncs' // FNCS Finals / Grand Finals / Global
  | 'lan' // Major offline event
  | 'major'; // Major online/international event (Cash Cup Extra, DreamHack, ...)

export interface TournamentEvent {
  id: string;
  /** Full display name, e.g. "FNCS Chapter 4 Season 4 — EU Grand Finals". */
  name: string;
  /** Compact label used inside game clues, e.g. "FNCS Ch4S4". */
  shortName: string;
  tier: EventTier;
  year: number;
  /** ISO date used purely for chronological ordering. */
  date: string;
  /** Region the finals were played in; `null` for global/cross-region events. */
  region: Region | null;
  /** Team size of the event format. */
  format: 'solo' | 'duo' | 'trio' | 'squad';
  /** Season key such as "C4S4"; `null` for non-FNCS events. */
  season: string | null;
}

export interface PlayerResult {
  eventId: string;
  /** 1-based finishing position. Unique per event within the dataset. */
  placement: number;
  /** Prize money earned from this event, in USD. */
  prize: number;
}

export interface TeammateLink {
  playerId: string;
  /** Number of tournament matches played together. */
  matches: number;
}

export interface Player {
  id: string;
  /** Competitive handle — the canonical name shown everywhere in the UI. */
  name: string;
  realName: string | null;
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  countryName: string;
  region: Region;
  /** ISO date of birth, or `null` when unknown. */
  birthDate: string | null;
  /** Age in years at `DATA_UPDATED_AT`. */
  age: number | null;
  /** Career prize money in USD. */
  earnings: number;
  /** Prize money per calendar year; keys are years as strings. Sums to `earnings`. */
  earningsByYear: Record<string, number>;
  /** Current organisation, or `null` for free agents. */
  team: string | null;
  /** Number of FNCS titles (1st place in an FNCS-tier event). */
  fncsWins: number;
  /** Power Ranking points. */
  pr: number;
  /** Major results only, sorted oldest to newest. */
  results: PlayerResult[];
  /** Most-played tournament teammates, sorted by matches descending. */
  teammates: TeammateLink[];
  /** Optional headshot URL. Sample data has none; the UI falls back to an avatar. */
  photoUrl: string | null;
  status: 'active' | 'inactive';
}

/** Date the underlying data snapshot was taken. Shown in the rules panels. */
export const DATA_UPDATED_AT = '2026-09-08';
export const DATA_SOURCE_LABEL = 'sample dataset (Liquipedia-inspired)';
