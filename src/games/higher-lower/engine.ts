import { ref, type GamePayloads, type Outcome } from '@/analytics/types';
import type { RosterPlayer } from '@/data/liquipedia/roster';
import type { Difficulty } from '@/games/shared/difficulty';
import { makeRng, pick, sample, type Rng } from '@/lib/rng';

/** Pure game logic for Higher or Lower — no React, no DOM. */

export type Category = 'age' | 'earnings' | 'fncsWins' | 'fncsFinals';
export type Answer = 'higher' | 'lower' | 'equal';

/**
 * A roster player, plus the one value the roster row does not carry.
 *
 * FNCS grand finals played live in `facts.json`, which this game otherwise
 * never loads. The page fetches it the first time the category is picked and
 * attaches the count; a player without one has no FNCS Finals value.
 */
export type Contender = RosterPlayer & { fncsFinals?: number };

export type { Difficulty };

/**
 * Only Hard offers the Equal button — and once it is on the board, using it is
 * compulsory. Easy and Medium are never dealt a tie at all (see
 * `answersDealt`), and would accept either direction if one were.
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
  {
    id: 'fncsFinals',
    label: 'FNCS Finals',
    hint: 'FNCS grand finals reached — the regional finals, plus the Globals and the other FNCS LANs.',
    title: 'FNCS Finals',
  },
];

export function valueOf(player: Contender, category: Category): number {
  if (category === 'age') return player.age ?? 0;
  if (category === 'fncsWins') return player.fncsWins;
  if (category === 'fncsFinals') return player.fncsFinals ?? 0;
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
 *
 * FNCS Finals does not, for the reason FNCS Wins must hold on to its noughts
 * so carefully: 2,362 players have never reached a final, and a shown nought
 * can only go up. Earnings leaves out the players on no money the same way.
 */
export function eligible<T extends Contender>(players: readonly T[], category: Category): T[] {
  return players.filter((player) => {
    if (category === 'age') return player.age !== null;
    if (category === 'fncsWins') return true;
    if (category === 'fncsFinals') return (player.fncsFinals ?? 0) > 0;
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
 * money. Age is in whole years and the FNCS counts in titles and finals, where
 * a relative gap would call nought-against-one the widest pair on the board.
 *
 * Very close on the whole-number categories is level or one apart. Only
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
  // Whole finals. The top earners have reached ten to thirty of them, so FNCS
  // Wins' three-apart would call 12 against 15 obvious.
  fncsFinals: {
    obvious: [8, Infinity],
    moderate: [4, 8],
    close: [2, 4],
    'very-close': [0, 2],
  },
};

/**
 * How far apart two players are, in the category's own unit — a share of the
 * bigger figure for earnings, years for age, titles or finals for the FNCS.
 */
export function gapBetween(a: RosterPlayer, b: RosterPlayer, category: Category): number {
  const x = valueOf(a, category);
  const y = valueOf(b, category);
  if (category !== 'earnings') return Math.abs(x - y);
  const hi = Math.max(x, y);
  return hi <= 0 ? 0 : Math.abs(x - y) / hi;
}

/**
 * Whether a pair's gap lands in a closeness band.
 *
 * A pair on nought fits every band. It is not a close call between two title
 * counts: it is "has this player ever won one?", the only question a shown
 * nought can ask other than a free Higher. Held to the band, it could only be
 * dealt on Hard from round 13, and every nought shown before then was a round
 * with one possible answer.
 */
export function fitsBand(
  a: RosterPlayer,
  b: RosterPlayer,
  category: Category,
  closeness: Closeness,
): boolean {
  if (category === 'fncsWins' && a.fncsWins === 0 && b.fncsWins === 0) return true;
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

/** The answer `hidden` gives against `shown`. */
function answerBetween(hidden: RosterPlayer, shown: RosterPlayer, category: Category): Answer {
  const a = valueOf(hidden, category);
  const b = valueOf(shown, category);
  return a > b ? 'higher' : a < b ? 'lower' : 'equal';
}

/**
 * The answers a level may be dealt.
 *
 * Ties only where there is an Equal button: without one a tie accepts either
 * answer and is a free point rather than a question. And never on earnings,
 * where a tie is two careers level to the dollar — a coincidence of the
 * records that nobody could know.
 */
function answersDealt(category: Category, difficulty: Difficulty): Answer[] {
  return hasEqualButton(difficulty) && category !== 'earnings'
    ? ['higher', 'lower', 'equal']
    : ['higher', 'lower'];
}

/**
 * Who could be dealt against `current` in `round`, grouped by the answer each
 * would give: the unused players in the fame window whose gap lands in the
 * scheduled band, or failing that the three nearest misses. At the very top of
 * the roster there may be no "obvious" pair at all — the top twenty span $1.2M
 * to $3.8M — and the nearest miss is still the most obvious question those
 * names can ask. `inBand` says which of the two it was.
 *
 * If the window has nobody left it widens to the level's cap, and nobody left
 * inside the cap is `null`: a cleared run. Easy never borrows an unknown to
 * keep going.
 */
function offers(
  ranked: readonly RosterPlayer[],
  shown: ReadonlySet<string>,
  current: RosterPlayer,
  category: Category,
  difficulty: Difficulty,
  round: number,
): { by: Map<Answer, RosterPlayer[]>; inBand: boolean } | null {
  const answers = answersDealt(category, difficulty);
  const allowed = (player: RosterPlayer) =>
    !shown.has(player.id) && answers.includes(answerBetween(player, current, category));

  const { cap } = WINDOW[difficulty];
  let from: RosterPlayer[] = [];
  for (const limit of [windowFor(difficulty, round), cap]) {
    from = ranked.slice(0, limit).filter(allowed);
    if (from.length > 0) break;
  }
  if (from.length === 0) return null;

  const closeness = closenessFor(difficulty, round);
  let dealt = from.filter((player) => fitsBand(player, current, category, closeness));
  const inBand = dealt.length > 0;
  if (!inBand) {
    const [low, high] = BANDS[category][closeness];
    const miss = (player: RosterPlayer) => {
      const gap = gapBetween(player, current, category);
      return gap < low ? low - gap : gap - high;
    };
    dealt = [...from].sort((a, b) => miss(a) - miss(b)).slice(0, 3);
  }

  const by = new Map<Answer, RosterPlayer[]>();
  for (const player of dealt) {
    const answer = answerBetween(player, current, category);
    const bucket = by.get(answer);
    if (bucket) bucket.push(player);
    else by.set(answer, [player]);
  }
  return { by, inBand };
}

/**
 * Whether a round asked from `player` would have more than one answer.
 *
 * A round the shown number answers by itself is not a question. Without an
 * Equal button a nought can only go up, and on FNCS Wins, where "obvious"
 * means three titles apart, so can a one or a two: 35% of Easy's FNCS rounds
 * had a nought on the left and a player who had to have more.
 *
 * Only a round inside its band counts. The nearest misses usually sit on both
 * sides, and counting them steered every Earnings run to open on a player with
 * no obvious partner in the top twenty — round one was off schedule in all 60
 * test runs, against 8 before.
 */
function isOpen(
  ranked: readonly RosterPlayer[],
  shown: ReadonlySet<string>,
  player: RosterPlayer,
  category: Category,
  difficulty: Difficulty,
  round: number,
): boolean {
  const next = offers(ranked, shown, player, category, difficulty, round);
  return next !== null && next.inBand && next.by.size > 1;
}

/**
 * Players checked with `isOpen` per round, at most. Each check scans the fame
 * window, which reaches a few thousand on Hard, so a round samples rather than
 * checking everyone.
 */
const LOOKAHEAD = 24;

/**
 * Below this many players, a direction is the edge of the roster.
 *
 * A run is a walk — each answer moves the shown value — and an even walk
 * wanders off into the thin ends. Age climbed past 33 — the top 710 earners
 * hold 21 players that old — used them all up and had to fall back to 41
 * against 33 on a very-close round. So the draw is even until one side is down
 * to its last few, and then follows the players back toward the middle.
 *
 * Not on FNCS Wins. Its thin end is the handful of multi-title champions, and
 * following the players away from them brought back "three titles? lower" —
 * 76% of Easy's answers could be called from the shown number. Running out of
 * champions costs it a nearest-miss round, which its bands, measured rather
 * than held, already allow. A gentle lean everywhere was tried first and was
 * worse on both counts: on FNCS Wins it walked straight back into the noughts.
 */
const THIN = 5;

/**
 * Equal's weight beside the two directions together, when both are on offer:
 * one round in five. When a direction is impossible it is an even draw
 * against the other instead.
 */
const EQUAL_SHARE = 0.25;

/**
 * Of `players`, the ones from the region this run has shown least.
 *
 * An event field is lopsided — 46 of the 2026 Globals' 101 are European — and
 * the fame window is cut by earnings, so a run over a field was Europe and
 * North America with the odd guest. On in event mode only; the whole scene
 * makes no promise about regions.
 */
function leastShown(
  players: RosterPlayer[],
  ranked: readonly RosterPlayer[],
  shown: ReadonlySet<string>,
): RosterPlayer[] {
  const count = new Map<string, number>();
  for (const player of ranked) {
    if (shown.has(player.id)) count.set(player.region ?? '', (count.get(player.region ?? '') ?? 0) + 1);
  }
  const times = (player: RosterPlayer) => count.get(player.region ?? '') ?? 0;
  const fewest = Math.min(...players.map(times));
  return players.filter((player) => times(player) === fewest);
}

/**
 * Picks the challenger for `round` against `current`: the answer first, then a
 * player who gives it.
 *
 * Letting the answer fall out of the draw leaked it. A player who has just gone
 * up sits above most of the window, so the next answer was usually "lower" and
 * the one after that usually "higher". On FNCS Wins it locked Hard into
 * 1-0-1-0-1-0: nought against nought was banned, so a shown nought could only
 * go up, and a shown one nearly always went down to the noughts that fill the
 * window. Nine answers in ten could be called from the shown number and the
 * last answer without knowing either player.
 *
 * So Higher and Lower are an even draw away from the edges (`THIN`), Equal
 * comes up rarely enough that Hard does not turn back into "press Equal
 * forever" (`EQUAL_SHARE`), and a shown nought, which cannot go lower, is an
 * even draw between Higher and Equal.
 *
 * Within the answer, a player who leaves the next round open is preferred
 * (`isOpen`); when nobody does, the round takes what it has.
 */
function chooseChallenger(
  ranked: readonly RosterPlayer[],
  shown: ReadonlySet<string>,
  current: RosterPlayer,
  category: Category,
  difficulty: Difficulty,
  round: number,
  rng: Rng,
  spread = false,
): RosterPlayer | null {
  const offered = offers(ranked, shown, current, category, difficulty, round);
  if (!offered) return null;
  const { by, inBand } = offered;
  // Nobody in the band: one of the nearest misses, as it always was. Choosing
  // among them by answer or by `isOpen` picks the farther ones — it served vic0
  // on $984k against aqua on $2.2M on a very-close round, passing over a closer
  // miss because the round after it was shut.
  if (!inBand) return pick(rng, [...by.values()].flat());

  const up = by.get('higher')?.length ?? 0;
  const down = by.get('lower')?.length ?? 0;
  const edge = category !== 'fncsWins' && Math.min(up, down) < THIN;
  const lean = up && down ? (edge ? up / (up + down) : 0.5) : up ? 1 : 0;
  const weight = (answer: Answer) =>
    answer === 'higher' ? lean : answer === 'lower' ? 1 - lean : up && down ? EQUAL_SHARE : 1;
  const weighted = [...by.keys()].map((answer) => ({ answer, weight: weight(answer) }));
  let roll = rng() * weighted.reduce((sum, entry) => sum + entry.weight, 0);
  const { answer } = weighted.find((entry) => (roll -= entry.weight) < 0) ?? weighted[weighted.length - 1];

  const tried = sample(rng, by.get(answer)!, LOOKAHEAD);
  const open = tried.filter((player) =>
    isOpen(ranked, new Set(shown).add(player.id), player, category, difficulty, round + 1),
  );
  const choice = open.length > 0 ? open : tried;
  return pick(rng, spread ? leastShown(choice, ranked, shown) : choice);
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
  /** Prefer the region this run has shown least — on in event mode. See `leastShown`. */
  spread: boolean;
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
  spread = false,
): GameState | null {
  const ranked = [...eligible(players, category)].sort((a, b) => b.earnings - a.earnings);
  if (ranked.length < 2) return null;

  const rng = makeRng(`${seed}:0`);
  // Round one's known side comes from the same window as its challenger: top
  // 20 against top 20. It is shown, so it is held to `isOpen` like the rest.
  const opening = ranked.slice(0, windowFor(difficulty, 1));
  const open = opening.filter((player) =>
    isOpen(ranked, new Set([player.id]), player, category, difficulty, 1),
  );
  const current = pick(rng, open.length > 0 ? open : opening);
  const challenger = chooseChallenger(
    ranked,
    new Set([current.id]),
    current,
    category,
    difficulty,
    1,
    rng,
    spread,
  );
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
    spread,
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
    state.spread,
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
