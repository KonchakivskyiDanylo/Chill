import type { ClueRoundPayload, Outcome } from '@/analytics/types';
import type { Bios, Stint } from '@/data/liquipedia/bios';
import type { Facts } from '@/data/liquipedia/facts';
import { orgName, type Orgs } from '@/data/liquipedia/orgs';
import type { RosterPlayer } from '@/data/liquipedia/roster';
import { moneyShort, monthYear, plural } from '@/lib/format';
import { makeRng, shuffle } from '@/lib/rng';
import { recordRound, startRound, type ClueRound } from '@/games/shared/clue-round';

/**
 * Pure logic for Transfer Window: name a player from the organisations they
 * have played for, revealed one at a time.
 *
 * Built to the user's roadmap (2 Oct 2026): current and former organisations,
 * how many, how long at each, what they won there, region, career timeline.
 * The timeline and the time at each need the dated stints in bios.json; with
 * only orgs.json's lists the game still plays, shuffled.
 */

export type Mode = 'timeline' | 'shuffled';

/** Organisations a player needs on record to come up. */
export const MIN_ORGS = 3;
/** Organisation cards in a round, at most: a twelve-org journeyman shows the eight best-known. */
export const MAX_CARDS = 8;

export interface OrgCard {
  org: string;
  name: string;
  /** Null in Shuffled, or where the transfer was not recorded. */
  from: string | null;
  to: string | null;
  /** Where they play today. */
  current: boolean;
  /** Regional FNCS titles won while here (Timeline only). */
  titles: number;
}

export type Clue =
  | { kind: 'org'; card: OrgCard }
  | { kind: 'fact'; id: 'region' | 'titles' | 'earnings'; label: string; value: string };

export type GameState = ClueRound<RosterPlayer, Clue> & { mode: Mode };

/** Who can come up: three organisations or more. */
export function eligible(bios: Bios) {
  return (players: RosterPlayer[]): RosterPlayer[] => players.filter((player) => bios.orgsOf(player.id).length >= MIN_ORGS);
}

const DAY = 86_400_000;

/** "3y 9m", "7m", "2w" — how long a stint lasted, to today if it is still open. */
export function duration(from: string | null, to: string | null, today = new Date()): string | null {
  if (!from) return null;
  const days = ((to ? Date.parse(to) : today.getTime()) - Date.parse(from)) / DAY;
  if (!Number.isFinite(days) || days < 0) return null;
  if (days < 30) return `${Math.max(1, Math.round(days / 7))}w`;
  const months = Math.round(days / 30.44);
  return months < 12 ? `${months}m` : `${Math.floor(months / 12)}y${months % 12 ? ` ${months % 12}m` : ''}`;
}

/**
 * The cards, at most `MAX_CARDS`: every stint in Timeline (two spells at one
 * org are two cards), one per org in Shuffled. A long list keeps the orgs with
 * a Liquipedia page first, then the most recent.
 */
function cardsFor(
  player: RosterPlayer,
  stints: readonly Stint[],
  mode: Mode,
  orgs: Orgs | null,
  facts: Facts | null,
): OrgCard[] {
  const current = (stint: Stint) =>
    stint.to === null && (orgs?.get(stint.org)?.current.includes(player.id) ?? orgName(stint.org, orgs) === player.team);
  const wins = facts?.of(player.id).fncsWinDates ?? [];
  let cards: OrgCard[] = stints.map((stint) => ({
    org: stint.org,
    name: orgName(stint.org, orgs),
    from: mode === 'timeline' ? stint.from : null,
    to: mode === 'timeline' ? stint.to : null,
    current: current(stint),
    titles:
      mode === 'timeline' && stint.from
        ? wins.filter((day) => day >= stint.from! && (!stint.to || day <= stint.to)).length
        : 0,
  }));
  if (mode === 'shuffled') {
    const seen = new Set<string>();
    cards = cards.filter((card) => !seen.has(card.org) && seen.add(card.org));
  }
  if (cards.length > MAX_CARDS) {
    const keep = new Set(
      cards
        .map((card, index) => ({ card, index, notable: orgs?.get(card.org)?.hasPage ? 1 : 0 }))
        .sort((a, b) => b.notable - a.notable || b.index - a.index)
        .slice(0, MAX_CARDS)
        .map((entry) => entry.card),
    );
    cards = cards.filter((card) => keep.has(card));
  }
  return cards;
}

export function createGame(
  player: RosterPlayer,
  bios: Bios,
  orgs: Orgs | null,
  facts: Facts | null,
  mode: Mode,
  seed: string = String(Date.now()),
): GameState {
  const effective: Mode = bios.dated ? mode : 'shuffled';
  const cards = cardsFor(player, bios.stintsOf(player.id), effective, orgs, facts);
  const ordered = effective === 'timeline' ? cards : shuffle(makeRng(seed), cards);
  const clues: Clue[] = ordered.map((card) => ({ kind: 'org', card }));
  if (player.region) clues.push({ kind: 'fact', id: 'region', label: 'Competes in', value: player.region });
  clues.push({
    kind: 'fact',
    id: 'titles',
    label: 'FNCS titles',
    value: player.fncsWins ? plural(player.fncsWins, 'FNCS win') : 'None',
  });
  if (player.earningsKnown) clues.push({ kind: 'fact', id: 'earnings', label: 'Prize money', value: moneyShort(player.earnings) });
  return { ...startRound(player, clues), mode: effective };
}

/** A card's dates as one line: "Mar 2019 → Dec 2022", "Dec 2024 → now". */
export function span(card: OrgCard): string | null {
  if (!card.from && !card.to && !card.current) return null;
  const from = card.from ? monthYear(card.from) : '?';
  const to = card.current ? 'now' : card.to ? monthYear(card.to) : '?';
  return `${from} → ${to}`;
}

export function record(state: GameState): { outcome: Outcome; r: ClueRoundPayload } {
  return recordRound(state, (clue) =>
    clue.kind === 'org'
      ? { id: `org:${clue.card.org}`, name: clue.card.name }
      : { id: `fact:${clue.id}`, name: `${clue.label}: ${clue.value}` },
  );
}
