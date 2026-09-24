import { ref, type GamePayloads, type Outcome } from '@/analytics/types';
import type { RosterPlayer } from '@/data/liquipedia/roster';
import type { Difficulty } from '@/games/shared/difficulty';
import { makeRng, pick, type Rng } from '@/lib/rng';

/** Pure game logic for Higher or Lower — no React, no DOM. */

export type Category = 'age' | 'earnings' | 'fncsWins';
export type Answer = 'higher' | 'lower' | 'equal';

export type { Difficulty };

/**
 * Only Hard offers the Equal button — and once it is on the board, using it is
 * compulsory. Easy and Medium are never dealt a tie at all (see
 * `chooseChallenger`), and would accept either direction if one were.
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

/*
 * How a pair is chosen.
 *
 * Two dials, turned by the round you are on and the level you picked:
 *
 *   who     the challenger comes from the top N earners of the pool, and N
 *           grows every round. Round one is top 20 against top 20 — the
 *           names everyone knows — and the level decides how fast the window
 *           opens and how far it may go.
 *   how     the gap between the two values has to land in a band — obvious,
 *           moderate, close, very close — and the band tightens on a fixed
 *           schedule, faster on harder levels.
 *
 * The pairing it replaces had the second dial and not the first: it drew from
 * everyone in the level's fame tier at once, so "obvious" meant a big gap
 * between two players you had never heard of, and a 15-year-old on $0 against
 * a 30-year-old nobody was an easy round on paper and a coin toss in practice.
 * Obvious is a big gap between names you know.
 */

/** How close a pair's values are. */
export type Closeness = 'obvious' | 'moderate' | 'close' | 'very-close';

export const CLOSENESS_ICON: Record<Closeness, string> = {
  obvious: '🟢',
  moderate: '🟡',
  close: '🟠',
  'very-close': '🔴',
};

/** Rounds spent on each step of a schedule before moving to the next. */
export const ROUNDS_PER_STEP = 4;

/**
 * The closeness each block of rounds asks for; the last step repeats forever.
 *
 * Easy stays on big gaps for eight rounds and only reaches very close at 21.
 * Medium starts the same but is at close by 13. Hard is at very close by 13
 * and stays there, which is where the Equal button starts to matter.
 */
export const SCHEDULE: Record<Difficulty, Closeness[]> = {
  easy: ['obvious', 'obvious', 'moderate', 'moderate', 'close', 'very-close'],
  medium: ['obvious', 'moderate', 'moderate', 'close', 'very-close', 'very-close'],
  hard: ['obvious', 'moderate', 'close', 'very-close', 'very-close', 'very-close'],
};

export function closenessFor(difficulty: Difficulty, round: number): Closeness {
  const steps = SCHEDULE[difficulty];
  return steps[Math.min(Math.floor((round - 1) / ROUNDS_PER_STEP), steps.length - 1)];
}

/**
 * The gap each closeness stands for, as [at least, less than].
 *
 * Earnings are relative — $40k against $50k and $2.0M against $2.5M are the
 * same question — so "obvious" is one player on at most half the other's
 * money. Age is in whole years and FNCS wins in titles, where a relative gap
 * would call nought-against-one the widest pair on the board.
 *
 * Very close on the two whole-number categories is level or one apart. Only
 * Hard is dealt the level ones, and it must not be dealt nothing else: with
 * very close meaning ties alone, every FNCS round past the twelfth was a tie
 * and Hard became "press Equal forever" — 134 of 200 rounds in a test run.
 */
const BANDS: Record<Category, Record<Closeness, [number, number]>> = {
  earnings: {
    obvious: [0.5, Infinity],
    moderate: [0.25, 0.5],
    close: [0.1, 0.25],
    'very-close': [0, 0.1],
  },
  age: {
    obvious: [6, Infinity],
    moderate: [3, 6],
    close: [2, 3],
    'very-close': [0, 2],
  },
  fncsWins: {
    obvious: [3, Infinity],
    moderate: [2, 3],
    close: [1, 2],
    'very-close': [0, 2],
  },
};

/**
 * How far apart two players are, in the category's own unit — a share of the
 * bigger figure for earnings, years for age, titles for FNCS wins.
 */
export function gapBetween(a: RosterPlayer, b: RosterPlayer, category: Category): number {
  const x = valueOf(a, category);
  const y = valueOf(b, category);
  if (category !== 'earnings') return Math.abs(x - y);
  const hi = Math.max(x, y);
  return hi <= 0 ? 0 : Math.abs(x - y) / hi;
}

/** Whether a pair's gap lands in a closeness band. */
export function fitsBand(
  a: RosterPlayer,
  b: RosterPlayer,
  category: Category,
  closeness: Closeness,
): boolean {
  const gap = gapBetween(a, b, category);
  const [low, high] = BANDS[category][closeness];
  return gap >= low && gap < high;
}

/**
 * The fame window: how many of the pool's top earners the challenger may come
 * from, by round.
 *
 * Sorted by career earnings, the roster falls into four rough profiles —
 * very high-profile (top 50), established (to 250), general (to 1,000) and
 * everyone else. `cap` is where each level stops: Easy never leaves the first
 * two, Medium reaches the general scene, Hard eventually draws from anyone.
 * Earnings is the measure for every category, Age included, because what
 * makes a pair obvious is knowing who the two people are.
 */
export const WINDOW: Record<Difficulty, { start: number; grow: number; cap: number }> = {
  easy: { start: 20, grow: 10, cap: 250 },
  medium: { start: 20, grow: 30, cap: 1000 },
  hard: { start: 20, grow: 60, cap: Infinity },
};

export function windowFor(difficulty: Difficulty, round: number): number {
  const { start, grow, cap } = WINDOW[difficulty];
  return Math.min(cap, start + grow * (round - 1));
}

/**
 * Picks the challenger for `round` against `current`.
 *
 * 1. Take the unused players inside this round's fame window.
 * 2. Keep those whose gap to `current` lands in the scheduled band, and pick
 *    one at random.
 * 3. If none does, pick among the three whose gap comes nearest the band. At
 *    the very top of the roster there may be no "obvious" pair at all — the
 *    top twenty span $1.2M to $3.8M — and the nearest miss is still the most
 *    obvious question those names can ask.
 * 4. If the window has nobody left, widen it to the level's cap. Nobody left
 *    inside the cap is a cleared run — Easy never borrows an unknown to keep
 *    going.
 *
 * Ties are never dealt without an Equal button, because a tie there accepts
 * either answer and is a free point rather than a question.
 */
function chooseChallenger(
  ranked: readonly RosterPlayer[],
  shown: ReadonlySet<string>,
  current: RosterPlayer,
  category: Category,
  difficulty: Difficulty,
  round: number,
  rng: Rng,
): RosterPlayer | null {
  const allowed = (player: RosterPlayer) => {
    if (shown.has(player.id)) return false;
    // At least one of the pair must hold a title. 5,394 of the 5,678 players
    // have never won one, so nought against nought was served constantly and
    // on Hard the game became "press Equal forever".
    if (category === 'fncsWins' && current.fncsWins === 0 && player.fncsWins === 0) return false;
    if (!hasEqualButton(difficulty) && valueOf(player, category) === valueOf(current, category)) {
      return false;
    }
    return true;
  };

  const { cap } = WINDOW[difficulty];
  let from: RosterPlayer[] = [];
  for (const limit of [windowFor(difficulty, round), cap]) {
    from = ranked.slice(0, limit).filter(allowed);
    if (from.length > 0) break;
  }
  if (from.length === 0) return null;

  const closeness = closenessFor(difficulty, round);
  const hits = from.filter((player) => fitsBand(player, current, category, closeness));
  if (hits.length > 0) return pick(rng, hits);

  const [low, high] = BANDS[category][closeness];
  const miss = (player: RosterPlayer) => {
    const gap = gapBetween(player, current, category);
    return gap < low ? low - gap : gap - high;
  };
  const nearest = [...from].sort((a, b) => miss(a) - miss(b)).slice(0, 3);
  return pick(rng, nearest);
}

export interface GameState {
  category: Category;
  difficulty: Difficulty;
  /** The run's pool, biggest earner first — the order the fame window is cut from. */
  ranked: RosterPlayer[];
  /** Everyone shown this run, so nobody comes round twice. */
  shown: ReadonlySet<string>;
  current: RosterPlayer;
  challenger: RosterPlayer;
  score: number;
  status: Status;
  lastAnswer: Answer | null;
  /**
   * Every pair answered this run, and how. Read by the analytics only — the
   * per-pair and per-player hit rates that could one day choose the pairs by
   * how often people actually get them right.
   */
  history: { shown: RosterPlayer; hidden: RosterPlayer; answer: Answer; correct: boolean }[];
  /**
   * Seed for this run. Each round derives its own RNG from it, so pairing is
   * reproducible from the run seed and the score alone and nothing has to carry
   * a mutable generator through the state.
   */
  seed: string;
}

/** The round being asked: one more than the rounds already scored. */
export function roundOf(state: GameState): number {
  return state.score + 1;
}

/**
 * Starts a run over `players` — the whole roster, or an event's field.
 *
 * The level is not a fame tier cut from the roster any more. It is the
 * schedule above: how fast the fame window opens and how fast the gap closes.
 */
export function createGame(
  players: readonly RosterPlayer[],
  category: Category,
  difficulty: Difficulty,
  seed: string = String(Date.now()),
): GameState | null {
  const ranked = [...eligible(players, category)].sort((a, b) => b.earnings - a.earnings);
  if (ranked.length < 2) return null;

  const rng = makeRng(`${seed}:0`);
  // Round one's known side comes from the same window as its challenger: top
  // 20 against top 20.
  const current = pick(rng, ranked.slice(0, windowFor(difficulty, 1)));
  const challenger = chooseChallenger(ranked, new Set([current.id]), current, category, difficulty, 1, rng);
  if (!challenger) return null;

  return {
    category,
    difficulty,
    ranked,
    shown: new Set([current.id, challenger.id]),
    current,
    challenger,
    score: 0,
    status: 'playing',
    lastAnswer: null,
    history: [],
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
    history: [...state.history, { shown: state.current, hidden: state.challenger, answer, correct }],
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
 * is chosen for the round the streak has reached.
 */
export function nextRound(state: GameState): GameState {
  if (state.status !== 'revealed') return state;

  const current = state.challenger;
  const round = roundOf(state);
  const rng = makeRng(`${state.seed}:${state.score}`);
  const challenger = chooseChallenger(
    state.ranked,
    state.shown,
    current,
    state.category,
    state.difficulty,
    round,
    rng,
  );
  // No pair left worth asking about — the run is cleared, not stuck.
  if (!challenger) return { ...state, status: 'cleared' };

  return {
    ...state,
    current,
    challenger,
    shown: new Set(state.shown).add(challenger.id),
    lastAnswer: null,
    status: 'playing',
  };
}

/**
 * The run as the analytics record it.
 *
 * `cleared` is its own outcome: the pool ran dry, which is a win. A game over
 * with no answer given is the Give up button.
 */
export function record(state: GameState): { outcome: Outcome; r: GamePayloads['higher-lower'] } {
  return {
    outcome:
      state.status === 'cleared' ? 'cleared' : state.lastAnswer === null ? 'gave-up' : 'lost',
    r: {
      score: state.score,
      pairs: state.history.map((pair) => ({
        shown: ref(pair.shown),
        hidden: ref(pair.hidden),
        answer: pair.answer,
        correct: pair.correct,
      })),
    },
  };
}
