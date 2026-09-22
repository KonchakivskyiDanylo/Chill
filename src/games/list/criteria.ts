import type { Facts, HeadlineEvent } from '@/data/liquipedia/facts';
import type { Orgs } from '@/data/liquipedia/orgs';
import type { Pool, Pools } from '@/data/liquipedia/pools';
import type { Roster, RosterPlayer } from '@/data/liquipedia/roster';
import type { Teammates } from '@/data/liquipedia/teammates';
import { moneyShort } from '@/lib/format';
import type { Searchable } from '@/lib/text';

/**
 * The List categories.
 *
 * Deliberately a short, hand-picked set rather than the hundreds the generator
 * used to produce. A recall game only works when you can picture the answer
 * set before you start typing — "players who competed at FNCS Chapter 3 Season
 * 2 NA West Grand Finals" is a list nobody holds in their head, and forty of
 * those made the game feel random rather than hard.
 *
 * These are lists people actually argue about.
 */

export interface Criterion {
  id: string;
  /** The prompt shown to the player. */
  title: string;
  /** Extra context, e.g. the event the field came from. */
  subtitle?: string;
  answers: Searchable[];
  /**
   * What the guess box searches, when it is not the roster.
   *
   * Almost every list is answered with players and leaves this alone. "Countries
   * with a player over $1M" is answered with countries, and searching the
   * roster for one would find nothing.
   */
  pool?: Searchable[];
  /** What the answers are, for the prompt and the count. Default "players". */
  noun?: string;
}

/** Below this a category is not worth a 90-second round. */
const MIN_ANSWERS = 8;

export function buildCriteria(
  roster: Roster,
  facts: Facts,
  pools: Pools | null,
  /** Both optional: List loads them after the first paint — see `ListGame`. */
  orgs?: Orgs | null,
  teammates?: Teammates | null,
): Criterion[] {
  const out: Criterion[] = [];
  const byId = new Map(roster.players.map((player) => [player.id, player]));

  const add = (id: string, title: string, answers: RosterPlayer[], subtitle?: string) => {
    if (answers.length < MIN_ANSWERS) return;
    out.push({ id, title, subtitle, answers });
  };

  // ------------------------------------------------------- event fields --
  // A qualified field is the best kind of list: finite, published, and argued
  // about all week.
  for (const pool of pools?.pools ?? []) {
    const answers = pool.players
      .map((id) => byId.get(id))
      .filter((player): player is RosterPlayer => Boolean(player));
    add(`pool:${pool.id}`, `Players who qualified for ${pool.label}`, answers, pool.event);
  }

  // ----------------------------------------------------- FNCS by region --
  // Split, because "every FNCS winner ever" is a 280-name list and neither
  // region's regulars help you with the other's.
  const fncsRegions = new Map<string, RosterPlayer[]>();
  for (const player of roster.players) {
    const regions = new Set<string>();
    for (const index of facts.of(player.id).won) {
      const event = facts.events[index];
      if (event?.kind === 'fncs' && event.region) regions.add(event.region);
    }
    for (const region of regions) {
      const list = fncsRegions.get(region);
      if (list) list.push(player);
      else fncsRegions.set(region, [player]);
    }
  }
  for (const [region, answers] of [...fncsRegions].sort((a, b) => b[1].length - a[1].length)) {
    add(`fncs:${region}`, `FNCS grand final winners — ${region}`, answers);
  }

  // ---------------------------------------------------------- LAN wins --
  add(
    'lan-winners',
    'Players who have won a LAN',
    roster.players.filter((player) => facts.of(player.id).wins.lan > 0),
    'Any offline tournament in the top two tiers',
  );

  // ------------------------------------------------- qualified for both --
  // The overlap between two fields, which is a list people argue about all
  // week and a much shorter one than either field on its own.
  const fields = pools?.pools ?? [];
  if (fields.length >= 2) {
    const [a, b] = fields;
    const inB = new Set(b.players);
    const both = a.players
      .filter((id) => inB.has(id))
      .map((id) => byId.get(id))
      .filter((player): player is RosterPlayer => Boolean(player));
    add(
      `pool:both:${a.id}:${b.id}`,
      `Players who qualified for both ${a.label} and ${b.label}`,
      both,
      'On both fields',
    );
  }

  // --------------------------------------------------------- earnings --
  // Thresholds rather than a top-N, because a threshold is a list you can
  // picture the edge of: "who has cleared a million" is a question with a
  // remembered answer, where "the top 40 earners" is a ranking you look up.
  for (const threshold of [500_000, 1_000_000, 2_000_000]) {
    add(
      `earnings:${threshold}`,
      `Players with ${moneyShort(threshold)}+ career earnings`,
      roster.players.filter((player) => player.earnings >= threshold),
      'Career prize money across every tournament on record',
    );
  }

  // ------------------------------------------------------- FNCS titles --
  for (const threshold of [2, 3, 4]) {
    add(
      `fncs-wins:${threshold}`,
      `Players with ${threshold}+ FNCS wins`,
      roster.players.filter((player) => player.fncsWins >= threshold),
      'FNCS grand finals won, across every season and region',
    );
  }

  // ------------------------------------------------------ year by year --
  /*
   * One season at a time, which is how people actually remember this scene.
   *
   * Titles rather than earnings, because `facts.json` records the years a
   * player won something and nothing anywhere records what a player earned in
   * a given year per player — `rankings.json` has the per-year money as a
   * finished top ten, not as a column anything can filter. "Everyone who
   * cleared $300k in 2021" therefore needs a notebook run; this is the version
   * the shipped data can answer honestly.
   */
  const winYears = [...new Set(roster.players.flatMap((p) => facts.of(p.id).winYears))].sort();
  for (const year of winYears) {
    const winners = roster.players.filter((player) => facts.of(player.id).winYears.includes(year));
    add(`won-in-year:${year}`, `Players who won a title in ${year}`, winners, 'Any tournament win on record');
  }

  // ============================================================ two events ==
  /*
   * "Everyone who was at both of these."
   *
   * The intersection of two fields is a better list than either of them: it is
   * short enough to finish, and it is exactly the argument people have — who
   * has been to every Globals, who was at the World Cup *and* is still here.
   *
   * Only the headline events, because a pair of regional qualifiers is a list
   * nobody holds in their head. `playedAt` is indexed once and reused.
   */
  const headline = facts.headlineEvents;
  for (let i = 0; i < headline.length; i++) {
    for (let j = i + 1; j < headline.length; j++) {
      const a = headline[i];
      const b = headline[j];
      const atB = facts.playedAt(b.index);
      const both = roster.players.filter(
        (player) => facts.playedAt(a.index).has(player.id) && atB.has(player.id),
      );
      add(
        `both:${a.index}:${b.index}`,
        `Players who were at both ${a.short} and ${b.short}`,
        both,
        `${a.date.slice(0, 4)} and ${b.date.slice(0, 4)}`,
      );
    }
  }

  // Every Global Championship there has been — the shortest list in the game
  // and the one worth the most.
  const globals = headline.filter((event) => event.short.includes('Global Championship'));
  if (globals.length >= 3) {
    const everyOne = roster.players.filter((player) =>
      globals.every((event) => facts.playedAt(event.index).has(player.id)),
    );
    add(
      'every-global',
      `Players who have played every FNCS Global Championship`,
      everyOne,
      globals.map((event) => event.date.slice(0, 4)).join(', '),
    );
  }

  /*
   * Back-to-back rounds of the FNCS, by region.
   *
   * A "round" is every region's grand final inside a week of each other, found
   * by clustering the dates — the naming has changed four times and the dates
   * have not. Only the rounds from 2025 on, because a pair from 2020 is two
   * names most people never knew.
   */
  for (const [a, b] of consecutiveFinals(facts)) {
    if (a.date < '2025') continue;
    const atB = facts.playedAt(b.index);
    const both = roster.players.filter(
      (player) => facts.playedAt(a.index).has(player.id) && atB.has(player.id),
    );
    add(`finals-pair:${a.index}:${b.index}`, `Players at both ${a.short} and ${b.short}`, both,
      'Two FNCS grand finals in a row, same region');
  }

  // ===================================================== FNCS, deeper in ====
  for (const threshold of [15, 20, 25]) {
    add(
      `fncs-apps:${threshold}`,
      `Players with ${threshold}+ FNCS grand finals`,
      roster.players.filter((player) => facts.of(player.id).fncsApps >= threshold),
      'Grand finals reached, across every season and region',
    );
  }

  // Won two rounds of the FNCS in a row. Rare enough to be a list and famous
  // enough to be a memory.
  const rounds = fncsRounds(facts);
  add(
    'fncs-back-to-back',
    'Players who have won the FNCS back to back',
    roster.players.filter((player) => {
      const won = new Set(facts.of(player.id).won);
      let previous = false;
      for (const round of rounds) {
        const here = round.some((event) => won.has(event.index));
        if (here && previous) return true;
        previous = here;
      }
      return false;
    }),
    'Two consecutive rounds of FNCS grand finals',
  );

  // ============================================================= earnings ===
  // Per year, which is how a career is actually remembered: 2019 is the World
  // Cup and nothing else, 2021 is a different cast entirely.
  const years = [
    ...new Set(roster.players.flatMap((player) => Object.keys(player.earningsByYear).map(Number))),
  ].sort();
  for (const year of years) {
    for (const threshold of [100_000, 200_000]) {
      add(
        `year-earnings:${year}:${threshold}`,
        `Players who earned ${moneyShort(threshold)}+ in ${year}`,
        roster.players.filter((player) => (player.earningsByYear[year] ?? 0) >= threshold),
        `Prize money won during ${year}`,
      );
    }
  }
  add(
    'year-earnings:best:500000',
    'Players who have earned $500K+ in a single year',
    roster.players.filter((player) =>
      Object.values(player.earningsByYear).some((amount) => amount >= 500_000),
    ),
    'Any one calendar year on record',
  );

  // ======================================================== who plus what ===
  // A country crossed with an achievement. "French FNCS winners" is a list
  // somebody can actually reel off; "French players" is a phone book.
  const byCountry = new Map<string, RosterPlayer[]>();
  for (const player of roster.players) {
    if (!player.countryName) continue;
    const list = byCountry.get(player.countryName);
    if (list) list.push(player);
    else byCountry.set(player.countryName, [player]);
  }
  for (const [country, players] of [...byCountry].sort((a, b) => b[1].length - a[1].length)) {
    add(
      `country-fncs:${country}`,
      `Players from ${country} who have won an FNCS`,
      players.filter((player) => player.fncsWins > 0),
      'FNCS grand finals won, across every season and region',
    );
    add(
      `country-earnings:${country}`,
      `Players from ${country} with $100K+ career earnings`,
      players.filter((player) => player.earnings >= 100_000),
      'Career prize money across every tournament on record',
    );
  }

  // Countries, not players: the one list here you answer with a flag's name.
  const countryPool = [...byCountry.keys()].sort().map((name) => ({ id: name, name }));
  for (const threshold of [100_000, 500_000, 1_000_000]) {
    const countries = [...byCountry]
      .filter(([, players]) => players.some((player) => player.earnings >= threshold))
      .map(([name]) => ({ id: name, name }));
    if (countries.length >= MIN_ANSWERS) {
      out.push({
        id: `countries-over:${threshold}`,
        title: `Countries with a player over ${moneyShort(threshold)} in career earnings`,
        subtitle: 'One player is enough to put a country on this list',
        answers: countries,
        pool: countryPool,
        noun: 'countries',
      });
    }
  }

  // ================================================================= orgs ===
  // All-time, not the current badge: "has played for FaZe" is a list, "plays
  // for FaZe" is a roster page.
  // $500k is where the tail stops being names anyone can place: it keeps 52
  // organisations, and the last of them is still a team you have heard of.
  for (const org of orgs?.notable(500_000) ?? []) {
    add(
      `org:${org.id}`,
      `Players who have played for ${org.name}`,
      org.ever
        .map((id) => byId.get(id))
        .filter((player): player is RosterPlayer => Boolean(player)),
      'Anyone on the roster at any point, not just today',
    );
  }

  // ============================================================ teammates ===
  /*
   * "Everyone who has queued with X."
   *
   * Anchored on names people can picture, and cut at ten tournaments together
   * so the list is a duo history rather than everyone who ever shared a lobby.
   * Needs `teammates.json`, which List loads in the background — see the note
   * where it is called.
   */
  if (teammates) {
    const anchors = [...roster.players].sort((a, b) => b.earnings - a.earnings).slice(0, 30);
    for (const anchor of anchors) {
      add(
        `with:${anchor.id}`,
        `Players who have played 10+ tournaments with ${anchor.name}`,
        teammates
          .cluesFor(anchor.id, byId)
          .filter((clue) => clue.events >= 10)
          .map((clue) => clue.player),
        'Tournaments entered together, across their whole careers',
      );
    }
  }

  return out;
}

/**
 * Rounds of the FNCS: every region's grand final inside a week of each other.
 *
 * Clustered on the date rather than parsed out of the name, because the name
 * has been "FNCS: Season X", "C2S1: FNCS", "FNCS 2023 - Major 1" and "FNCS
 * 2025 - Major 3" and the dates have been the dates throughout. A cluster of
 * fewer than four regions is a one-off nobody could qualify for — a Global
 * Championship, an invitational — and is not a round.
 */
function fncsRounds(facts: Facts): HeadlineEvent[][] {
  const finals = facts.events
    .filter((event) => event.kind === 'fncs')
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const rounds: HeadlineEvent[][] = [];
  let current: HeadlineEvent[] = [];
  for (const event of finals) {
    const gap = current.length
      ? (Date.parse(event.date) - Date.parse(current[current.length - 1].date)) / 86_400_000
      : 0;
    if (current.length && gap > 7) {
      rounds.push(current);
      current = [];
    }
    current.push(event);
  }
  if (current.length) rounds.push(current);
  return rounds.filter((round) => round.length >= 4);
}

/** Consecutive grand finals in one region, newest last. */
function consecutiveFinals(facts: Facts): [HeadlineEvent, HeadlineEvent][] {
  const byRegion = new Map<string, HeadlineEvent[]>();
  for (const event of facts.events) {
    if (event.kind !== 'fncs' || !event.region) continue;
    const list = byRegion.get(event.region);
    if (list) list.push(event);
    else byRegion.set(event.region, [event]);
  }
  const pairs: [HeadlineEvent, HeadlineEvent][] = [];
  for (const events of byRegion.values()) {
    events.sort((a, b) => (a.date < b.date ? -1 : 1));
    for (let i = 1; i < events.length; i++) pairs.push([events[i - 1], events[i]]);
  }
  return pairs;
}

/**
 * The same kinds of list, cut down to one tournament's field.
 *
 * "Name everyone who qualified" is the obvious one and the whole field is the
 * answer, which makes it the one list in this game you can genuinely finish.
 * The rest are that list crossed with a fact — everyone from Europe who made
 * it, everyone in the field who has won an FNCS — and they are better recall
 * prompts than their all-time versions precisely because the ceiling is eighty
 * rather than four thousand: you can hold the shape of the answer in your head
 * and still not be able to name it.
 *
 * Nothing here is precomputed. A field is a hundred players and every fact
 * needed is already on the roster row or in `facts.json`.
 */
export function buildPoolCriteria(
  pool: Pool,
  players: RosterPlayer[],
  facts: Facts,
): Criterion[] {
  const out: Criterion[] = [];
  const add = (id: string, title: string, answers: RosterPlayer[], subtitle?: string) => {
    if (answers.length < MIN_ANSWERS) return;
    out.push({ id, title, subtitle, answers });
  };
  const prefix = `pool:${pool.id}`;
  const field = `The ${pool.label} field`;

  add(`${prefix}:all`, `Everyone who qualified for ${pool.label}`, players, pool.event);

  // ------------------------------------------------------------ regions --
  const regions = new Map<string, RosterPlayer[]>();
  for (const player of players) {
    if (!player.region) continue;
    const list = regions.get(player.region);
    if (list) list.push(player);
    else regions.set(player.region, [player]);
  }
  for (const [region, answers] of [...regions].sort((a, b) => b[1].length - a[1].length)) {
    add(`${prefix}:region:${region}`, `${pool.label} qualifiers from ${region}`, answers, field);
  }

  // ---------------------------------------------------------- countries --
  // Only the well-represented ones: "the two Norwegians who qualified" is a
  // trivia question, not a list.
  const countries = new Map<string, RosterPlayer[]>();
  for (const player of players) {
    if (!player.countryName) continue;
    const list = countries.get(player.countryName);
    if (list) list.push(player);
    else countries.set(player.countryName, [player]);
  }
  for (const [country, answers] of [...countries].sort((a, b) => b[1].length - a[1].length)) {
    add(`${prefix}:country:${country}`, `${pool.label} qualifiers from ${country}`, answers, field);
  }

  // ------------------------------------------------------------- titles --
  add(
    `${prefix}:fncs`,
    `${pool.label} qualifiers who have won an FNCS`,
    players.filter((player) => player.fncsWins > 0),
    `${field} — FNCS grand finals won across every season and region`,
  );
  add(
    `${prefix}:lan`,
    `${pool.label} qualifiers who have won a LAN`,
    players.filter((player) => facts.of(player.id).wins.lan > 0),
    `${field} — any offline tournament in the top two tiers`,
  );
  add(
    `${prefix}:no-fncs`,
    `${pool.label} qualifiers who have never won an FNCS`,
    players.filter((player) => player.fncsWins === 0),
    field,
  );

  // ------------------------------------------------------------- status --
  add(
    `${prefix}:retired`,
    `${pool.label} qualifiers who are no longer competing`,
    players.filter((player) => player.status !== 'active'),
    field,
  );

  return out;
}
