import type { RosterPlayer } from '@/data/liquipedia/roster';
import { moneyShort } from '@/lib/format';

/** Pure logic for Guess the Player. */

/**
 * Exact — age and the FNCS counts are simply right or wrong. Worth testing
 * because competitive players sit in a narrow age band and FNCS counts are
 * small. Direction — arrows on every number. Earnings always use this style.
 */
export type FeedbackMode = 'exact' | 'direction';

export const MAX_GUESSES = 8;

/**
 * Shared tournaments before two players count as having played together.
 *
 * One or two is a pickup duo for a cash cup, and it would turn the column
 * green for pairs nobody would ever call teammates. Ten is a partnership.
 */
export const TOGETHER_MIN = 10;

export type AttributeKey =
  | 'region'
  | 'country'
  | 'status'
  | 'age'
  | 'earnings'
  | 'fncsWins'
  | 'fncsFinals'
  | 'together';

/**
 * Green or red, nothing between.
 *
 * There was an amber "close" — right region wrong country, within two years,
 * within 20% of the earnings — and it was taken out. The arrows already say
 * which way to go, and amber on top of them was a second, vaguer answer to
 * the same question.
 */
export type CellState = 'hit' | 'miss';

/**
 * What the two newer columns read, when their files have loaded.
 *
 * Optional because both files are generated and may be absent — a supported
 * state everywhere else — and the game still plays on the six roster columns.
 */
export interface Extras {
  /** FNCS grand finals a player has appeared in, from `facts.json`. */
  fncsFinals?: (playerId: string) => number;
  /** Tournaments two players entered together, from `teammates.json`. */
  together?: (a: string, b: string) => number;
}

export interface AttributeResult {
  key: AttributeKey;
  label: string;
  /** The guessed player's value, as shown in the cell. */
  display: string;
  state: CellState;
  /** Set when the secret is higher/lower than the guess. */
  direction?: 'up' | 'down';
}

export interface GuessRow {
  player: RosterPlayer;
  attributes: AttributeResult[];
  correct: boolean;
}

export interface GameState {
  mode: FeedbackMode;
  secret: RosterPlayer;
  rows: GuessRow[];
  status: 'playing' | 'won' | 'lost';
  extras: Extras;
}

/**
 * A round on a secret player the caller has already chosen.
 *
 * The caller picks, because who comes up next is a rotation question (see
 * `games/shared/rotation.ts`) and the rules of the round are not.
 */
export function gameFor(secret: RosterPlayer, mode: FeedbackMode, extras: Extras = {}): GameState {
  return { mode, secret, rows: [], status: 'playing', extras };
}

/**
 * Players who can be the answer.
 *
 * Every column has to say something, so a player with no published birthday or
 * no earnings figure would hand back two blank cells and a shrug.
 */
export function answerable(players: readonly RosterPlayer[]): RosterPlayer[] {
  return players.filter((player) => player.age !== null && player.earningsKnown);
}

function numericResult(
  key: AttributeKey,
  label: string,
  display: string,
  guessValue: number,
  secretValue: number,
  mode: FeedbackMode,
): AttributeResult {
  if (guessValue === secretValue) return { key, label, display, state: 'hit' };
  if (mode === 'exact') return { key, label, display, state: 'miss' };
  return { key, label, display, state: 'miss', direction: secretValue > guessValue ? 'up' : 'down' };
}

/**
 * Whether the guess is one of the secret player's regular teammates.
 *
 * Green on ten shared tournaments or more — see `TOGETHER_MIN`. A red cell
 * still prints the count when there is one, because "Only 4" says you are
 * circling the right duo even when it is not the answer.
 */
function togetherResult(guess: RosterPlayer, secret: RosterPlayer, count: number): AttributeResult {
  const base = { key: 'together' as const, label: 'Played together' };
  if (guess.id === secret.id) return { ...base, display: '—', state: 'hit' };
  if (count >= TOGETHER_MIN) return { ...base, display: `${count} events`, state: 'hit' };
  return { ...base, display: count > 0 ? `Only ${count}` : 'Never', state: 'miss' };
}

export function compare(
  guess: RosterPlayer,
  secret: RosterPlayer,
  mode: FeedbackMode,
  extras: Extras = {},
): AttributeResult[] {
  const guessAge = guess.age ?? 0;
  const secretAge = secret.age ?? 0;

  // Career earnings always show a direction: exact matching on a six-figure
  // number would never land.
  const earnings: AttributeResult =
    guess.earnings === secret.earnings
      ? { key: 'earnings', label: 'Earnings', display: moneyShort(guess.earnings), state: 'hit' }
      : {
          key: 'earnings',
          label: 'Earnings',
          display: moneyShort(guess.earnings),
          state: 'miss',
          direction: secret.earnings > guess.earnings ? 'up' : 'down',
        };

  const out: AttributeResult[] = [
    {
      key: 'region',
      label: 'Region',
      display: guess.region ?? '—',
      state: guess.region === secret.region ? 'hit' : 'miss',
    },
    {
      key: 'country',
      label: 'Country',
      display: guess.countryName ?? '—',
      // The region column beside it already says "right region, wrong country".
      state: guess.country === secret.country ? 'hit' : 'miss',
    },
    {
      key: 'status',
      label: 'Status',
      display: guess.status === 'active' ? 'Active' : 'Retired',
      state: (guess.status === 'active') === (secret.status === 'active') ? 'hit' : 'miss',
    },
    numericResult('age', 'Age', String(guessAge), guessAge, secretAge, mode),
    earnings,
    numericResult('fncsWins', 'FNCS wins', String(guess.fncsWins), guess.fncsWins, secret.fncsWins, mode),
  ];

  if (extras.fncsFinals) {
    const guessFinals = extras.fncsFinals(guess.id);
    out.push(
      numericResult(
        'fncsFinals',
        'FNCS finals',
        String(guessFinals),
        guessFinals,
        extras.fncsFinals(secret.id),
        mode,
      ),
    );
  }
  if (extras.together) out.push(togetherResult(guess, secret, extras.together(guess.id, secret.id)));
  return out;
}

export function submitGuess(state: GameState, guess: RosterPlayer): GameState {
  if (state.status !== 'playing') return state;
  if (state.rows.some((row) => row.player.id === guess.id)) return state;

  const correct = guess.id === state.secret.id;
  const rows = [
    ...state.rows,
    { player: guess, attributes: compare(guess, state.secret, state.mode, state.extras), correct },
  ];
  return {
    ...state,
    rows,
    status: correct ? 'won' : rows.length >= MAX_GUESSES ? 'lost' : 'playing',
  };
}

/** Ends the round unsolved, so the secret player can be revealed. */
export function giveUp(state: GameState): GameState {
  return state.status === 'playing' ? { ...state, status: 'lost' } : state;
}

export function guessesLeft(state: GameState): number {
  return MAX_GUESSES - state.rows.length;
}
