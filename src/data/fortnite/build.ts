import {
  DATA_UPDATED_AT,
  type EventEntry,
  type OrgStint,
  type Player,
  type PlayerResult,
  type Region,
  type TeammateLink,
  type TournamentEvent,
} from '@/data/types';
import { EVENTS } from './events';
import { ENTRIES } from './entries';
import { PLAYER_SEEDS, type PlayerSeed } from './players';
import { COUNTRY_NAMES, REGION_BY_COUNTRY } from './countries';

/**
 * Assembles the dataset the games consume from the three generated tables.
 *
 * The generated files hold only what a source actually states: which rosters
 * placed where, when each player was born, what they have earned. Everything a
 * game asks about a player — their career, who they played with, how many FNCS
 * titles they hold, which org they are on — is computed here from those rows.
 * That is the point of the split: a new result row updates every derived number
 * at once, and no hand-authored total can contradict the table it came from.
 *
 * Where a source is silent the value stays empty rather than being invented.
 * Per-event prize money is the clearest case: Wikipedia and the Liquipedia
 * portal publish career totals, not payouts per placement, so `prize` is 0
 * until real payout data is loaded.
 */

const eventById = new Map(EVENTS.map((event) => [event.id, event]));

function ageAt(birthDate: string | null, onDate: string): number | null {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  const on = new Date(onDate);
  let age = on.getFullYear() - born.getFullYear();
  const monthDiff = on.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && on.getDate() < born.getDate())) age--;
  return age;
}

/** Entries, with prize money attached where known (none yet) and a source tag. */
const entries: EventEntry[] = ENTRIES.filter((entry) => eventById.has(entry.eventId)).map((entry) => ({
  id: entry.id,
  eventId: entry.eventId,
  placement: entry.placement,
  prize: 0,
  playerIds: entry.playerIds,
  org: entry.org,
  source: 'wikipedia' as const,
}));

const entriesByPlayer = new Map<string, EventEntry[]>();
for (const entry of entries) {
  for (const playerId of entry.playerIds) {
    const list = entriesByPlayer.get(playerId);
    if (list) list.push(entry);
    else entriesByPlayer.set(playerId, [entry]);
  }
}

const byDate = (a: EventEntry, b: EventEntry): number => {
  const da = eventById.get(a.eventId)!.date;
  const db = eventById.get(b.eventId)!.date;
  return da < db ? -1 : da > db ? 1 : a.eventId < b.eventId ? -1 : 1;
};
for (const list of entriesByPlayer.values()) list.sort(byDate);

/** Which region a player belongs to: the one they most recently competed in. */
function regionOf(seed: PlayerSeed, playerEntries: EventEntry[]): Region {
  for (let i = playerEntries.length - 1; i >= 0; i--) {
    const region = eventById.get(playerEntries[i].eventId)?.region;
    if (region) return region;
  }
  if (seed.regions.length) return seed.regions[seed.regions.length - 1];
  return REGION_BY_COUNTRY[seed.country] ?? 'NAC';
}

/**
 * Every org spell we can evidence.
 *
 * Two kinds of evidence exist upstream: an entry that names the organisation a
 * roster represented (dated, from the LAN rows), and the current organisation
 * on Wikipedia's earners table (undated). A dated spell runs from the first to
 * the last event played under that banner; the current org is left open-ended.
 */
function orgHistoryOf(seed: PlayerSeed, playerEntries: EventEntry[]): OrgStint[] {
  const observed = new Map<string, { first: string; last: string }>();
  for (const entry of playerEntries) {
    if (!entry.org) continue;
    const date = eventById.get(entry.eventId)!.date;
    const window = observed.get(entry.org);
    if (window) {
      if (date < window.first) window.first = date;
      if (date > window.last) window.last = date;
    } else {
      observed.set(entry.org, { first: date, last: date });
    }
  }

  const current = seed.orgs.length ? seed.orgs[seed.orgs.length - 1] : null;
  const stints: OrgStint[] = [];
  for (const [org, window] of observed) {
    const isCurrent = current?.org === org;
    stints.push({ org, from: window.first, to: isCurrent ? null : window.last, source: 'wikipedia' });
  }
  if (current && !observed.has(current.org)) {
    stints.push({ org: current.org, from: null, to: null, source: current.source });
  }
  return stints.sort((a, b) => (a.from ?? '') < (b.from ?? '') ? -1 : (a.from ?? '') > (b.from ?? '') ? 1 : 0);
}

function teammatesOf(playerId: string, playerEntries: EventEntry[]): TeammateLink[] {
  const shared = new Map<string, string[]>();
  for (const entry of playerEntries) {
    for (const other of entry.playerIds) {
      if (other === playerId) continue;
      const list = shared.get(other);
      if (list) list.push(entry.eventId);
      else shared.set(other, [entry.eventId]);
    }
  }
  return [...shared.entries()]
    .map(([id, eventIds]) => ({ playerId: id, events: eventIds.length, eventIds }))
    .sort((a, b) => b.events - a.events || (a.playerId < b.playerId ? -1 : 1));
}

function buildPlayers(): Player[] {
  return PLAYER_SEEDS.map((seed) => {
    const playerEntries = entriesByPlayer.get(seed.id) ?? [];

    const results: PlayerResult[] = playerEntries.map((entry) => ({
      eventId: entry.eventId,
      entryId: entry.id,
      placement: entry.placement,
      prize: entry.prize,
    }));

    let fncsWins = 0;
    let majorWins = 0;
    for (const entry of playerEntries) {
      if (entry.placement !== 1) continue;
      const tier = eventById.get(entry.eventId)?.tier;
      if (tier === 'fncs') fncsWins++;
      else if (tier) majorWins++;
    }

    const orgHistory = orgHistoryOf(seed, playerEntries);
    const current = orgHistory.find((stint) => stint.to === null) ?? null;

    return {
      id: seed.id,
      name: seed.name,
      realName: seed.realName,
      country: seed.country,
      countryName: COUNTRY_NAMES[seed.country] ?? seed.country,
      region: regionOf(seed, playerEntries),
      regions: seed.regions,
      birthDate: seed.birthDate,
      age: ageAt(seed.birthDate, DATA_UPDATED_AT),
      earnings: seed.earnings,
      earningsKnown: seed.earningsKnown,
      earningsByYear: seed.earningsByYear,
      team: current?.org ?? null,
      orgHistory,
      fncsWins,
      majorWins,
      results,
      teammates: teammatesOf(seed.id, playerEntries),
      photoUrl: null,
      status: seed.status,
    } satisfies Player;
  });
}

export const FORTNITE_PLAYERS: Player[] = buildPlayers();
export const FORTNITE_EVENTS: TournamentEvent[] = EVENTS;
export const FORTNITE_ENTRIES: EventEntry[] = entries;
