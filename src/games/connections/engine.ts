import { ref, type GamePayloads, type Outcome } from '@/analytics/types';
import type { RosterPlayer } from '@/data/liquipedia/roster';
import { makeRng, pick, sample, shuffle, type Rng } from '@/lib/rng';
import {
  buildCriteria,
  hasNestedPair,
  NEAR_NESTED,
  type CriteriaSource,
  type CriterionKind,
  type PlayerCriterion,
} from '@/games/shared/criteria';

/** Pure logic for Connections. */

export const GROUP_SIZE = 4;
export const GROUP_COUNT = 4;
export const MAX_MISTAKES = 4;
/*
 * Attempts before giving up.
 *
 * Higher than it looks like it needs to be, because the guards are strict and
 * a big pool has hundreds of connections in it: on the whole roster about one
 * draw in six survives the decoy check alone, and a board that cannot be built
 * shows the player an error rather than a puzzle. A whole run costs a few
 * milliseconds.
 */
const GENERATION_ATTEMPTS = 1500;

/** Deals tried with one draw of kinds before drawing again — see `generatePuzzle`. */
const TRIES_PER_DRAW = 20;

export interface Group {
  id: string;
  /** The connection, revealed when the group is solved. */
  label: string;
  players: RosterPlayer[];
}

export interface Puzzle {
  groups: Group[];
  /** All 16 players in display order. */
  board: RosterPlayer[];
}

export interface GameState {
  puzzle: Puzzle;
  solved: Group[];
  selected: string[];
  mistakes: number;
  status: 'playing' | 'won' | 'lost';
  /** How many of the last four belonged to one group, when it was not four. */
  near: number | null;
  /**
   * Every four submitted, in order. The analytics read the wrong ones: which
   * players get filed under the wrong connection is the Connections version
   * of Griefer's "misunderstood" list.
   */
  attempts: { ids: string[]; correct: boolean }[];
}

/**
 * The kinds of connection a group may be built from.
 *
 * Deliberately short. The generator used to reach for anything `buildCriteria`
 * produced plus a teammate link on top, which is how a board ended up asking
 * for "has played 2+ tournaments alongside Trexer" — a rule that is both
 * unknowable and, at two shared tournaments, not really a fact about either
 * player. What is left is the set of things somebody could actually hold in
 * their head about sixteen names: where they are from, who they played for,
 * what they have won and what they have earned.
 *
 * Birth year was on this list and came off it. "Born in 2005" reads like a
 * sharp group, but nobody can tell a 2005 from a 2006 across four handles, so
 * in play it was a group you could only find by elimination.
 */
const GROUP_KINDS = new Set<CriterionKind>([
  'country',
  'region',
  'org',
  'fncs-winner',
  'fncs-wins',
  'lan-winner',
  'tournament-winner',
  'earnings',
]);

/**
 * Kinds that are the same question wearing different clothes.
 *
 * "Is from Norway", "is from Canada" and "competes in South America" are three
 * separate kinds and one puzzle about where people are from — a board of them
 * is solved by reading nationalities and nothing else. Two per family is the
 * cap, the same rule the kinds already had, applied where it actually bites.
 */
const FAMILY: Partial<Record<CriterionKind, string>> = {
  country: 'origin',
  region: 'origin',
  'fncs-winner': 'titles',
  'fncs-wins': 'titles',
  'lan-winner': 'titles',
  'tournament-winner': 'titles',
};
const familyOf = (criterion: PlayerCriterion) => FAMILY[criterion.kind] ?? criterion.kind;

/**
 * A connection that is not in play but lands on *exactly four* of the sixteen,
 * across more than one group, is a wrong answer that looks completely right —
 * four French names on a board where France is not a group. Five or more is
 * left alone: there is no clean four to pick, and on a board of names people
 * know, "is from the United States" or "competes in North America" lands on
 * five most of the time — ruling that out would rule out the famous names.
 */

/** Rank gap allowed between the easiest and hardest group. */
const BALANCE = 6;

function combinations(indices: number[], size: number): number[][] {
  if (size === 0) return [[]];
  const out: number[][] = [];
  for (let i = 0; i <= indices.length - size; i++) {
    for (const rest of combinations(indices.slice(i + 1), size - 1)) {
      out.push([indices[i], ...rest]);
    }
  }
  return out;
}

/**
 * How many ways the sixteen split into four connected fours.
 *
 * This is the whole promise of the puzzle: one solution. `deal` keeps it by
 * construction, since every connection lands on its own four and nobody else;
 * this is the same promise checked from outside — the exact covers of the
 * board by four-subsets that each sit inside some connection — so that
 * `check:games` holds the generator to it rather than taking its word.
 *
 * Counted over the four connections in play, which is the promise the game can
 * actually keep: any four names share *something*, and a generator that tried
 * to rule out every unnamed coincidence would rule out every board.
 */
function splits(board: RosterPlayer[], criteria: PlayerCriterion[], stopAt = 2): number {
  const masks = new Set<number>();
  for (const criterion of criteria) {
    const fits = board.map((player, index) => (criterion.test(player) ? index : -1)).filter((i) => i >= 0);
    for (const combo of combinations(fits, GROUP_SIZE)) {
      masks.add(combo.reduce((mask, index) => mask | (1 << index), 0));
    }
  }
  const byLowest = new Map<number, number[]>();
  for (const mask of masks) {
    const lowest = 31 - Math.clz32(mask & -mask);
    const bucket = byLowest.get(lowest);
    if (bucket) bucket.push(mask);
    else byLowest.set(lowest, [mask]);
  }

  const full = (1 << board.length) - 1;
  let found = 0;
  const walk = (covered: number) => {
    if (found >= stopAt) return;
    if (covered === full) {
      found++;
      return;
    }
    const open = ~covered & full;
    const lowest = 31 - Math.clz32(open & -open);
    for (const mask of byLowest.get(lowest) ?? []) {
      if ((mask & covered) === 0) walk(covered | mask);
    }
  };
  walk(0);
  return found;
}

/** How often each fame tier is drawn — `RANDOM_MIX`, on Random. */
export type FameMix = Readonly<Record<string, number>>;

const TIERS = ['easy', 'medium', 'hard'] as const;

/**
 * The fame tier of each of a group's `count` places: `mix` shared out as
 * evenly as whole places allow, the remainder drawn by weight. At `RANDOM_MIX`
 * that is two household names, one regular, and a regular or a deep cut.
 *
 * Every group gets the same share rather than drawing each player's tier on
 * its own, which let one group take four household names and another four
 * deep cuts — and the balance check threw out nine boards in ten that had no
 * earnings group to exempt.
 */
function tiersFor(rng: Rng, count: number, mix: FameMix): string[] {
  const exact = TIERS.map((tier) => (mix[tier] ?? 0) * count);
  const places = TIERS.flatMap((tier, index) => Array<string>(Math.floor(exact[index])).fill(tier));
  const rest = exact.map((share) => share - Math.floor(share));
  while (places.length < count) {
    let roll = rng() * rest.reduce((sum, share) => sum + share, 0);
    const index = rest.findIndex((share) => (roll -= share) < 0);
    places.push(TIERS[index < 0 ? TIERS.length - 1 : index]);
  }
  return places;
}

/**
 * `count` players, at the fame tiers `mix` asks for (`tiersFor`), falling back
 * to the nearest tier the pool has when it runs out of one. Without a mix, an
 * even draw.
 */
function draw(rng: Rng, players: RosterPlayer[], count: number, mix?: FameMix): RosterPlayer[] {
  if (!mix) return sample(rng, players, count);
  const left = [...players];
  const out: RosterPlayer[] = [];
  for (const wanted of tiersFor(rng, count, mix)) {
    const at = TIERS.indexOf(wanted as (typeof TIERS)[number]);
    const nearest = [...TIERS]
      .sort((a, b) => Math.abs(TIERS.indexOf(a) - at) - Math.abs(TIERS.indexOf(b) - at))
      .find((tier) => left.some((player) => player.tier === tier));
    if (!nearest) break;
    const chosen = pick(rng, left.filter((player) => player.tier === nearest));
    out.push(chosen);
    left.splice(left.indexOf(chosen), 1);
  }
  return out;
}

/**
 * Four players per connection, none of whom fits any of the other three.
 *
 * So every connection lands on exactly its own four. The generator before this
 * let up to two players per group fit a second connection as well — the
 * overlap was meant to be the trap — and what it produced was five Poles on a
 * board with a Poland group: a fifth name that is plainly right and plainly
 * wrong at once, placed only by knowing which of the five also fits something
 * else. Every board it made had a connection on five or more of the sixteen,
 * and "has earned $100K+" reached nine.
 *
 * The overlap did bring in famous names — the FaZe player who has won an FNCS
 * — and an even draw from the exclusive pools is a board of deep cuts, so on
 * Random each player's fame tier is drawn first (`mix`), the way every game
 * deals its secret player there.
 *
 * Scarcest connection first: a group with six candidates has to take its four
 * before a group with forty spends them.
 */
function deal(
  criteria: PlayerCriterion[],
  rng: Rng,
  mix?: FameMix,
): { criterion: PlayerCriterion; players: RosterPlayer[] }[] | null {
  const order = [...criteria].sort((a, b) => a.matches.length - b.matches.length);
  const dealt: { criterion: PlayerCriterion; players: RosterPlayer[] }[] = [];
  for (const criterion of order) {
    const others = criteria.filter((other) => other.id !== criterion.id);
    const only = criterion.matches.filter((player) => !others.some((other) => other.test(player)));
    if (only.length < GROUP_SIZE) return null;
    dealt.push({ criterion, players: draw(rng, only, GROUP_SIZE, mix) });
  }
  return dealt;
}

/**
 * Whether the four groups are of comparable difficulty.
 *
 * Measured as where each group's players sit in the board's own earnings order.
 * A board with the four biggest names in one group and four nobodies in another
 * is solved in that order and the second half is a shrug.
 *
 * An earnings group sits out. Now that nobody else on the board may clear its
 * line, it is the richest four by definition, so it always read as the easy
 * group and the kind was never dealt — 0 of 60 boards.
 */
function balanced(groups: { criterion: PlayerCriterion; players: RosterPlayer[] }[]): boolean {
  const compared = groups.filter((group) => group.criterion.kind !== 'earnings');
  const players = compared.flatMap((group) => group.players);
  const rank = new Map(
    [...players]
      .sort((a, b) => a.earnings - b.earnings)
      .map((player, index) => [player.id, index] as const),
  );
  const means = compared.map(
    (group) => group.players.reduce((sum, p) => sum + (rank.get(p.id) ?? 0), 0) / GROUP_SIZE,
  );
  const allowed = (BALANCE * players.length) / (GROUP_SIZE * GROUP_COUNT);
  return Math.max(...means) - Math.min(...means) <= allowed;
}

/**
 * Builds a board of four groups of four.
 *
 * Each connection lands on exactly its own four (`deal`), which makes the
 * split unique by construction. What is left to check is the board as a
 * whole: no connection outside the four sitting on it as a decoy, and four
 * groups of comparable difficulty (`balanced`).
 *
 * `mix` weights the draw towards famous names; the game passes `RANDOM_MIX`
 * on Random, and nothing when a tier or an event field has been chosen.
 */
export function generatePuzzle(
  source: CriteriaSource,
  seed: string = String(Date.now()),
  mix?: FameMix,
): Puzzle | null {
  const rng = makeRng(seed);
  const candidates = buildCriteria(source, {
    minMatches: GROUP_SIZE,
    maxShare: 0.35,
  }).filter((criterion) => GROUP_KINDS.has(criterion.kind));
  if (candidates.length < GROUP_COUNT) return null;

  const byKind = new Map<CriterionKind, PlayerCriterion[]>();
  for (const criterion of candidates) {
    const bucket = byKind.get(criterion.kind);
    if (bucket) bucket.push(criterion);
    else byKind.set(criterion.kind, [criterion]);
  }

  for (let attempt = 0, draws = 0; attempt < GENERATION_ATTEMPTS; draws++) {
    /*
     * Four kinds, then one connection of each — not four out of the hat.
     *
     * A flat draw is a nationality generator: there are eighty countries and
     * exactly one "has won a LAN", so four-from-the-hat served country nearly
     * every board and the rest never came up. Drawing kinds first gives every
     * kind the same seat at the table, and every fourth draw goes back to the
     * flat one so that two countries can still be two groups — France and
     * Brazil is a good puzzle.
     *
     * The kinds are then kept for `TRIES_PER_DRAW` deals rather than redrawn
     * after every failure. Redrawing let whichever kinds pass the checks most
     * easily crowd out the rest: once an earnings group sat out the balance
     * check, it was on 54 of 60 boards.
     */
    const flat = draws % 4 === 3;
    const kinds = sample(rng, [...byKind.keys()], GROUP_COUNT);
    for (let tries = 0; tries < TRIES_PER_DRAW && attempt < GENERATION_ATTEMPTS; tries++, attempt++) {
      const picked = flat
        ? sample(rng, candidates, GROUP_COUNT)
        : kinds.map((kind) => pick(rng, byKind.get(kind)!));
      if (picked.length < GROUP_COUNT) {
        attempt++;
        break;
      }

      /*
       * Three groups about where somebody is from make a flat puzzle — but a
       * small pool may have nothing else to offer, and a flat board beats
       * "could not find four groups". The family cap holds for the first three
       * quarters of the attempts and then falls back to the per-kind one.
       */
      const grouping = attempt < GENERATION_ATTEMPTS * 0.75 ? familyOf : (c: PlayerCriterion) => c.kind;
      const families = new Map<string, number>();
      for (const criterion of picked) {
        const family = grouping(criterion);
        families.set(family, (families.get(family) ?? 0) + 1);
      }
      if ([...families.values()].some((count) => count > 2)) {
        // A family is decided by the kinds alone, so these kinds never pass.
        if (flat) continue;
        attempt++;
        break;
      }
      /*
       * "3+ FNCS titles" inside "has won an FNCS" is not two connections, and
       * neither is a pair that is only nearly nested. Exact implication let
       * "has won a major tournament" and "has won an FNCS title" share a board,
       * because one of the 165 major winners has no FNCS title — so every major
       * winner on the board fitted both groups, and nobody could say which four
       * were meant.
       */
      if (hasNestedPair(picked, NEAR_NESTED)) continue;

      const dealt = deal(picked, rng, mix);
      if (!dealt) continue;
      const board = dealt.flatMap((entry) => entry.players);
      if (!balanced(dealt)) continue;

      const groupOf = new Map<string, number>();
      dealt.forEach((entry, index) => entry.players.forEach((p) => groupOf.set(p.id, index)));
      const decoy = candidates.some((criterion) => {
        if (picked.some((inPlay) => inPlay.id === criterion.id)) return false;
        const hits = board.filter((player) => criterion.test(player));
        if (hits.length !== GROUP_SIZE) return false;
        return new Set(hits.map((player) => groupOf.get(player.id))).size > 1;
      });
      if (decoy) continue;

      return {
        groups: dealt.map((entry) => ({
          id: entry.criterion.id,
          label: entry.criterion.label,
          players: entry.players,
        })),
        board: shuffle(rng, board),
      };
    }
  }
  return null;
}

/**
 * How many ways a finished board splits into four connected fours.
 *
 * `check:games` holds every generated board to 1 (see `splits`).
 */
export function solutions(puzzle: Puzzle, source: CriteriaSource): number {
  const inPlay = connectionsOf(puzzle, source);
  if (inPlay.length !== GROUP_COUNT) return -1;
  return splits(puzzle.board, inPlay, 3);
}

/**
 * Connections in play that land on more than their own four — a fifth Pole
 * beside the Poland group. The generator never deals one; this asks from the
 * outside so `check:games` can hold it to that.
 */
export function crowded(puzzle: Puzzle, source: CriteriaSource): string[] {
  return connectionsOf(puzzle, source)
    .filter((criterion) => puzzle.board.filter((player) => criterion.test(player)).length > GROUP_SIZE)
    .map((criterion) => criterion.label);
}

function connectionsOf(puzzle: Puzzle, source: CriteriaSource): PlayerCriterion[] {
  const candidates = buildCriteria(source, { minMatches: GROUP_SIZE, maxShare: 0.35 });
  return puzzle.groups
    .map((group) => candidates.find((criterion) => criterion.id === group.id))
    .filter((criterion): criterion is PlayerCriterion => Boolean(criterion));
}

export function createGame(puzzle: Puzzle): GameState {
  return { puzzle, solved: [], selected: [], mistakes: 0, status: 'playing', near: null, attempts: [] };
}

export function toggle(state: GameState, player: RosterPlayer): GameState {
  if (state.status !== 'playing') return state;
  if (state.solved.some((group) => group.players.some((p) => p.id === player.id))) return state;

  const selected = state.selected.includes(player.id)
    ? state.selected.filter((id) => id !== player.id)
    : state.selected.length >= GROUP_SIZE
      ? state.selected
      : [...state.selected, player.id];
  return { ...state, selected, near: null };
}

export function submit(state: GameState): GameState {
  if (state.status !== 'playing' || state.selected.length !== GROUP_SIZE) return state;

  const unsolved = state.puzzle.groups.filter(
    (group) => !state.solved.some((solved) => solved.id === group.id),
  );
  const selectedIds = new Set(state.selected);

  const exact = unsolved.find((group) => group.players.every((player) => selectedIds.has(player.id)));
  const attempts = [...state.attempts, { ids: [...state.selected], correct: Boolean(exact) }];
  if (exact) {
    const solved = [...state.solved, exact];
    return {
      ...state,
      solved,
      selected: [],
      status: solved.length === GROUP_COUNT ? 'won' : 'playing',
      near: null,
      attempts,
    };
  }

  /*
   * How close the guess was — but only when that is worth saying.
   *
   * Reported for three-of-four and nothing else. Two-of-four was also being
   * announced, and it is almost always true: pick any four from a board of
   * sixteen holding four groups and two of them land together by accident more
   * often than not. So "2 of those 4 belong to one group" fired on most wrong
   * guesses while telling the player nothing they could act on — a hint that
   * common reads as noise, and it made the genuine three-of-four hint easy to
   * scroll past.
   */
  const best = Math.max(
    ...unsolved.map((group) => group.players.filter((player) => selectedIds.has(player.id)).length),
  );
  const mistakes = state.mistakes + 1;
  return {
    ...state,
    mistakes,
    selected: [],
    status: mistakes >= MAX_MISTAKES ? 'lost' : 'playing',
    near: best >= GROUP_SIZE - 1 ? best : null,
    attempts,
  };
}

/** Ends the round unsolved, so the remaining groups can be revealed. */
export function giveUp(state: GameState): GameState {
  return state.status === 'playing' ? { ...state, selected: [], status: 'lost' } : state;
}

export function unsolvedGroups(state: GameState): Group[] {
  return state.puzzle.groups.filter((group) => !state.solved.some((solved) => solved.id === group.id));
}

/** Lives remaining, for the hearts row. */
export function livesLeft(state: GameState): number {
  return Math.max(0, MAX_MISTAKES - state.mistakes);
}

/** The round as the analytics record it. Lost with lives left means given up. */
export function record(state: GameState): { outcome: Outcome; r: GamePayloads['connections'] } {
  return {
    outcome:
      state.status === 'won' ? 'won' : state.mistakes >= MAX_MISTAKES ? 'lost' : 'gave-up',
    r: {
      groups: state.puzzle.groups.map((group) => ({
        rule: { id: group.id, name: group.label },
        players: group.players.map(ref),
      })),
      attempts: state.attempts.map((attempt) => ({ players: attempt.ids, correct: attempt.correct })),
    },
  };
}
