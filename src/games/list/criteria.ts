import type { Facts } from '@/data/liquipedia/facts';
import type { Pools } from '@/data/liquipedia/pools';
import type { Roster, RosterPlayer } from '@/data/liquipedia/roster';

/**
 * The List categories.
 *
 * Deliberately a short, hand-picked set rather than the hundreds the generator
 * used to produce. A recall game only works when you can picture the answer
 * set before you start typing — "players who competed at FNCS Chapter 3 Season
 * 2 NA West Grand Finals" is a list nobody holds in their head, and forty of
 * those made the game feel random rather than hard.
 *
 * These five are lists people actually argue about.
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

  return out;
}
