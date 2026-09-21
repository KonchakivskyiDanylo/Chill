import type { Facts } from '@/data/liquipedia/facts';
import type { Pool, Pools } from '@/data/liquipedia/pools';
import type { Roster, RosterPlayer } from '@/data/liquipedia/roster';
import { moneyShort } from '@/lib/format';

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
  answers: RosterPlayer[];
}

/** Below this a category is not worth a 90-second round. */
const MIN_ANSWERS = 8;

export function buildCriteria(roster: Roster, facts: Facts, pools: Pools | null): Criterion[] {
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

  return out;
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
