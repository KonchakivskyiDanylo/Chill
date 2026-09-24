import type { Facts } from '@/data/liquipedia/facts';
import type { Orgs } from '@/data/liquipedia/orgs';
import type { RosterPlayer } from '@/data/liquipedia/roster';
import { moneyShort } from '@/lib/format';

/**
 * Reusable player predicates.
 *
 * Griefer, Tic Tac Toe and Connections all need "does this player satisfy X",
 * so the criteria live in one place. Every criterion carries its matching
 * players, which is what lets the puzzle generators reject impossible boards
 * before showing them.
 *
 * Rebuilt on the Liquipedia export. The previous version ran on the 316-player
 * Wikipedia import and could only really answer two questions — of the 21
 * criteria it produced, 16 were a country or a region. That is why a Griefer
 * board reading "every player here competes in Brazil" was solvable without
 * knowing a single player: the cards carried flags, and the flags were the
 * answer. Cards now show the handle alone, and the criteria below are varied
 * enough that reading one off a card is no longer possible anyway.
 */

export type CriterionKind =
  | 'country'
  | 'region'
  | 'org'
  | 'fncs-winner'
  | 'global-winner'
  | 'lan-winner'
  | 'tournament-winner'
  | 'earnings'
  | 'fncs-wins'
  | 'won-fncs-region'
  | 'won-fncs-year'
  | 'played-event'
  | 'status'
  | 'age';

export interface PlayerCriterion {
  id: string;
  kind: CriterionKind;
  /** Reads after "This player ...", e.g. "has played for NRG". */
  label: string;
  /** Compact label for grid headers. */
  short: string;
  test: (player: RosterPlayer) => boolean;
  matches: RosterPlayer[];
}

export interface CriteriaSource {
  /** The pool criteria are built against — usually the game's chosen pool. */
  players: readonly RosterPlayer[];
  facts: Facts;
  orgs: Orgs;
}

export interface CriteriaOptions {
  /** Criteria with fewer matches than this are dropped. */
  minMatches?: number;
  /** Criteria matching more than this share of the pool are dropped (too easy). */
  maxShare?: number;
  /**
   * How many organisations may become rules, richest first.
   *
   * Capped, and low, for two reasons. The generators pick a rule at random, and
   * without a cap 174 of the ~250 rules were organisations — so "has played for
   * X" came up seven times in ten and career earnings, titles and tournaments
   * almost never did. And the tail of that list is orgs nobody can name: being
   * asked which four of eight players once had a stint at a team with a
   * Liquipedia page and $102k in career prize money is not a quiz question.
   */
  maxOrgs?: number;
}

/**
 * How the scene writes each FNCS region. South America is Liquipedia's label
 * for what the FNCS itself has always called Brazil.
 */
const REGION_SHORT: Record<string, string> = {
  'North America': 'NA',
  Europe: 'EU',
  'South America': 'BR',
  Oceania: 'OCE',
  'Middle East': 'ME',
  Asia: 'Asia',
};

export function buildCriteria(
  { players, facts, orgs }: CriteriaSource,
  options: CriteriaOptions = {},
): PlayerCriterion[] {
  const { minMatches = 4, maxShare = 0.5, maxOrgs = 10 } = options;
  const out: PlayerCriterion[] = [];

  const add = (
    id: string,
    kind: CriterionKind,
    label: string,
    short: string,
    test: (player: RosterPlayer) => boolean,
  ) => {
    const matches = players.filter(test);
    if (matches.length < minMatches) return;
    if (matches.length > players.length * maxShare) return;
    out.push({ id, kind, label, short, test, matches });
  };

  // ------------------------------------------------------------ identity --
  for (const country of [...new Set(players.map((p) => p.countryName).filter(Boolean))] as string[]) {
    add(`country:${country}`, 'country', `is from ${country}`, country, (p) => p.countryName === country);
  }

  for (const region of [...new Set(players.map((p) => p.region).filter(Boolean))] as string[]) {
    add(`region:${region}`, 'region', `competes in ${region}`, region, (p) => p.region === region);
  }

  add('status:active', 'status', 'is still competing', 'Active', (p) => p.status === 'active');
  add('status:retired', 'status', 'has retired from competing', 'Retired', (p) => p.status !== 'active');

  for (const [id, label, short, test] of [
    ['age:under-18', 'is under 18', 'Under 18', (p: RosterPlayer) => p.age !== null && p.age < 18],
    ['age:20-plus', 'is 20 or older', '20+', (p: RosterPlayer) => p.age !== null && p.age >= 20],
  ] as const) {
    add(id, 'age', label, short, test);
  }

  // ---------------------------------------------------------------- orgs --
  // Org *history*, not the current badge — most players have worn several, and
  // "has played for FaZe" is a far better question than "plays for FaZe today".
  //
  // `notable()` is already sorted richest first, so the cap takes the orgs a
  // viewer would actually recognise. See `maxOrgs`.
  for (const org of orgs.notable().slice(0, maxOrgs)) {
    const ids = new Set(org.ever);
    add(`org:${org.id}`, 'org', `has played for ${org.name}`, org.name, (p) => ids.has(p.id));
  }

  // --------------------------------------------------------------- wins --
  add('fncs-winner', 'fncs-winner', 'has won an FNCS title', 'FNCS winner', (p) => p.fncsWins > 0);
  add(
    'global-winner',
    'global-winner',
    'has won a global championship',
    'Global champion',
    (p) => facts.of(p.id).wins.global > 0,
  );
  add(
    'lan-winner',
    'lan-winner',
    'has won a LAN',
    'LAN winner',
    (p) => facts.of(p.id).wins.lan > 0,
  );
  add(
    'tournament-winner',
    'tournament-winner',
    'has won a major tournament',
    'Major winner',
    (p) => facts.of(p.id).wins.major > 0,
  );

  for (const threshold of [2, 3]) {
    add(
      `fncs-wins:${threshold}`,
      'fncs-wins',
      `has ${threshold}+ FNCS titles`,
      `${threshold}+ FNCS titles`,
      (p) => p.fncsWins >= threshold,
    );
  }

  for (const threshold of [100_000, 250_000, 500_000, 1_000_000]) {
    add(
      `earnings:${threshold}`,
      'earnings',
      `has earned ${moneyShort(threshold)}+ in their career`,
      `${moneyShort(threshold)}+ earned`,
      (p) => p.earnings >= threshold,
    );
  }

  /*
   * FNCS wins by region and by year, named as the thing a player did.
   *
   * These used to be "Won in Europe" and "Won in 2023", counting any headline
   * win by where the event was held. That made Cooper a European winner for
   * taking the 2023 Globals in Copenhagen — true of the venue and of nothing a
   * player would ever answer with. Both now ask about the regional FNCS alone
   * — "Won EU FNCS", "Won FNCS in 2023" — and a Globals is not an FNCS title
   * for either, which is how the FNCS count everywhere else reads it too.
   */
  const regions = [...new Set(players.flatMap((p) => facts.of(p.id).fncsWinRegions))];
  for (const region of regions) {
    const short = REGION_SHORT[region] ?? region;
    add(
      `won-fncs:${region}`,
      'won-fncs-region',
      `has won the ${short} FNCS`,
      `Won ${short} FNCS`,
      (p) => facts.of(p.id).fncsWinRegions.includes(region),
    );
  }

  const years = [...new Set(players.flatMap((p) => facts.of(p.id).fncsWinYears))].sort();
  for (const year of years) {
    add(
      `won-fncs-in:${year}`,
      'won-fncs-year',
      `won a regional FNCS final in ${year}`,
      `Won FNCS in ${year}`,
      (p) => facts.of(p.id).fncsWinYears.includes(year),
    );
  }

  // ------------------------------------------------------ played at event --
  // Only events people can name — globals and LANs. There are well over a
  // hundred regional FNCS grand finals and their names differ by one word.
  for (const event of facts.headlineEvents) {
    const ids = facts.playedAt(event.index);
    add(
      `played:${event.index}`,
      'played-event',
      `played at ${event.name}`,
      // "Played" matters in a grid header — otherwise it reads as "won it".
      `Played ${event.short}`,
      (p) => ids.has(p.id),
    );
  }

  return out;
}

/** Players who satisfy both criteria — the Tic Tac Toe cell test. */
export function intersect(a: PlayerCriterion, b: PlayerCriterion): RosterPlayer[] {
  return a.matches.filter((player) => b.test(player));
}

/**
 * Whether two criteria share anyone at all.
 *
 * Separate from `intersect` because the board generator asks this question
 * hundreds of times per attempt and does not care who the players are. It
 * stops at the first hit, where `intersect` always walks the whole match set —
 * and the answer is usually yes on the first or second player.
 */
export function intersects(a: PlayerCriterion, b: PlayerCriterion): boolean {
  return a.matches.some((player) => b.test(player));
}

/**
 * True when one criterion implies the other, e.g. "3+ FNCS titles" inside
 * "2+ FNCS titles", or "global champion" inside "LAN winner". Such a pair makes
 * a redundant row/column or a muddy Connections group, so generators reject
 * boards containing one.
 *
 * `share` below 1 also catches the pair that is *nearly* nested: at 0.9, a
 * pair where nine in ten of the smaller set are in the larger. Exact
 * implication let "Won NA FNCS" and "North America" onto one Tic Tac Toe board
 * because a handful of NA winners now compete elsewhere — and the cell where
 * they crossed was just "Won NA FNCS" asked twice.
 */
export function isNested(a: PlayerCriterion, b: PlayerCriterion, share = 1): boolean {
  const [small, large] = a.matches.length <= b.matches.length ? [a, b] : [b, a];
  if (small.matches.length === 0) return false;
  const inside = small.matches.filter((player) => large.test(player)).length;
  return inside >= small.matches.length * share;
}

/** No pair among the given criteria may imply another — or nearly, below `share` 1. */
export function hasNestedPair(criteria: PlayerCriterion[], share = 1): boolean {
  for (let i = 0; i < criteria.length; i++) {
    for (let j = i + 1; j < criteria.length; j++) {
      if (isNested(criteria[i], criteria[j], share)) return true;
    }
  }
  return false;
}
