import type { RosterPlayer } from '@/data/liquipedia/roster';
import type { Difficulty } from '@/games/shared/difficulty';
import { makeRng, pick, sample, shuffle, type Rng } from '@/lib/rng';

/** Pure game logic for Higher or Lower — no React, no DOM. */

export type Category = 'age' | 'earnings' | 'fncsWins';
export type Answer = 'higher' | 'lower' | 'equal';

export type { Difficulty };

/**
 * Only Hard offers the Equal button — and once it is on the board, using it is
 * compulsory. Easy and Medium accept either direction on a tie.
 */
export function hasEqualButton(difficulty: Difficulty): boolean {
  return difficulty === 'hard';
}

export type Status = 'playing' | 'revealed' | 'gameover' | 'cleared';

export interface CategoryMeta {
  id: Category;
  label: string;
  hint: string;
  /** Sentence used in the prompt, e.g. "Career Earnings". */
  title: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: 'age', label: 'Age', hint: 'How old is the player today?', title: 'Age' },
  {
    id: 'earnings',
    label: 'Career Earnings',
    hint: 'Total prize money won across their career.',
    title: 'Career Earnings',
  },
  {
    id: 'fncsWins',
    label: 'FNCS Wins',
    hint: 'Grand finals won across every FNCS season and region — nought included.',
    title: 'FNCS Wins',
  },
];

export function valueOf(player: RosterPlayer, category: Category): number {
  if (category === 'age') return player.age ?? 0;
  if (category === 'fncsWins') return player.fncsWins;
  return player.earnings;
}

/**
 * Players usable for a category — guards against missing data.
 *
 * FNCS Wins deliberately keeps players on nought. Only 284 of the 5,678
 * players have ever won one, so excluding the rest left a pool where everyone
 * was a champion and the question was "which champion won more" — and it threw
 * away the best round the category has: a name you know on one title against a
 * name you do not on one title.
 */
export function eligible(players: readonly RosterPlayer[], category: Category): RosterPlayer[] {
  return players.filter((player) => {
    if (category === 'age') return player.age !== null;
    if (category === 'fncsWins') return true;
    return player.earningsKnown && player.earnings > 0;
  });
}

// ------------------------------------------------------------- pairing --

/**
 * How far apart two players are on a category, as 0 (identical) to 1 (miles).
 *
 * Relative for the continuous categories, because $40k against $50k and $2.0M
 * against $2.5M are the same question asked twice. Absolute for FNCS wins,
 * where the numbers run 0 to 7 and a relative gap would call nought-against-one
 * the widest pair on the board when it is one of the closest.
 */
export function gapBetween(a: RosterPlayer, b: RosterPlayer, category: Category): number {
  const x = valueOf(a, category);
  const y = valueOf(b, category);
  if (category === 'fncsWins') return Math.min(Math.abs(x - y) / 4, 1);
  const hi = Math.max(x, y);
  return hi <= 0 ? 0 : Math.abs(x - y) / hi;
}

/**
 * The gap a round is aiming for.
 *
 * Two things move it. Difficulty sets where it starts: Easy opens on pairs that
 * are obvious, Hard on pairs that are nearly level. Then it tightens as the
 * streak grows, so a run gets harder the longer it survives instead of staying
 * the same question fifty times.
 *
 * This is what stops a blowout landing late — a 1-versus-5 on round thirty is
 * not a question, it is a gift, and before this the pairing was random so it
 * happened constantly.
 */
const TARGET: Record<Difficulty, [start: number, end: number]> = {
  easy: [0.6, 0.35],
  medium: [0.35, 0.18],
  hard: [0.18, 0.06],
};

/** Rounds over which the target tightens from `start` to `end`. */
const RAMP = 15;

export function targetGap(difficulty: Difficulty, score: number): number {
  const [start, end] = TARGET[difficulty];
  return start + (end - start) * Math.min(score / RAMP, 1);
}

/**
 * How many of the remaining players to consider per round.
 *
 * A Hard pool is over four thousand players and scoring every one of them on
 * every round is wasted work — a random slice of sixty already contains
 * something close to any target we ask for.
 */
const CANDIDATES = 60;

/**
 * Picks the next challenger: the one whose gap to `current` sits closest to
 * what this round is aiming for.
 *
 * Chosen from the best handful rather than the single best, so two runs at the
 * same score are not the same run.
 */
function chooseChallenger(
  queue: readonly RosterPlayer[],
  current: RosterPlayer,
  category: Category,
  difficulty: Difficulty,
  score: number,
  rng: Rng,
): RosterPlayer | null {
  const target = targetGap(difficulty, score);

  /*
   * At least one of the pair must hold a title.
   *
   * Letting players on nought into the category was right — "a name you know
   * on one title against a name you do not" is the best round it has. Letting
   * *both* sides be on nought is not: 5,394 of the 5,678 eligible players have
   * never won one, so on Hard the pairing found a nought-against-nought tie
   * every single round and the game became "press Equal forever".
   */
  const from =
    category === 'fncsWins' && current.fncsWins === 0
      ? queue.filter((player) => player.fncsWins > 0)
      : queue;
  // Nothing left that makes a question. The run has been cleared, not broken.
  if (from.length === 0) return null;

  const slice = from.length <= CANDIDATES ? from : sample(rng, from, CANDIDATES);
  const ranked = slice
    .map((player) => ({ player, distance: Math.abs(gapBetween(player, current, category) - target) }))
    .sort((a, b) => a.distance - b.distance);
  return pick(rng, ranked.slice(0, Math.min(5, ranked.length))).player;
}

export interface GameState {
  category: Category;
  difficulty: Difficulty;
  /** Players not yet shown this run. */
  queue: RosterPlayer[];
  current: RosterPlayer;
  challenger: RosterPlayer;
  score: number;
  status: Status;
  lastAnswer: Answer | null;
  /**
   * Seed for this run. Each round derives its own RNG from it, so pairing is
   * reproducible from the run seed and the score alone and nothing has to carry
   * a mutable generator through the state.
   */
  seed: string;
}

/** Drops `player` from `queue`. */
function without(queue: readonly RosterPlayer[], player: RosterPlayer): RosterPlayer[] {
  return queue.filter((entry) => entry.id !== player.id);
}

/**
 * Starts a run. `players` is the difficulty's pool: the caller narrows the
 * roster to one fame tier first, so a run only compares players of comparable
 * renown.
 */
export function createGame(
  players: readonly RosterPlayer[],
  category: Category,
  difficulty: Difficulty,
  seed: string = String(Date.now()),
): GameState | null {
  const pool = eligible(players, category);
  if (pool.length < 2) return null;

  const rng = makeRng(`${seed}:0`);
  const shuffled = shuffle(rng, pool);
  const [current, ...rest] = shuffled;
  const challenger = chooseChallenger(rest, current, category, difficulty, 0, rng);
  if (!challenger) return null;

  return {
    category,
    difficulty,
    queue: without(rest, challenger),
    current,
    challenger,
    score: 0,
    status: 'playing',
    lastAnswer: null,
    seed,
  };
}

/** The correct answer for the current pair. */
export function correctAnswer(state: GameState): Answer {
  const a = valueOf(state.challenger, state.category);
  const b = valueOf(state.current, state.category);
  if (a > b) return 'higher';
  if (a < b) return 'lower';
  return 'equal';
}

export function isCorrect(state: GameState, answer: Answer): boolean {
  const truth = correctAnswer(state);
  // Without an Equal button a tie has to accept either direction.
  if (!hasEqualButton(state.difficulty) && truth === 'equal') {
    return answer === 'higher' || answer === 'lower';
  }
  return answer === truth;
}

/** Applies an answer: reveals the hidden value, and scores or ends the run. */
export function submitAnswer(state: GameState, answer: Answer): GameState {
  if (state.status !== 'playing') return state;
  const correct = isCorrect(state, answer);
  return {
    ...state,
    lastAnswer: answer,
    score: correct ? state.score + 1 : state.score,
    status: correct ? 'revealed' : 'gameover',
  };
}

/**
 * Ends the run on the spot, revealing the hidden value.
 *
 * `gameover` rather than `cleared`: giving up is not clearing the pool, and the
 * board reads the difference — the run-over banner shows what the answer was.
 */
export function giveUp(state: GameState): GameState {
  return state.status === 'playing' ? { ...state, status: 'gameover' } : state;
}

/**
 * Moves to the next pair. The revealed player slides across and becomes the
 * known side, so no player is ever shown twice in a run, and the new challenger
 * is chosen against them at the difficulty the streak has earned.
 */
export function nextRound(state: GameState): GameState {
  if (state.status !== 'revealed') return state;
  if (state.queue.length === 0) return { ...state, status: 'cleared' };

  const current = state.challenger;
  const rng = makeRng(`${state.seed}:${state.score}`);
  const challenger = chooseChallenger(
    state.queue,
    current,
    state.category,
    state.difficulty,
    state.score,
    rng,
  );
  // No pair left worth asking about — the run is cleared, not stuck.
  if (!challenger) return { ...state, status: 'cleared' };

  return {
    ...state,
    current,
    challenger,
    queue: without(state.queue, challenger),
    lastAnswer: null,
    status: 'playing',
  };
}
