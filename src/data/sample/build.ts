import { makeRng, randInt, shuffle, type Rng } from '@/lib/rng';
import {
  DATA_UPDATED_AT,
  type Player,
  type PlayerResult,
  type Region,
  type TeammateLink,
  type TournamentEvent,
} from '@/data/types';
import { COUNTRY_NAMES, ROSTER, type RosterSeed } from './roster';
import { EVENTS, EVENT_BY_ID, FNCS_SEASONS } from './tournaments';

/**
 * Expands the compact seed roster into the full dataset every game consumes.
 *
 * The generator is fully deterministic (seeded by player id), so the site shows
 * the same dataset on every load and across devices. Its job is to guarantee
 * internal consistency, in particular:
 *
 *  - a player's `fncsWins` is *derived* from their results, never authored
 *    independently, so "Top 10 FNCS wins" and "FNCS winners" always agree;
 *  - placements are unique per player within an event (bar a couple of authored
 *    real-world ties), so "Top 10 at <event>" has an unambiguous answer;
 *  - `earningsByYear` always sums to career `earnings`;
 *  - teammate match counts are symmetric between both players.
 */

const SEASON_INDEX = new Map(FNCS_SEASONS.map((s, i) => [s.key, i]));

/** How likely a player of each tier is to reach a regional grand final. */
const FINALS_RATE: Record<RosterSeed['tier'], number> = { 1: 0.92, 2: 0.78, 3: 0.62, 4: 0.46 };
/** Relative strength used to order players inside an event. */
const TIER_STRENGTH: Record<RosterSeed['tier'], number> = { 1: 1.0, 2: 0.72, 3: 0.5, 4: 0.34 };
/** How likely a player of each tier is invited to / qualifies for a non-FNCS major. */
const MAJOR_RATE: Record<RosterSeed['tier'], number> = { 1: 0.78, 2: 0.5, 3: 0.26, 4: 0.12 };

const SMALL_REGIONS: Region[] = ['NAW', 'BR', 'OCE', 'ASIA', 'ME'];

function fieldSize(event: TournamentEvent): number {
  if (event.id === 'wc-2019-solo' || event.id === 'fncs-invitational-2021') return 100;
  if (event.id === 'wc-2019-duo') return 50;
  if (event.tier === 'lan') return 32;
  if (event.tier === 'global') return event.format === 'solo' ? 75 : 50;
  return event.region && SMALL_REGIONS.includes(event.region) ? 25 : 33;
}

/** Rough prize weight: steeply front-loaded, like a real payout table. */
function prizeWeight(event: TournamentEvent, placement: number): number {
  const base = event.tier === 'global' ? 30 : event.tier === 'lan' ? 22 : event.tier === 'fncs' ? 14 : 10;
  const regionFactor = event.region && SMALL_REGIONS.includes(event.region) ? 0.55 : 1;
  return (base * regionFactor) / Math.pow(placement, 0.85);
}

function ageAt(birthDate: string | null, onDate: string): number | null {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  const on = new Date(onDate);
  let age = on.getFullYear() - born.getFullYear();
  const monthDiff = on.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && on.getDate() < born.getDate())) age--;
  return age;
}

function activeSeasons(seed: RosterSeed): string[] {
  const from = SEASON_INDEX.get(seed.first) ?? 0;
  const to = SEASON_INDEX.get(seed.last) ?? FNCS_SEASONS.length - 1;
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  return FNCS_SEASONS.slice(lo, hi + 1).map((s) => s.key);
}

function activeYears(seed: RosterSeed): number[] {
  const seasons = activeSeasons(seed);
  const years = new Set<number>();
  for (const key of seasons) {
    const season = FNCS_SEASONS[SEASON_INDEX.get(key) ?? 0];
    years.add(season.year);
  }
  // World Cup year for the earliest generation of players.
  if (seed.first === 'C2S1') years.add(2019);
  return [...years].sort();
}

interface Participation {
  seed: RosterSeed;
  rng: Rng;
  /** Events entered, before placements are known. */
  eventIds: Set<string>;
  /** Placements pinned before the per-event ranking pass. */
  pinned: Map<string, number>;
}

function buildParticipation(): Map<string, Participation> {
  const byId = new Map<string, Participation>();

  for (const seed of ROSTER) {
    const rng = makeRng(`participation:${seed.id}`);
    const eventIds = new Set<string>();
    const pinned = new Map<string, number>();

    // FNCS regional grand finals.
    const seasons = activeSeasons(seed);
    for (const seasonKey of seasons) {
      if (rng() < FINALS_RATE[seed.tier]) {
        eventIds.add(`fncs-${seasonKey.toLowerCase()}-${seed.region.toLowerCase()}`);
      }
    }
    // Career Path needs a real path: guarantee at least three majors.
    if (eventIds.size < 3) {
      for (const seasonKey of shuffle(rng, seasons)) {
        if (eventIds.size >= 3) break;
        eventIds.add(`fncs-${seasonKey.toLowerCase()}-${seed.region.toLowerCase()}`);
      }
    }

    // Non-FNCS majors the player was around for.
    const years = new Set(activeYears(seed));
    for (const event of EVENTS) {
      if (event.tier === 'fncs') continue;
      if (!years.has(event.year)) continue;
      if (rng() < MAJOR_RATE[seed.tier]) eventIds.add(event.id);
    }

    // Authored results always take precedence.
    for (const [eventId, placement] of seed.signature ?? []) {
      if (!EVENT_BY_ID.has(eventId)) continue;
      eventIds.add(eventId);
      pinned.set(eventId, placement);
    }

    byId.set(seed.id, { seed, rng, eventIds, pinned });
  }

  return byId;
}

/**
 * Hands out FNCS titles. One title per event (authored ties aside) so that
 * "who won FNCS Ch4S4 EU" has exactly one answer.
 */
function assignTitles(participation: Map<string, Participation>): void {
  const claimed = new Set<string>();
  for (const p of participation.values()) {
    for (const [eventId, placement] of p.pinned) {
      if (placement === 1) claimed.add(eventId);
    }
  }

  // Strongest players claim first so titles land on plausible names.
  const contenders = [...participation.values()]
    .filter((p) => (p.seed.fncsWins ?? 0) > 0)
    .sort((a, b) => a.seed.tier - b.seed.tier || b.seed.pr - a.seed.pr || (a.seed.id < b.seed.id ? -1 : 1));

  for (const p of contenders) {
    const target = p.seed.fncsWins ?? 0;
    const candidates = shuffle(
      makeRng(`titles:${p.seed.id}`),
      [...p.eventIds].filter((id) => {
        const event = EVENT_BY_ID.get(id);
        return event?.tier === 'fncs' && !claimed.has(id) && !p.pinned.has(id);
      }),
    );
    for (const eventId of candidates.slice(0, target)) {
      claimed.add(eventId);
      p.pinned.set(eventId, 1);
    }
  }
}

/** Ranks every event's field and writes a placement for each participant. */
function assignPlacements(participation: Map<string, Participation>): Map<string, PlayerResult[]> {
  const byEvent = new Map<string, string[]>();
  for (const p of participation.values()) {
    for (const eventId of p.eventIds) {
      const list = byEvent.get(eventId);
      if (list) list.push(p.seed.id);
      else byEvent.set(eventId, [p.seed.id]);
    }
  }

  const results = new Map<string, PlayerResult[]>();
  for (const seed of ROSTER) results.set(seed.id, []);

  for (const [eventId, playerIds] of byEvent) {
    const event = EVENT_BY_ID.get(eventId);
    if (!event) continue;
    const rng = makeRng(`event:${eventId}`);
    const size = Math.max(fieldSize(event), playerIds.length);

    const taken = new Set<number>();
    const placements = new Map<string, number>();
    for (const id of playerIds) {
      const pinnedPlacement = participation.get(id)!.pinned.get(eventId);
      if (pinnedPlacement !== undefined) {
        placements.set(id, pinnedPlacement);
        taken.add(pinnedPlacement);
      }
    }

    const open = playerIds.filter((id) => !placements.has(id));
    // Strength ordering, with jitter so results are not perfectly tier-sorted.
    const ranked = open
      .map((id) => {
        const seed = participation.get(id)!.seed;
        return { id, score: TIER_STRENGTH[seed.tier] + (rng() - 0.5) * 0.55 };
      })
      .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));

    // Titles are never generated. A 1st place exists only where the roster
    // authored one (via `fncsWins` or a `signature` entry), so the number of
    // wins a player shows always matches what you wrote in roster.ts. Events
    // nobody claimed simply have no winner in our player pool.
    const pool: number[] = [];
    for (let position = 2; position <= size; position++) {
      if (!taken.has(position)) pool.push(position);
    }
    const chosen = shuffle(rng, pool)
      .slice(0, ranked.length)
      .sort((a, b) => a - b);
    ranked.forEach((entry, index) => placements.set(entry.id, chosen[index]));

    for (const [id, placement] of placements) {
      results.get(id)!.push({ eventId, placement, prize: 0 });
    }
  }

  for (const list of results.values()) {
    list.sort((a, b) => {
      const ea = EVENT_BY_ID.get(a.eventId)!;
      const eb = EVENT_BY_ID.get(b.eventId)!;
      return ea.date < eb.date ? -1 : ea.date > eb.date ? 1 : ea.id < eb.id ? -1 : 1;
    });
  }
  return results;
}

/**
 * Splits career earnings into per-result prizes plus a per-year remainder for
 * the minor events we do not model. Always sums exactly to `earnings`.
 */
function assignEarnings(
  seed: RosterSeed,
  playerResults: PlayerResult[],
): { earningsByYear: Record<string, number>; earnings: number } {
  const years = activeYears(seed);
  const byYear: Record<string, number> = {};
  for (const year of years) byYear[String(year)] = 0;

  const weights = playerResults.map((r) => prizeWeight(EVENT_BY_ID.get(r.eventId)!, r.placement));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  // Majors account for the bulk of a career; the rest is Cash Cups and qualifiers.
  const majorPot = Math.round(seed.earnings * 0.72);

  playerResults.forEach((result, index) => {
    const share = totalWeight > 0 ? weights[index] / totalWeight : 0;
    const prize = Math.round((majorPot * share) / 50) * 50;
    result.prize = prize;
    const year = String(EVENT_BY_ID.get(result.eventId)!.year);
    byYear[year] = (byYear[year] ?? 0) + prize;
  });

  // Spread the remainder across active years, weighted towards busier years.
  const spent = Object.values(byYear).reduce((sum, v) => sum + v, 0);
  let remainder = seed.earnings - spent;
  if (years.length > 0) {
    const rng = makeRng(`earnings:${seed.id}`);
    const shares = years.map(() => 0.5 + rng());
    const shareTotal = shares.reduce((sum, s) => sum + s, 0);
    years.forEach((year, index) => {
      if (index === years.length - 1) return;
      const amount = Math.round((remainder * shares[index]) / shareTotal / 50) * 50;
      byYear[String(year)] = (byYear[String(year)] ?? 0) + amount;
      remainder -= amount;
    });
    const lastYear = String(years[years.length - 1]);
    byYear[lastYear] = (byYear[lastYear] ?? 0) + remainder;
  }

  // Guard against a negative tail if the remainder maths ever overshoots.
  for (const key of Object.keys(byYear)) {
    if (byYear[key] < 0) byYear[key] = 0;
  }
  const total = Object.values(byYear).reduce((sum, v) => sum + v, 0);
  return { earningsByYear: byYear, earnings: total };
}

/** Builds symmetric teammate links: A played N matches with B means B played N with A. */
function buildTeammates(): Map<string, TeammateLink[]> {
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const pairMatches = new Map<string, number>();
  const partnersOf = new Map<string, Set<string>>();
  for (const seed of ROSTER) partnersOf.set(seed.id, new Set());

  const seasonsOf = new Map(ROSTER.map((s) => [s.id, new Set(activeSeasons(s))]));
  const overlaps = (a: RosterSeed, b: RosterSeed) => {
    const sa = seasonsOf.get(a.id)!;
    for (const key of seasonsOf.get(b.id)!) if (sa.has(key)) return true;
    return false;
  };

  const link = (a: string, b: string, matches: number) => {
    if (a === b) return;
    const key = pairKey(a, b);
    if (!pairMatches.has(key)) pairMatches.set(key, matches);
    partnersOf.get(a)!.add(b);
    partnersOf.get(b)!.add(a);
  };

  // 1. Authored duos/trios get the biggest match counts.
  for (const seed of ROSTER) {
    const rng = makeRng(`partners:${seed.id}`);
    for (const partnerId of seed.partners ?? []) {
      if (!seasonsOf.has(partnerId)) continue;
      link(seed.id, partnerId, randInt(rng, 620, 1240));
    }
  }

  // 2. Fill up to 10+ links from region-mates whose careers overlap.
  for (const seed of ROSTER) {
    const rng = makeRng(`teammates:${seed.id}`);
    const pool = ROSTER.filter(
      (other) =>
        other.id !== seed.id &&
        !partnersOf.get(seed.id)!.has(other.id) &&
        other.region === seed.region &&
        overlaps(seed, other),
    );
    // Fall back to the whole roster if a region is too thin to reach ten links.
    const fallback = ROSTER.filter(
      (other) => other.id !== seed.id && !partnersOf.get(seed.id)!.has(other.id),
    );
    const candidates = shuffle(rng, pool.length >= 12 ? pool : [...pool, ...shuffle(rng, fallback)]);
    for (const other of candidates) {
      if (partnersOf.get(seed.id)!.size >= 12) break;
      link(seed.id, other.id, randInt(rng, 18, 480));
    }
  }

  const out = new Map<string, TeammateLink[]>();
  for (const seed of ROSTER) {
    const links: TeammateLink[] = [...partnersOf.get(seed.id)!].map((playerId) => ({
      playerId,
      matches: pairMatches.get(pairKey(seed.id, playerId)) ?? 0,
    }));
    links.sort((a, b) => b.matches - a.matches || (a.playerId < b.playerId ? -1 : 1));
    out.set(seed.id, links);
  }
  return out;
}

function buildPlayers(): Player[] {
  const participation = buildParticipation();
  assignTitles(participation);
  const resultsById = assignPlacements(participation);
  const teammatesById = buildTeammates();

  return ROSTER.map((seed) => {
    const results = resultsById.get(seed.id) ?? [];
    const { earningsByYear, earnings } = assignEarnings(seed, results);
    const fncsWins = results.filter(
      (r) => EVENT_BY_ID.get(r.eventId)?.tier === 'fncs' && r.placement === 1,
    ).length;

    return {
      id: seed.id,
      name: seed.name,
      realName: seed.realName ?? null,
      country: seed.country,
      countryName: COUNTRY_NAMES[seed.country] ?? seed.country,
      region: seed.region,
      birthDate: seed.born ?? null,
      age: ageAt(seed.born ?? null, DATA_UPDATED_AT),
      earnings,
      earningsByYear,
      team: seed.team ?? null,
      fncsWins,
      pr: seed.pr,
      results,
      teammates: teammatesById.get(seed.id) ?? [],
      photoUrl: null,
      status: seed.status ?? 'active',
    } satisfies Player;
  });
}

/** The generated sample dataset. Built once per page load. */
export const SAMPLE_PLAYERS: Player[] = buildPlayers();
export const SAMPLE_EVENTS: TournamentEvent[] = EVENTS;
