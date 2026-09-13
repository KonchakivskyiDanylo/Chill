import type { Dataset } from '@/data/dataset';
import type { Player } from '@/data/types';
import { makeRng, pick, type Rng } from '@/lib/rng';
import { money, ordinal, plural } from '@/lib/format';

/** Pure logic for Tenaball. */

export type CategoryId = 'career-earnings' | 'year-earnings' | 'tournament' | 'fncs-wins' | 'titles';
export type Difficulty = 'easy' | 'hard';

export const HARD_LIVES = 3;
export const SLOTS = 10;

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  hint: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: 'career-earnings', label: 'Career Earnings', hint: 'The ten biggest career prize-money totals.' },
  { id: 'year-earnings', label: 'Earnings in a Year', hint: 'The ten biggest earners in one calendar year.' },
  { id: 'tournament', label: 'A Specific Tournament', hint: 'The ten best finishers at one major event.' },
  { id: 'fncs-wins', label: 'FNCS Wins', hint: 'The ten players with the most FNCS titles.' },
  { id: 'titles', label: 'Total Titles', hint: 'The ten players with the most tournament wins of any kind.' },
];

export interface Slot {
  rank: number;
  player: Player;
  /** The value that earned this rank, e.g. "$1,120,000" or "4th". */
  value: string;
  /** Raw comparable value, used to spot players who tie with the cut-off. */
  raw: number;
}

export interface Puzzle {
  category: CategoryId;
  title: string;
  /** How ties are resolved for this category — every category states its own. */
  tieRule: string;
  slots: Slot[];
  /** Comparable value for any player, so we can detect boundary ties. */
  valueOf: (player: Player) => number;
  /** True when a bigger raw value is better (all current categories except placements). */
  higherIsBetter: boolean;
}

/**
 * Categories this dataset can actually build a board for.
 *
 * "A Specific Tournament" needs ten recorded finishers at one event; while the
 * data only records winners, it has nothing to rank and is left out of the
 * picker rather than failing after the player chooses it.
 */
export function availableCategories(dataset: Dataset): CategoryMeta[] {
  return CATEGORIES.filter((meta) => buildPuzzle(dataset, meta.id, `probe-${meta.id}`) !== null);
}

/** Builds a puzzle, or null when the dataset cannot support the category. */
export function buildPuzzle(dataset: Dataset, category: CategoryId, seed: string): Puzzle | null {
  const rng = makeRng(seed);
  switch (category) {
    case 'career-earnings':
      return rankPuzzle(
        dataset,
        'career-earnings',
        'Top 10 by career earnings',
        'Straight prize-money order. Exact ties are split by name.',
        (player) => player.earnings,
        (value) => money(value),
      );
    case 'titles':
      return rankPuzzle(
        dataset,
        'titles',
        'Top 10 by total titles',
        'FNCS titles plus global, LAN and major wins. Exact ties are split by name.',
        (player) => player.fncsWins + player.majorWins,
        (value) => plural(value, 'title'),
      );
    case 'fncs-wins':
      return rankPuzzle(
        dataset,
        'fncs-wins',
        'Top 10 by FNCS wins',
        'Players level on titles are ranked by career earnings — a tie with 10th still counts as a near miss, not a mistake.',
        (player) => player.fncsWins,
        (value) => plural(value, 'title'),
        (player) => player.earnings,
      );
    case 'year-earnings':
      return yearPuzzle(dataset, rng);
    case 'tournament':
      return tournamentPuzzle(dataset, rng);
    default:
      return null;
  }
}

/** Generic "top ten by a number" puzzle. */
function rankPuzzle(
  dataset: Dataset,
  category: CategoryId,
  title: string,
  tieRule: string,
  valueOf: (player: Player) => number,
  format: (value: number) => string,
  tieBreak?: (player: Player) => number,
): Puzzle | null {
  const ranked = dataset.players
    .map((player) => ({ player, value: valueOf(player) }))
    .filter((entry) => entry.value > 0)
    .sort(
      (a, b) =>
        b.value - a.value ||
        (tieBreak ? tieBreak(b.player) - tieBreak(a.player) : 0) ||
        (a.player.name < b.player.name ? -1 : 1),
    );

  if (ranked.length < SLOTS) return null;

  return {
    category,
    title,
    tieRule,
    slots: ranked.slice(0, SLOTS).map((entry, index) => ({
      rank: index + 1,
      player: entry.player,
      value: format(entry.value),
      raw: entry.value,
    })),
    valueOf,
    higherIsBetter: true,
  };
}

function yearPuzzle(dataset: Dataset, rng: Rng): Puzzle | null {
  const usable = dataset.years.filter(
    (year) => dataset.players.filter((player) => dataset.earningsIn(player, year) > 0).length >= SLOTS,
  );
  if (usable.length === 0) return null;
  const year = pick(rng, usable);

  const puzzle = rankPuzzle(
    dataset,
    'year-earnings',
    `Top 10 earners in ${year}`,
    'Prize money won during that calendar year only. Exact ties are split by name.',
    (player) => dataset.earningsIn(player, year),
    (value) => money(value),
  );
  return puzzle;
}

function tournamentPuzzle(dataset: Dataset, rng: Rng): Puzzle | null {
  // Only events where the top ten is unambiguous: the 10th and 11th finishers
  // must not share a placement, otherwise there is no single right answer.
  const candidates = dataset.eventsWithParticipants(SLOTS + 2).filter((event) => {
    const standings = dataset.standings(event.id);
    return standings[SLOTS - 1].result.placement !== standings[SLOTS].result.placement;
  });
  if (candidates.length === 0) return null;

  const event = pick(rng, candidates);
  const standings = dataset.standings(event.id);
  const placementOf = new Map(standings.map((entry) => [entry.player.id, entry.result.placement]));

  return {
    category: 'tournament',
    title: `Top 10 at ${event.name}`,
    tieRule: 'Ranked by finishing position at this event.',
    slots: standings.slice(0, SLOTS).map((entry, index) => ({
      rank: index + 1,
      player: entry.player,
      value: ordinal(entry.result.placement),
      raw: entry.result.placement,
    })),
    valueOf: (player) => placementOf.get(player.id) ?? Number.POSITIVE_INFINITY,
    higherIsBetter: false,
  };
}

// ------------------------------------------------------------------ state --

export interface GameState {
  puzzle: Puzzle;
  difficulty: Difficulty;
  /** Ranks already filled in. */
  found: Set<number>;
  wrong: Player[];
  lives: number;
  status: 'playing' | 'won' | 'lost';
}

export function createGame(puzzle: Puzzle, difficulty: Difficulty): GameState {
  return {
    puzzle,
    difficulty,
    found: new Set(),
    wrong: [],
    lives: difficulty === 'hard' ? HARD_LIVES : Number.POSITIVE_INFINITY,
    status: 'playing',
  };
}

export type GuessOutcome =
  | { kind: 'correct'; rank: number }
  | { kind: 'duplicate'; rank: number }
  | { kind: 'tied' } // right value, but outside the ten — costs nothing
  | { kind: 'wrong' }
  | { kind: 'unknown' }; // text did not resolve to a player

export function applyGuess(state: GameState, player: Player | null): { state: GameState; outcome: GuessOutcome } {
  if (state.status !== 'playing') return { state, outcome: { kind: 'wrong' } };
  if (!player) return { state, outcome: { kind: 'unknown' } };

  const slot = state.puzzle.slots.find((entry) => entry.player.id === player.id);
  if (slot) {
    if (state.found.has(slot.rank)) return { state, outcome: { kind: 'duplicate', rank: slot.rank } };
    const found = new Set(state.found).add(slot.rank);
    return {
      state: { ...state, found, status: found.size === state.puzzle.slots.length ? 'won' : 'playing' },
      outcome: { kind: 'correct', rank: slot.rank },
    };
  }

  // A player level with the cut-off is a fair answer that the tie rule excluded;
  // do not punish it.
  const cutoff = state.puzzle.slots[state.puzzle.slots.length - 1].raw;
  const value = state.puzzle.valueOf(player);
  const tiesTheCut = Number.isFinite(value) && value === cutoff;
  if (tiesTheCut) return { state, outcome: { kind: 'tied' } };

  const lives = state.difficulty === 'hard' ? state.lives - 1 : state.lives;
  return {
    state: {
      ...state,
      wrong: [...state.wrong, player],
      lives,
      status: lives <= 0 ? 'lost' : 'playing',
    },
    outcome: { kind: 'wrong' },
  };
}
