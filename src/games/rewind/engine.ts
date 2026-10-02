import type { GamePayloads, Outcome } from '@/analytics/types';
import type { Bios } from '@/data/liquipedia/bios';
import type { Facts } from '@/data/liquipedia/facts';
import { orgName, type Orgs } from '@/data/liquipedia/orgs';
import type { FameTier, Roster, RosterPlayer } from '@/data/liquipedia/roster';
import { ordinal } from '@/lib/format';
import { makeRng, shuffle, type Rng } from '@/lib/rng';
import type { Level } from '@/games/shared/levels';
import { parseLobby, roundLabel } from '@/games/shared/lobbies';

/**
 * Pure logic for Rewind: moments from competitive Fortnite, dealt in a jumble,
 * to be put back in order oldest first.
 *
 * Built to the user's roadmap (2 Oct 2026), from the moments the data has
 * dates for: a player's first (or third) FNCS title, who won each LAN, an FNCS
 * season's grand finals, a player joining an organisation, an organisation
 * being founded. No card carries its year in its words — "the 2024 Global
 * Championship" would sort itself — so a LAN is named by who won it.
 *
 * The check is Pyramid's: everything in the right place locks green, and the
 * levels differ in how far apart the moments are and how many checks you get.
 */

export type MomentKind = 'lan-win' | 'first-title' | 'title' | 'round' | 'signing' | 'founded';

export interface Moment {
  /** Unique within a deal. */
  id: string;
  /** ISO day. */
  date: string;
  text: string;
  icon: string;
  kind: MomentKind;
  /** How well known: the level deals only moments at or above its bands. */
  tier: FameTier;
  /** Roster ids the moment is about, so one player does not fill a deal. */
  players: string[];
}

export const LEVELS: Record<
  Level,
  { size: number; gapDays: number; tiers: FameTier[]; kinds: MomentKind[]; lives: number }
> = {
  easy: {
    size: 5,
    gapDays: 150,
    tiers: ['easy'],
    kinds: ['lan-win', 'first-title', 'signing', 'founded'],
    lives: Number.POSITIVE_INFINITY,
  },
  medium: {
    size: 6,
    gapDays: 60,
    tiers: ['easy', 'medium'],
    kinds: ['lan-win', 'first-title', 'title', 'round', 'signing', 'founded'],
    lives: 2,
  },
  hard: {
    size: 7,
    gapDays: 21,
    tiers: ['easy', 'medium', 'hard'],
    kinds: ['lan-win', 'first-title', 'title', 'round', 'signing', 'founded'],
    lives: 1,
  },
};

/** At most this many of one kind (unless the pile has too few kinds), and of one player, in a deal. */
const PER_KIND = 2;
const PER_PLAYER = 2;

/** Orgs whose signings and foundings are worth a card: the richest with a page. */
const NOTABLE_ORGS = 60;
const EASY_ORGS = 20;

const TIER_RANK: Record<FameTier, number> = { easy: 0, medium: 1, hard: 2 };
const lesser = (a: FameTier, b: FameTier): FameTier => (TIER_RANK[a] >= TIER_RANK[b] ? a : b);

export interface Sources {
  roster: Roster;
  facts: Facts;
  bios: Bios | null;
  orgs: Orgs | null;
}

const names = (players: readonly RosterPlayer[]) =>
  players.length <= 2
    ? players.map((p) => p.name).join(' & ')
    : `${players.slice(0, -1).map((p) => p.name).join(', ')} & ${players[players.length - 1].name}`;

/** Every moment the data can date. */
export function allMoments({ roster, facts, bios, orgs }: Sources): Moment[] {
  const byId = new Map(roster.players.map((player) => [player.id, player]));
  const out: Moment[] = [];

  // Who won each LAN, the event named without its year.
  for (const event of facts.events) {
    if (!event.lan) continue;
    const winners = [...facts.wonAt(event.index)].flatMap((id) => byId.get(id) ?? []);
    if (winners.length === 0) continue;
    const title = roundLabel(event.short.replace(/\s+-\s+/g, ' ')).replace(/^Major 1 /, '');
    out.push({
      id: `lan:${event.index}`,
      date: event.date,
      text: `${names(winners)} win${winners.length === 1 ? 's' : ''} the ${title}`,
      icon: '🏆',
      kind: 'lan-win',
      tier: 'easy',
      players: winners.map((p) => p.id),
    });
  }

  // A season's FNCS grand finals, for the seasons whose names carry no year.
  for (const round of facts.fncsRounds) {
    const label = roundLabel(parseLobby(round[0].name).round);
    if (/^Major/.test(label) || /\b20\d\d\b/.test(label)) continue;
    out.push({
      id: `round:${round[0].date}`,
      date: round[0].date,
      text: `The FNCS ${label} grand finals`,
      icon: '📅',
      kind: 'round',
      tier: 'medium',
      players: [],
    });
  }

  // FNCS titles: the first for anyone, the later ones for the players with several.
  for (const player of roster.players) {
    const dates = facts.of(player.id).fncsWinDates;
    dates.forEach((date, index) => {
      out.push({
        id: `title:${player.id}:${index}`,
        date,
        text: `${player.name}’s ${index === 0 ? 'first' : ordinal(index + 1)} FNCS title`,
        icon: index === 0 ? '🥇' : '🏅',
        kind: index === 0 ? 'first-title' : 'title',
        tier: index === 0 ? player.tier : lesser(player.tier, 'medium'),
        players: [player.id],
      });
    });
  }

  const notable = (orgs?.orgs ?? []).filter((org) => org.hasPage).slice(0, NOTABLE_ORGS);
  const orgTier = new Map(notable.map((org, index) => [org.id, (index < EASY_ORGS ? 'easy' : 'medium') as FameTier]));

  // Signings: only with dated stints, only at the orgs people know.
  if (bios?.dated) {
    for (const player of roster.players) {
      for (const stint of bios.stintsOf(player.id)) {
        const tier = orgTier.get(stint.org);
        if (!stint.from || !tier) continue;
        out.push({
          id: `signing:${player.id}:${stint.org}:${stint.from}`,
          date: stint.from,
          text: `${player.name} joins ${orgName(stint.org, orgs)}`,
          icon: '✍️',
          kind: 'signing',
          tier: lesser(player.tier, tier),
          players: [player.id],
        });
      }
    }
  }

  // Foundings, from the Fortnite years on: FaZe Clan's 2010 sorts itself.
  for (const org of notable) {
    if (!org.founded || org.founded < '2017-01-01') continue;
    out.push({
      id: `founded:${org.id}`,
      date: org.founded,
      text: `${org.name} is founded`,
      icon: '🏢',
      kind: 'founded',
      tier: orgTier.get(org.id) ?? 'medium',
      players: [],
    });
  }
  return out;
}

const DAY = 86_400_000;

/**
 * One deal: the level's number of moments, every two at least its gap apart,
 * no more than two of a kind or about one player. Kinds take turns being
 * drawn from, so the cards are not all titles because titles are most of the
 * pile. Null when the pile cannot make one.
 */
export function deal(moments: readonly Moment[], level: Level, rng: Rng): Moment[] | null {
  const config = LEVELS[level];
  const pile = moments.filter((moment) => config.kinds.includes(moment.kind) && config.tiers.includes(moment.tier));
  const byKind = new Map<MomentKind, Moment[]>();
  for (const moment of pile) byKind.set(moment.kind, [...(byKind.get(moment.kind) ?? []), moment]);
  if (byKind.size === 0) return null;
  // With few kinds in the pile — no signings before bios.json exists — each may fill more seats.
  const perKind = Math.max(PER_KIND, Math.ceil(config.size / byKind.size));

  for (let attempt = 0; attempt < 60; attempt++) {
    const chosen: Moment[] = [];
    const kinds = new Map<MomentKind, number>();
    const players = new Map<string, number>();
    const fits = (moment: Moment) =>
      (kinds.get(moment.kind) ?? 0) < perKind &&
      moment.players.every((id) => (players.get(id) ?? 0) < PER_PLAYER) &&
      chosen.every((other) => Math.abs(Date.parse(other.date) - Date.parse(moment.date)) >= config.gapDays * DAY);
    let stalled = 0;
    while (chosen.length < config.size && stalled < 40) {
      const kindList = [...byKind.keys()].filter((kind) => (kinds.get(kind) ?? 0) < perKind);
      if (kindList.length === 0) break;
      const kind = kindList[Math.floor(rng() * kindList.length)];
      const options = byKind.get(kind)!;
      const moment = options[Math.floor(rng() * options.length)];
      if (!fits(moment)) {
        stalled++;
        continue;
      }
      chosen.push(moment);
      kinds.set(moment.kind, (kinds.get(moment.kind) ?? 0) + 1);
      for (const id of moment.players) players.set(id, (players.get(id) ?? 0) + 1);
    }
    if (chosen.length === config.size) return chosen.sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  return null;
}

// ------------------------------------------------------------------ round --

export interface GameState {
  level: Level;
  /** Oldest first: the answer. */
  solution: Moment[];
  /** As the player has them, top to bottom. */
  order: Moment[];
  locked: ReadonlySet<string>;
  wrong: ReadonlySet<string>;
  checks: number;
  lives: number;
  status: 'playing' | 'won' | 'lost';
  gaveUp: boolean;
}

/** Right where it stands: the same day as the moment that belongs there, so two on one day go either way. */
export function rightAt(state: Pick<GameState, 'solution' | 'order'>, index: number): boolean {
  return state.order[index].date === state.solution[index].date;
}

export function inPlace(state: GameState): number {
  return state.order.filter((_, index) => rightAt(state, index)).length;
}

/** A shuffle with at most one moment already in its place. */
export function createGame(solution: Moment[], level: Level, seed: string = String(Date.now())): GameState {
  const rng = makeRng(seed);
  let order = shuffle(rng, solution);
  for (let tries = 0; tries < 20; tries++) {
    if (order.filter((moment, index) => moment.date === solution[index].date).length <= 1) break;
    order = shuffle(rng, solution);
  }
  return {
    level,
    solution,
    order,
    locked: new Set(),
    wrong: new Set(),
    checks: 0,
    lives: LEVELS[level].lives,
    status: 'playing',
    gaveUp: false,
  };
}

/** Swap two places. A locked moment stays put. */
export function swap(state: GameState, a: number, b: number): GameState {
  if (state.status !== 'playing' || a === b) return state;
  if (state.locked.has(state.order[a].id) || state.locked.has(state.order[b].id)) return state;
  const order = [...state.order];
  [order[a], order[b]] = [order[b], order[a]];
  const wrong = new Set(state.wrong);
  wrong.delete(order[a].id);
  wrong.delete(order[b].id);
  return { ...state, order, wrong };
}

/** Locks everything in its place; the rest turns red. A check that is not perfect costs a life. */
export function check(state: GameState): GameState {
  if (state.status !== 'playing') return state;
  const locked = new Set(state.locked);
  const wrong = new Set<string>();
  state.order.forEach((moment, index) => (rightAt(state, index) ? locked.add(moment.id) : wrong.add(moment.id)));
  const checks = state.checks + 1;
  if (wrong.size === 0) return { ...state, locked, wrong, checks, status: 'won' };
  const lives = state.lives - 1;
  return { ...state, locked, wrong, checks, lives, status: lives <= 0 ? 'lost' : 'playing' };
}

export function giveUp(state: GameState): GameState {
  return state.status === 'playing' ? { ...state, status: 'lost', gaveUp: true } : state;
}

export function record(state: GameState): { outcome: Outcome; r: GamePayloads['rewind'] } {
  const placed = new Set(state.order.filter((_, index) => rightAt(state, index)).map((moment) => moment.id));
  return {
    outcome: state.status === 'won' ? 'won' : state.gaveUp ? 'gave-up' : 'lost',
    r: {
      puzzle: { id: `rewind:${state.level}`, name: `Rewind — ${state.level}` },
      items: state.solution.map((moment) => ({ id: moment.id, name: moment.text, placed: placed.has(moment.id) })),
      checks: state.checks,
    },
  };
}
