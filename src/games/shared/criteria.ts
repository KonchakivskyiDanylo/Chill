import type { Dataset } from '@/data/dataset';
import type { Player } from '@/data/types';
import { REGION_LABEL } from '@/data/types';
import { moneyShort } from '@/lib/format';

/**
 * Reusable player predicates.
 *
 * Impostor, Tic Tac Toe and Connections all need "does this player satisfy X",
 * so the criteria live in one place. Every criterion carries its matching
 * players, which is what lets the puzzle generators reject impossible boards
 * before showing them.
 */

export type CriterionKind =
  | 'country'
  | 'region'
  | 'team'
  | 'org-history'
  | 'fncs-winner'
  | 'global-winner'
  | 'lan-winner'
  | 'earnings'
  | 'fncs-wins'
  | 'won-in-region'
  | 'won-in-year'
  | 'won-format'
  | 'age'
  | 'status'
  | 'played-event'
  | 'teammates';

export interface PlayerCriterion {
  id: string;
  kind: CriterionKind;
  /** Reads after "This player ...", e.g. "plays for NRG". */
  label: string;
  /** Compact label for grid headers. */
  short: string;
  test: (player: Player) => boolean;
  matches: Player[];
}

export interface CriteriaOptions {
  /** Criteria with fewer matches than this are dropped. */
  minMatches?: number;
  /** Criteria matching more than this share of the roster are dropped (too easy). */
  maxShare?: number;
}

export function buildCriteria(dataset: Dataset, options: CriteriaOptions = {}): PlayerCriterion[] {
  const { minMatches = 4, maxShare = 0.55 } = options;
  const out: PlayerCriterion[] = [];

  const add = (
    id: string,
    kind: CriterionKind,
    label: string,
    short: string,
    test: (player: Player) => boolean,
  ) => {
    const matches = dataset.players.filter(test);
    if (matches.length < minMatches) return;
    if (matches.length > dataset.players.length * maxShare) return;
    out.push({ id, kind, label, short, test, matches });
  };

  for (const country of dataset.countries) {
    const name = dataset.countryName(country);
    add(`country:${country}`, 'country', `is from ${name}`, name, (player) => player.country === country);
  }

  for (const region of dataset.regions) {
    add(
      `region:${region}`,
      'region',
      `competes in ${REGION_LABEL[region]}`,
      REGION_LABEL[region],
      (player) => player.region === region,
    );
  }

  for (const team of dataset.teams) {
    add(`team:${team}`, 'team', `plays for ${team}`, team, (player) => player.team === team);
  }

  add('fncs-winner', 'fncs-winner', 'has won an FNCS title', 'FNCS winner', (player) => player.fncsWins > 0);

  const globalWinners = new Set(dataset.winnersByTier(['global']).map((player) => player.id));
  add(
    'global-winner',
    'global-winner',
    'has won a global championship',
    'Global champion',
    (player) => globalWinners.has(player.id),
  );

  const lanWinners = new Set(dataset.winnersByTier(['lan', 'global']).map((player) => player.id));
  add(
    'lan-winner',
    'lan-winner',
    'has won a major LAN or global event',
    'Major/LAN winner',
    (player) => lanWinners.has(player.id),
  );

  for (const threshold of [500_000, 750_000, 1_000_000]) {
    add(
      `earnings:${threshold}`,
      'earnings',
      `has earned ${moneyShort(threshold)}+ in their career`,
      `${moneyShort(threshold)}+ earned`,
      (player) => player.earnings >= threshold,
    );
  }

  for (const threshold of [2, 3]) {
    add(
      `fncs-wins:${threshold}`,
      'fncs-wins',
      `has ${threshold}+ FNCS titles`,
      `${threshold}+ FNCS titles`,
      (player) => player.fncsWins >= threshold,
    );
  }

  // Where a player actually won, which is not always where they compete now:
  // Muz won in Oceania and NA East, Acorn in NA East and NA Central.
  const wonIn = new Map<string, Set<string>>();
  const wonYear = new Map<string, Set<number>>();
  const wonFormat = new Map<string, Set<string>>();
  for (const player of dataset.roster) {
    for (const { event, result } of dataset.careerOf(player)) {
      if (result.placement !== 1) continue;
      if (event.region) {
        const set = wonIn.get(player.id) ?? new Set<string>();
        set.add(event.region);
        wonIn.set(player.id, set);
      }
      const years = wonYear.get(player.id) ?? new Set<number>();
      years.add(event.year);
      wonYear.set(player.id, years);
      const formats = wonFormat.get(player.id) ?? new Set<string>();
      formats.add(event.format);
      wonFormat.set(player.id, formats);
    }
  }

  for (const region of dataset.regions) {
    add(
      `won-in:${region}`,
      'won-in-region',
      `has won a title in ${REGION_LABEL[region]}`,
      `Title in ${REGION_LABEL[region]}`,
      (player) => wonIn.get(player.id)?.has(region) ?? false,
    );
  }

  for (const year of [...new Set(dataset.events.map((event) => event.year))].sort()) {
    add(
      `won-in-year:${year}`,
      'won-in-year',
      `won a title in ${year}`,
      `Won in ${year}`,
      (player) => wonYear.get(player.id)?.has(year) ?? false,
    );
  }

  for (const format of ['solo', 'duo', 'trio', 'squad'] as const) {
    add(
      `won-format:${format}`,
      'won-format',
      `has won a ${format} event`,
      `${format[0].toUpperCase()}${format.slice(1)} winner`,
      (player) => wonFormat.get(player.id)?.has(format) ?? false,
    );
  }

  // Org *history*, not just the current badge — most players have worn several.
  for (const org of dataset.allOrgs) {
    const ids = new Set(dataset.everPlayedFor(org).map((player) => player.id));
    add(
      `org:${org}`,
      'org-history',
      `has played for ${org}`,
      org,
      (player) => ids.has(player.id),
    );
  }

  for (const [id, label, short, test] of [
    ['age:under-20', 'is under 20', 'Under 20', (p: Player) => p.age !== null && p.age < 20],
    ['age:20-plus', 'is 20 or older', '20+', (p: Player) => p.age !== null && p.age >= 20],
  ] as const) {
    add(id, 'age', label, short, test);
  }

  add('status:active', 'status', 'is still competing', 'Active', (player) => player.status === 'active');

  // "Played at <major>" — only the headline events, never a regional final.
  for (const event of dataset.events) {
    if (event.tier === 'fncs') continue;
    const ids = new Set(dataset.participantsOf(event.id).map((player) => player.id));
    add(
      `played:${event.id}`,
      'played-event',
      `played at ${event.name}`,
      // "Played" matters in a grid header — otherwise it reads as "won it".
      `Played ${event.shortName}`,
      (player) => ids.has(player.id),
    );
  }

  return out;
}

/** Players who satisfy both criteria — the Tic Tac Toe cell test. */
export function intersect(a: PlayerCriterion, b: PlayerCriterion): Player[] {
  return a.matches.filter((player) => b.test(player));
}

/**
 * True when one criterion implies the other, e.g. "3+ FNCS titles" inside
 * "2+ FNCS titles", or "global champion" inside "major/LAN winner". Such a pair
 * makes a redundant row/column or a muddy Connections group, so generators
 * reject boards containing one.
 */
export function isNested(a: PlayerCriterion, b: PlayerCriterion): boolean {
  const [small, large] = a.matches.length <= b.matches.length ? [a, b] : [b, a];
  return small.matches.every((player) => large.test(player));
}

/** No pair among the given criteria may imply another. */
export function hasNestedPair(criteria: PlayerCriterion[]): boolean {
  for (let i = 0; i < criteria.length; i++) {
    for (let j = i + 1; j < criteria.length; j++) {
      if (isNested(criteria[i], criteria[j])) return true;
    }
  }
  return false;
}
